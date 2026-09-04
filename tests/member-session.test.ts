import assert from 'node:assert/strict';
import test from 'node:test';

import { cookieValue, createMemberSessionToken, verifyMemberSessionToken } from '../lib/storage/member-session.ts';

const secret = 'test-only-session-secret-with-32-characters';

void test('verifies an unexpired signed member session', async () => {
  const token = await createMemberSessionToken({ sub: 'member-123', exp: 2_000 }, secret);
  assert.deepEqual(await verifyMemberSessionToken(token, secret, 1_000), { sub: 'member-123', exp: 2_000 });
  assert.equal(cookieValue(`theme=dark; hana_session=${token}; locale=ko`, 'hana_session'), token);
});

void test('rejects expired, tampered, malformed, and weakly signed sessions', async () => {
  const token = await createMemberSessionToken({ sub: 'member-123', exp: 2_000 }, secret);
  assert.equal(await verifyMemberSessionToken(token, secret, 2_000), undefined);
  assert.equal(await verifyMemberSessionToken(`${token}x`, secret, 1_000), undefined);
  assert.equal(await verifyMemberSessionToken('not-a-token', secret, 1_000), undefined);
  assert.equal(await verifyMemberSessionToken(token, 'too-short', 1_000), undefined);
});
