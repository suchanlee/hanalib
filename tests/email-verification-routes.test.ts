import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLoader } from './helpers/load-source.ts';

const previousEnvironment = {
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
  AUTH_TRANSACTION_SECRET: process.env.AUTH_TRANSACTION_SECRET,
  CONTACT_ENCRYPTION_KEY: process.env.CONTACT_ENCRYPTION_KEY,
  CONTACT_HASH_KEY: process.env.CONTACT_HASH_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
};

test.after(() => {
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

void test('stores a notification email for immediate delivery without verification', async () => {
  Object.assign(process.env, {
    PUBLIC_APP_URL: 'https://library.example',
    AUTH_TRANSACTION_SECRET: 'transaction-secret',
    CONTACT_ENCRYPTION_KEY: 'encryption-key',
    CONTACT_HASH_KEY: 'hash-key',
    RESEND_API_KEY: 'resend-key',
    EMAIL_FROM: 'Library <books@library.example>',
  });
  let sql = '';
  let values: unknown[] = [];
  const database = {
    prepare(candidate: string) {
      sql = candidate;
      const statement = {
        bind(...bound: unknown[]) { values = bound; return statement; },
        async run() { return { meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
  const load = sourceLoader({
    '@/db': { getD1Database: () => database },
    '@/lib/auth/email-verification': {
      normalizeEmail: (email: string) => email.trim().toLowerCase(),
    },
    '@/lib/notifications/contact-crypto': {
      encryptContact: async () => 'encrypted-email',
      hashContact: async () => 'email-hash',
    },
    '@/lib/persistence/errors': {
      libraryError: (code: string, detail: string) => Object.assign(new Error(detail), { code }),
    },
    '@/lib/persistence/server': {
      jsonObject: async () => ({ email: ' Reader@Example.COM ' }),
      withLibraryApi: async (_request: Request, handler: (repository: unknown, context: { actorId: string }) => Promise<unknown>) => {
        const data = await handler({}, { actorId: 'member-1' });
        return Response.json({ data });
      },
    },
  });
  const route = load<{ POST(request: Request): Promise<Response> }>('app/api/profile/email/route.ts');

  const response = await route.POST(new Request('https://library.example/api/profile/email', { method: 'POST' }));
  assert.deepEqual(await response.json(), { data: { saved: true } });
  assert.match(sql, /kind, address_encrypted, address_hash, verified_at/);
  assert.equal(values[1], 'member-1');
  assert.equal(values[2], 'encrypted-email');
  assert.equal(values[3], 'email-hash');
  assert.equal(typeof values[4], 'number');
});

void test('confirmation verifies only the address bound into the signed token', async () => {
  Object.assign(process.env, {
    PUBLIC_APP_URL: 'https://library.example',
    AUTH_TRANSACTION_SECRET: 'transaction-secret',
  });
  let values: unknown[] = [];
  const load = sourceLoader({
    '@/db': {
      getD1Database: () => ({
        prepare: () => {
          const statement = {
            bind(...bound: unknown[]) { values = bound; return statement; },
            async run() { return { meta: { changes: 1 } }; },
          };
          return statement;
        },
      }),
    },
    '@/lib/auth/email-verification': {
      readEmailVerificationToken: async () => ({ profileId: 'member-1', emailHash: 'email-hash' }),
    },
    '@/lib/http/observed-route': {
      observedRoute: async (_request: Request, _operation: string, handler: () => Promise<Response>) => handler(),
    },
  });
  const route = load<{ GET(request: Request): Promise<Response> }>('app/api/profile/email-verification/confirm/route.ts');

  const response = await route.GET(new Request('https://library.example/api/profile/email-verification/confirm?token=token'));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://library.example/?emailVerification=verified');
  assert.equal(values[1], 'member-1');
  assert.equal(values[2], 'email-hash');
});
