import { holdOfferExpiresAt } from '../domain/rules.ts';
import type { AppLocale } from '../domain/types.ts';
import type { OutboxPayloadByType } from './outbox.ts';

interface HoldOfferRow {
  id: string;
  catalogItemId: string;
  memberId: string;
  locale: string;
  displayName: string;
  displayNameKo: string;
  bookTitle: string;
  coverUrl: string | null;
}

function affected(result: D1Result<unknown>) {
  return Number(result.meta.changes ?? 0);
}

function appLocale(value: string): AppLocale {
  return value === 'en' ? 'en' : 'ko';
}

function recipientName(row: HoldOfferRow) {
  return row.locale === 'ko' ? row.displayNameKo : row.displayName;
}

function eventPayload(row: HoldOfferRow, expiresAt: number, baseUrl: string) {
  return {
    bookTitle: row.bookTitle,
    recipientName: recipientName(row),
    expiresAt: new Date(expiresAt).toISOString(),
    offerUrl: `${baseUrl.replace(/\/$/, '')}/borrowing?hold=${encodeURIComponent(row.id)}`,
    ...(row.coverUrl ? { coverUrl: row.coverUrl } : {}),
  } satisfies OutboxPayloadByType['hold_available'];
}

async function nextQueuedHold(db: D1Database, catalogItemId: string) {
  return db.prepare(`
    SELECT
      h.id,
      h.catalog_item_id AS catalogItemId,
      h.member_id AS memberId,
      p.locale,
      p.display_name AS displayName,
      p.display_name_ko AS displayNameKo,
      be.title AS bookTitle,
      be.cover_source_url AS coverUrl
    FROM holds h
    INNER JOIN profiles p ON p.id = h.member_id
    INNER JOIN catalog_items ci ON ci.id = h.catalog_item_id
    INNER JOIN book_editions be ON be.id = ci.edition_id
    WHERE h.catalog_item_id = ? AND h.status = 'queued'
    ORDER BY h.created_at ASC, h.id ASC
    LIMIT 1
  `).bind(catalogItemId).first<HoldOfferRow>();
}

export async function offerNextHold(
  db: D1Database,
  catalogItemId: string,
  now: number,
  baseUrl: string,
) {
  const next = await nextQueuedHold(db, catalogItemId);
  if (!next) {
    await db.prepare(`
      UPDATE catalog_items
      SET status = 'available', version = version + 1, updated_at = ?
      WHERE id = ? AND status <> 'archived'
        AND NOT EXISTS (SELECT 1 FROM loans WHERE catalog_item_id = ? AND status = 'active')
        AND NOT EXISTS (SELECT 1 FROM holds WHERE catalog_item_id = ? AND status = 'offered')
    `).bind(now, catalogItemId, catalogItemId, catalogItemId).run();
    return null;
  }

  const expiresAt = holdOfferExpiresAt(new Date(now)).getTime();
  const payload = eventPayload(next, expiresAt, baseUrl);
  const results = await db.batch([
    db.prepare(`
      UPDATE holds
      SET status = 'offered', offered_at = ?, expires_at = ?, reminded_at = NULL
      WHERE id = ? AND status = 'queued'
        AND NOT EXISTS (
          SELECT 1 FROM holds active
          WHERE active.catalog_item_id = ? AND active.status = 'offered'
        )
    `).bind(now, expiresAt, next.id, catalogItemId),
    db.prepare(`
      UPDATE catalog_items
      SET status = 'held', version = version + 1, updated_at = ?
      WHERE id = ? AND status <> 'archived'
        AND NOT EXISTS (SELECT 1 FROM loans WHERE catalog_item_id = ? AND status = 'active')
        AND EXISTS (SELECT 1 FROM holds WHERE id = ? AND status = 'offered' AND offered_at = ?)
    `).bind(now, catalogItemId, catalogItemId, next.id, now),
    db.prepare(`
      INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_id, recipient_id, locale,
        payload_json, available_at, attempt_count
      )
      SELECT ?, 'hold_available', 'hold', h.id, h.member_id, ?, ?, ?, 0
      FROM holds h
      WHERE h.id = ? AND h.status = 'offered' AND h.offered_at = ?
    `).bind(
      `event-${crypto.randomUUID()}`,
      appLocale(next.locale),
      JSON.stringify(payload),
      now,
      next.id,
      now,
    ),
  ]);
  return affected(results[0]) === 1 && affected(results[1]) === 1 && affected(results[2]) === 1
    ? next.id
    : null;
}

export async function expireHoldOffers(
  db: D1Database,
  now: number,
  baseUrl: string,
) {
  const expired = await db.prepare(`
    SELECT id, catalog_item_id AS catalogItemId
    FROM holds
    WHERE status = 'offered' AND expires_at <= ?
    ORDER BY expires_at ASC
  `).bind(now).all<{ id: string; catalogItemId: string }>();
  let count = 0;
  for (const hold of expired.results) {
    const result = await db.prepare(`
      UPDATE holds SET status = 'expired'
      WHERE id = ? AND status = 'offered' AND expires_at <= ?
    `).bind(hold.id, now).run();
    if (affected(result) !== 1) continue;
    count += 1;
    await offerNextHold(db, hold.catalogItemId, now, baseUrl);
  }
  return count;
}

export async function remindHoldOffers(
  db: D1Database,
  now: number,
  baseUrl: string,
) {
  const reminderCutoff = now - 24 * 60 * 60 * 1_000;
  const offers = await db.prepare(`
    SELECT
      h.id,
      h.catalog_item_id AS catalogItemId,
      h.member_id AS memberId,
      p.locale,
      p.display_name AS displayName,
      p.display_name_ko AS displayNameKo,
      be.title AS bookTitle,
      be.cover_source_url AS coverUrl,
      h.expires_at AS expiresAt
    FROM holds h
    INNER JOIN profiles p ON p.id = h.member_id
    INNER JOIN catalog_items ci ON ci.id = h.catalog_item_id
    INNER JOIN book_editions be ON be.id = ci.edition_id
    WHERE h.status = 'offered' AND h.reminded_at IS NULL
      AND h.offered_at <= ? AND h.expires_at > ?
    ORDER BY h.offered_at ASC
  `).bind(reminderCutoff, now).all<HoldOfferRow & { expiresAt: number }>();
  let count = 0;
  for (const offer of offers.results) {
    const payload = eventPayload(offer, offer.expiresAt, baseUrl) satisfies OutboxPayloadByType['hold_offer_reminder'];
    const results = await db.batch([
      db.prepare(`
        UPDATE holds SET reminded_at = ?
        WHERE id = ? AND status = 'offered' AND reminded_at IS NULL AND expires_at > ?
      `).bind(now, offer.id, now),
      db.prepare(`
        INSERT INTO outbox_events (
          id, event_type, aggregate_type, aggregate_id, recipient_id, locale,
          payload_json, available_at, attempt_count
        )
        SELECT ?, 'hold_offer_reminder', 'hold', h.id, h.member_id, ?, ?, ?, 0
        FROM holds h
        WHERE h.id = ? AND h.status = 'offered' AND h.reminded_at = ?
      `).bind(
        `event-${crypto.randomUUID()}`,
        appLocale(offer.locale),
        JSON.stringify(payload),
        now,
        offer.id,
        now,
      ),
    ]);
    if (affected(results[0]) === 1 && affected(results[1]) === 1) count += 1;
  }
  return count;
}
