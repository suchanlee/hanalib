import type { OutboxPayloadByType } from './outbox.ts';
import { offerNextHold } from './hold-queue.ts';

interface ExpiredRequestRow {
  id: string;
  catalogItemId: string;
  ownerId: string;
  ownerLocale: string;
  ownerDisplayName: string;
  ownerDisplayNameKo: string;
  requesterDisplayName: string;
  requesterDisplayNameKo: string;
  bookTitle: string;
  convertedCatalogItemId: string | null;
}

function affected(result: D1Result<unknown>) {
  return Number(result.meta.changes ?? 0);
}

function language(value: string) {
  return value === 'en' ? 'en' : 'ko';
}

function localizedName(locale: string, english: string, korean: string) {
  return locale === 'ko' ? korean : english;
}

export async function expireBorrowRequest(
  db: D1Database,
  requestId: string,
  now: number,
  baseUrl: string,
) {
  const request = await db.prepare(`
    SELECT
      lr.id,
      lr.catalog_item_id AS catalogItemId,
      ci.owner_id AS ownerId,
      owner.locale AS ownerLocale,
      owner.display_name AS ownerDisplayName,
      owner.display_name_ko AS ownerDisplayNameKo,
      requester.display_name AS requesterDisplayName,
      requester.display_name_ko AS requesterDisplayNameKo,
      COALESCE(json_extract(ci.metadata_overrides_json, '$.title'), be.title) AS bookTitle,
      (
        SELECT h.catalog_item_id FROM holds h
        WHERE h.borrow_request_id = lr.id AND h.status = 'converted'
        LIMIT 1
      ) AS convertedCatalogItemId
    FROM loan_requests lr
    INNER JOIN catalog_items ci ON ci.id = lr.catalog_item_id
    INNER JOIN book_editions be ON be.id = ci.edition_id
    INNER JOIN profiles owner ON owner.id = ci.owner_id
    INNER JOIN profiles requester ON requester.id = lr.requester_id
    WHERE lr.id = ? AND lr.status = 'pending' AND lr.expires_at <= ?
    LIMIT 1
  `).bind(requestId, now).first<ExpiredRequestRow>();
  if (!request) return false;

  const payload: OutboxPayloadByType['borrow_expired'] = {
    bookTitle: request.bookTitle,
    recipientName: localizedName(request.ownerLocale, request.ownerDisplayName, request.ownerDisplayNameKo),
    actorName: localizedName(request.ownerLocale, request.requesterDisplayName, request.requesterDisplayNameKo),
    bookUrl: `${baseUrl.replace(/\/$/, '')}/?book=${encodeURIComponent(request.catalogItemId)}`,
  };
  const results = await db.batch([
    db.prepare(`
      UPDATE loan_requests
      SET status = 'expired', responded_at = ?, responded_by = NULL
      WHERE id = ? AND status = 'pending' AND expires_at <= ?
    `).bind(now, request.id, now),
    db.prepare(`
      INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_id, recipient_id, locale,
        payload_json, available_at, attempt_count
      )
      SELECT ?, 'borrow_expired', 'loan_request', lr.id, ?, ?, ?, ?, 0
      FROM loan_requests lr
      WHERE lr.id = ? AND lr.status = 'expired' AND lr.responded_at = ?
    `).bind(
      `event-${crypto.randomUUID()}`,
      request.ownerId,
      language(request.ownerLocale),
      JSON.stringify(payload),
      now,
      request.id,
      now,
    ),
  ]);
  if (affected(results[0]) !== 1 || affected(results[1]) !== 1) return false;
  if (request.convertedCatalogItemId) {
    await offerNextHold(db, request.convertedCatalogItemId, now, baseUrl);
  }
  return true;
}

export async function expireStaleBorrowRequests(
  db: D1Database,
  now = Date.now(),
  baseUrl = 'https://hanalib.app',
) {
  const due = await db.prepare(`
    SELECT id FROM loan_requests
    WHERE status = 'pending' AND expires_at <= ?
    ORDER BY expires_at ASC
  `).bind(now).all<{ id: string }>();
  let expired = 0;
  for (const request of due.results) {
    if (await expireBorrowRequest(db, request.id, now, baseUrl)) expired += 1;
  }
  return expired;
}
