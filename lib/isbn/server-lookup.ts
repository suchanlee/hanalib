import {
  retrievalClient,
  retrievalIncomplete,
  type RetrievalOptions,
  type RetrievalDiagnostic,
} from './retrieval.ts';
import {
  assessDescription,
  cleanDescription,
  descriptionLanguage,
  isFullerDescription,
} from '../books/descriptions.ts';
import type { AppLocale } from '../domain/types.ts';
import {
  lookupFixtureMetadata,
  stitchMetadata,
  type MetadataCandidate,
  type StitchedBookMetadata,
} from './providers.ts';
import { isbn13To10 } from './isbn.ts';
import {
  normalizeAladinResponse,
  type AladinResponse,
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

export type ProviderStatus =
  | 'ok'
  | 'partial'
  | 'not-found'
  | 'failed'
  | 'not-configured';
export type ProviderId =
  | 'aladin'
  | 'nlk'
  | 'naver'
  | 'kakao-books'
  | 'google-books'
  | 'open-library';

export interface LookupProviderConfig {
  aladinTtbKey?: string;
  nlkApiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
  kakaoRestApiKey?: string;
  googleBooksApiKey?: string;
  timeoutMs?: number;
  basicOnly?: boolean;
}

export interface ServerLookupResult {
  metadata: StitchedBookMetadata | null;
  providerStatus: Record<ProviderId, ProviderStatus>;
  usedFixture: boolean;
  diagnostics: RetrievalDiagnostic[];
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 8_000;

function providerSignal(timeoutMs: number) {
  return AbortSignal.timeout(Math.max(100, Math.min(timeoutMs, 15_000)));
}

export async function fetchAladinMetadata(
  isbn13: string,
  apiKey: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
) {
  const url = new URL('https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx');
  url.search = new URLSearchParams({
    ttbkey: apiKey,
    itemIdType: 'ISBN13',
    ItemId: isbn13,
    output: 'js',
    Version: '20131101',
  }).toString();
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: { accept: 'application/json' },
    signal: providerSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`Aladin responded with ${response.status}.`);
  const payload = (await response.json()) as AladinResponse;
  if (payload.errorCode) throw new Error('Aladin lookup failed.');
  const normalized = normalizeAladinResponse(isbn13, payload);
  return normalized ? { ...normalized, source: 'aladin' as const } : null;
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
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('NLK returned an invalid payload.');
  const normalized = normalizeNlkResponse(
    isbn13,
    payload as Record<string, unknown>,
  );
  return normalized ? { ...normalized, source: 'nlk' as const } : null;
}

export async function fetchGoogleBooksMetadata(
  isbn13: string,
  apiKey: string,
  options: RetrievalOptions = {},
) {
  const client = retrievalClient('google-books', options);
  const items: NonNullable<GoogleVolumesResponse['items']> = [];
  const lookup = async (identifier: string, stage: string) => {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.search = new URLSearchParams({
      q: `isbn:${identifier}`,
      maxResults: '10',
      printType: 'books',
      key: apiKey,
    }).toString();
    const payload = await client.json<GoogleVolumesResponse>(url, stage);
    for (const item of payload?.items ?? []) {
      if (normalizeGoogleBooksResponse(isbn13, { items: [item] }))
        items.push(item);
      else
        client.report({
          stage,
          outcome: 'rejected',
          reason: 'identifier-or-title-mismatch',
        });
    }
  };
  const normalized = () => normalizeGoogleBooksResponse(isbn13, { items });
  const needsDescription = () =>
    assessDescription(normalized()?.description).quality !== 'substantive';
  await lookup(isbn13, 'search-isbn13');
  const isbn10 = isbn13To10(isbn13);
  if (!options.basicOnly && needsDescription() && isbn10)
    await lookup(isbn10, 'search-isbn10');
  if (!options.basicOnly && needsDescription()) {
    const ids = [
      ...new Set(
        items.flatMap((item) =>
          item.id && /^[a-zA-Z0-9_-]+$/.test(item.id) ? [item.id] : [],
        ),
      ),
    ].slice(0, 3);
    const details = await Promise.all(
      ids.map(async (id) => {
        const url = new URL(
          `https://www.googleapis.com/books/v1/volumes/${id}`,
        );
        url.search = new URLSearchParams({
          key: apiKey,
          projection: 'full',
        }).toString();
        const item = await client.json<
          NonNullable<GoogleVolumesResponse['items']>[number]
        >(url, `volume:${id}`);
        if (
          item &&
          item.id === id &&
          normalizeGoogleBooksResponse(isbn13, { items: [item] })
        )
          return item;
        else if (item)
          client.report({
            stage: 'volume-selection',
            outcome: 'rejected',
            reason: 'identifier-or-record-mismatch',
            record: id,
          });
        return undefined;
      }),
    );
    items.push(
      ...details.filter((item): item is NonNullable<typeof item> =>
        Boolean(item),
      ),
    );
  }
  const result = normalized();
  client.report({
    stage: 'description-selection',
    outcome: result?.description ? 'ok' : 'not-found',
    descriptionCharacters: result?.description?.length ?? 0,
  });
  if (!result && retrievalIncomplete(client.events))
    throw new Error('Google Books retrieval incomplete.');
  return result ? { ...result, source: 'google-books' as const } : null;
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
  if (!response.ok)
    throw new Error(`Naver Books responded with ${response.status}.`);
  const normalized = normalizeNaverBooksResponse(
    isbn13,
    (await response.json()) as NaverBooksResponse,
  );
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
  if (!response.ok)
    throw new Error(`Kakao Books responded with ${response.status}.`);
  const normalized = normalizeKakaoBooksResponse(
    isbn13,
    (await response.json()) as KakaoBooksResponse,
  );
  return normalized ? { ...normalized, source: 'kakao-books' as const } : null;
}

export async function fetchOpenLibraryMetadata(
  isbn13: string,
  options: RetrievalOptions = {},
) {
  const client = retrievalClient('open-library', options, {
    accept: 'application/json',
    'user-agent': 'Hana Seed Books/1.0 (https://library.hanaseed.org)',
  });
  const normalizeTitle = (s: string) =>
    s
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '');
  type Work = {
    key?: string;
    title?: string;
    subjects?: string[];
    authors?: Array<{ author?: { key?: string } }>;
    description?: string | { value?: string };
  };
  const workCache = new Map<string, Promise<Work | null>>();
  const authorCache = new Map<string, Promise<string | undefined>>();
  const authorName = (key: string) => {
    if (!/^\/authors\/OL\d+A$/.test(key)) return Promise.resolve(undefined);
    if (!authorCache.has(key))
      authorCache.set(
        key,
        client
          .json<{ name?: string }>(
            `https://openlibrary.org${key}.json`,
            `author:${key}`,
          )
          .then((p) => p?.name?.trim()),
      );
    return authorCache.get(key)!;
  };
  const getWork = (edition: OpenLibraryEditionResponse) => {
    const key = edition.works?.length === 1 ? edition.works[0].key : undefined;
    if (!key || !/^\/works\/OL\d+W$/.test(key)) return Promise.resolve(null);
    if (!workCache.has(key))
      workCache.set(
        key,
        client
          .json<Work>(`https://openlibrary.org${key}.json`, `work:${key}`)
          .then((w) => {
            if (w?.key && w.key !== key) {
              client.report({
                stage: 'work-selection',
                outcome: 'rejected',
                reason: 'record-mismatch',
                record: key,
              });
              return null;
            }
            return w;
          }),
      );
    return workCache.get(key)!;
  };
  const searchUrl = new URL('https://openlibrary.org/search.json');
  searchUrl.search = new URLSearchParams({
    q: `isbn:${isbn13}`,
    fields:
      'title,author_name,publisher,first_publish_year,language,isbn,cover_i',
    limit: '10',
  }).toString();
  const searchPromise = client
    .json<OpenLibrarySearchResponse>(searchUrl, 'search')
    .then((payload) =>
      payload ? normalizeOpenLibrarySearchResponse(isbn13, payload) : null,
    );
  if (options.basicOnly) {
    const result = await searchPromise;
    if (!result && retrievalIncomplete(client.events))
      throw new Error('Open Library lookup incomplete.');
    return result ? { ...result, source: 'open-library' as const } : null;
  }
  const rawEdition = await client.json<OpenLibraryEditionResponse>(
    `https://openlibrary.org/isbn/${isbn13}.json`,
    'edition',
  );
  const editions: OpenLibraryEditionResponse[] = [];
  const addEdition = (e: OpenLibraryEditionResponse, stage: string) => {
    if (!normalizeOpenLibraryEditionResponse(isbn13, e)) {
      client.report({
        stage,
        outcome: 'rejected',
        reason: 'identifier-or-title-mismatch',
        record: e.key,
      });
      return;
    }
    if (!editions.some((existing) => e.key && existing.key === e.key))
      editions.push(e);
  };
  if (rawEdition) addEdition(rawEdition, 'edition-selection');
  // Search metadata aggregates editions; use its record IDs for discovery only.
  if (!editions.length) {
    const url = new URL('https://openlibrary.org/search.json');
    url.search = new URLSearchParams({
      q: `isbn:${isbn13}`,
      fields: 'key,title,editions,editions.key',
      limit: '3',
    }).toString();
    const discovered = await client.json<{
      docs?: Array<{ editions?: { docs?: Array<{ key?: string }> } }>;
    }>(url, 'edition-discovery');
    const keys = [
      ...new Set(
        discovered?.docs?.flatMap(
          (d) =>
            d.editions?.docs?.flatMap((e) =>
              e.key && /^\/books\/OL\d+M$/.test(e.key) ? [e.key] : [],
            ) ?? [],
        ) ?? [],
      ),
    ].slice(0, 3);
    const details = await Promise.all(
      keys.map((key) =>
        client.json<OpenLibraryEditionResponse>(
          `https://openlibrary.org${key}.json`,
          `edition-detail:${key}`,
        ),
      ),
    );
    details.forEach((e, i) => {
      if (e && e.key === keys[i]) addEdition(e, 'edition-detail-selection');
      else if (e)
        client.report({
          stage: 'edition-detail-selection',
          outcome: 'rejected',
          reason: 'record-mismatch',
        });
    });
  }
  const primary = editions[0];
  let normalized = primary
    ? normalizeOpenLibraryEditionResponse(isbn13, primary)!
    : null;
  const evaluate = async (edition: OpenLibraryEditionResponse) => {
    const keys = [
      ...new Set(
        (edition.authors ?? []).flatMap((a) => (a.key ? [a.key] : [])),
      ),
    ].slice(0, 12);
    const [names, work] = await Promise.all([
      Promise.all(keys.map(authorName)),
      getWork(edition),
    ]);
    const candidate = normalizeOpenLibraryEditionResponse(
      isbn13,
      edition,
      names.filter((n): n is string => Boolean(n)),
    )!;
    if (candidate.description) {
      candidate.descriptionSourceUrl =
        edition.key && /^\/books\/OL\d+M$/.test(edition.key)
          ? `https://openlibrary.org${edition.key}`
          : `https://openlibrary.org/isbn/${isbn13}`;
      candidate.descriptionScope = 'edition';
    }
    if (!work) return candidate;
    candidate.subjects = [
      ...(candidate.subjects ?? []),
      ...(work.subjects ?? []).filter((s) => typeof s === 'string'),
    ];
    const raw =
      typeof work.description === 'string'
        ? work.description
        : work.description?.value;
    const description = cleanDescription(
      raw
        ?.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1'),
    );
    if (!description) {
      client.report({
        stage: 'work-selection',
        outcome: 'not-found',
        reason: 'no-description',
        record: edition.works![0].key,
      });
      return candidate;
    }
    const workKeys = (work.authors ?? []).flatMap((a) =>
      a.author?.key ? [a.author.key] : [],
    );
    const authorConflict =
      keys.length > 0 &&
      workKeys.length > 0 &&
      !keys.some((k) => workKeys.includes(k));
    const et = normalizeTitle(edition.title ?? '');
    const wt = normalizeTitle(work.title ?? '');
    const exactTitle = Boolean(et && wt && et === wt);
    const parts = (s: string) =>
      s.split(':').map(normalizeTitle).filter(Boolean);
    const titleVariant = Boolean(
      et &&
      wt &&
      (parts(edition.title ?? '').includes(wt) ||
        parts(work.title ?? '').includes(et)),
    );
    let authorCorroborated = keys.some((k) => workKeys.includes(k));
    if (!exactTitle && titleVariant && !authorConflict && !authorCorroborated) {
      const workNames = await Promise.all(workKeys.slice(0, 3).map(authorName));
      const evidenceNames = [
        ...(candidate.authors ?? []),
        ...((await searchPromise)?.authors ?? []),
      ].map(normalizeTitle);
      authorCorroborated = workNames.some(
        (name) => name && evidenceNames.includes(normalizeTitle(name)),
      );
    }
    const adaptation = (text: string) =>
      /\b(?:graphic novels?|graphic adaptations?|adapted|abridged|retold)\b/i.test(
        text,
      );
    const editionAdapted = adaptation(
      [
        edition.title,
        edition.subtitle,
        edition.edition_name,
        edition.by_statement,
        ...(edition.subjects ?? []),
      ].join(' '),
    );
    const workAdapted = adaptation(
      [work.title, description, ...(work.subjects ?? [])].join(' '),
    );
    const sameLanguage =
      candidate.language &&
      descriptionLanguage(description) === candidate.language &&
      description
        .split(/\n\s*\n/)
        .filter((p) => p.length >= 80)
        .every((p) => descriptionLanguage(p) === candidate.language);
    const reason = authorConflict
      ? 'author-conflict'
      : !(exactTitle || (titleVariant && authorCorroborated))
        ? 'title-or-author-unconfirmed'
        : editionAdapted && !workAdapted
          ? 'adaptation-mismatch'
          : !candidate.language
            ? 'edition-language-missing'
            : !sameLanguage
              ? 'description-language-mismatch'
              : !isFullerDescription(candidate.description, description)
                ? 'no-description-improvement'
                : undefined;
    client.report({
      stage: 'work-selection',
      outcome: reason ? 'rejected' : 'ok',
      reason,
      record: edition.works![0].key,
      descriptionCharacters: description.length,
    });
    if (!reason) {
      candidate.description = description;
      candidate.descriptionSourceUrl = `https://openlibrary.org${edition.works![0].key}`;
      candidate.descriptionScope = 'work';
    }
    return candidate;
  };
  if (primary) {
    type EditionPage = {
      entries?: OpenLibraryEditionResponse[];
      links?: { next?: string };
    };
    const primaryWork =
      primary.works?.length === 1 ? primary.works[0].key : undefined;
    const alternativePage = () =>
      client.json<EditionPage>(
        `https://openlibrary.org${primaryWork}/editions.json?limit=100`,
        'alternative-editions',
      );
    // Missing language is known before work retrieval. Fetch corroboration concurrently.
    const prefetchedAlternatives =
      primaryWork &&
      /^\/works\/OL\d+W$/.test(primaryWork) &&
      !normalized?.language &&
      assessDescription(normalized?.description).quality !== 'substantive'
        ? alternativePage()
        : undefined;
    normalized = await evaluate(primary);
    // A single bounded page; alternative records must repeat this ISBN and work link.
    const key = primary.works?.length === 1 ? primary.works[0].key : undefined;
    if (
      key &&
      /^\/works\/OL\d+W$/.test(key) &&
      assessDescription(normalized.description).quality !== 'substantive'
    ) {
      const payload = await (prefetchedAlternatives ?? alternativePage());
      if (payload?.links?.next || (payload?.entries?.length ?? 0) >= 100)
        client.report({
          stage: 'alternative-editions',
          outcome: 'skipped',
          reason: 'page-budget-exhausted',
        });
      const matches = [...(payload?.entries ?? []), ...editions.slice(1)]
        .filter((e) => {
          const n = normalizeOpenLibraryEditionResponse(isbn13, e);
          const sameWork = e.works?.length === 1 && e.works[0].key === key;
          const primaryKeys = (primary.authors ?? []).map((a) => a.key);
          const otherKeys = (e.authors ?? []).map((a) => a.key);
          const conflict =
            primaryKeys.length &&
            otherKeys.length &&
            !primaryKeys.some((k) => otherKeys.includes(k));
          if (!n || e.key === primary.key) return false;
          const reason =
            !e.key || !/^\/books\/OL\d+M$/.test(e.key)
              ? 'record-mismatch'
              : !sameWork
                ? 'work-link-mismatch'
                : conflict
                  ? 'author-conflict'
                  : normalizeTitle(e.title ?? '') !==
                      normalizeTitle(primary.title ?? '')
                    ? 'title-mismatch'
                    : normalized!.language &&
                        n.language &&
                        normalized!.language !== n.language
                      ? 'edition-language-conflict'
                      : undefined;
          if (reason)
            client.report({
              stage: 'alternative-edition-selection',
              outcome: 'rejected',
              reason,
              record: e.key,
            });
          return !reason;
        })
        .slice(0, 3);
      const knownLanguages = new Set(
        matches.flatMap((e) => {
          const l = normalizeOpenLibraryEditionResponse(isbn13, e)?.language;
          return l ? [l] : [];
        }),
      );
      if (!normalized.language && knownLanguages.size > 1) {
        client.report({
          stage: 'alternative-edition-selection',
          outcome: 'rejected',
          reason: 'conflicting-edition-languages',
        });
      } else {
        for (const e of matches) {
          const alternative = await evaluate(e);
          if (
            isFullerDescription(normalized.description, alternative.description)
          ) {
            normalized.description = alternative.description;
            normalized.descriptionSourceUrl = alternative.descriptionSourceUrl;
            normalized.descriptionScope = alternative.descriptionScope;
          }
          normalized.language ??= alternative.language;
          if (!normalized.authors?.length)
            normalized.authors = alternative.authors;
        }
      }
    }
  }
  const search = await searchPromise;
  if (!normalized && !search) {
    if (retrievalIncomplete(client.events))
      throw new Error('Open Library retrieval incomplete.');
    return null;
  }
  const preferred = normalized ?? search!;
  const result = {
    ...preferred,
    authors: preferred.authors?.length ? preferred.authors : search?.authors,
    publisher: preferred.publisher ?? search?.publisher,
    publishedYear: preferred.publishedYear ?? search?.publishedYear,
    language: preferred.language ?? search?.language,
    coverUrl: preferred.coverUrl ?? search?.coverUrl,
  };
  client.report({
    stage: 'description-selection',
    outcome: result.description ? 'ok' : 'not-found',
    descriptionCharacters: result.description?.length ?? 0,
  });
  return { ...result, source: 'open-library' as const };
}

export async function resolveBookMetadata(
  isbn13: string,
  locale: AppLocale,
  config: LookupProviderConfig,
  options: { fetchImpl?: FetchLike; allowFixture?: boolean } = {},
): Promise<ServerLookupResult> {
  const providerStatus: Record<ProviderId, ProviderStatus> = {
    aladin: config.aladinTtbKey ? 'failed' : 'not-configured',
    nlk: config.nlkApiKey ? 'failed' : 'not-configured',
    naver:
      config.naverClientId && config.naverClientSecret
        ? 'failed'
        : 'not-configured',
    'kakao-books': config.kakaoRestApiKey ? 'failed' : 'not-configured',
    'google-books': config.googleBooksApiKey ? 'failed' : 'not-configured',
    'open-library': 'failed',
  };
  const tasks: Array<{
    id: ProviderId;
    run: () => Promise<MetadataCandidate | null>;
  }> = [];
  const diagnostics: RetrievalDiagnostic[] = [];
  const providerOptions = {
    fetchImpl: options.fetchImpl,
    timeoutMs: config.timeoutMs,
    basicOnly: config.basicOnly,
    onDiagnostic: (event: RetrievalDiagnostic) => diagnostics.push(event),
  };
  if (config.aladinTtbKey)
    tasks.push({
      id: 'aladin',
      run: () =>
        fetchAladinMetadata(isbn13, config.aladinTtbKey!, providerOptions),
    });
  if (config.nlkApiKey)
    tasks.push({
      id: 'nlk',
      run: () => fetchNlkMetadata(isbn13, config.nlkApiKey!, providerOptions),
    });
  if (config.naverClientId && config.naverClientSecret)
    tasks.push({
      id: 'naver',
      run: () =>
        fetchNaverBooksMetadata(
          isbn13,
          config.naverClientId!,
          config.naverClientSecret!,
          providerOptions,
        ),
    });
  if (config.kakaoRestApiKey)
    tasks.push({
      id: 'kakao-books',
      run: () =>
        fetchKakaoBooksMetadata(
          isbn13,
          config.kakaoRestApiKey!,
          providerOptions,
        ),
    });
  if (config.googleBooksApiKey)
    tasks.push({
      id: 'google-books',
      run: () =>
        fetchGoogleBooksMetadata(
          isbn13,
          config.googleBooksApiKey!,
          providerOptions,
        ),
    });
  tasks.push({
    id: 'open-library',
    run: () => fetchOpenLibraryMetadata(isbn13, providerOptions),
  });

  // A single wall-clock deadline retains completed providers even if another
  // never resolves (including response-body reads). Abort outstanding fetches.
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  if (config.basicOnly) {
    const fetcher = options.fetchImpl ?? fetch;
    providerOptions.fetchImpl = (url, init) =>
      fetcher(url, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([controller.signal, init.signal])
          : controller.signal,
      });
  }
  const deadline = new Promise<never>((_, reject) => {
    if (config.basicOnly)
      deadlineTimer = setTimeout(
        () => {
          reject(new Error('lookup-deadline'));
          controller.abort();
        },
        Math.max(1, config.timeoutMs ?? 1_500),
      );
  });
  const settled = await Promise.allSettled(
    tasks.map(({ run }) =>
      config.basicOnly ? Promise.race([run(), deadline]) : run(),
    ),
  );
  if (deadlineTimer) clearTimeout(deadlineTimer);
  const candidates: MetadataCandidate[] = [];
  const failedTasks: typeof tasks = [];
  settled.forEach((result, index) => {
    const id = tasks[index].id;
    if (result.status === 'rejected') {
      providerStatus[id] = 'failed';
      if (!['google-books', 'open-library'].includes(id))
        failedTasks.push(tasks[index]);
      return;
    }
    providerStatus[id] = result.value
      ? retrievalIncomplete(diagnostics.filter((e) => e.provider === id))
        ? 'partial'
        : 'ok'
      : 'not-found';
    if (result.value) candidates.push(result.value);
  });

  const preliminary =
    candidates.length > 0 ? stitchMetadata(isbn13, locale, candidates) : null;
  const usefulFields = preliminary
    ? [
        preliminary.authors.length > 0,
        Boolean(preliminary.publisher),
        Boolean(preliminary.pageCount),
        Boolean(preliminary.coverUrl),
      ].filter(Boolean).length
    : 0;

  // A provider can fail transiently while another returns only a title and year. Retry only
  // in that sparse case so the common path stays fast while intake remains resilient.
  if (
    !config.basicOnly &&
    preliminary &&
    usefulFields < 2 &&
    failedTasks.length > 0
  ) {
    const retries = await Promise.allSettled(
      failedTasks.map(({ run }) => run()),
    );
    retries.forEach((result, index) => {
      const id = failedTasks[index].id;
      if (result.status === 'rejected') return;
      providerStatus[id] = result.value ? 'ok' : 'not-found';
      if (result.value) candidates.push(result.value);
    });
  }

  if (candidates.length > 0) {
    return {
      metadata: stitchMetadata(isbn13, locale, candidates),
      providerStatus,
      diagnostics,
      usedFixture: false,
    };
  }
  if (options.allowFixture) {
    const fixture = await lookupFixtureMetadata(isbn13, locale);
    if (fixture)
      return {
        metadata: fixture,
        providerStatus,
        diagnostics,
        usedFixture: true,
      };
  }
  return { metadata: null, providerStatus, diagnostics, usedFixture: false };
}

export function fixtureLookupAllowed(
  requested: boolean,
  environment: {
    APP_RUNTIME_MODE?: string;
    NODE_ENV?: string;
    ISBN_FIXTURES_ENABLED?: string;
  } = process.env,
) {
  const runtimeMode = environment.APP_RUNTIME_MODE ?? environment.NODE_ENV;
  if (runtimeMode !== 'development' && runtimeMode !== 'test') return false;
  return requested || environment.ISBN_FIXTURES_ENABLED === 'true';
}
