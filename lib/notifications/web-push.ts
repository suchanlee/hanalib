import {
  sendPushNotification,
  topicFromString,
  type PushPayload,
  type PushSubscriptionData,
} from '@mmmike/web-push/send';
import { decryptContact, encryptContact, hashContact } from './contact-crypto.ts';
import type { NotificationTemplate } from './templates.ts';

interface SubscriptionRow {
  id: string;
  endpointHash: string;
  subscriptionEncrypted: string;
}

export interface WebPushConfig {
  contactEncryptionKey?: string;
  contactHashKey?: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
}

export interface WebPushResult {
  attempted: number;
  delivered: number;
  gone: number;
  failed: number;
}

export type WebPushSender = typeof sendPushNotification;

export function webPushConfig(source: Record<string, string | undefined> = process.env): WebPushConfig {
  return {
    contactEncryptionKey: source.CONTACT_ENCRYPTION_KEY,
    contactHashKey: source.CONTACT_HASH_KEY,
    vapidPublicKey: source.WEB_PUSH_PUBLIC_KEY,
    vapidPrivateKey: source.WEB_PUSH_PRIVATE_KEY,
    vapidSubject: source.WEB_PUSH_SUBJECT,
  };
}

export function isWebPushConfigured(config: WebPushConfig) {
  return Boolean(
    config.contactEncryptionKey
    && config.contactHashKey
    && config.vapidPublicKey
    && config.vapidPrivateKey
    && config.vapidSubject,
  );
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid-web-push-key');
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function isTrustedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || value.length > 2_048) return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === 'fcm.googleapis.com'
      || hostname === 'updates.push.services.mozilla.com'
      || hostname.endsWith('.push.services.mozilla.com')
      || hostname === 'web.push.apple.com'
      || hostname.endsWith('.push.apple.com')
      || hostname.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
}

export function parseWebPushSubscription(value: unknown): PushSubscriptionData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-web-push-subscription');
  const candidate = value as Record<string, unknown>;
  const keys = candidate.keys;
  if (
    typeof candidate.endpoint !== 'string'
    || !keys
    || typeof keys !== 'object'
    || Array.isArray(keys)
  ) throw new Error('invalid-web-push-subscription');
  const keyPair = keys as Record<string, unknown>;
  if (typeof keyPair.p256dh !== 'string' || typeof keyPair.auth !== 'string') {
    throw new Error('invalid-web-push-subscription');
  }
  if (
    !isTrustedPushEndpoint(candidate.endpoint)
    || decodeBase64Url(keyPair.p256dh).byteLength !== 65
    || decodeBase64Url(keyPair.auth).byteLength !== 16
  ) throw new Error('invalid-web-push-subscription');
  return {
    endpoint: candidate.endpoint,
    keys: { p256dh: keyPair.p256dh, auth: keyPair.auth },
  };
}

function storageConfig(config: WebPushConfig) {
  if (!config.contactEncryptionKey || !config.contactHashKey) {
    throw new Error('web-push-storage-not-configured');
  }
  return {
    encryptionKey: config.contactEncryptionKey,
    hashKey: config.contactHashKey,
  };
}

function senderConfig(config: WebPushConfig) {
  if (!config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) {
    throw new Error('web-push-delivery-not-configured');
  }
  return {
    publicKey: config.vapidPublicKey,
    privateKey: config.vapidPrivateKey,
    subject: config.vapidSubject,
  };
}

export async function saveWebPushSubscription(
  db: D1Database,
  userId: string,
  value: unknown,
  config: WebPushConfig,
  now = Date.now(),
) {
  const subscription = parseWebPushSubscription(value);
  const storage = storageConfig(config);
  const endpointHash = await hashContact(subscription.endpoint, storage.hashKey);
  const encrypted = await encryptContact(JSON.stringify(subscription), storage.encryptionKey);
  const id = `push-${crypto.randomUUID()}`;
  await db.batch([
    db.prepare(`
      INSERT INTO web_push_subscriptions (
        id, user_id, endpoint_hash, subscription_encrypted, created_at, updated_at,
        last_delivered_at, failure_count, disabled_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL)
      ON CONFLICT(endpoint_hash) DO UPDATE SET
        user_id = excluded.user_id,
        subscription_encrypted = excluded.subscription_encrypted,
        updated_at = excluded.updated_at,
        failure_count = 0,
        disabled_at = NULL
    `).bind(id, userId, endpointHash, encrypted, now, now),
    db.prepare(`
      UPDATE web_push_subscriptions
      SET disabled_at = ?
      WHERE user_id = ? AND disabled_at IS NULL AND id NOT IN (
        SELECT id FROM web_push_subscriptions
        WHERE user_id = ? AND disabled_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 8
      )
    `).bind(now, userId, userId),
  ]);
  return { enabled: true };
}

export async function removeWebPushSubscription(
  db: D1Database,
  userId: string,
  endpoint: string,
  config: WebPushConfig,
  now = Date.now(),
) {
  if (!isTrustedPushEndpoint(endpoint)) throw new Error('invalid-web-push-subscription');
  const { hashKey } = storageConfig(config);
  const endpointHash = await hashContact(endpoint, hashKey);
  await db.prepare(`
    UPDATE web_push_subscriptions
    SET disabled_at = ?, updated_at = ?
    WHERE user_id = ? AND endpoint_hash = ? AND disabled_at IS NULL
  `).bind(now, now, userId, endpointHash).run();
  return { enabled: false };
}

export function webPushPayload(message: NotificationTemplate, tag: string): PushPayload {
  return {
    title: message.subject,
    body: message.text,
    url: message.primaryUrl ?? message.actions?.[0]?.url ?? '/',
    tag,
  };
}

export async function sendWebPushToUser(
  db: D1Database,
  userId: string,
  message: NotificationTemplate,
  tag: string,
  config: WebPushConfig,
  options: { now?: number; sender?: WebPushSender } = {},
): Promise<WebPushResult> {
  const storage = storageConfig(config);
  const vapid = senderConfig(config);
  const sender = options.sender ?? sendPushNotification;
  const now = options.now ?? Date.now();
  const rows = await db.prepare(`
    SELECT
      id,
      endpoint_hash AS endpointHash,
      subscription_encrypted AS subscriptionEncrypted
    FROM web_push_subscriptions
    WHERE user_id = ? AND disabled_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 8
  `).bind(userId).all<SubscriptionRow>();
  const result: WebPushResult = { attempted: rows.results.length, delivered: 0, gone: 0, failed: 0 };
  const topic = await topicFromString(tag);

  for (const row of rows.results) {
    try {
      const subscription = parseWebPushSubscription(JSON.parse(
        await decryptContact(row.subscriptionEncrypted, storage.encryptionKey),
      ));
      const delivered = await sender(subscription, webPushPayload(message, tag), vapid, {
        ttl: 48 * 60 * 60,
        urgency: 'high',
        topic,
        timeoutMs: 10_000,
      });
      if (delivered) {
        result.delivered += 1;
        await db.prepare(`
          UPDATE web_push_subscriptions
          SET last_delivered_at = ?, failure_count = 0, updated_at = ?
          WHERE id = ? AND endpoint_hash = ?
        `).bind(now, now, row.id, row.endpointHash).run();
      } else {
        result.gone += 1;
        await db.prepare(`
          UPDATE web_push_subscriptions
          SET disabled_at = ?, updated_at = ?
          WHERE id = ? AND endpoint_hash = ?
        `).bind(now, now, row.id, row.endpointHash).run();
      }
    } catch {
      result.failed += 1;
      await db.prepare(`
        UPDATE web_push_subscriptions
        SET failure_count = failure_count + 1, updated_at = ?
        WHERE id = ? AND endpoint_hash = ?
      `).bind(now, row.id, row.endpointHash).run();
    }
  }
  return result;
}
