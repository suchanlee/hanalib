import assert from 'node:assert/strict';
import test from 'node:test';
import { base64UrlEncode, jsonBase64Url, parseJsonBase64Url, utf8 } from '../lib/auth/encoding.ts';
import { readProviderAuthConfig, safeReturnTo } from '../lib/auth/config.ts';
import {
  authorizationUrl,
  createAppleClientSecret,
  identityFromClaims,
  sanitizeExternalName,
  verifyOidcIdToken,
  type OidcClaims,
} from '../lib/auth/oauth.ts';
import {
  newOAuthTransaction,
  oauthTransactionCookie,
  oauthTransactionFromRequest,
  pkceChallenge,
} from '../lib/auth/oauth-transaction.ts';

const sessionSecret = 'session-secret-with-more-than-32-bytes-for-tests';
const transactionSecret = 'transaction-secret-with-more-than-32-bytes-tests';
const now = new Date('2026-09-04T17:00:00.000Z');
const baseEnv = {
  PUBLIC_APP_URL: 'https://library.example',
  AUTH_SESSION_SECRET: sessionSecret,
  AUTH_TRANSACTION_SECRET: transactionSecret,
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  APPLE_CLIENT_ID: 'com.example.library',
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_KEY_ID: 'KEY1234567',
  APPLE_PRIVATE_KEY: 'unused-for-authorization-url',
};

void test('uses the standard S256 PKCE transformation', async () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(await pkceChallenge(verifier), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

void test('canonicalizes return paths and rejects network-path variants', () => {
  assert.equal(safeReturnTo('/catalog?owner=me#top'), '/catalog?owner=me#top');
  assert.equal(safeReturnTo('//attacker.example'), '/');
  assert.equal(safeReturnTo('/\\attacker.example'), '/');
  assert.equal(safeReturnTo('https://attacker.example'), '/');
});

void test('binds OAuth state, nonce, verifier, and return path in a signed short-lived cookie', async () => {
  const transaction = newOAuthTransaction('google', '/catalog?owner=me', now);
  const setCookie = await oauthTransactionCookie(transaction, transactionSecret, true);
  const cookiePair = setCookie.split(';', 1)[0];
  const request = new Request('https://library.example/api/auth/google/callback', {
    headers: { cookie: cookiePair },
  });
  const recovered = await oauthTransactionFromRequest(request, transactionSecret, true, now);
  assert.deepEqual(recovered, transaction);
  assert.equal(await oauthTransactionFromRequest(request, transactionSecret, true, new Date(now.getTime() + 11 * 60 * 1_000)), null);
});

void test('allows Apple form_post to return its state cookie only over HTTPS', async () => {
  const transaction = newOAuthTransaction('apple', '/', now);
  const setCookie = await oauthTransactionCookie(transaction, transactionSecret, true);
  assert.match(setCookie, /SameSite=None/u);
  assert.match(setCookie, /; Secure/u);
  await assert.rejects(oauthTransactionCookie(transaction, transactionSecret, false));
  assert.throws(() => readProviderAuthConfig('apple', {
    ...baseEnv,
    PUBLIC_APP_URL: 'http://localhost:3000',
  }));
});

void test('builds Google code flow with PKCE and Apple form_post flow', async () => {
  const google = readProviderAuthConfig('google', baseEnv);
  const googleTransaction = newOAuthTransaction('google', '/', now);
  const googleUrl = await authorizationUrl(google, googleTransaction);
  assert.equal(googleUrl.origin, 'https://accounts.google.com');
  assert.equal(googleUrl.searchParams.get('response_type'), 'code');
  assert.equal(googleUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(googleUrl.searchParams.get('state'), googleTransaction.state);
  assert.equal(googleUrl.searchParams.get('nonce'), googleTransaction.nonce);
  assert.equal(googleUrl.searchParams.get('redirect_uri'), 'https://library.example/api/auth/google/callback');

  const apple = readProviderAuthConfig('apple', baseEnv);
  const appleTransaction = newOAuthTransaction('apple', '/', now);
  const appleUrl = await authorizationUrl(apple, appleTransaction);
  assert.equal(appleUrl.origin, 'https://appleid.apple.com');
  assert.equal(appleUrl.searchParams.get('response_type'), 'code');
  assert.equal(appleUrl.searchParams.get('response_mode'), 'form_post');
  assert.equal(appleUrl.searchParams.get('scope'), 'name email');
  assert.equal(appleUrl.searchParams.has('code_challenge'), false);
  assert.equal(appleUrl.searchParams.get('redirect_uri'), 'https://library.example/api/auth/apple/callback');
});

async function signedIdToken(claims: OidcClaims) {
  const pair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2_048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }, true, ['sign', 'verify']);
  const header = jsonBase64Url({ alg: 'RS256', kid: 'test-key', typ: 'JWT' });
  const payload = jsonBase64Url(claims);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    pair.privateKey,
    utf8(`${header}.${payload}`),
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const token = `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
  const fetcher = (async () => Response.json({ keys: [{ ...publicJwk, kid: 'test-key' }] })) as typeof fetch;
  return { token, fetcher };
}

void test('verifies the provider signature and all replay-sensitive ID-token claims', async () => {
  const claims: OidcClaims = {
    iss: 'https://accounts.google.com',
    sub: 'google-subject-1',
    aud: 'google-client-id',
    iat: Math.floor(now.getTime() / 1_000),
    exp: Math.floor(now.getTime() / 1_000) + 300,
    nonce: 'expected-nonce',
    email: 'reader@example.com',
    email_verified: true,
  };
  const { token, fetcher } = await signedIdToken(claims);
  const verified = await verifyOidcIdToken(token, {
    audience: 'google-client-id',
    issuers: ['https://accounts.google.com'],
    jwksUrl: 'https://issuer.example/keys',
    nonce: 'expected-nonce',
    now,
    fetcher,
  });
  assert.equal(verified.sub, 'google-subject-1');

  await assert.rejects(verifyOidcIdToken(token, {
    audience: 'google-client-id',
    issuers: ['https://accounts.google.com'],
    jwksUrl: 'https://issuer.example/keys',
    nonce: 'wrong-nonce',
    now,
    fetcher,
  }));
  const [tokenHeader, tokenPayload, tokenSignature] = token.split('.');
  const changed = tokenSignature.startsWith('a') ? 'b' : 'a';
  const tamperedToken = `${tokenHeader}.${tokenPayload}.${changed}${tokenSignature.slice(1)}`;
  await assert.rejects(verifyOidcIdToken(tamperedToken, {
    audience: 'google-client-id',
    issuers: ['https://accounts.google.com'],
    jwksUrl: 'https://issuer.example/keys',
    nonce: 'expected-nonce',
    now,
    fetcher,
  }));
});

void test('creates a five-minute ES256 Apple client-secret JWT', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const base64 = Buffer.from(pkcs8).toString('base64');
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`;
  const token = await createAppleClientSecret({
    clientId: 'com.example.library',
    teamId: 'TEAM123456',
    keyId: 'KEY1234567',
    privateKey,
  }, now);
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(parseJsonBase64Url(header), { alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
  assert.deepEqual(parseJsonBase64Url(payload), {
    iss: 'TEAM123456',
    iat: Math.floor(now.getTime() / 1_000),
    exp: Math.floor(now.getTime() / 1_000) + 300,
    aud: 'https://appleid.apple.com',
    sub: 'com.example.library',
  });
  assert.ok(signature.length > 20);
});

void test('sanitizes provider names and refuses unverified Google email', () => {
  assert.equal(sanitizeExternalName('  <Jiwoo>\u202e   Reader  '), 'Jiwoo Reader');
  assert.throws(() => identityFromClaims('google', {
    iss: 'https://accounts.google.com',
    sub: 'subject',
    aud: 'client',
    iat: 1,
    exp: 2,
    nonce: 'nonce',
    email: 'unverified@example.com',
    email_verified: false,
  }));
});
