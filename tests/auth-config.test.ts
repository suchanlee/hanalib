import assert from 'node:assert/strict';
import test from 'node:test';
import { demoIdentity } from '../lib/auth/demo.ts';
import { oauthProviders, oauthStartUrl } from '../features/auth/provider-config.ts';

void test('builds same-origin OAuth start URLs only', () => {
  assert.equal(oauthStartUrl('google', '/catalog?q=book'), '/api/auth/google/start?returnTo=%2Fcatalog%3Fq%3Dbook');
  assert.equal(oauthStartUrl('kakao', '/catalog?q=book'), '/api/auth/kakao/start?returnTo=%2Fcatalog%3Fq%3Dbook');
  assert.equal(oauthStartUrl('kakao', 'https://attacker.example'), '/api/auth/kakao/start?returnTo=%2F');
  assert.equal(oauthStartUrl('kakao', '//attacker.example'), '/api/auth/kakao/start?returnTo=%2F');
});

void test('documents the complete Kakao server credential set', () => {
  assert.equal(oauthProviders.google.clientIdSecretName, 'GOOGLE_CLIENT_ID');
  assert.deepEqual(oauthProviders.google.serverSecretNames, ['GOOGLE_CLIENT_SECRET']);
  assert.equal(oauthProviders.kakao.clientIdSecretName, 'KAKAO_REST_API_KEY');
  assert.deepEqual(oauthProviders.kakao.serverSecretNames, ['KAKAO_CLIENT_SECRET']);
});

void test('keeps deterministic owner and borrower identities development-only', () => {
  assert.equal(demoIdentity('owner').providerSubject, 'local-preview-member');
  assert.equal(demoIdentity('borrower').providerSubject, 'local-preview-borrower');
  assert.notEqual(demoIdentity('owner').email, demoIdentity('borrower').email);
});
