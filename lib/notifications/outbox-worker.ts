import type { AppLocale, NotificationChannel } from '../domain/types.ts';
import type { OutboxPayloadByType, LibraryOutboxEventType } from '../persistence/outbox.ts';
import { operationalLog, safeErrorCode } from '../observability/log.ts';
import { decryptContact, encryptContact } from './contact-crypto.ts';
import { parseKakaoCredential, refreshKakaoCredential } from './kakao.ts';
import { sendNotification, type NotificationSenderConfig } from './sender.ts';
import { borrowRequestTemplate, decisionTemplate, returnCheckTemplate, type NotificationTemplate } from './templates.ts';

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

export interface OutboxWorkerConfig extends NotificationSenderConfig {
  contactEncryptionKey?: string;
}

export interface OutboxWorkerResult {
  claimed: number;
  sent: number;
  failed: number;
}

function affected(result: D1Result<unknown>) {
  return Number(result.meta.changes ?? 0);
}

function locale(value: string): AppLocale {
  return value === 'en' ? 'en' : 'ko';
}

function eventType(value: string): LibraryOutboxEventType | undefined {
  return ['borrow_requested', 'borrow_accepted', 'borrow_declined', 'return_check_due'].includes(value)
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
  if (type === 'borrow_requested') {
    const value = payload(fullRow, type);
    if (typeof value.actorName !== 'string' || typeof value.expiresAt !== 'string') throw new Error('invalid-outbox-payload');
    if (typeof value.decisionUrl !== 'string') throw new Error('invalid-outbox-payload');
    return borrowRequestTemplate({
      locale: language,
      ownerName: value.recipientName,
      borrowerName: value.actorName,
      bookTitle: value.bookTitle,
      expiresAt: new Date(value.expiresAt),
      decisionUrl: value.decisionUrl,
    });
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

async function scheduleNextReturnCheck(db: D1Database, row: OutboxRow, now: number) {
  if (row.eventType !== 'return_check_due') return;
  const loan = await db.prepare("SELECT status FROM loans WHERE id = ? LIMIT 1")
    .bind(row.aggregateId)
    .first<{ status: string }>();
  if (loan?.status !== 'active') return;
  const next = now + 7 * 86_400_000;
  await db.batch([
    db.prepare("UPDATE loans SET last_check_at = ?, next_check_at = ? WHERE id = ? AND status = 'active'")
      .bind(now, next, row.aggregateId),
    db.prepare('UPDATE return_checkins SET sent_at = ?, next_scheduled_for = ? WHERE loan_id = ? AND scheduled_for = ?')
      .bind(now, next, row.aggregateId, row.availableAt),
    db.prepare('INSERT OR IGNORE INTO return_checkins (id, loan_id, scheduled_for) VALUES (?, ?, ?)')
      .bind(`checkin-${crypto.randomUUID()}`, row.aggregateId, next),
    db.prepare(`
      INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_id, recipient_id, locale,
        payload_json, available_at, attempt_count
      ) VALUES (?, 'return_check_due', 'loan', ?, ?, ?, ?, ?, 0)
    `).bind(
      `event-${crypto.randomUUID()}`,
      row.aggregateId,
      row.recipientId,
      row.locale,
      row.payloadJson,
      next,
    ),
  ]);
}

async function recipient(
  db: D1Database,
  row: OutboxRow,
  config: OutboxWorkerConfig,
  fetcher: typeof fetch,
  now: number,
) {
  const person = await db.prepare(`
    SELECT
      p.notification_channel AS notificationChannel,
      (SELECT ai.email FROM auth_identities ai WHERE ai.profile_id = p.id ORDER BY ai.last_signed_in_at DESC LIMIT 1) AS email
    FROM profiles p
    WHERE p.id = ?
    LIMIT 1
  `).bind(row.recipientId).first<RecipientRow>();
  if (!person) throw new Error('recipient-not-found');

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
  options: { now?: number; limit?: number; fetcher?: typeof fetch; requestId?: string } = {},
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
  const result: OutboxWorkerResult = { claimed: 0, sent: 0, failed: 0 };

  for (const row of rows.results) {
    const leaseUntil = now + 5 * 60_000;
    const claim = await db.prepare(`
      UPDATE outbox_events
      SET attempt_count = attempt_count + 1, available_at = ?
      WHERE id = ? AND processed_at IS NULL AND available_at <= ?
    `).bind(leaseUntil, row.id, now).run();
    if (affected(claim) !== 1) continue;
    result.claimed += 1;
    try {
      const target = await recipient(db, row, config, options.fetcher ?? fetch, now);
      const deliveries = await sendNotification(
        config,
        target,
        renderOutboxMessage(row),
        options.fetcher ?? fetch,
        `hana-${row.id}`,
      );
      const sentAt = Date.now();
      await db.batch([
        ...deliveries.map((delivery) => db.prepare(`
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
        )),
        db.prepare('UPDATE outbox_events SET processed_at = ?, available_at = ? WHERE id = ? AND processed_at IS NULL')
          .bind(sentAt, row.availableAt, row.id),
      ]);
      await scheduleNextReturnCheck(db, row, sentAt);
      result.sent += 1;
    } catch (error) {
      const retryAt = now + Math.min(6 * 3_600_000, 60_000 * 2 ** Math.min(row.attemptCount, 8));
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

export async function expireStaleBorrowRequests(db: D1Database, now = Date.now()) {
  const result = await db.prepare("UPDATE loan_requests SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?")
    .bind(now)
    .run();
  return affected(result);
}
