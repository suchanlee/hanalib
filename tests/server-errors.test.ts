import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLoader } from './helpers/load-source.ts';
import { LibraryError, libraryError } from '../lib/persistence/errors.ts';
import * as logs from '../lib/observability/log.ts';

void test('member lookup preserves unauthenticated results but propagates infrastructure failures', async () => {
  let outcome: unknown = undefined;
  const load = sourceLoader({
    '@/lib/auth/member': {
      getAuthenticatedMember: async () => {
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
  });
  const { requireActiveMember } = load<{
    requireActiveMember: (request: Request) => Promise<unknown>;
  }>('lib/storage/request-member.ts');
  const request = new Request('https://library.example');
  assert.equal(await requireActiveMember(request), undefined);
  outcome = { id: 'member', communityId: 'hana' };
  assert.deepEqual(await requireActiveMember(request), {
    memberId: 'member',
    communityId: 'hana',
  });
  outcome = new Error('D1 unavailable');
  await assert.rejects(requireActiveMember(request), /D1 unavailable/);
});

void test('committed mutations succeed even when background delivery fails or stalls', async () => {
  const jobs: Promise<unknown>[] = [];
  const records: unknown[] = [];
  let dispatch: () => Promise<unknown> = async () => {
    throw new Error('outbox unavailable');
  };
  const load = sourceLoader({
    'cloudflare:workers': {
      waitUntil: (job: Promise<unknown>) => jobs.push(job),
    },
    '../../db/index': { getD1Database: () => ({}) },
    '../auth/member.ts': {
      requireAuthenticatedMember: async () => ({
        id: 'member',
        communityId: 'hana',
      }),
      AuthenticationRequiredError: class extends Error {},
    },
    '../auth/session.ts': { isSameOriginMutation: () => true },
    '../http/json.ts': {},
    '../notifications/outbox-worker.ts': {
      processReadyOutbox: () => dispatch(),
    },
    '../observability/log.ts': {
      ...logs,
      operationalLog: (...args: unknown[]) => records.push(args),
    },
    './d1-repository.ts': { D1LibraryRepository: class {} },
    './errors.ts': { LibraryError, libraryError },
    './rate-limit.ts': { enforceRateLimit: async () => {} },
  });
  const api = load<{
    withLibraryApi(
      request: Request,
      handler: () => Promise<unknown>,
      options: object,
    ): Promise<Response>;
  }>('lib/persistence/server.ts');
  const request = new Request('https://library.example/api/borrow-requests');
  const response = await api.withLibraryApi(
    request,
    async () => ({ saved: true }),
    { dispatchNotifications: true, status: 201 },
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { data: { saved: true } });
  assert.ok(response.headers.get('x-request-id'));
  await Promise.all(jobs);
  assert.equal(records.length, 1);
  let complete!: () => void;
  dispatch = () =>
    new Promise<void>((resolve) => {
      complete = resolve;
    });
  const stalled = await api.withLibraryApi(
    request,
    async () => ({ saved: true }),
    { dispatchNotifications: true },
  );
  assert.equal(stalled.status, 200);
  complete();
  await Promise.all(jobs);
  const rejected = await api.withLibraryApi(
    request,
    async () => {
      throw libraryError('conflict', 'Already changed');
    },
    { dispatchNotifications: true },
  );
  assert.equal(rejected.status, 409);
  assert.equal(jobs.length, 2);
});

void test('OAuth error redirects carry the server reference and clear the transaction cookie', () => {
  const load = sourceLoader({
    './config': {},
    './oauth': {},
    './oauth-transaction': {
      clearOAuthTransactionCookie: () => 'transaction=; Max-Age=0',
    },
    './member': {},
    './kakao-notifications': {},
    '../../db': {},
    './demo': {},
    './session': {},
  });
  const { errorRedirect } = load<{
    errorRedirect: (
      origin: string,
      code: string,
      secure: boolean,
      requestId: string,
    ) => Response;
  }>('lib/auth/handlers.ts');
  const response = errorRedirect(
    'https://library.example',
    'invalid_state',
    true,
    'callback-123',
  );
  const url = new URL(response.headers.get('location')!);
  assert.equal(url.searchParams.get('authError'), 'invalid_state');
  assert.equal(url.searchParams.get('authRequestId'), 'callback-123');
  assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
});

void test('cover and ISBN routes report membership outages as 503 with a traceable request id', async () => {
  for (const [path, method] of [
    ['app/api/covers/route.ts', 'POST'],
    ['app/api/covers/[assetId]/route.ts', 'GET'],
    ['app/api/isbn/lookup/route.ts', 'GET'],
  ]) {
    const records: unknown[] = [];
    const load = sourceLoader({
      'cloudflare:workers': { env: {} },
      '@/db': {},
      '@/lib/isbn/server-lookup': {},
      '@/lib/storage/request-member': {
        requireActiveMember: async () => {
          throw new Error('D1 down');
        },
      },
      '@/lib/observability/log': {
        ...logs,
        operationalLog: (...args: unknown[]) => records.push(args),
      },
    });
    const handler =
      load<Record<string, (request: Request) => Promise<Response>>>(path)[
        method
      ];
    const response = await handler(
      new Request('https://library.example/api/test', { method }),
    );
    assert.equal(response.status, 503, path);
    assert.ok(response.headers.get('x-request-id'), path);
    assert.equal(records.length, 1, path);
  }
});
