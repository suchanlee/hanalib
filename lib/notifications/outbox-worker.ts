import type { AppLocale, NotificationChannel } from '../domain/types.ts';
import { nextReturnCheckAt } from '../domain/rules.ts';
import type { OutboxPayloadByType, LibraryOutboxEventType } from '../persistence/outbox.ts';
import { operationalLog, safeErrorCode } from '../observability/log.ts';
import { decryptContact, encryptContact } from './contact-crypto.ts';
import { parseKakaoCredential, refreshKakaoCredential } from './kakao.ts';
import { sendNotification, sendResendEmail, type DeliveryResult, type NotificationSenderConfig } from './sender.ts';
import { bookReturnedTemplate, borrowRequestReminderTemplate, borrowRequestTemplate, decisionTemplate, holdOfferTemplate, requestClosedTemplate, returnCheckTemplate, type NotificationTemplate } from './templates.ts';
import {
  isWebPushConfigured,
  sendWebPushToUser,
  type WebPushConfig,
  type WebPushSender,
} from './web-push.ts';

interface OutboxRow {
  id: string;
  eventType: string;
  aggregateId: string;
  recipientId: string;
  locale: string;
  payloadJson: string;
  availableAt: number;
  attemptCount: number;
}

interface RecipientRow {
  notificationChannel: string;
  email: string | null;
}

interface SmsRow {
  addressEncrypted: string;
}

interface KakaoRow {
  id: string;
  addressEncrypted: string;
}

export interface OutboxWorkerConfig extends NotificationSenderConfig, WebPushConfig {
  contactEncryptionKey?: string;
}

export interface OutboxWorkerResult {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
}

function affected(result: D1Result<unknown>) {
  return Number(result.meta.changes ?? 0);
}

function locale(value: string): AppLocale {
  return value === 'en' ? 'en' : 'ko';
}

function eventType(value: string): LibraryOutboxEventType | undefined {
  return ['borrow_requested', 'borrow_request_reminder', 'borrow_accepted', 'borrow_declined', 'borrow_canceled', 'borrow_expired', 'book_returned', 'return_check_due', 'hold_available', 'hold_offer_reminder'].includes(value)
    ? value as LibraryOutboxEventType
    : undefined;
}

function payload<Type extends LibraryOutboxEventType>(row: OutboxRow, _type: Type) {
  const parsed = JSON.parse(row.payloadJson) as OutboxPayloadByType[Type];
  if (!parsed || typeof parsed !== 'object' || typeof parsed.bookTitle !== 'string' || typeof parsed.recipientName !== 'string') {
    throw new Error('invalid-outbox-payload');
  }
  return parsed;
}

export function renderOutboxMessage(row: Pick<OutboxRow, 'eventType' | 'locale' | 'payloadJson'>): NotificationTemplate {
  const fullRow = row as OutboxRow;
  const type = eventType(row.eventType);
  if (!type) throw new Error('unsupported-outbox-event');
  const language = locale(row.locale);
  if (type === 'borrow_requested' || type === 'borrow_request_reminder') {
    const value = payload(fullRow, type);
    if (typeof value.actorName !== 'string' || typeof value.expiresAt !== 'string') throw new Error('invalid-outbox-payload');
    if (typeof value.decisionUrl !== 'string') throw new Error('invalid-outbox-payload');
    const input = {
      locale: language,
      ownerName: value.recipientName,
      borrowerName: value.actorName,
      bookTitle: value.bookTitle,
      expiresAt: new Date(value.expiresAt),
      decisionUrl: value.decisionUrl,
      bookUrl: typeof value.bookUrl === 'string' ? value.bookUrl : undefined,
      coverUrl: typeof value.coverUrl === 'string' ? value.coverUrl : undefined,
    };
    return type === 'borrow_request_reminder'
      ? borrowRequestReminderTemplate(input)
      : borrowRequestTemplate(input);
  }
  if (type === 'return_check_due') {
    const value = payload(fullRow, type);
    if (typeof value.returnUrl !== 'string') throw new Error('invalid-outbox-payload');
    return returnCheckTemplate({
      locale: language,
      borrowerName: value.recipientName,
      bookTitle: value.bookTitle,
      returnUrl: value.returnUrl,
    });
  }
  if (type === 'hold_available' || type === 'hold_offer_reminder') {
    const value = payload(fullRow, type);
    if (typeof value.expiresAt !== 'string' || typeof value.offerUrl !== 'string') throw new Error('invalid-outbox-payload');
    return holdOfferTemplate({
      locale: language,
      memberName: value.recipientName,
      bookTitle: value.bookTitle,
      expiresAt: new Date(value.expiresAt),
      offerUrl: value.offerUrl,
      coverUrl: typeof value.coverUrl === 'string' ? value.coverUrl : undefined,
      reminder: type === 'hold_offer_reminder',
    });
  }
  if (type === 'borrow_canceled' || type === 'borrow_expired') {
    const value = payload(fullRow, type);
    if (typeof value.actorName !== 'string' || typeof value.bookUrl !== 'string') throw new Error('invalid-outbox-payload');
    return requestClosedTemplate({
      locale: language,
      ownerName: value.recipientName,
      borrowerName: value.actorName,
      bookTitle: value.bookTitle,
      bookUrl: value.bookUrl,
      reason: type === 'borrow_canceled' ? 'canceled' : 'expired',
    });
  }
  if (type === 'book_returned') {
    const value = payload(fullRow, type);
    if (typeof value.actorName !== 'string' || typeof value.bookUrl !== 'string') throw new Error('invalid-outbox-payload');
    return bookReturnedTemplate({
      locale: language,
      ownerName: value.recipientName,
      borrowerName: value.actorName,
      bookTitle: value.bookTitle,
      bookUrl: value.bookUrl,
    });
  }
  const value = payload(fullRow, type);
  return decisionTemplate({
    locale: language,
    borrowerName: value.recipientName,
    bookTitle: value.bookTitle,
    accepted: type === 'borrow_accepted',
    returnUrl: type === 'borrow_accepted' && 'returnUrl' in value && typeof value.returnUrl === 'string'
      ? value.returnUrl
      : undefined,
  });
}

function channel(value: string, hasPhone: boolean, hasEmail: boolean): NotificationChannel {
  if (value === 'both' && hasPhone && hasEmail) return 'both';
  if ((value === 'sms' || value === 'both') && hasPhone) return 'sms';
  return 'email';
}

async function completeDelivery(db: D1Database, row: OutboxRow, now: number) {
  const complete = db.prepare('UPDATE outbox_events SET processed_at = ? WHERE id = ? AND processed_at IS NULL')
    .bind(now, row.id);
  if (row.eventType !== 'return_check_due') {
    await complete.run();
    return;
  }
  const loan = await db.prepare("SELECT status, next_check_at AS scheduledFor FROM loans WHERE id = ? LIMIT 1")
    .bind(row.aggregateId)
    .first<{ status: string; scheduledFor: number }>();
  if (loan?.status !== 'active') {
    await complete.run();
    return;
  }
  // available_at is a retry/lease timestamp; the loan retains the original cadence.
  const scheduledFor = loan.scheduledFor;
  const next = nextReturnCheckAt(new Date(scheduledFor), new Date(now)).getTime();
  // D1 batches are transactional: a scheduling failure must leave this event retryable.
  // Guard inserts too, in case the book was returned after the read above.
  await db.batch([
    db.prepare("UPDATE loans SET last_check_at = ?, next_check_at = ? WHERE id = ? AND status = 'active'")
      .bind(now, next, row.aggregateId),
    db.prepare('UPDATE return_checkins SET sent_at = ?, next_scheduled_for = ? WHERE loan_id = ? AND scheduled_for = ?')
      .bind(now, next, row.aggregateId, scheduledFor),
    db.prepare(`INSERT OR IGNORE INTO return_checkins (id, loan_id, scheduled_for)
      SELECT ?, id, ? FROM loans WHERE id = ? AND status = 'active'`)
      .bind(`checkin-${crypto.randomUUID()}`, next, row.aggregateId),
    db.prepare(`
      INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_id, recipient_id, locale,
        payload_json, available_at, attempt_count
      ) SELECT ?, 'return_check_due', 'loan', id, ?, ?, ?, ?, 0
        FROM loans WHERE id = ? AND status = 'active'
    `).bind(`event-${crypto.randomUUID()}`, row.recipientId, row.locale, row.payloadJson, next, row.aggregateId),
    complete,
  ]);
}

async function eventIsActionable(db: D1Database, row: OutboxRow, now: number) {
  if (row.eventType === 'borrow_requested' || row.eventType === 'borrow_request_reminder') {
    const request = await db.prepare("SELECT 1 AS active FROM loan_requests WHERE id = ? AND status = 'pending' AND expires_at > ? LIMIT 1")
      .bind(row.aggregateId, now)
      .first<{ active: number }>();
    return Boolean(request?.active);
  }
  if (row.eventType === 'return_check_due') {
    const loan = await db.prepare("SELECT 1 AS active FROM loans WHERE id = ? AND status = 'active' LIMIT 1")
      .bind(row.aggregateId)
      .first<{ active: number }>();
    return Boolean(loan?.active);
  }
  if (row.eventType === 'hold_available' || row.eventType === 'hold_offer_reminder') {
    const hold = await db.prepare("SELECT 1 AS active FROM holds WHERE id = ? AND status = 'offered' AND expires_at > ? LIMIT 1")
      .bind(row.aggregateId, now)
      .first<{ active: number }>();
    return Boolean(hold?.active);
  }
  return true;
}

async function recipient(
  db: D1Database,
  row: OutboxRow,
  person: RecipientRow,
  config: OutboxWorkerConfig,
  fetcher: typeof fetch,
  now: number,
) {
  const kakao = await db.prepare(`
    SELECT id, address_encrypted AS addressEncrypted
    FROM notification_endpoints
    WHERE user_id = ? AND kind = 'kakao' AND enabled = 1 AND verified_at IS NOT NULL
    LIMIT 1
  `).bind(row.recipientId).first<KakaoRow>();
  if (person.notificationChannel === 'kakao') {
    if (!kakao || !config.contactEncryptionKey) throw new Error('recipient-has-no-kakao-credential');
    let credential = parseKakaoCredential(await decryptContact(kakao.addressEncrypted, config.contactEncryptionKey));
    if (credential.accessExpiresAt <= now + 5 * 60_000) {
      credential = await refreshKakaoCredential(config, credential, fetcher, now);
      const encrypted = await encryptContact(JSON.stringify(credential), config.contactEncryptionKey);
      await db.prepare('UPDATE notification_endpoints SET address_encrypted = ? WHERE id = ? AND enabled = 1')
        .bind(encrypted, kakao.id)
        .run();
    }
    return { channel: 'kakao' as const, kakaoAccessToken: credential.accessToken };
  }

  const sms = await db.prepare(`
    SELECT address_encrypted AS addressEncrypted
    FROM notification_endpoints
    WHERE user_id = ? AND kind = 'sms' AND enabled = 1 AND verified_at IS NOT NULL
    LIMIT 1
  `).bind(row.recipientId).first<SmsRow>();
  const phone = sms && config.contactEncryptionKey
    ? await decryptContact(sms.addressEncrypted, config.contactEncryptionKey)
    : undefined;
  const email = person.email ?? undefined;
  if (!email && !phone) throw new Error('recipient-has-no-verified-contact');
  return { channel: channel(person.notificationChannel, Boolean(phone), Boolean(email)), email, phone };
}

export async function processReadyOutbox(
  db: D1Database,
  config: OutboxWorkerConfig,
  options: { now?: number; limit?: number; fetcher?: typeof fetch; requestId?: string; pushSender?: WebPushSender } = {},
): Promise<OutboxWorkerResult> {
  const now = options.now ?? Date.now();
  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const rows = await db.prepare(`
    SELECT
      id, event_type AS eventType, aggregate_id AS aggregateId,
      recipient_id AS recipientId, locale, payload_json AS payloadJson,
      available_at AS availableAt, attempt_count AS attemptCount
    FROM outbox_events
    WHERE processed_at IS NULL AND available_at <= ?
    ORDER BY available_at ASC
    LIMIT ?
  `).bind(now, limit).all<OutboxRow>();
  const result: OutboxWorkerResult = { claimed: 0, sent: 0, failed: 0, skipped: 0 };

  for (const row of rows.results) {
    const claimAt = options.now ?? Date.now();
    const leaseUntil = claimAt + 5 * 60_000;
    const claim = await db.prepare(`
      UPDATE outbox_events
      SET attempt_count = attempt_count + 1, available_at = ?
      WHERE id = ? AND processed_at IS NULL AND available_at <= ?
    `).bind(leaseUntil, row.id, claimAt).run();
    if (affected(claim) !== 1) continue;
    result.claimed += 1;
    try {
      if (!await eventIsActionable(db, row, claimAt)) {
        await db.prepare('UPDATE outbox_events SET processed_at = ? WHERE id = ? AND processed_at IS NULL')
          .bind(now, row.id)
          .run();
        result.skipped += 1;
        continue;
      }
      const message = renderOutboxMessage(row);
      const person = await db.prepare(`
        SELECT p.notification_channel AS notificationChannel,
          (SELECT ai.email FROM auth_identities ai WHERE ai.profile_id = p.id AND ai.email IS NOT NULL
           ORDER BY ai.last_signed_in_at DESC LIMIT 1) AS email
        FROM profiles p WHERE p.id = ? LIMIT 1
      `).bind(row.recipientId).first<RecipientRow>();
      if (!person) throw new Error('recipient-not-found');
      const previous = await db.prepare(`
        SELECT channel FROM notification_deliveries WHERE event_id = ? AND status = 'sent'
      `).bind(row.id).all<{ channel: DeliveryResult['channel'] }>();
      const sentChannels = new Set(previous.results.map((delivery) => delivery.channel));
      const fetcher = options.fetcher ?? fetch;
      // Persist each success immediately so a failure on another channel does not resend it.
      async function recordDelivery(delivery: DeliveryResult) {
        const sentAt = Date.now();
        await db.prepare(`
          INSERT OR REPLACE INTO notification_deliveries (
            id, event_id, recipient_id, channel, provider_message_id,
            status, attempt_count, sent_at, created_at
          ) VALUES (?, ?, ?, ?, ?, 'sent', ?, ?, ?)
        `).bind(
          `delivery-${crypto.randomUUID()}`,
          row.id,
          row.recipientId,
          delivery.channel,
          delivery.providerMessageId,
          row.attemptCount + 1,
          sentAt,
          sentAt,
        ).run();
        sentChannels.add(delivery.channel);
      }
      const outcomes = await Promise.allSettled([
        (async () => {
          if (person.email && !sentChannels.has('email')) {
            await recordDelivery(await sendResendEmail(config, person.email, message, fetcher, `hana-${row.id}`));
          }
        })(),
        (async () => {
          if (sentChannels.has('push')) return;
          if (isWebPushConfigured(config)) {
            const push = await sendWebPushToUser(db, row.recipientId, message, `hana-${row.id}`, config, {
              now, sender: options.pushSender,
            });
            if (push.delivered > 0) {
              await recordDelivery({ channel: 'push', providerMessageId: `web-push:${push.delivered}` });
              return;
            }
          }
          // Email is always handled independently; retain the other legacy fallbacks.
          const target = await recipient(db, row, person, config, fetcher, now);
          if (target.channel === 'email') return;
          const fallbackChannel = target.channel === 'both' ? 'sms' : target.channel;
          if (sentChannels.has(fallbackChannel)) return;
          const deliveries = await sendNotification(config, { ...target, channel: fallbackChannel }, message, fetcher, `hana-${row.id}`);
          for (const delivery of deliveries) await recordDelivery(delivery);
        })(),
      ]);
      const failure = outcomes.find((outcome) => outcome.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      if (sentChannels.size === 0) throw new Error('recipient-has-no-verified-contact');
      const sentAt = Date.now();
      await completeDelivery(db, row, sentAt);
      result.sent += 1;
    } catch (error) {
      const retryAt = (options.now ?? Date.now()) + Math.min(6 * 3_600_000, 60_000 * 2 ** Math.min(row.attemptCount, 8));
      await db.prepare('UPDATE outbox_events SET available_at = ? WHERE id = ? AND processed_at IS NULL')
        .bind(retryAt, row.id)
        .run();
      operationalLog('error', 'notification-delivery-failed', {
        requestId: options.requestId,
        operation: 'notification-delivery',
        eventType: row.eventType,
        attemptCount: row.attemptCount + 1,
        errorCode: safeErrorCode(error, 'delivery-failed'),
      });
      result.failed += 1;
    }
  }
  return result;
}
