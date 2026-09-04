import type { MetadataCandidate } from './providers';

interface GoogleVolumeInfo {
  title?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  language?: string;
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
}

export interface GoogleVolumesResponse {
  items?: Array<{ volumeInfo?: GoogleVolumeInfo }>;
}

function language(value?: string): MetadataCandidate['language'] {
  if (value === 'ko') return 'ko';
  if (value === 'en') return 'en';
  return 'other';
}

function year(value?: string) {
  const match = value?.match(/^\d{4}/);
  return match ? Number(match[0]) : undefined;
}

export function normalizeGoogleBooksResponse(isbn13: string, response: GoogleVolumesResponse): Omit<MetadataCandidate, 'source'> | null {
  const exact = response.items?.find(({ volumeInfo }) => volumeInfo?.industryIdentifiers?.some(({ identifier }) => identifier?.replace(/\D/g, '') === isbn13));
  const info = exact?.volumeInfo;
  if (!info?.title || !info.authors?.length) return null;
  const rawCover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;

  return {
    isbn13,
    title: info.title,
    authors: info.authors,
    publisher: info.publisher,
    publishedYear: year(info.publishedDate),
    language: language(info.language),
    pageCount: info.pageCount,
    description: info.description,
    coverUrl: rawCover?.replace(/^http:/, 'https:'),
  };
}

type UnknownRecord = Record<string, unknown>;

function records(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object');
  return [];
}

function text(record: UnknownRecord, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function normalizeNlkResponse(isbn13: string, response: UnknownRecord): Omit<MetadataCandidate, 'source'> | null {
  const candidates = [
    ...records(response.docs),
    ...records(response.items),
    ...records(response.RESULT),
    ...records(response.result),
  ];
  const candidatesWithIsbn = candidates.filter((item) => text(item, 'EA_ISBN'));
  const exact = candidates.find((item) => text(item, 'EA_ISBN')?.replace(/\D/g, '') === isbn13);
  if (candidatesWithIsbn.length > 0 && !exact) return null;
  const selected = exact ?? candidates[0];
  if (!selected) return null;
  const title = text(selected, 'TITLE');
  if (!title) return null;
  const author = text(selected, 'AUTHOR');
  const pageText = text(selected, 'PAGE');
  const parsedPages = pageText ? Number(pageText.match(/\d+/)?.[0]) : undefined;

  return {
    isbn13,
    title,
    authors: author?.split(/[;,/]/).map((value) => value.trim()).filter(Boolean),
    publisher: text(selected, 'PUBLISHER'),
    publishedYear: year(text(selected, 'PUBLISH_PREDATE')),
    language: 'ko',
    pageCount: parsedPages && Number.isFinite(parsedPages) ? parsedPages : undefined,
    coverUrl: text(selected, 'TITLE_URL')?.replace(/^http:/, 'https:'),
  };
}
