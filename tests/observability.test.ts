import assert from 'node:assert/strict';
import test from 'node:test';

import {
  operationalLog,
  requestLogContext,
  safeErrorCode,
  withRequestId,
} from '../lib/observability/log.ts';

void test('uses a Cloudflare request identifier without retaining query values or record ids', () => {
  const context = requestLogContext(new Request(
    'https://example.test/api/catalog/item-4b0cade0-1cc0-4ca9-a01b-65890a0990b2?isbn=9780140328721',
    { headers: { 'cf-ray': 'A36199690A8E1722-SJC' } },
  ), 100);

  assert.equal(context.requestId, 'a36199690a8e1722');
  assert.equal(context.route, '/api/catalog/:id');
  assert.equal(context.method, 'GET');
  assert.equal('isbn' in context, false);
});

void test('adds the request id to responses so reported errors can be correlated', () => {
  const response = withRequestId(new Response(null, { status: 503 }), {
    requestId: 'a36199690a8e1722',
  });
  assert.equal(response.headers.get('x-request-id'), 'a36199690a8e1722');

  const existing = withRequestId(new Response(null, { headers: { 'x-request-id': 'inner-request-id' } }), {
    requestId: 'outer-request-id',
  });
  assert.equal(existing.headers.get('x-request-id'), 'inner-request-id');
});

void test('keeps only allowlisted operational fields out of structured logs', () => {
  const records: string[] = [];
  const original = console.error;
  console.error = (value?: unknown) => records.push(String(value));
  try {
    operationalLog('error', 'library-api-failed', {
      requestId: 'a36199690a8e1722',
      method: 'POST',
      route: '/api/catalog',
      operation: 'library-api',
      status: 500,
      errorCode: 'internal-error',
      ...({ bookTitle: 'Do not log me', token: 'secret-token' } as Record<string, string>),
    });
  } finally {
    console.error = original;
  }

  assert.equal(records.length, 1);
  const logged = JSON.parse(records[0]) as Record<string, unknown>;
  assert.equal(logged.schema, 'hana.operations.v1');
  assert.equal(logged.requestId, 'a36199690a8e1722');
  assert.equal(logged.errorCode, 'internal-error');
  assert.equal('bookTitle' in logged, false);
  assert.equal('token' in logged, false);
});

void test('does not copy arbitrary exception messages into logs', () => {
  assert.equal(safeErrorCode(new Error('Member Suchan could not borrow Fantastic Mr. Fox'), 'internal-error'), 'internal-error');
  assert.equal(safeErrorCode(new Error('kakao-message-delivery-failed-401'), 'delivery-failed'), 'kakao-message-delivery-failed-401');
  assert.equal(safeErrorCode({ code: 'server-misconfigured' }, 'internal-error'), 'server-misconfigured');
});
