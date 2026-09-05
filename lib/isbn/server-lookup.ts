import type { AppLocale } from '../domain/types.ts';
import { lookupFixtureMetadata, stitchMetadata, type MetadataCandidate, type StitchedBookMetadata } from './providers.ts';
import { isbn13To10 } from './isbn.ts';
import {
  normalizeGoogleBooksResponse,
  normalizeKakaoBooksResponse,
  normalizeNaverBooksResponse,
  normalizeNlkResponse,
  normalizeOpenLibraryEditionResponse,
  normalizeOpenLibrarySearchResponse,
  type GoogleVolumesResponse,
  type KakaoBooksResponse,
  type NaverBooksResponse,
  type OpenLibraryEditionResponse,
  type OpenLibrarySearchResponse,
} from './server-normalizers.ts';

export type ProviderStatus = 'ok' | 'not-found' | 'failed' | 'not-configured';
export type ProviderId = 'nlk' | 'naver' | 'kakao-books' | 'google-books' | 'open-library';

export interface LookupProviderConfig {
  nlkApiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
  kakaoRestApiKey?: string;
  googleBooksApiKey?: string;
  timeoutMs?: number;
}

export interface ServerLookupResult {
  metadata: StitchedBookMetadata | null;
  providerStatus: Record<ProviderId, ProviderStatus>;
  usedFixture: boolean;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 8_000;

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
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookup = async (identifier: string) => {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', `isbn:${identifier}`);
    url.searchParams.set('maxResults', '10');
    url.searchParams.set('printType', 'books');
    url.searchParams.set('key', apiKey);
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: providerSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Google Books responded with ${response.status}.`);
    return normalizeGoogleBooksResponse(isbn13, await response.json() as GoogleVolumesResponse);
  };

  const primary = await lookup(isbn13);
  if (primary) return { ...primary, source: 'google-books' as const };

  // Some older English editions are indexed only by their equivalent ISBN-10.
  const isbn10 = isbn13To10(isbn13);
  if (!isbn10) return null;
  const fallback = await lookup(isbn10);
  return fallback ? { ...fallback, source: 'google-books' as const } : null;
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

export async function fetchKakaoBooksMetadata(
  isbn13: string,
  restApiKey: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
) {
  const url = new URL('https://dapi.kakao.com/v3/search/book');
  url.searchParams.set('query', isbn13);
  url.searchParams.set('target', 'isbn');
  url.searchParams.set('size', '10');
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: {
      accept: 'application/json',
      authorization: `KakaoAK ${restApiKey}`,
    },
    signal: providerSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Kakao Books responded with ${response.status}.`);
  const normalized = normalizeKakaoBooksResponse(isbn13, await response.json() as KakaoBooksResponse);
  return normalized ? { ...normalized, source: 'kakao-books' as const } : null;
}

export async function fetchOpenLibraryMetadata(
  isbn13: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    accept: 'application/json',
    'user-agent': 'Hana Seed Books/1.0 (https://hana-community-library.lee-suchan.chatgpt.site/)',
  };
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const editionLookup = async () => {
    const signal = providerSignal(timeoutMs);
    const response = await fetchImpl(`https://openlibrary.org/isbn/${isbn13}.json`, { headers, signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Open Library edition lookup responded with ${response.status}.`);
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
    return normalizeOpenLibraryEditionResponse(isbn13, edition, authorNames);
  };

  const searchLookup = async () => {
    const url = new URL('https://openlibrary.org/search.json');
    url.searchParams.set('q', `isbn:${isbn13}`);
    url.searchParams.set('fields', 'title,author_name,publisher,first_publish_year,language,isbn,cover_i');
    url.searchParams.set('limit', '10');
    const response = await fetchImpl(url, { headers, signal: providerSignal(timeoutMs) });
    if (!response.ok) throw new Error(`Open Library search responded with ${response.status}.`);
    return normalizeOpenLibrarySearchResponse(isbn13, await response.json() as OpenLibrarySearchResponse);
  };

  const [editionResult, searchResult] = await Promise.allSettled([editionLookup(), searchLookup()]);
  const edition = editionResult.status === 'fulfilled' ? editionResult.value : null;
  const search = searchResult.status === 'fulfilled' ? searchResult.value : null;
  if (!edition && !search) {
    if (editionResult.status === 'rejected' && searchResult.status === 'rejected') throw editionResult.reason;
    return null;
  }

  const preferred = edition ?? search!;
  const fallback = edition ? search : null;
  const normalized = {
    ...preferred,
    authors: preferred.authors?.length ? preferred.authors : fallback?.authors,
    publisher: preferred.publisher ?? fallback?.publisher,
    publishedYear: preferred.publishedYear ?? fallback?.publishedYear,
    language: preferred.language ?? fallback?.language,
    pageCount: preferred.pageCount ?? fallback?.pageCount,
    description: preferred.description ?? fallback?.description,
    coverUrl: preferred.coverUrl ?? fallback?.coverUrl,
  };
  return { ...normalized, source: 'open-library' as const };
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
    'kakao-books': config.kakaoRestApiKey ? 'failed' : 'not-configured',
    'google-books': config.googleBooksApiKey ? 'failed' : 'not-configured',
    'open-library': 'failed',
  };
  const tasks: Array<{ id: ProviderId; run: () => Promise<MetadataCandidate | null> }> = [];
  const providerOptions = { fetchImpl: options.fetchImpl, timeoutMs: config.timeoutMs };
  if (config.nlkApiKey) tasks.push({ id: 'nlk', run: () => fetchNlkMetadata(isbn13, config.nlkApiKey!, providerOptions) });
  if (config.naverClientId && config.naverClientSecret) tasks.push({
    id: 'naver',
    run: () => fetchNaverBooksMetadata(isbn13, config.naverClientId!, config.naverClientSecret!, providerOptions),
  });
  if (config.kakaoRestApiKey) tasks.push({
    id: 'kakao-books',
    run: () => fetchKakaoBooksMetadata(isbn13, config.kakaoRestApiKey!, providerOptions),
  });
  if (config.googleBooksApiKey) tasks.push({
    id: 'google-books',
    run: () => fetchGoogleBooksMetadata(isbn13, config.googleBooksApiKey!, providerOptions),
  });
  tasks.push({ id: 'open-library', run: () => fetchOpenLibraryMetadata(isbn13, providerOptions) });

  const settled = await Promise.allSettled(tasks.map(({ run }) => run()));
  const candidates: MetadataCandidate[] = [];
  const failedTasks: typeof tasks = [];
  settled.forEach((result, index) => {
    const id = tasks[index].id;
    if (result.status === 'rejected') {
      providerStatus[id] = 'failed';
      failedTasks.push(tasks[index]);
      return;
    }
    providerStatus[id] = result.value ? 'ok' : 'not-found';
    if (result.value) candidates.push(result.value);
  });

  const preliminary = candidates.length > 0 ? stitchMetadata(isbn13, locale, candidates) : null;
  const usefulFields = preliminary ? [
    preliminary.authors.length > 0,
    Boolean(preliminary.publisher),
    Boolean(preliminary.pageCount),
    Boolean(preliminary.coverUrl),
  ].filter(Boolean).length : 0;

  // A provider can fail transiently while another returns only a title and year. Retry only
  // in that sparse case so the common path stays fast while intake remains resilient.
  if (preliminary && usefulFields < 2 && failedTasks.length > 0) {
    const retries = await Promise.allSettled(failedTasks.map(({ run }) => run()));
    retries.forEach((result, index) => {
      const id = failedTasks[index].id;
      if (result.status === 'rejected') return;
      providerStatus[id] = result.value ? 'ok' : 'not-found';
      if (result.value) candidates.push(result.value);
    });
  }

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
