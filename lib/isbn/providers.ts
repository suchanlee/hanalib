import { classifySubjects } from '../books/classify.ts';
import { bestDescription } from '../books/descriptions.ts';
import type { CategoryEvidence } from '../books/categories';
import { ApiError, requestJson } from '../http/client.ts';
import type { AddBookInput, AppLocale } from '@/lib/domain/types';

export type MetadataSource = 'aladin' | 'nlk' | 'naver' | 'kakao-books' | 'google-books' | 'open-library' | 'member' | 'fixture';

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
  descriptionSourceUrl?: string;
  descriptionScope?: 'edition' | 'work';
  coverUrl?: string;
  subjects?: string[];
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
    try {
    const payload = await requestJson<Omit<MetadataCandidate, 'source'>>(`${this.endpoint}?isbn=${encodeURIComponent(isbn13)}&locale=${locale}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal,
    });
    return { ...payload, source: this.id };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
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

  async lookup(isbn13: string, locale: AppLocale, signal?: AbortSignal, mode: 'fast' | 'enrich' = 'fast'): Promise<StitchedBookMetadata | null> {
    const deadline = mode === 'fast' ? AbortSignal.timeout(1_900) : undefined;
    const lookupSignal = deadline ? (signal ? AbortSignal.any([signal, deadline]) : deadline) : signal;
    const search = new URLSearchParams({ isbn: isbn13, locale, mode });
    if (this.allowDevelopmentFixture) search.set('fixture', '1');
    const headers = new Headers({ accept: 'application/json' });
    if (process.env.NODE_ENV !== 'production' && this.developmentMemberId) {
      headers.set('x-hana-demo-member-id', this.developmentMemberId);
    }
    try {
    return await requestJson<StitchedBookMetadata>(`${this.endpoint}?${search}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers,
      signal: lookupSignal,
    });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
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

function bestEditionTitle(candidates: MetadataCandidate[], locale: AppLocale, sourceOrder: MetadataSource[]) {
  if (locale === 'ko') {
    const authoritative = firstValue(candidates, ['nlk', 'naver', 'kakao-books'], (candidate) => candidate.title);
    if (authoritative) return authoritative;
  }

  return candidates
    .flatMap((candidate) => candidate.title?.trim() ? [{ candidate, title: candidate.title.trim() }] : [])
    .sort((left, right) => {
      const score = ({ candidate, title }: typeof left) => {
        const hasHangul = /[\uac00-\ud7a3]/.test(title);
        const scriptMatches = locale === 'ko' ? hasHangul : !hasHangul;
        const languageMatches = candidate.language === locale;
        const sourceRank = sourceOrder.indexOf(candidate.source);
        return (scriptMatches ? 1_000 : 0)
          + (languageMatches ? 500 : 0)
          + Math.min(title.length, 160)
          + (sourceRank < 0 ? 0 : sourceOrder.length - sourceRank);
      };
      return score(right) - score(left);
    })
    .map(({ candidate, title }) => ({ value: title, source: candidate.source }))
    .at(0);
}

export function stitchMetadata(isbn13: string, locale: AppLocale, candidates: MetadataCandidate[]): StitchedBookMetadata {
  candidates = candidates.filter((candidate) => candidate.isbn13 === isbn13);
  const bibliographicOrder: MetadataSource[] = locale === 'ko'
    ? ['nlk', 'naver', 'kakao-books', 'google-books', 'open-library', 'aladin', 'fixture', 'member']
    : ['google-books', 'open-library', 'kakao-books', 'naver', 'nlk', 'aladin', 'fixture', 'member'];
  const coverOrder: MetadataSource[] = locale === 'ko'
    ? ['kakao-books', 'naver', 'google-books', 'nlk', 'open-library', 'aladin', 'fixture', 'member']
    : ['google-books', 'open-library', 'kakao-books', 'naver', 'nlk', 'aladin', 'fixture', 'member'];
  const title = bestEditionTitle(candidates, locale, bibliographicOrder);
  const titleEn = firstValue(candidates, ['google-books', 'open-library', 'kakao-books', 'naver', 'nlk', 'fixture'], (candidate) => candidate.titleEn);
  const authors = firstValue(candidates, bibliographicOrder, (candidate) => candidate.authors);
  const publisher = firstValue(candidates, bibliographicOrder, (candidate) => candidate.publisher);
  const publishedYear = firstValue(candidates, bibliographicOrder, (candidate) => candidate.publishedYear);
  const titleCandidate = title ? candidates.find((candidate) => candidate.source === title.source) : undefined;
  const language = titleCandidate?.language
    ? { value: titleCandidate.language, source: titleCandidate.source }
    : firstValue(candidates, bibliographicOrder, (candidate) => candidate.language);
  const pageCount = firstValue(candidates, ['google-books', 'open-library', 'nlk', 'naver', 'kakao-books', 'fixture'], (candidate) => candidate.pageCount);
  const editionLanguage = language?.value === 'ko' || /[\uac00-\ud7a3]/.test(title?.value ?? '') ? 'ko' : language?.value === 'en' ? 'en' : locale;
  const description = bestDescription(candidates.filter((candidate) => candidate.isbn13 === isbn13), editionLanguage, bibliographicOrder);
  const coverUrl = firstValue(candidates, coverOrder, (candidate) => candidate.coverUrl);

  const selections = { title, titleEn, authors, publisher, publishedYear, language, pageCount, description, coverUrl };
  const provenance: Record<string, string> = {};
  for (const [field, selection] of Object.entries(selections)) {
    if (selection) provenance[field] = selection.source;
  }

  if (description?.candidate.descriptionSourceUrl) provenance.descriptionUrl = description.candidate.descriptionSourceUrl;
  if (description?.candidate.descriptionScope) provenance.descriptionScope = description.candidate.descriptionScope;

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
    categories: classifySubjects(candidates.flatMap((candidate): CategoryEvidence[] =>
      candidate.subjects?.length && ['aladin', 'google-books', 'open-library'].includes(candidate.source)
        ? [{ source: candidate.source as CategoryEvidence['source'], subjects: candidate.subjects }] : [])),
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
