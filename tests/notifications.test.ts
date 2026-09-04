import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInboundSmsDecision, resolveOwnerSmsReply } from '../lib/notifications/domain.ts';
import { isValidUsPhone, normalizeUsPhone } from '../features/settings/validation.ts';
import type { BorrowRequest, CatalogItem } from '../lib/domain/types.ts';

const ownerItem = { id: 'item-1', ownerId: 'owner-1', status: 'available' } as CatalogItem;
const liveRequest = { id: 'request-1', catalogItemId: 'item-1', status: 'pending', expiresAt: '2026-09-07T00:00:00.000Z' } as BorrowRequest;
const now = new Date('2026-09-05T00:00:00.000Z');

void test('accepts only exact SMS 1 and 2 commands', () => {
  assert.deepEqual(parseInboundSmsDecision(' 1 '), { kind: 'decision', decision: 'accepted' });
  assert.deepEqual(parseInboundSmsDecision('\n2\n'), { kind: 'decision', decision: 'declined' });
  assert.deepEqual(parseInboundSmsDecision('yes'), { kind: 'invalid' });
  assert.deepEqual(parseInboundSmsDecision('1 please'), { kind: 'invalid' });
});

void test('applies an owner reply only to one live actionable request', () => {
  assert.deepEqual(resolveOwnerSmsReply('owner-1', '1', [ownerItem], [liveRequest], now), {
    kind: 'ready',
    requestId: 'request-1',
    decision: 'accepted',
  });
  assert.deepEqual(resolveOwnerSmsReply('owner-1', '2', [ownerItem], [liveRequest, { ...liveRequest, id: 'request-2' }], now), {
    kind: 'ambiguous',
    requestCount: 2,
  });
});

void test('expired and unrelated requests are never actionable by SMS', () => {
  const expired = { ...liveRequest, expiresAt: '2026-09-04T00:00:00.000Z' };
  assert.deepEqual(resolveOwnerSmsReply('owner-1', '1', [ownerItem], [expired], now), { kind: 'no-actionable-request' });
  assert.deepEqual(resolveOwnerSmsReply('other-owner', '1', [ownerItem], [liveRequest], now), { kind: 'no-actionable-request' });
});

void test('the US pilot accepts and normalizes +1 E.164 numbers only', () => {
  assert.equal(isValidUsPhone('+1 (415) 555-2481'), true);
  assert.equal(normalizeUsPhone('+1 (415) 555-2481'), '+14155552481');
  assert.equal(isValidUsPhone('+442079460000'), false);
  assert.equal(isValidUsPhone('555'), false);
});
