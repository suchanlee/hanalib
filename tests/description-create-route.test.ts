import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLoader } from './helpers/load-source.ts';

void test('creation responds after commit while hydration is still running', async () => {
  const jobs: Promise<unknown>[] = [];
  let committed = false;
  let release!: () => void;
  const load = sourceLoader({
    'cloudflare:workers': {
      waitUntil: (job: Promise<unknown>) => jobs.push(job),
    },
    '@/db': { getD1Database: () => ({}) },
    '@/lib/isbn/config': { lookupProviderConfig: () => ({}) },
    '@/lib/books/description-jobs': {
      processDescriptionJobs: (
        _db: unknown,
        _config: unknown,
        options: { itemId: string },
      ) => {
        assert.equal(committed, true);
        assert.equal(options.itemId, 'saved-book');
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    },
    '@/lib/persistence/server': {
      jsonObject: async () => ({}),
      withLibraryApi: async (
        _request: Request,
        handler: (repo: unknown, context: unknown) => Promise<unknown>,
      ) => {
        const data = await handler(
          {
            createCatalogItem: async () => {
              committed = true;
              return { id: 'saved-book' };
            },
          },
          {},
        );
        return Response.json({ data }, { status: 201 });
      },
    },
  });
  const { POST } = load<{ POST: (request: Request) => Promise<Response> }>(
    'app/api/catalog/route.ts',
  );
  const response = await POST(
    new Request('https://example.com/api/catalog', { method: 'POST' }),
  );
  assert.equal(response.status, 201);
  assert.equal(jobs.length, 1);
  release();
  await Promise.all(jobs);
});
