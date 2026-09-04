import assert from 'node:assert/strict';
import test from 'node:test';
import { clearSessionCookie, createSessionToken, isSameOriginMutation, sessionCookie, verifySessionToken } from '../lib/auth/session.ts';
import { parseCookies } from '../lib/auth/cookies.ts';

const secret = 'session-secret-with-more-than-32-bytes-for-tests';
const now = new Date('2026-09-04T17:00:00.000Z');

void test('round-trips a signed session and rejects tampering or expiry', async () => {
  const token = await createSessionToken({
    profileId: 'profile-1',
    communityId: 'hana-launch',
    provider: 'google',
  }, { secret, secure: true, now });

  const session = await verifySessionToken(token, { secret, secure: true, now });
  assert.equal(session?.profileId, 'profile-1');
  assert.equal(session?.communityId, 'hana-launch');
  assert.equal(session?.provider, 'google');

  const [payload, signature] = token.split('.');
  const replacement = signature.startsWith('a') ? 'b' : 'a';
  assert.equal(await verifySessionToken(`${payload}.${replacement}${signature.slice(1)}`, { secret, secure: true, now }), null);
  assert.equal(await verifySessionToken(token, {
    secret,
    secure: true,
    now: new Date(now.getTime() + 31 * 24 * 60 * 60 * 1_000),
  }), null);
});

void test('issues host-only secure HttpOnly cookies in HTTPS deployments', async () => {
  const token = await createSessionToken({
    profileId: 'profile-1',
    communityId: 'hana-launch',
    provider: 'apple',
  }, { secret, secure: true, now });
  const header = sessionCookie(token, true);
  assert.match(header, /^__Host-hana_session=/u);
  assert.match(header, /; Path=\//u);
  assert.match(header, /; HttpOnly/u);
  assert.match(header, /; Secure/u);
  assert.match(header, /; SameSite=Lax/u);
  assert.match(clearSessionCookie(true), /Max-Age=0/u);
});

void test('accepts mutation requests only from the configured origin', () => {
  const valid = new Request('https://library.example/api/auth/logout', {
    method: 'POST',
    headers: { origin: 'https://library.example' },
  });
  const crossSite = new Request('https://library.example/api/auth/logout', {
    method: 'POST',
    headers: { origin: 'https://attacker.example' },
  });
  const missingOrigin = new Request('https://library.example/api/auth/logout', { method: 'POST' });
  assert.equal(isSameOriginMutation(valid, 'https://library.example'), true);
  assert.equal(isSameOriginMutation(crossSite, 'https://library.example'), false);
  assert.equal(isSameOriginMutation(missingOrigin, 'https://library.example'), false);
});

void test('ignores malformed cookie encoding without discarding valid cookies', () => {
  const cookies = parseCookies('broken=%E0%A4%A; hana_session=valid.token; theme=ko');
  assert.equal(cookies.has('broken'), false);
  assert.equal(cookies.get('hana_session'), 'valid.token');
  assert.equal(cookies.get('theme'), 'ko');
});
