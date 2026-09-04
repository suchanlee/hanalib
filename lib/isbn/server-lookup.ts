import type { AppLocale } from '../domain/types.ts';
import { lookupFixtureMetadata, stitchMetadata, type MetadataCandidate, type StitchedBookMetadata } from './providers.ts';
import {
  normalizeGoogleBooksResponse,
  normalizeNaverBooksResponse,
  normalizeNlkResponse,
  normalizeOpenLibraryEditionResponse,
  type GoogleVolumesResponse,
  type NaverBooksResponse,
  type OpenLibraryEditionResponse,
} from './server-normalizers.ts';

export type ProviderStatus = 'ok' | 'not-found' | 'failed' | 'not-configured';
export type ProviderId = 'nlk' | 'naver' | 'google-books' | 'open-library';

export interface LookupProviderConfig {
  nlkApiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
  googleBooksApiKey?: string;
  timeoutMs?: number;
}

export interface ServerLookupResult {
  metadata: StitchedBookMetadata | null;
  providerStatus: Record<ProviderId, ProviderStatus>;
  usedFixture: boolean;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 5_000;

function providerSignal(timeoutMs: number) {
  return AbortSignal.timeout(Math.max(100, Math.min(timeoutMs, 15_000)));
}

export async function fetchNlkMetadata(
  isbn13: string,
  apiKey: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
) {
  const url = new URL('https://www.nl.go.kr/seoji/SearchApi.do');
  url.searchParams.set('cert_key', apiKey);
  url.searchParams.set('result_style', 'json');
  url.searchParams.set('page_no', '1');
  url.searchParams.set('page_size', '10');
  url.searchParams.set('isbn', isbn13);
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: { accept: 'application/json' },
    signal: providerSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`NLK responded with ${response.status}.`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('NLK returned an invalid payload.');
  const normalized = normalizeNlkResponse(isbn13, payload as Record<string, unknown>);
  return normalized ? { ...normalized, source: 'nlk' as const } : null;
}

export async function fetchGoogleBooksMetadata(
  isbn13: string,
  apiKey: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
) {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', `isbn:${isbn13}`);
  url.searchParams.set('maxResults', '10');
  url.searchParams.set('printType', 'books');
  url.searchParams.set('key', apiKey);
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: { accept: 'application/json' },
    signal: providerSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google Books responded with ${response.status}.`);
  const normalized = normalizeGoogleBooksResponse(isbn13, await response.json() as GoogleVolumesResponse);
  return normalized ? { ...normalized, source: 'google-books' as const } : null;
}

export async function fetchNaverBooksMetadata(
  isbn13: string,
  clientId: string,
  clientSecret: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
) {
  const url = new URL('https://openapi.naver.com/v1/search/book.json');
  url.searchParams.set('query', isbn13);
  url.searchParams.set('display', '10');
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: {
      accept: 'application/json',
      'x-naver-client-id': clientId,
      'x-naver-client-secret': clientSecret,
    },
    signal: providerSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Naver Books responded with ${response.status}.`);
  const normalized = normalizeNaverBooksResponse(isbn13, await response.json() as NaverBooksResponse);
  return normalized ? { ...normalized, source: 'naver' as const } : null;
}

export async function fetchOpenLibraryMetadata(
  isbn13: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = providerSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const headers = {
    accept: 'application/json',
    'user-agent': 'Hana Community Library/1.0 (https://hana-community-library.lee-suchan.chatgpt.site/)',
  };
  const response = await fetchImpl(`https://openlibrary.org/isbn/${isbn13}.json`, { headers, signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Library responded with ${response.status}.`);
  const edition = await response.json() as OpenLibraryEditionResponse;
  const authorKeys = [...new Set((edition.authors ?? []).flatMap(({ key }) => key ? [key] : []))].slice(0, 12);
  const authorResponses = await Promise.allSettled(authorKeys.map(async (key) => {
    if (!/^\/authors\/OL\d+A$/.test(key)) return undefined;
    const authorResponse = await fetchImpl(`https://openlibrary.org${key}.json`, { headers, signal });
    if (!authorResponse.ok) return undefined;
    const payload = await authorResponse.json() as { name?: string };
    return payload.name?.trim() || undefined;
  }));
  const authorNames = authorResponses.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
  const normalized = normalizeOpenLibraryEditionResponse(isbn13, edition, authorNames);
  return normalized ? { ...normalized, source: 'open-library' as const } : null;
}

export async function resolveBookMetadata(
  isbn13: string,
  locale: AppLocale,
  config: LookupProviderConfig,
  options: { fetchImpl?: FetchLike; allowFixture?: boolean } = {},
): Promise<ServerLookupResult> {
  const providerStatus: Record<ProviderId, ProviderStatus> = {
    nlk: config.nlkApiKey ? 'failed' : 'not-configured',
    naver: config.naverClientId && config.naverClientSecret ? 'failed' : 'not-configured',
    'google-books': config.googleBooksApiKey ? 'failed' : 'not-configured',
    'open-library': 'failed',
  };
  const tasks: Array<{ id: ProviderId; promise: Promise<MetadataCandidate | null> }> = [];
  const providerOptions = { fetchImpl: options.fetchImpl, timeoutMs: config.timeoutMs };
  if (config.nlkApiKey) tasks.push({ id: 'nlk', promise: fetchNlkMetadata(isbn13, config.nlkApiKey, providerOptions) });
  if (config.naverClientId && config.naverClientSecret) tasks.push({ id: 'naver', promise: fetchNaverBooksMetadata(isbn13, config.naverClientId, config.naverClientSecret, providerOptions) });
  if (config.googleBooksApiKey) tasks.push({ id: 'google-books', promise: fetchGoogleBooksMetadata(isbn13, config.googleBooksApiKey, providerOptions) });
  tasks.push({ id: 'open-library', promise: fetchOpenLibraryMetadata(isbn13, providerOptions) });

  const settled = await Promise.allSettled(tasks.map(({ promise }) => promise));
  const candidates: MetadataCandidate[] = [];
  settled.forEach((result, index) => {
    const id = tasks[index].id;
    if (result.status === 'rejected') {
      providerStatus[id] = 'failed';
      return;
    }
    providerStatus[id] = result.value ? 'ok' : 'not-found';
    if (result.value) candidates.push(result.value);
  });

  if (candidates.length > 0) {
    return { metadata: stitchMetadata(isbn13, locale, candidates), providerStatus, usedFixture: false };
  }
  if (options.allowFixture) {
    const fixture = await lookupFixtureMetadata(isbn13, locale);
    if (fixture) return { metadata: fixture, providerStatus, usedFixture: true };
  }
  return { metadata: null, providerStatus, usedFixture: false };
}

export function fixtureLookupAllowed(
  requested: boolean,
  environment: { APP_RUNTIME_MODE?: string; NODE_ENV?: string; ISBN_FIXTURES_ENABLED?: string } = process.env,
) {
  const runtimeMode = environment.APP_RUNTIME_MODE ?? environment.NODE_ENV;
  if (runtimeMode !== 'development' && runtimeMode !== 'test') return false;
  return requested || environment.ISBN_FIXTURES_ENABLED === 'true';
}
