import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLoader } from './helpers/load-source.ts';

void test('ISBN lookup retains a repaired same-community description without replacing it with a provider snippet', async () => {
  const current = 'Imported…';
  const full = 'Imported description with the complete ending.';
  let stored: { description: string; source: string } | null = {
    description: full,
    source: 'yes24-reviewed',
  };
  let bound: unknown[] = [];
  const load = sourceLoader({
    '@/db': {
      getD1Database: () => ({
        prepare(sql: string) {
          assert.match(sql, /ci.community_id = \?/);
          assert.match(sql, /be.isbn13 = \?/);
          return {
            bind(...values: unknown[]) {
              bound = values;
              return this;
            },
            async first() {
              return stored;
            },
          };
        },
      }),
    },
    '@/lib/persistence/rate-limit': { enforceRateLimit: async () => {} },
    '@/lib/storage/request-member': {
      requireActiveMember: async () => ({
        memberId: 'owner',
        communityId: 'hana',
      }),
    },
    '@/lib/isbn/server-lookup': {
      fixtureLookupAllowed: () => false,
      resolveBookMetadata: async () => ({
        metadata: {
          isbn13: '9788932817842',
          title: 'Book',
          description: current,
          provenance: { description: 'kakao-books' },
        },
        providerStatus: { 'kakao-books': 'found' },
        usedFixture: false,
      }),
    },
  });
  const { GET } = load<{ GET: (r: Request) => Promise<Response> }>(
    'app/api/isbn/lookup/route.ts',
  );
  const request = () =>
    new Request('http://localhost/api/isbn/lookup?isbn=9788932817842');
  const response = await GET(request());
  assert.equal(response.status, 200);
  const body = await response.json() as { description: string; provenance: Record<string, string> };
  assert.equal(body.description, full);
  assert.equal(body.provenance.description, 'yes24-reviewed');
  assert.deepEqual(bound, ['9788932817842', 'hana']);
  stored = { description: full, source: 'member' };
  assert.equal(((await (await GET(request())).json()) as { description: string }).description, current);
  stored = null;
  assert.equal(((await (await GET(request())).json()) as { description: string }).description, current);
});
