import type { AppLocale } from '../domain/types.ts';
import { lookupFixtureMetadata, stitchMetadata, type MetadataCandidate, type StitchedBookMetadata } from './providers.ts';
import { normalizeGoogleBooksResponse, normalizeNlkResponse, type GoogleVolumesResponse } from './server-normalizers.ts';

export type ProviderStatus = 'ok' | 'not-found' | 'failed' | 'not-configured';
export type ProviderId = 'nlk' | 'google-books';

export interface LookupProviderConfig {
  nlkApiKey?: string;
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

export async function resolveBookMetadata(
  isbn13: string,
  locale: AppLocale,
  config: LookupProviderConfig,
  options: { fetchImpl?: FetchLike; allowFixture?: boolean } = {},
): Promise<ServerLookupResult> {
  const providerStatus: Record<ProviderId, ProviderStatus> = {
    nlk: config.nlkApiKey ? 'failed' : 'not-configured',
    'google-books': config.googleBooksApiKey ? 'failed' : 'not-configured',
  };
  const tasks: Array<{ id: ProviderId; promise: Promise<MetadataCandidate | null> }> = [];
  const providerOptions = { fetchImpl: options.fetchImpl, timeoutMs: config.timeoutMs };
  if (config.nlkApiKey) tasks.push({ id: 'nlk', promise: fetchNlkMetadata(isbn13, config.nlkApiKey, providerOptions) });
  if (config.googleBooksApiKey) tasks.push({ id: 'google-books', promise: fetchGoogleBooksMetadata(isbn13, config.googleBooksApiKey, providerOptions) });

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
  environment: { NODE_ENV?: string; ISBN_FIXTURES_ENABLED?: string } = process.env,
) {
  if (environment.NODE_ENV !== 'development' && environment.NODE_ENV !== 'test') return false;
  return requested || environment.ISBN_FIXTURES_ENABLED === 'true';
}
