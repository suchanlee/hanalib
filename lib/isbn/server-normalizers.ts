import type { MetadataCandidate } from './providers';
import { isbn10To13, normalizeIsbn } from './isbn.ts';
import { highResolutionCoverUrl } from './cover-url.ts';
import { bestDescription, cleanDescription } from '../books/descriptions.ts';

interface GoogleVolumeInfo {
  title?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  language?: string;
  categories?: string[];
  imageLinks?: {
    extraLarge?: string;
    large?: string;
    medium?: string;
    small?: string;
    thumbnail?: string;
    smallThumbnail?: string;
  };
  industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
}

export interface GoogleVolumesResponse {
  items?: Array<{ id?: string; volumeInfo?: GoogleVolumeInfo }>;
}

export interface NaverBooksResponse {
  items?: Array<{
    title?: string;
    image?: string;
    author?: string;
    publisher?: string;
    pubdate?: string;
    isbn?: string;
    description?: string;
  }>;
}

export interface KakaoBooksResponse {
  documents?: Array<{
    title?: string;
    contents?: string;
    isbn?: string;
    datetime?: string;
    authors?: string[];
    publisher?: string;
    thumbnail?: string;
  }>;
}

export interface OpenLibraryEditionResponse {
  key?: string;
  author?: string[];
  edition_name?: string;
  title?: string;
  subtitle?: string;
  authors?: Array<{ key?: string }>;
  by_statement?: string;
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  languages?: Array<{ key?: string }>;
  covers?: number[];
  subjects?: string[];
  works?: Array<{ key?: string }>;
  isbn_10?: string[];
  isbn_13?: string[];
  description?: string | { value?: string };
}

export interface OpenLibrarySearchResponse {
  docs?: Array<{
    title?: string;
    author_name?: string[];
    publisher?: string[];
    first_publish_year?: number;
    language?: string[];
    isbn?: string[];
    cover_i?: number;
  }>;
}

function language(value?: string): MetadataCandidate['language'] {
  if (value === 'ko') return 'ko';
  if (value === 'en') return 'en';
  return value ? 'other' : undefined;
}

function year(value?: string) {
  const match = value?.match(/\d{4}/);
  return match ? Number(match[0]) : undefined;
}

function cleanMarkup(value?: string) {
  if (!value) return undefined;
  const cleaned = value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

function includesIsbn13(values: string[], isbn13: string) {
  return values.some((value) => {
    const normalized = normalizeIsbn(value);
    return (
      normalized === isbn13 ||
      (normalized.length === 10 && isbn10To13(normalized) === isbn13)
    );
  });
}

function openLibraryLanguage(values: string[]): MetadataCandidate['language'] {
  const mapped = new Set(
    values
      .map((value) => {
        const code = value.split('/').pop();
        return code === 'kor'
          ? 'ko'
          : code === 'eng'
            ? 'en'
            : code
              ? 'other'
              : undefined;
      })
      .filter((value): value is NonNullable<MetadataCandidate['language']> =>
        Boolean(value),
      ),
  );
  if (mapped.size > 1) return 'other';
  return mapped.values().next().value;
}

export function normalizeGoogleBooksResponse(
  isbn13: string,
  response: GoogleVolumesResponse,
): Omit<MetadataCandidate, 'source'> | null {
  const exact =
    response.items?.flatMap(({ volumeInfo }) =>
      volumeInfo &&
      includesIsbn13(
        volumeInfo?.industryIdentifiers?.flatMap(({ identifier }) =>
          identifier ? [identifier] : [],
        ) ?? [],
        isbn13,
      )
        ? [volumeInfo]
        : [],
    ) ?? [];
  const first = <T>(select: (info: GoogleVolumeInfo) => T | undefined) =>
    exact.map(select).find((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== '';
    });
  const title = first((info) => info.title);
  if (!title) return null;
  const rawCover =
    first((info) => info.imageLinks?.extraLarge) ??
    first((info) => info.imageLinks?.large) ??
    first((info) => info.imageLinks?.medium) ??
    first((info) => info.imageLinks?.small) ??
    first((info) => info.imageLinks?.thumbnail) ??
    first((info) => info.imageLinks?.smallThumbnail);

  const selectedDescription = bestDescription(
    (response.items ?? [])
      .filter((item) => item.volumeInfo && exact.includes(item.volumeInfo))
      .map((item) => ({
        source: 'google-books',
        description: item.volumeInfo?.description,
        id: item.id,
      })),
    language(first((info) => info.language)) === 'ko' ||
      /[\uac00-\ud7a3]/.test(title)
      ? 'ko'
      : 'en',
    ['google-books'],
  );
  return {
    isbn13,
    title,
    ...(selectedDescription?.candidate.id
      ? {
          descriptionSourceUrl: `https://books.google.com/books?id=${encodeURIComponent(selectedDescription.candidate.id)}`,
          descriptionScope: 'edition' as const,
        }
      : {}),
    subjects: [...new Set(exact.flatMap((info) => info.categories ?? []))],
    authors: first((info) => info.authors),
    publisher: first((info) => info.publisher),
    publishedYear: year(first((info) => info.publishedDate)),
    language: language(first((info) => info.language)),
    pageCount: first((info) => info.pageCount),
    description: selectedDescription?.value,
    coverUrl: rawCover ? highResolutionCoverUrl(rawCover) : undefined,
  };
}

type UnknownRecord = Record<string, unknown>;

function records(value: unknown): UnknownRecord[] {
  if (Array.isArray(value))
    return value.filter(
      (item): item is UnknownRecord =>
        Boolean(item) && typeof item === 'object',
    );
  return [];
}

function text(record: UnknownRecord, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function normalizeNlkResponse(
  isbn13: string,
  response: UnknownRecord,
): Omit<MetadataCandidate, 'source'> | null {
  const candidates = [
    ...records(response.docs),
    ...records(response.items),
    ...records(response.RESULT),
    ...records(response.result),
  ];
  const selected = candidates.find((item) =>
    includesIsbn13(text(item, 'EA_ISBN')?.split(/\s+/) ?? [], isbn13),
  );
  if (!selected) return null;
  const title = text(selected, 'TITLE');
  if (!title) return null;
  const author = text(selected, 'AUTHOR');
  const pageText = text(selected, 'PAGE');
  const parsedPages = pageText ? Number(pageText.match(/\d+/)?.[0]) : undefined;

  return {
    isbn13,
    title,
    authors: author
      ?.split(/[;,/]/)
      .map((value) => value.trim())
      .filter(Boolean),
    publisher: text(selected, 'PUBLISHER'),
    publishedYear: year(text(selected, 'PUBLISH_PREDATE')),
    language: 'ko',
    pageCount:
      parsedPages && Number.isFinite(parsedPages) ? parsedPages : undefined,
    coverUrl: text(selected, 'TITLE_URL')?.replace(/^http:/, 'https:'),
  };
}

export function normalizeNaverBooksResponse(
  isbn13: string,
  response: NaverBooksResponse,
): Omit<MetadataCandidate, 'source'> | null {
  const exact = response.items?.find((item) =>
    includesIsbn13(item.isbn?.split(/\s+/) ?? [], isbn13),
  );
  const title = cleanMarkup(exact?.title);
  if (!exact || !title) return null;
  const authors = cleanMarkup(exact.author)
    ?.split(/[|^;,]/)
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    isbn13,
    title,
    authors,
    publisher: cleanMarkup(exact.publisher),
    publishedYear: year(exact.pubdate),
    language: /[\uac00-\ud7a3]/.test(title) ? 'ko' : undefined,
    description: cleanDescription(exact.description),
    coverUrl: exact.image?.replace(/^http:/, 'https:'),
  };
}

export function normalizeKakaoBooksResponse(
  isbn13: string,
  response: KakaoBooksResponse,
): Omit<MetadataCandidate, 'source'> | null {
  const exact = response.documents?.find((item) =>
    includesIsbn13(item.isbn?.split(/\s+/) ?? [], isbn13),
  );
  const title = cleanMarkup(exact?.title);
  if (!exact || !title) return null;
  const authors = exact.authors?.map((author) => author.trim()).filter(Boolean);

  return {
    isbn13,
    title,
    authors,
    publisher: cleanMarkup(exact.publisher),
    publishedYear: year(exact.datetime),
    language: /[\uac00-\ud7a3]/.test(title) ? 'ko' : undefined,
    description: cleanDescription(exact.contents),
    coverUrl: exact.thumbnail
      ? highResolutionCoverUrl(exact.thumbnail)
      : undefined,
  };
}

export function normalizeOpenLibraryEditionResponse(
  isbn13: string,
  response: OpenLibraryEditionResponse,
  authorNames: string[] = [],
): Omit<MetadataCandidate, 'source'> | null {
  const identifiers = [
    ...(response.isbn_13 ?? []),
    ...(response.isbn_10 ?? []),
  ];
  if (!includesIsbn13(identifiers, isbn13)) return null;
  const baseTitle = cleanMarkup(response.title);
  if (!baseTitle) return null;
  const subtitle = cleanMarkup(response.subtitle);
  const title =
    subtitle && !baseTitle.includes(subtitle)
      ? `${baseTitle}: ${subtitle}`
      : baseTitle;
  const statementAuthor = cleanMarkup(response.by_statement)?.replace(
    /^by\s+/i,
    '',
  );
  const authors = authorNames.map((value) => value.trim()).filter(Boolean);
  if (authors.length === 0 && statementAuthor) authors.push(statementAuthor);
  const coverId = response.covers?.find(
    (value) => Number.isInteger(value) && value > 0,
  );
  const rawDescription =
    typeof response.description === 'string'
      ? response.description
      : response.description?.value;
  const detectedLanguage = openLibraryLanguage(
    response.languages?.flatMap(({ key }) => (key ? [key] : [])) ?? [],
  );

  return {
    isbn13,
    title,
    authors,
    publisher: response.publishers?.find((value) => value.trim())?.trim(),
    publishedYear: year(response.publish_date),
    language: detectedLanguage,
    pageCount:
      Number.isInteger(response.number_of_pages) &&
      (response.number_of_pages ?? 0) > 0
        ? response.number_of_pages
        : undefined,
    description: cleanDescription(rawDescription),
    subjects: response.subjects,
    coverUrl: coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`
      : undefined,
  };
}

export function normalizeOpenLibrarySearchResponse(
  isbn13: string,
  response: OpenLibrarySearchResponse,
): Omit<MetadataCandidate, 'source'> | null {
  const exact = response.docs?.find((document) =>
    includesIsbn13(document.isbn ?? [], isbn13),
  );
  const title = cleanMarkup(exact?.title);
  if (!exact || !title) return null;

  const authors = exact.author_name
    ?.map((value) => cleanMarkup(value))
    .filter((value): value is string => Boolean(value));
  const publishers = [
    ...new Set(
      exact.publisher
        ?.map((value) => cleanMarkup(value))
        .filter((value): value is string => Boolean(value)) ?? [],
    ),
  ];
  const detectedLanguage = openLibraryLanguage(exact.language ?? []);
  const coverId =
    Number.isInteger(exact.cover_i) && (exact.cover_i ?? 0) > 0
      ? exact.cover_i
      : undefined;

  return {
    isbn13,
    title,
    authors,
    // Search documents can aggregate multiple editions. Only trust an unambiguous publisher.
    publisher: publishers.length === 1 ? publishers[0] : undefined,
    publishedYear:
      Number.isInteger(exact.first_publish_year) &&
      (exact.first_publish_year ?? 0) > 0
        ? exact.first_publish_year
        : undefined,
    language: detectedLanguage,
    coverUrl: coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`
      : undefined,
  };
}

export interface AladinResponse {
  errorCode?: number;
  item?: Array<{
    isbn13?: string;
    isbn?: string;
    title?: string;
    author?: string;
    publisher?: string;
    pubDate?: string;
    description?: string;
    categoryId?: number;
    categoryName?: string;
  }>;
}

/** Aladin provides retailer categories, not canonical Thema codes. */
export function normalizeAladinResponse(
  isbn13: string,
  response: AladinResponse,
): Omit<MetadataCandidate, 'source'> | null {
  const exact = response.item?.find((item) =>
    includesIsbn13([item.isbn13 ?? '', item.isbn ?? ''], isbn13),
  );
  const title = cleanMarkup(exact?.title);
  if (!exact || !title) return null;
  return {
    isbn13,
    title,
    authors: cleanMarkup(exact.author)
      ?.replace(/\s*\([^)]*\)/g, '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    publisher: cleanMarkup(exact.publisher),
    publishedYear: year(exact.pubDate),
    description: cleanDescription(exact.description),
    subjects: exact.categoryName ? [exact.categoryName] : [],
  };
}
