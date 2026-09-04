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
    nlk: 'failed', naver: 'not-configured', 'google-books': 'ok', 'open-library': 'ok',
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
    nlk: 'not-configured', naver: 'not-configured', 'google-books': 'not-configured', 'open-library': 'ok',
  });
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

void test('allows fixtures only when explicitly enabled outside production', () => {
  assert.equal(fixtureLookupAllowed(false, { NODE_ENV: 'development', ISBN_FIXTURES_ENABLED: undefined }), false);
  assert.equal(fixtureLookupAllowed(true, { NODE_ENV: 'development', ISBN_FIXTURES_ENABLED: undefined }), true);
  assert.equal(fixtureLookupAllowed(false, { NODE_ENV: 'test', ISBN_FIXTURES_ENABLED: 'true' }), true);
  assert.equal(fixtureLookupAllowed(true, { NODE_ENV: 'production', ISBN_FIXTURES_ENABLED: 'true' }), false);
  assert.equal(fixtureLookupAllowed(true, { APP_RUNTIME_MODE: 'production', NODE_ENV: 'development', ISBN_FIXTURES_ENABLED: 'true' }), false);
});
