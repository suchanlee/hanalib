import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmailVerificationToken,
  normalizeEmail,
  readEmailVerificationToken,
} from '../lib/auth/email-verification.ts';

const secret = 'email-verification-test-secret-at-least-32-bytes';
const now = Date.parse('2026-09-05T19:00:00.000Z');

void test('normalizes plausible email addresses and rejects unsafe input', () => {
  assert.equal(normalizeEmail(' Reader@Example.COM '), 'reader@example.com');
  assert.equal(normalizeEmail('missing-at.example.com'), undefined);
  assert.equal(normalizeEmail('reader@example'), undefined);
  assert.equal(normalizeEmail(`reader@${'x'.repeat(320)}.com`), undefined);
});

void test('email verification tokens are purpose-bound, signed, and short-lived', async () => {
  const token = await createEmailVerificationToken('member-1', 'email-hash', secret, now);
  assert.deepEqual(await readEmailVerificationToken(token, secret, now + 59 * 60_000), {
    version: 1,
    purpose: 'verify-email',
    profileId: 'member-1',
    emailHash: 'email-hash',
    issuedAt: now,
    expiresAt: now + 60 * 60_000,
  });
  assert.equal(await readEmailVerificationToken(token, secret, now + 60 * 60_000), null);
  assert.equal(await readEmailVerificationToken(`${token}x`, secret, now), null);
});
