import assert from 'node:assert/strict';
import test from 'node:test';
import { readJsonObject } from '../lib/http/json.ts';
import { LibraryError } from '../lib/persistence/errors.ts';
import { enforceRateLimit } from '../lib/persistence/rate-limit.ts';

void test('rejects a declared JSON body that exceeds the request limit', async () => {
  const request = new Request('https://library.example/api/catalog', {
    method: 'POST',
    headers: { 'content-length': '70000', 'content-type': 'application/json' },
    body: '{}',
  });
  await assert.rejects(
    readJsonObject(request),
    (error: unknown) =>
      error instanceof LibraryError &&
      error.code === 'payload-too-large' &&
      error.status === 413,
  );
});

void test('stops streaming JSON once the request limit is crossed', async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(40_000));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request('https://library.example/api/catalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  await assert.rejects(
    readJsonObject(request),
    (error: unknown) =>
      error instanceof LibraryError && error.code === 'payload-too-large',
  );
  assert.equal(canceled, true);
});

void test('accepts a bounded JSON object', async () => {
  const request = new Request('https://library.example/api/catalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '아몬드' }),
  });
  assert.deepEqual(await readJsonObject(request), { title: '아몬드' });
});

void test('rejects an actor after a rate-limit bucket is exhausted', async () => {
  let count = 0;
  const statement = {
    bind() { return this; },
    run() { return Promise.resolve({ success: true, results: [], meta: { changes: 1 } }); },
    first() { count += 1; return Promise.resolve({ count }); },
  };
  const database = { prepare: () => statement } as unknown as D1Database;
  const policy = { name: 'test', limit: 1, windowMs: 60_000 };
  await enforceRateLimit(database, 'member-1', policy, 1_000);
  await assert.rejects(
    enforceRateLimit(database, 'member-1', policy, 1_001),
    (error: unknown) => error instanceof LibraryError && error.code === 'rate-limited' && error.status === 429,
  );
});
