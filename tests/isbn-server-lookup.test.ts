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

function providerFetch(options: { failNlk?: boolean; timeoutNlk?: boolean } = {}): FetchLike {
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
    return Response.json(googlePayload);
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
  assert.deepEqual(result.providerStatus, { nlk: 'failed', 'google-books': 'ok' });
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

void test('allows fixtures only when explicitly enabled outside production', () => {
  assert.equal(fixtureLookupAllowed(false, { NODE_ENV: 'development', ISBN_FIXTURES_ENABLED: undefined }), false);
  assert.equal(fixtureLookupAllowed(true, { NODE_ENV: 'development', ISBN_FIXTURES_ENABLED: undefined }), true);
  assert.equal(fixtureLookupAllowed(false, { NODE_ENV: 'test', ISBN_FIXTURES_ENABLED: 'true' }), true);
  assert.equal(fixtureLookupAllowed(true, { NODE_ENV: 'production', ISBN_FIXTURES_ENABLED: 'true' }), false);
  assert.equal(fixtureLookupAllowed(true, { APP_RUNTIME_MODE: 'production', NODE_ENV: 'development', ISBN_FIXTURES_ENABLED: 'true' }), false);
});
