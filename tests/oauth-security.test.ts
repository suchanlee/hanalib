import assert from 'node:assert/strict';
import test from 'node:test';
import { base64UrlEncode, jsonBase64Url, utf8 } from '../lib/auth/encoding.ts';
import { readProviderAuthConfig, safeReturnTo } from '../lib/auth/config.ts';
import {
  authorizationUrl,
  exchangeAuthorizationCode,
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
  KAKAO_REST_API_KEY: 'kakao-rest-api-key',
  KAKAO_CLIENT_SECRET: 'kakao-client-secret',
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

void test('binds Kakao state, nonce, verifier, and return path in a signed short-lived cookie', async () => {
  const transaction = newOAuthTransaction('kakao', '/catalog?owner=me', now);
  const setCookie = await oauthTransactionCookie(transaction, transactionSecret, true);
  const cookiePair = setCookie.split(';', 1)[0];
  const request = new Request('https://library.example/api/auth/kakao/callback', {
    headers: { cookie: cookiePair },
  });
  const recovered = await oauthTransactionFromRequest(request, transactionSecret, true, now);
  assert.deepEqual(recovered, transaction);
  assert.equal(await oauthTransactionFromRequest(request, transactionSecret, true, new Date(now.getTime() + 11 * 60 * 1_000)), null);
  assert.match(setCookie, /SameSite=Lax/u);
  assert.match(setCookie, /; Secure/u);
});

void test('builds Kakao OIDC authorization with nonce and PKCE', async () => {
  const kakao = readProviderAuthConfig('kakao', baseEnv);
  const transaction = newOAuthTransaction('kakao', '/', now);
  const url = await authorizationUrl(kakao, transaction);
  assert.equal(url.origin, 'https://kauth.kakao.com');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid,profile_nickname,profile_image');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), transaction.state);
  assert.equal(url.searchParams.get('nonce'), transaction.nonce);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://library.example/api/auth/kakao/callback');
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
  return { token, publicJwk };
}

void test('verifies the Kakao signature and all replay-sensitive ID-token claims', async () => {
  const claims: OidcClaims = {
    iss: 'https://kauth.kakao.com',
    sub: 'kakao-subject-1',
    aud: 'kakao-rest-api-key',
    iat: Math.floor(now.getTime() / 1_000),
    exp: Math.floor(now.getTime() / 1_000) + 300,
    nonce: 'expected-nonce',
    nickname: '하나 독자',
  };
  const { token, publicJwk } = await signedIdToken(claims);
  const fetcher = (async () => Response.json({ keys: [{ ...publicJwk, kid: 'test-key' }] })) as typeof fetch;
  const verified = await verifyOidcIdToken(token, {
    audience: 'kakao-rest-api-key',
    issuers: ['https://kauth.kakao.com'],
    jwksUrl: 'https://issuer.example/keys',
    nonce: 'expected-nonce',
    now,
    fetcher,
  });
  assert.equal(verified.sub, 'kakao-subject-1');

  await assert.rejects(verifyOidcIdToken(token, {
    audience: 'kakao-rest-api-key',
    issuers: ['https://kauth.kakao.com'],
    jwksUrl: 'https://issuer.example/keys',
    nonce: 'wrong-nonce',
    now,
    fetcher,
  }));
  const [tokenHeader, tokenPayload, tokenSignature] = token.split('.');
  const changed = tokenSignature.startsWith('a') ? 'b' : 'a';
  await assert.rejects(verifyOidcIdToken(`${tokenHeader}.${tokenPayload}.${changed}${tokenSignature.slice(1)}`, {
    audience: 'kakao-rest-api-key',
    issuers: ['https://kauth.kakao.com'],
    jwksUrl: 'https://issuer.example/keys',
    nonce: 'expected-nonce',
    now,
    fetcher,
  }));
});

void test('exchanges the Kakao authorization code with client secret and PKCE', async () => {
  const config = readProviderAuthConfig('kakao', baseEnv);
  const transaction = newOAuthTransaction('kakao', '/', now);
  const claims: OidcClaims = {
    iss: 'https://kauth.kakao.com',
    sub: '123456789',
    aud: 'kakao-rest-api-key',
    iat: Math.floor(Date.now() / 1_000),
    exp: Math.floor(Date.now() / 1_000) + 300,
    nonce: transaction.nonce,
  };
  const { token, publicJwk } = await signedIdToken(claims);
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === '/oauth/token') {
      const body = init?.body as URLSearchParams;
      assert.equal(body.get('client_id'), 'kakao-rest-api-key');
      assert.equal(body.get('client_secret'), 'kakao-client-secret');
      assert.equal(body.get('code_verifier'), transaction.verifier);
      assert.equal(body.get('redirect_uri'), 'https://library.example/api/auth/kakao/callback');
      return Response.json({ id_token: token });
    }
    if (url.pathname === '/.well-known/jwks.json') {
      return Response.json({ keys: [{ ...publicJwk, kid: 'test-key' }] });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  const result = await exchangeAuthorizationCode(config, 'authorization-code', transaction, fetcher);
  assert.equal(result.sub, '123456789');
});

void test('sanitizes Kakao profile data and ignores unverified email claims', () => {
  assert.equal(sanitizeExternalName('  <Jiwoo>\u202e   Reader  '), 'Jiwoo Reader');
  const identity = identityFromClaims('kakao', {
    iss: 'https://kauth.kakao.com',
    sub: 'subject',
    aud: 'client',
    iat: 1,
    exp: 2,
    nonce: 'nonce',
    nickname: '  하나 독자 ',
    picture: 'https://k.kakaocdn.net/example.jpg',
    email: 'unverified@example.com',
    email_verified: false,
  });
  assert.equal(identity.displayName, '하나 독자');
  assert.equal(identity.email, '');
  assert.equal(identity.avatarUrl, 'https://k.kakaocdn.net/example.jpg');
});
