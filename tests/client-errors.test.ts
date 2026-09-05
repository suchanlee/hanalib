import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, apiData, requestJson } from '../lib/http/client.ts';
import {
  issueDetails,
  issueMessage,
  userIssue,
} from '../features/app/user-issue.ts';

void test('preserves request ids for structured, legacy, and non-JSON server errors', async (t) => {
  for (const response of [
    Response.json(
      { error: { code: 'conflict', message: 'private information' } },
      { status: 409, headers: { 'x-request-id': 'support-123' } },
    ),
    Response.json(
      { error: 'conflict' },
      { status: 409, headers: { 'x-request-id': 'support-123' } },
    ),
    new Response('<html>private internal error</html>', {
      status: 503,
      headers: { 'x-request-id': 'support-123' },
    }),
  ]) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(requestJson('/api/test'), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.requestId, 'support-123');
      assert.equal(error.status, response.status);
      assert.doesNotMatch(issueDetails(userIssue(error)), /private|html/);
      return true;
    });
    t.mock.restoreAll();
  }
});

void test('rejects invalid success envelopes with their support reference', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({}, { headers: { 'x-request-id': 'bad-envelope' } }),
  );
  await assert.rejects(
    apiData('/api/app'),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === 'invalid-response' &&
      error.requestId === 'bad-envelope',
  );
});

void test('network failures are actionable and mutations are not automatically repeated', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new TypeError('secret network details');
  });
  await assert.rejects(
    apiData('/api/catalog', { method: 'POST' }),
    (error: unknown) =>
      error instanceof ApiError && error.code === 'network-error',
  );
  assert.equal(calls, 1);
});

void test('deadlines and caller cancellation are distinguished', async (t) => {
  t.mock.method(AbortSignal, 'timeout', () =>
    AbortSignal.abort(new DOMException('Timed out', 'TimeoutError')),
  );
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: unknown, init: RequestInit) => {
      throw init.signal?.reason;
    },
  );
  await assert.rejects(
    requestJson('/api/app'),
    (error: unknown) =>
      error instanceof ApiError && error.code === 'request-timeout',
  );
  const controller = new AbortController();
  controller.abort(new DOMException('Canceled', 'AbortError'));
  await assert.rejects(requestJson('/api/app', { signal: controller.signal }), {
    name: 'AbortError',
  });
});

void test('every error category offers localized guidance and shareable, sanitized diagnostics', () => {
  for (const status of [0, 400, 401, 403, 404, 409, 413, 415, 429, 500, 503]) {
    const issue = userIssue(
      new ApiError(status, 'request-failed', 'reference-1'),
      'return-book',
    );
    assert.match(issueDetails(issue), /reference-1/);
    assert.ok(issueMessage(issue, 'en').length > 30);
    assert.match(issueMessage(issue, 'ko'), /[가-힣]/);
  }
  assert.match(
    issueMessage(userIssue(new ApiError(503, 'sync-failed')), 'en'),
    /was saved.*instead of repeating/,
  );
  assert.match(
    issueMessage(userIssue(new ApiError(503, 'failed'), 'sign-out'), 'en'),
    /still be signed in/,
  );
  const unsafe = userIssue(
    new ApiError(500, '<script>private</script>', 'private/email@example.com'),
    'private user name',
  );
  assert.doesNotMatch(issueDetails(unsafe), /script|private|example.com/);
});

void test('a timeout while reading the response body retains the server reference', async (t) => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => controller.signal);
  t.mock.method(globalThis, 'fetch', async () => {
    const response = new Response('{}', {
      headers: { 'x-request-id': 'slow-body-123' },
    });
    response.json = async () => {
      controller.abort(new DOMException('Timed out', 'TimeoutError'));
      throw controller.signal.reason;
    };
    return response;
  });
  await assert.rejects(
    requestJson('/api/app'),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === 'request-timeout' &&
      error.requestId === 'slow-body-123',
  );
});
