import assert from 'node:assert/strict';
import test from 'node:test';
import { userIssue, issueDetails } from '../features/app/user-issue.ts';
import { ApiError } from '../lib/http/client.ts';
import { sanitizeDiagnostic } from '../lib/observability/client-diagnostic.ts';
import { sourceLoader } from './helpers/load-source.ts';

function runtimeError() {
  const error = new TypeError('private member@example.com token=secret');
  error.stack = [
    error.toString(),
    '    at privateFunction (https://library.example/assets/app-abc123.js?token=secret:42:19)',
    'handler@https://library.example/features/catalog/book-detail-view.tsx?t=123:81:7',
    '    at extension (chrome-extension://private/content.js:1:2)',
    '    at local (/Users/private/code/source.ts:1:2)',
    '    at unknown (https://library.example/api/member@example.com:1:2)',
  ].join('\n');
  return error;
}

void test('browser errors have stable per-exception traces and private-data-free code locations', () => {
  const error = runtimeError();
  const issue = userIssue(error, 'browser-event');
  assert.match(issue.traceId, /^client-[0-9a-f-]{36}$/);
  assert.equal(userIssue(error).traceId, issue.traceId);
  assert.notEqual(userIssue(runtimeError()).traceId, issue.traceId);
  assert.equal(issue.errorType, 'TypeError');
  assert.deepEqual(issue.sourceLocations, [
    '/assets/app-abc123.js:42:19',
    '/features/catalog/book-detail-view.tsx:81:7',
  ]);
  const details = issueDetails(issue);
  assert.doesNotMatch(
    details,
    /private|secret|token|example.com|Users|extension|\?t=/,
  );
  assert.match(details, /TypeError/);
  assert.match(details, /app-abc123.js:42:19/);
  assert.match(userIssue('private rejection').traceId, /^client-/);
  const apiIssue = userIssue(
    new ApiError(503, 'service-unavailable', 'server-123'),
  );
  assert.match(apiIssue.traceId, /^client-/);
  assert.equal(apiIssue.requestId, 'server-123');
  const serverError = Object.assign(new Error('private server error'), {
    digest: 'digest-123',
  });
  assert.match(
    issueDetails(userIssue(serverError)),
    /Server digest: digest-123/,
  );
  const firefox = new ReferenceError('private');
  firefox.stack = 'handler@https://library.example/assets/app-abc123.js:42:19';
  assert.deepEqual(userIssue(firefox).sourceLocations, ['/assets/app-abc123.js:42:19']);
});

void test('diagnostic ingestion discards unknown fields and bounds every accepted source location', () => {
  const diagnostic = sanitizeDiagnostic({
    ...userIssue(runtimeError()),
    message: 'private',
    token: 'secret',
    stack: 'raw private stack',
    requestId: 'secret@example.com',
    serverDigest: 'private data',
    errorType: 'private name',
    status: 900,
    sourceLocations: [
      '/private/secret.ts:1:2',
      '/assets/app.js?token=secret:1:2',
      ...Array(20).fill('/assets/app.js:1:2'),
    ],
  });
  assert.ok(diagnostic);
  assert.equal(diagnostic.sourceLocations.length, 8);
  assert.equal(diagnostic.errorType, 'UnknownError');
  assert.equal(diagnostic.status, 0);
  assert.doesNotMatch(JSON.stringify(diagnostic), /private|secret|token|stack/);
  assert.equal(
    sanitizeDiagnostic({ ...diagnostic, traceId: 'invalid' }),
    undefined,
  );
  assert.equal(
    sanitizeDiagnostic({ ...diagnostic, occurredAt: 'not-a-date' }),
    undefined,
  );
});

void test('browser diagnostics exclude code from other origins', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'https://library.example' } },
  });
  try {
    const error = runtimeError();
    error.stack +=
      '\n    at extension (https://external.example/assets/secret.js:1:2)';
    assert.equal(userIssue(error).sourceLocations.length, 2);
    assert.doesNotMatch(issueDetails(userIssue(error)), /secret/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

void test('browser reports correlate copied traces with server logs and deduplicate repeated rendering', async (t) => {
  const records: string[] = [];
  t.mock.method(console, 'error', (record: string) => records.push(record));
  const load = sourceLoader();
  const { POST } = load<typeof import('../app/api/diagnostics/route.ts')>(
    'app/api/diagnostics/route.ts',
  );
  const { reportClientIssue } = load<
    typeof import('../features/app/report-client-issue.ts')
  >('features/app/report-client-issue.ts');
  let requests = 0;
  t.mock.method(
    globalThis,
    'fetch',
    async (path: string, init: RequestInit) => {
      requests++;
      assert.equal(path, '/api/diagnostics');
      assert.equal(init.keepalive, true);
      assert.ok(init.signal);
      const origin = process.env.PUBLIC_APP_URL
        ? new URL(process.env.PUBLIC_APP_URL).origin
        : 'https://library.example';
      const headers = new Headers(init.headers);
      headers.set('origin', origin);
      headers.set('cf-ray', 'A36199690A8E1722-SJC');
      return POST(new Request(`${origin}${path}`, { ...init, headers }));
    },
  );
  const issue = userIssue(runtimeError(), 'browser-event');
  const first = reportClientIssue(issue);
  assert.equal(reportClientIssue({ ...issue }), first);
  assert.equal(await first, 'recorded');
  assert.equal(requests, 1);
  const server = records
    .map((record) => JSON.parse(record))
    .find((record) => record.event === 'client-error-reported');
  assert.equal(server.traceId, issue.traceId);
  assert.equal(server.reportRequestId, 'a36199690a8e1722');
  assert.deepEqual(server.sourceLocations, issue.sourceLocations);
  assert.doesNotMatch(
    records.join('\n'),
    /private|secret|token|member@example/,
  );
});

void test('reporting rejection, blocked HTTP, and timeouts resolve safely without retries', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const failure of ['offline', 'http', 'timeout']) {
    const load = sourceLoader();
    const { reportClientIssue } = load<
      typeof import('../features/app/report-client-issue.ts')
    >('features/app/report-client-issue.ts');
    let requests = 0;
    if (failure === 'timeout') {
      t.mock.method(AbortSignal, 'timeout', () =>
        AbortSignal.abort(new DOMException('timeout', 'TimeoutError')),
      );
    }
    t.mock.method(
      globalThis,
      'fetch',
      async (_path: string, init: RequestInit) => {
        requests++;
        if (failure === 'http') return new Response(null, { status: 503 });
        if (init.signal?.aborted) throw init.signal.reason;
        throw new TypeError('network unavailable');
      },
    );
    assert.equal(
      await reportClientIssue(userIssue(runtimeError())),
      'unavailable',
    );
    assert.equal(requests, 1);
  }
});

void test('client reporting caps error storms and resumes after the reporting window', async (t) => {
  t.mock.method(console, 'error', () => {});
  let now = 100_000;
  t.mock.method(Date, 'now', () => now);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response(null, { status: 204 });
  });
  const load = sourceLoader();
  const { reportClientIssue } = load<
    typeof import('../features/app/report-client-issue.ts')
  >('features/app/report-client-issue.ts');
  for (let index = 0; index < 10; index++)
    assert.equal(
      await reportClientIssue(userIssue(runtimeError())),
      'recorded',
    );
  assert.equal(
    await reportClientIssue(userIssue(runtimeError())),
    'unavailable',
  );
  assert.equal(requests, 10);
  now += 60_000;
  assert.equal(await reportClientIssue(userIssue(runtimeError())), 'recorded');
  assert.equal(requests, 11);
});

void test('ingestion rejects cross-origin, malformed, oversized, and excess reports without logging them', async (t) => {
  const records: string[] = [];
  t.mock.method(console, 'error', (record: string) => records.push(record));
  let now = 100_000;
  t.mock.method(Date, 'now', () => now);
  const load = sourceLoader();
  const { POST } = load<typeof import('../app/api/diagnostics/route.ts')>(
    'app/api/diagnostics/route.ts',
  );
  const origin = process.env.PUBLIC_APP_URL
    ? new URL(process.env.PUBLIC_APP_URL).origin
    : 'https://library.example';
  const request = (body: string, headers: Record<string, string> = {}) =>
    new Request(`${origin}/api/diagnostics`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', ...headers },
      body,
    });
  const body = JSON.stringify(userIssue(runtimeError()));
  assert.equal(
    (await POST(request(body, { origin: 'https://attacker.example' }))).status,
    403,
  );
  assert.equal((await POST(request(body, { origin: '' }))).status, 403);
  assert.equal(
    (await POST(request(body, { 'content-type': 'text/plain' }))).status,
    415,
  );
  assert.equal((await POST(request('{'))).status, 400);
  assert.equal((await POST(request('{}'))).status, 400);
  assert.equal((await POST(request('x'.repeat(4_097)))).status, 413);
  assert.equal(records.length, 0);
  now += 60_000;
  for (let index = 0; index < 120; index++)
    assert.equal((await POST(request(body))).status, 204);
  const limited = await POST(request(body));
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('x-request-id'));
  assert.equal(records.length, 120);
  now += 60_000;
  assert.equal((await POST(request(body))).status, 204);
});
