import type { AddBookInput, AppLocale } from '@/lib/domain/types';

export type MetadataSource = 'nlk' | 'google-books' | 'member' | 'fixture';

export interface MetadataCandidate {
  source: MetadataSource;
  isbn13: string;
  title?: string;
  titleEn?: string;
  authors?: string[];
  publisher?: string;
  publishedYear?: number;
  language?: AddBookInput['language'];
  pageCount?: number;
  description?: string;
  coverUrl?: string;
}

export interface BookMetadataProvider {
  readonly id: Exclude<MetadataSource, 'member' | 'fixture'>;
  lookup(isbn13: string, locale: AppLocale, signal?: AbortSignal): Promise<MetadataCandidate | null>;
}

interface ProxyProviderOptions {
  endpoint: string;
}

abstract class ServerProxyProvider implements BookMetadataProvider {
  abstract readonly id: BookMetadataProvider['id'];
  private readonly endpoint: string;

  protected constructor({ endpoint }: ProxyProviderOptions) {
    this.endpoint = endpoint;
  }

  async lookup(isbn13: string, locale: AppLocale, signal?: AbortSignal) {
    const response = await fetch(`${this.endpoint}?isbn=${encodeURIComponent(isbn13)}&locale=${locale}`, {
      headers: { accept: 'application/json' },
      signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${this.id} lookup failed (${response.status})`);
    return { ...(await response.json() as Omit<MetadataCandidate, 'source'>), source: this.id };
  }
}

/** Calls a same-origin server route so the NLK API key never reaches the browser. */
export class NlkProvider extends ServerProxyProvider {
  readonly id = 'nlk' as const;

  constructor(endpoint = '/api/isbn/nlk') {
    super({ endpoint });
  }
}

/** Calls a same-origin server route that normalizes the Google Books response. */
export class GoogleBooksProvider extends ServerProxyProvider {
  readonly id = 'google-books' as const;

  constructor(endpoint = '/api/isbn/google-books') {
    super({ endpoint });
  }
}

/** Resolves and stitches all configured metadata sources on the server. */
export class ResolvedBookProvider {
  private readonly endpoint: string;
  private readonly allowDevelopmentFixture: boolean;
  private readonly developmentMemberId?: string;

  constructor(
    endpoint = '/api/isbn/lookup',
    allowDevelopmentFixture = false,
    developmentMemberId?: string,
  ) {
    this.endpoint = endpoint;
    this.allowDevelopmentFixture = allowDevelopmentFixture;
    this.developmentMemberId = developmentMemberId;
  }

  async lookup(isbn13: string, locale: AppLocale, signal?: AbortSignal): Promise<StitchedBookMetadata | null> {
    const search = new URLSearchParams({ isbn: isbn13, locale });
    if (this.allowDevelopmentFixture) search.set('fixture', '1');
    const headers = new Headers({ accept: 'application/json' });
    if (process.env.NODE_ENV !== 'production' && this.developmentMemberId) {
      headers.set('x-hana-demo-member-id', this.developmentMemberId);
    }
    const response = await fetch(`${this.endpoint}?${search}`, { credentials: 'same-origin', headers, signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Book metadata lookup failed (${response.status})`);
    return await response.json() as StitchedBookMetadata;
  }
}

export interface StitchedBookMetadata extends Omit<AddBookInput, 'condition' | 'ownerNotes'> {
  description?: string;
}

function firstValue<T>(candidates: MetadataCandidate[], sourceOrder: MetadataSource[], select: (candidate: MetadataCandidate) => T | undefined) {
  for (const source of sourceOrder) {
    const candidate = candidates.find((entry) => entry.source === source);
    const value = candidate ? select(candidate) : undefined;
    if (value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0)) {
      return { value, source };
    }
  }
  return undefined;
}

export function stitchMetadata(isbn13: string, locale: AppLocale, candidates: MetadataCandidate[]): StitchedBookMetadata {
  const bibliographicOrder: MetadataSource[] = locale === 'ko'
    ? ['nlk', 'google-books', 'fixture', 'member']
    : ['google-books', 'nlk', 'fixture', 'member'];
  const coverOrder: MetadataSource[] = ['google-books', 'nlk', 'fixture', 'member'];
  const title = firstValue(candidates, bibliographicOrder, (candidate) => candidate.title);
  const titleEn = firstValue(candidates, ['google-books', 'nlk', 'fixture'], (candidate) => candidate.titleEn);
  const authors = firstValue(candidates, bibliographicOrder, (candidate) => candidate.authors);
  const publisher = firstValue(candidates, bibliographicOrder, (candidate) => candidate.publisher);
  const publishedYear = firstValue(candidates, bibliographicOrder, (candidate) => candidate.publishedYear);
  const language = firstValue(candidates, bibliographicOrder, (candidate) => candidate.language);
  const pageCount = firstValue(candidates, ['google-books', 'nlk', 'fixture'], (candidate) => candidate.pageCount);
  const description = firstValue(candidates, ['google-books', 'nlk', 'fixture'], (candidate) => candidate.description);
  const coverUrl = firstValue(candidates, coverOrder, (candidate) => candidate.coverUrl);

  const selections = { title, titleEn, authors, publisher, publishedYear, language, pageCount, description, coverUrl };
  const provenance: Record<string, string> = {};
  for (const [field, selection] of Object.entries(selections)) {
    if (selection) provenance[field] = selection.source;
  }

  return {
    isbn13,
    title: title?.value ?? '',
    titleEn: titleEn?.value,
    authors: authors?.value ?? [],
    publisher: publisher?.value ?? '',
    publishedYear: publishedYear?.value ?? new Date().getFullYear(),
    language: language?.value ?? (locale === 'ko' ? 'ko' : 'en'),
    pageCount: pageCount?.value,
    description: description?.value,
    coverUrl: coverUrl?.value,
    provenance,
  };
}

const almondCover = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="480" height="720" viewBox="0 0 480 720">
    <rect width="480" height="720" fill="#d99d55"/>
    <path d="M0 585 480 420v300H0z" fill="#b86c44"/>
    <circle cx="240" cy="270" r="112" fill="#f4dfb2"/>
    <path d="M181 271c0-60 25-105 59-105s59 45 59 105-25 105-59 105-59-45-59-105z" fill="#7c4c31"/>
    <text x="240" y="90" text-anchor="middle" font-family="sans-serif" font-size="48" font-weight="700" fill="#2b2521">아몬드</text>
    <text x="240" y="650" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#fff7e8">손원평</text>
  </svg>
`)}`;

const fixtures: Record<string, MetadataCandidate[]> = {
  '9788936434267': [
    { source: 'nlk', isbn13: '9788936434267', title: '아몬드', authors: ['손원평'], publisher: '창비', publishedYear: 2017, language: 'ko' },
    { source: 'google-books', isbn13: '9788936434267', title: '아몬드', titleEn: 'Almond', authors: ['손원평'], pageCount: 263, language: 'ko', description: '감정을 느끼기 어려운 소년 윤재가 우정과 용기를 배워 가는 성장 소설.' },
    { source: 'fixture', isbn13: '9788936434267', coverUrl: almondCover },
  ],
  '9780593321201': [
    { source: 'google-books', isbn13: '9780593321201', title: 'Tomorrow, and Tomorrow, and Tomorrow', authors: ['Gabrielle Zevin'], publisher: 'Knopf', publishedYear: 2022, language: 'en', pageCount: 416, description: 'A novel about creative partnership, friendship, and the worlds people build together.' },
  ],
};

export async function lookupFixtureMetadata(isbn13: string, locale: AppLocale) {
  const candidates = fixtures[isbn13];
  if (!candidates) return null;
  return stitchMetadata(isbn13, locale, candidates);
}

export async function lookupWithProviders(isbn13: string, locale: AppLocale, providers: BookMetadataProvider[], signal?: AbortSignal) {
  const results = await Promise.allSettled(providers.map((provider) => provider.lookup(isbn13, locale, signal)));
  const candidates = results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
  return candidates.length > 0 ? stitchMetadata(isbn13, locale, candidates) : null;
}
