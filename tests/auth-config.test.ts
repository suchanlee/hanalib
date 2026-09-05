import assert from 'node:assert/strict';
import test from 'node:test';
import { readAuthBaseConfig } from '../lib/auth/config.ts';
import { demoIdentity } from '../lib/auth/demo.ts';
import { oauthProviders, oauthStartUrl } from '../features/auth/provider-config.ts';

const baseEnv = {
  PUBLIC_APP_URL: 'https://library.example',
  AUTH_SESSION_SECRET: 'session-secret-at-least-thirty-two-bytes',
  AUTH_TRANSACTION_SECRET: 'transaction-secret-at-least-thirty-two-bytes',
};

void test('builds same-origin OAuth start URLs only', () => {
  assert.equal(oauthStartUrl('kakao', '/catalog?q=book'), '/api/auth/kakao/start?returnTo=%2Fcatalog%3Fq%3Dbook');
  assert.equal(oauthStartUrl('kakao', 'https://attacker.example'), '/api/auth/kakao/start?returnTo=%2F');
  assert.equal(oauthStartUrl('kakao', '//attacker.example'), '/api/auth/kakao/start?returnTo=%2F');
});

void test('documents the complete Kakao server credential set', () => {
  assert.equal(oauthProviders.kakao.clientIdSecretName, 'KAKAO_REST_API_KEY');
  assert.deepEqual(oauthProviders.kakao.serverSecretNames, ['KAKAO_CLIENT_SECRET']);
});

void test('keeps deterministic owner and borrower identities development-only', () => {
  assert.equal(demoIdentity('owner').providerSubject, 'local-preview-member');
  assert.equal(demoIdentity('borrower').providerSubject, 'local-preview-borrower');
  assert.notEqual(demoIdentity('owner').email, demoIdentity('borrower').email);
});

void test('requires an exact Kakao subject and legacy email pair for one-time identity migration', () => {
  assert.deepEqual(readAuthBaseConfig({
    ...baseEnv,
    KAKAO_MIGRATION_SUBJECT: '5072964400',
    KAKAO_MIGRATION_GOOGLE_EMAIL: ' Member@Example.com ',
  }).kakaoIdentityMigration, {
    kakaoSubject: '5072964400',
    googleEmail: 'member@example.com',
  });
  assert.throws(
    () => readAuthBaseConfig({ ...baseEnv, KAKAO_MIGRATION_SUBJECT: '5072964400' }),
    /requires both subject and Google email/,
  );
  assert.throws(
    () => readAuthBaseConfig({
      ...baseEnv,
      KAKAO_MIGRATION_SUBJECT: 'not-a-subject',
      KAKAO_MIGRATION_GOOGLE_EMAIL: 'member@example.com',
    }),
    /numeric subject/,
  );
});
