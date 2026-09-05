import { getD1Database } from '@/db';
import { getAuthenticatedMember } from '@/lib/auth/member';
import { processReadyOutbox } from '@/lib/notifications/outbox-worker';

function authorized(request: Request) {
  const expected = process.env.E2E_TEST_SECRET;
  return Boolean(expected && expected.length >= 32 && request.headers.get('x-e2e-secret') === expected);
}

async function body(request: Request) {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function workerConfig() {
  return {
    contactEncryptionKey: process.env.CONTACT_ENCRYPTION_KEY,
    publicAppUrl: process.env.PUBLIC_APP_URL,
    kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
    kakaoClientSecret: process.env.KAKAO_CLIENT_SECRET,
  };
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'not-found' }, { status: 404 });
  const member = await getAuthenticatedMember(request);
  if (!member) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const input = await body(request);
  const db = getD1Database();

  if (input.action === 'connect-current') {
    if (member.provider !== 'demo') return Response.json({ error: 'demo-required' }, { status: 403 });
    const source = await db.prepare(`
      SELECT ne.address_encrypted AS addressEncrypted, ne.address_hash AS addressHash
      FROM notification_endpoints ne
      INNER JOIN auth_identities ai ON ai.profile_id = ne.user_id
      WHERE ai.provider = 'kakao' AND ne.kind = 'kakao' AND ne.enabled = 1 AND ne.verified_at IS NOT NULL
      ORDER BY ai.last_signed_in_at DESC
      LIMIT 1
    `).first<{ addressEncrypted: string; addressHash: string }>();
    if (!source) return Response.json({ error: 'source-not-connected' }, { status: 409 });
    const now = Date.now();
    await db.batch([
      db.prepare(`
        INSERT INTO notification_endpoints (
          id, user_id, kind, address_encrypted, address_hash, verified_at, enabled
        ) VALUES (?, ?, 'kakao', ?, ?, ?, 1)
        ON CONFLICT(user_id, kind) DO UPDATE SET
          address_encrypted = excluded.address_encrypted,
          address_hash = excluded.address_hash,
          verified_at = excluded.verified_at,
          enabled = 1
      `).bind(`endpoint-${crypto.randomUUID()}`, member.id, source.addressEncrypted, source.addressHash, now),
      db.prepare("UPDATE profiles SET notification_channel = 'kakao', updated_at = ? WHERE id = ?")
        .bind(now, member.id),
    ]);
    return Response.json({ data: { connected: true } }, { headers: { 'cache-control': 'no-store' } });
  }

  if (input.action === 'force-return-check') {
    const loanId = typeof input.loanId === 'string' ? input.loanId : '';
    const loan = await db.prepare(`
      SELECT id FROM loans
      WHERE id = ? AND status = 'active' AND (owner_id = ? OR borrower_id = ?)
      LIMIT 1
    `).bind(loanId, member.id, member.id).first<{ id: string }>();
    if (!loan) return Response.json({ error: 'loan-not-found' }, { status: 404 });
    const now = Date.now();
    await db.prepare(`
      UPDATE outbox_events
      SET available_at = ?, processed_at = NULL
      WHERE aggregate_type = 'loan' AND aggregate_id = ? AND event_type = 'return_check_due'
    `).bind(now, loan.id).run();
    const delivery = await processReadyOutbox(db, workerConfig(), { now, limit: 20 });
    return Response.json({ data: { delivery } }, { headers: { 'cache-control': 'no-store' } });
  }

  if (input.action === 'cleanup') {
    if (member.provider !== 'demo') return Response.json({ error: 'demo-required' }, { status: 403 });
    const itemId = typeof input.itemId === 'string' ? input.itemId : '';
    const item = await db.prepare('SELECT id, edition_id AS editionId FROM catalog_items WHERE id = ? AND owner_id = ? LIMIT 1')
      .bind(itemId, member.id)
      .first<{ id: string; editionId: string }>();
    if (!item) return Response.json({ error: 'item-not-found' }, { status: 404 });
    await db.batch([
      db.prepare(`
        DELETE FROM notification_deliveries WHERE event_id IN (
          SELECT id FROM outbox_events WHERE
            aggregate_id IN (SELECT id FROM loan_requests WHERE catalog_item_id = ?)
            OR aggregate_id IN (SELECT id FROM loans WHERE catalog_item_id = ?)
        )
      `).bind(item.id, item.id),
      db.prepare(`
        DELETE FROM outbox_events WHERE
          aggregate_id IN (SELECT id FROM loan_requests WHERE catalog_item_id = ?)
          OR aggregate_id IN (SELECT id FROM loans WHERE catalog_item_id = ?)
      `).bind(item.id, item.id),
      db.prepare('DELETE FROM return_checkins WHERE loan_id IN (SELECT id FROM loans WHERE catalog_item_id = ?)').bind(item.id),
      db.prepare(`
        DELETE FROM audit_events WHERE actor_id = ? OR aggregate_id = ?
          OR aggregate_id IN (SELECT id FROM loan_requests WHERE catalog_item_id = ?)
          OR aggregate_id IN (SELECT id FROM loans WHERE catalog_item_id = ?)
      `).bind(member.id, item.id, item.id, item.id),
      db.prepare('DELETE FROM loans WHERE catalog_item_id = ?').bind(item.id),
      db.prepare('DELETE FROM loan_requests WHERE catalog_item_id = ?').bind(item.id),
      db.prepare('DELETE FROM uploaded_assets WHERE catalog_item_id = ?').bind(item.id),
      db.prepare('DELETE FROM catalog_items WHERE id = ? AND owner_id = ?').bind(item.id, member.id),
      db.prepare('DELETE FROM book_editions WHERE id = ? AND NOT EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = ?)')
        .bind(item.editionId, item.editionId),
      db.prepare("DELETE FROM notification_endpoints WHERE user_id = ? AND kind = 'kakao'").bind(member.id),
    ]);
    return Response.json({ data: { cleaned: true } }, { headers: { 'cache-control': 'no-store' } });
  }

  return Response.json({ error: 'invalid-action' }, { status: 400 });
}
