import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptContact, encryptContact, hashContact } from '../lib/notifications/contact-crypto.ts';

const encryptionKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const hashKey = 'a-test-only-hash-key-with-at-least-32-characters';

void test('contact addresses are encrypted with unique authenticated ciphertexts', async () => {
  const first = await encryptContact('+14155550123', encryptionKey);
  const second = await encryptContact('+14155550123', encryptionKey);
  assert.notEqual(first, second);
  assert.equal(await decryptContact(first, encryptionKey), '+14155550123');
  const tampered = `${first.slice(0, 10)}${first[10] === 'A' ? 'B' : 'A'}${first.slice(11)}`;
  await assert.rejects(() => decryptContact(tampered, encryptionKey));
});

void test('contact hashes are stable but keyed', async () => {
  const first = await hashContact('reader@example.com', hashKey);
  const second = await hashContact('reader@example.com', hashKey);
  assert.equal(first, second);
  assert.notEqual(first, await hashContact('other@example.com', hashKey));
});
