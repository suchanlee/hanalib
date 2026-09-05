import assert from 'node:assert/strict';
import test from 'node:test';
import type { PushSubscriptionData } from '@mmmike/web-push/send';
import { encryptContact } from '../lib/notifications/contact-crypto.ts';
import {
  isTrustedPushEndpoint,
  parseWebPushSubscription,
  sendWebPushToUser,
  webPushPayload,
  type WebPushSender,
} from '../lib/notifications/web-push.ts';

const encryptionKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const hashKey = 'a-test-only-hash-key-with-at-least-32-characters';
const key = (size: number) => Buffer.alloc(size, 7).toString('base64url');

function subscription(endpoint = 'https://fcm.googleapis.com/fcm/send/test'): PushSubscriptionData {
  return { endpoint, keys: { p256dh: key(65), auth: key(16) } };
}

void test('accepts real browser push origins and rejects arbitrary outbound targets', () => {
  assert.equal(isTrustedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(isTrustedPushEndpoint('https://web.push.apple.com/QP/abc'), true);
  assert.equal(isTrustedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
  assert.equal(isTrustedPushEndpoint('https://internal.example.test/hooks'), false);
  assert.equal(isTrustedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc'), false);
  assert.deepEqual(parseWebPushSubscription(subscription()), subscription());
  assert.throws(() => parseWebPushSubscription({ ...subscription(), keys: { p256dh: key(64), auth: key(16) } }));
});

void test('maps notification templates to same-origin service worker payloads', () => {
  assert.deepEqual(webPushPayload({
    subject: 'Request to borrow Almond',
    text: 'Alex would like to borrow Almond.',
    actions: [{ label: 'View', url: 'https://library.example/borrowing' }],
  }, 'event-1'), {
    title: 'Request to borrow Almond',
    body: 'Alex would like to borrow Almond.',
    url: 'https://library.example/borrowing',
    tag: 'event-1',
  });
});

void test('delivers to active devices and disables subscriptions reported gone', async () => {
  const rows = await Promise.all([
    subscription('https://fcm.googleapis.com/fcm/send/active'),
    subscription('https://fcm.googleapis.com/fcm/send/gone'),
  ].map(async (value, index) => ({
    id: `push-${index}`,
    endpointHash: `hash-${index}`,
    subscriptionEncrypted: await encryptContact(JSON.stringify(value), encryptionKey),
  })));
  const updates: string[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) {
          return {
            async all() { return { results: rows }; },
            async run() { updates.push(sql); return { meta: { changes: 1 } }; },
          };
        },
      };
    },
  } as unknown as D1Database;
  const sender: WebPushSender = async (value) => !value.endpoint.endsWith('/gone');
  const result = await sendWebPushToUser(db, 'member-1', {
    subject: 'Test',
    text: 'It works',
    primaryUrl: 'https://library.example/settings',
  }, 'test-event', {
    contactEncryptionKey: encryptionKey,
    contactHashKey: hashKey,
    vapidPublicKey: key(65),
    vapidPrivateKey: key(32),
    vapidSubject: 'https://library.example',
  }, { now: 1234, sender });

  assert.deepEqual(result, { attempted: 2, delivered: 1, gone: 1, failed: 0 });
  assert.equal(updates.some((sql) => sql.includes('last_delivered_at')), true);
  assert.equal(updates.some((sql) => sql.includes('disabled_at')), true);
});
