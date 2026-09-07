import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBookMetadata } from '../lib/isbn/server-lookup.ts';

void test('fast lookup retains quick provider results while a provider ignores abort forever', async () => {
  const urls: string[] = [];
  const start = performance.now();
  const result = await resolveBookMetadata(
    '9780140328721',
    'en',
    {
      googleBooksApiKey: 'test',
      basicOnly: true,
      timeoutMs: 80,
    },
    {
      fetchImpl: async (input) => {
        const url = (input instanceof Request ? input.url : String(input));
        urls.push(url);
        if (url.includes('openlibrary')) return new Promise<Response>(() => {});
        return Response.json({
          items: [
            {
              id: 'id1',
              volumeInfo: {
                title: 'Matilda',
                authors: ['Roald Dahl'],
                description: 'A story…',
                industryIdentifiers: [
                  { type: 'ISBN_13', identifier: '9780140328721' },
                ],
              },
            },
          ],
        });
      },
    },
  );
  assert.ok(performance.now() - start < 500);
  assert.equal(result.metadata?.title, 'Matilda');
  assert.equal(result.providerStatus['open-library'], 'failed');
  assert.equal(urls.length, 2);
  assert.ok(
    urls.every(
      (u) =>
        !u.includes('/works/') &&
        !u.includes('/isbn/') &&
        !u.includes('projection=full'),
    ),
  );
});

void test('fast lookup does not retry provider errors or hang on response bodies', async () => {
  let calls = 0;
  const start = performance.now();
  const result = await resolveBookMetadata(
    '9780140328721',
    'en',
    {
      googleBooksApiKey: 'test',
      basicOnly: true,
      timeoutMs: 60,
    },
    {
      fetchImpl: async (url) => {
        calls++;
        if ((url instanceof Request ? url.url : String(url)).includes('googleapis'))
          return new Response('', { status: 503 });
        return {
          ok: true,
          status: 200,
          json: () => new Promise(() => {}),
        } as unknown as Response;
      },
    },
  );
  assert.ok(performance.now() - start < 500);
  assert.equal(result.metadata, null);
  assert.equal(calls, 2);
});

void test('the default fast budget returns partial metadata within two seconds', async () => {
  const start = performance.now();
  const result = await resolveBookMetadata(
    '9780140328721',
    'en',
    { basicOnly: true, googleBooksApiKey: 'test' },
    {
      fetchImpl: async (url) =>
        (url instanceof Request ? url.url : String(url)).includes('openlibrary')
          ? new Promise<Response>(() => {})
          : Response.json({
              items: [
                {
                  volumeInfo: {
                    title: 'Matilda',
                    industryIdentifiers: [
                      { type: 'ISBN_13', identifier: '9780140328721' },
                    ],
                  },
                },
              ],
            }),
    },
  );
  assert.equal(result.metadata?.title, 'Matilda');
  assert.ok(performance.now() - start < 1_900);
});
