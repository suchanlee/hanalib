import assert from 'node:assert/strict';
import test from 'node:test';

import { fixtureLookupAllowed, resolveBookMetadata, type FetchLike } from '../lib/isbn/server-lookup.ts';

const googlePayload = {
  items: [{
    volumeInfo: {
      title: 'Almond',
      authors: ['Won-pyung Sohn'],
      publisher: 'HarperVia',
      publishedDate: '2020-05-05',
      language: 'en',
      pageCount: 272,
      description: 'An English description.',
      imageLinks: { thumbnail: 'https://books.google.test/almond.jpg' },
      industryIdentifiers: [{ type: 'ISBN_13', identifier: '9788936434267' }],
    },
  }],
};

const nlkPayload = {
  docs: [{ TITLE: '아몬드', AUTHOR: '손원평', EA_ISBN: '9788936434267', PUBLISHER: '창비', PUBLISH_PREDATE: '2017' }],
};

const openLibraryPayload = {
  title: 'Almond', authors: [{ key: '/authors/OL123A' }], publishers: ['HarperVia'], publish_date: '2020',
  languages: [{ key: '/languages/eng' }], isbn_13: ['9788936434267'],
};

const openLibrarySearchPayload = {
  docs: [{
    title: 'Almond', author_name: ['Won-pyung Sohn'], publisher: ['HarperVia'], first_publish_year: 2020,
    language: ['eng'], isbn: ['9788936434267'], cover_i: 12345,
  }],
};

function providerFetch(options: { failNlk?: boolean; timeoutNlk?: boolean; failOpenLibrary?: boolean } = {}): FetchLike {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'www.nl.go.kr') {
      if (options.timeoutNlk) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
        });
      }
      if (options.failNlk) return Response.json({ error: 'down' }, { status: 503 });
      return Response.json(nlkPayload);
    }
    if (url.hostname === 'www.googleapis.com') return Response.json(googlePayload);
    if (url.hostname === 'openlibrary.org') {
      if (options.failOpenLibrary) return Response.json({ error: 'down' }, { status: 503 });
      if (url.pathname.startsWith('/authors/')) return Response.json({ name: 'Won-pyung Sohn' });
      if (url.pathname === '/search.json') return Response.json(openLibrarySearchPayload);
      return Response.json(openLibraryPayload);
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };
}

void test('fetches providers in parallel and stitches fields deterministically for Korean', async () => {
  const result = await resolveBookMetadata(
    '9788936434267',
    'ko',
    { nlkApiKey: 'nlk-key', googleBooksApiKey: 'google-key' },
    { fetchImpl: providerFetch() },
  );
  assert.equal(result.metadata?.title, '아몬드');
  assert.equal(result.metadata?.publisher, '창비');
  assert.equal(result.metadata?.pageCount, 272);
  assert.equal(result.metadata?.coverUrl, 'https://books.google.test/almond.jpg');
  assert.deepEqual(result.metadata?.provenance, {
    title: 'nlk',
    authors: 'nlk',
    publisher: 'nlk',
    publishedYear: 'nlk',
    language: 'nlk',
    pageCount: 'google-books',
    description: 'google-books',
    coverUrl: 'google-books',
  });
});

void test('returns useful metadata when one provider fails', async () => {
  const result = await resolveBookMetadata(
    '9788936434267',
    'ko',
    { nlkApiKey: 'nlk-key', googleBooksApiKey: 'google-key' },
    { fetchImpl: providerFetch({ failNlk: true }) },
  );
  assert.equal(result.metadata?.title, 'Almond');
  assert.deepEqual(result.providerStatus, {
    nlk: 'failed', naver: 'not-configured', 'kakao-books': 'not-configured', 'google-books': 'ok', 'open-library': 'ok',
  });
  assert.equal(result.usedFixture, false);
});

void test('bounds a stalled provider while preserving a successful provider result', async () => {
  const startedAt = Date.now();
  const result = await resolveBookMetadata(
    '9788936434267',
    'en',
    { nlkApiKey: 'nlk-key', googleBooksApiKey: 'google-key', timeoutMs: 100 },
    { fetchImpl: providerFetch({ timeoutNlk: true }) },
  );
  assert.equal(result.metadata?.title, 'Almond');
  assert.equal(result.providerStatus.nlk, 'failed');
  assert.ok(Date.now() - startedAt < 1_000);
});

void test('uses the credential-free exact-edition provider when configured providers are absent', async () => {
  const result = await resolveBookMetadata('9788936434267', 'en', {}, { fetchImpl: providerFetch() });
  assert.equal(result.metadata?.title, 'Almond');
  assert.deepEqual(result.metadata?.authors, ['Won-pyung Sohn']);
  assert.equal(result.metadata?.provenance.title, 'open-library');
  assert.deepEqual(result.providerStatus, {
    nlk: 'not-configured', naver: 'not-configured', 'kakao-books': 'not-configured', 'google-books': 'not-configured', 'open-library': 'ok',
  });
});

void test('falls back to Open Library search when its exact-edition endpoint fails', async () => {
  const fetchImpl: FetchLike = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.startsWith('/isbn/')) return Response.json({ error: 'down' }, { status: 503 });
    if (url.pathname === '/search.json') return Response.json(openLibrarySearchPayload);
    throw new Error(`Unexpected provider URL: ${url}`);
  };
  const result = await resolveBookMetadata('9788936434267', 'en', {}, { fetchImpl });
  assert.equal(result.metadata?.title, 'Almond');
  assert.deepEqual(result.metadata?.authors, ['Won-pyung Sohn']);
  assert.equal(result.providerStatus['open-library'], 'ok');
});

void test('retries older 978 editions with the equivalent ISBN-10 on Google Books', async () => {
  const queries: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'www.googleapis.com') {
      queries.push(url.searchParams.get('q') ?? '');
      if (url.searchParams.get('q') === 'isbn:0140328726') {
        return Response.json({ items: [{ volumeInfo: {
          title: 'Fantastic Mr. Fox', authors: ['Roald Dahl'], language: 'en',
          industryIdentifiers: [{ type: 'ISBN_10', identifier: '0140328726' }],
        } }] });
      }
      return Response.json({ totalItems: 0 });
    }
    if (url.hostname === 'openlibrary.org') return Response.json({ error: 'down' }, { status: 503 });
    throw new Error(`Unexpected provider URL: ${url}`);
  };
  const result = await resolveBookMetadata(
    '9780140328721', 'en', { googleBooksApiKey: 'google-key' }, { fetchImpl },
  );
  assert.equal(result.metadata?.title, 'Fantastic Mr. Fox');
  assert.deepEqual(queries, ['isbn:9780140328721', 'isbn:0140328726']);
});

void test('selects the most edition-specific exact title when Korean authorities are unavailable', async () => {
  const google = {
    items: [{ volumeInfo: {
      title: 'Talk to me in Korean workbook', authors: ['TalkToMeInKorean'], publishedDate: '2018', language: 'en',
      industryIdentifiers: [{ type: 'ISBN_13', identifier: '9791186701140' }],
    } }],
  };
  const edition = {
    title: 'Talk to Me in Korean Workbook', subtitle: 'Level 5', authors: [{ key: '/authors/OL123A' }],
    publish_date: '2018', languages: [{ key: '/languages/eng' }, { key: '/languages/kor' }],
    isbn_13: ['9791186701140'],
  };
  const fetchImpl: FetchLike = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'www.googleapis.com') return Response.json(google);
    if (url.pathname.startsWith('/authors/')) return Response.json({ name: 'TalkToMeInKorean' });
    if (url.pathname === '/search.json') return Response.json({ docs: [] });
    if (url.hostname === 'openlibrary.org') return Response.json(edition);
    throw new Error(`Unexpected provider URL: ${url}`);
  };
  const result = await resolveBookMetadata(
    '9791186701140', 'ko', { googleBooksApiKey: 'google-key' }, { fetchImpl },
  );
  assert.equal(result.metadata?.title, 'Talk to Me in Korean Workbook: Level 5');
  assert.equal(result.metadata?.provenance.title, 'open-library');
  assert.equal(result.metadata?.language, 'other');
});

void test('automatically retries a transient provider when the first result is too sparse', async () => {
  let openLibraryCalls = 0;
  const fetchImpl: FetchLike = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'www.googleapis.com') {
      return Response.json({ items: [{ volumeInfo: {
        title: 'Talk to me in Korean workbook', publishedDate: '2018', language: 'en',
        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9791186701140' }],
      } }] });
    }
    if (url.hostname === 'openlibrary.org') {
      openLibraryCalls += 1;
      if (openLibraryCalls <= 2) return Response.json({ error: 'temporary' }, { status: 503 });
      if (url.pathname === '/search.json') return Response.json({ docs: [] });
      return Response.json({
        title: 'Talk to Me in Korean Workbook', subtitle: 'Level 5', authors: [{ key: '/authors/OL123A' }],
        number_of_pages: 152, covers: [9279048], publish_date: '2018', isbn_13: ['9791186701140'],
      });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };
  const result = await resolveBookMetadata(
    '9791186701140', 'ko', { googleBooksApiKey: 'google-key' }, { fetchImpl },
  );
  assert.equal(result.metadata?.title, 'Talk to Me in Korean Workbook: Level 5');
  assert.equal(result.metadata?.pageCount, 152);
  assert.equal(result.providerStatus['open-library'], 'ok');
  assert.ok(openLibraryCalls >= 4);
});

void test('reports a provider outage without substituting a different edition', async () => {
  const result = await resolveBookMetadata(
    '9788936434267', 'ko', {}, { fetchImpl: providerFetch({ failOpenLibrary: true }) },
  );
  assert.equal(result.metadata, null);
  assert.equal(result.providerStatus['open-library'], 'failed');
});

void test('prefers Korean bibliographic fields and Naver covers while stitching sparse records', async () => {
  const fetchImpl: FetchLike = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'www.nl.go.kr') {
      return Response.json({ docs: [{ TITLE: '작별하지 않는다', AUTHOR: '한강', EA_ISBN: '9788954682152', PUBLISHER: '문학동네', PUBLISH_PREDATE: '20210909' }] });
    }
    if (url.hostname === 'openapi.naver.com') {
      return Response.json({ items: [{ title: '작별하지 않는다', author: '한강', publisher: '문학동네', pubdate: '20210909', isbn: '8954682154 9788954682152', image: 'https://naver.test/cover.jpg', description: '한국어 소개' }] });
    }
    if (url.hostname === 'openlibrary.org') return Response.json({}, { status: 404 });
    throw new Error(`Unexpected provider URL: ${url}`);
  };
  const result = await resolveBookMetadata('9788954682152', 'ko', {
    nlkApiKey: 'nlk-key', naverClientId: 'naver-id', naverClientSecret: 'naver-secret',
  }, { fetchImpl });
  assert.equal(result.metadata?.title, '작별하지 않는다');
  assert.equal(result.metadata?.provenance.title, 'nlk');
  assert.equal(result.metadata?.coverUrl, 'https://naver.test/cover.jpg');
  assert.equal(result.metadata?.description, '한국어 소개');
});

void test('uses the existing Kakao app credential for exact Korean book covers', async () => {
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'dapi.kakao.com') {
      assert.equal(url.searchParams.get('query'), '9788996991342');
      assert.equal(url.searchParams.get('target'), 'isbn');
      assert.equal(new Headers(init?.headers).get('authorization'), 'KakaoAK kakao-key');
      return Response.json({ documents: [{
        title: '미움받을 용기', authors: ['기시미 이치로'], publisher: '인플루엔셜',
        datetime: '2014-11-17T00:00:00.000+09:00', isbn: '8996991341 9788996991342',
        thumbnail: 'https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=http%3A%2F%2Ft1.daumcdn.net%2Flbook%2Fimage%2F1467038',
      }] });
    }
    if (url.hostname === 'openlibrary.org') return Response.json({}, { status: 404 });
    throw new Error(`Unexpected provider URL: ${url}`);
  };
  const result = await resolveBookMetadata(
    '9788996991342', 'ko', { kakaoRestApiKey: 'kakao-key' }, { fetchImpl },
  );
  assert.equal(result.metadata?.title, '미움받을 용기');
  assert.equal(result.metadata?.coverUrl, 'https://t1.daumcdn.net/lbook/image/1467038');
  assert.equal(result.metadata?.provenance.coverUrl, 'kakao-books');
  assert.equal(result.providerStatus['kakao-books'], 'ok');
});

void test('allows fixtures only when explicitly enabled outside production', () => {
  assert.equal(fixtureLookupAllowed(false, { NODE_ENV: 'development', ISBN_FIXTURES_ENABLED: undefined }), false);
  assert.equal(fixtureLookupAllowed(true, { NODE_ENV: 'development', ISBN_FIXTURES_ENABLED: undefined }), true);
  assert.equal(fixtureLookupAllowed(false, { NODE_ENV: 'test', ISBN_FIXTURES_ENABLED: 'true' }), true);
  assert.equal(fixtureLookupAllowed(true, { NODE_ENV: 'production', ISBN_FIXTURES_ENABLED: 'true' }), false);
  assert.equal(fixtureLookupAllowed(true, { APP_RUNTIME_MODE: 'production', NODE_ENV: 'development', ISBN_FIXTURES_ENABLED: 'true' }), false);
});
