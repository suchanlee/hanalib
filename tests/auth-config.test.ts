import assert from 'node:assert/strict';
import test from 'node:test';
import { oauthProviders, oauthStartUrl } from '../features/auth/provider-config.ts';

void test('builds same-origin OAuth start URLs only', () => {
  assert.equal(oauthStartUrl('google', '/catalog?q=book'), '/api/auth/google/start?returnTo=%2Fcatalog%3Fq%3Dbook');
  assert.equal(oauthStartUrl('apple', 'https://attacker.example'), '/api/auth/apple/start?returnTo=%2F');
  assert.equal(oauthStartUrl('google', '//attacker.example'), '/api/auth/google/start?returnTo=%2F');
});

void test('documents the complete Apple server credential set', () => {
  assert.deepEqual(oauthProviders.apple.serverSecretNames, ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']);
});
