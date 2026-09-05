import { getD1Database } from '@/db';
import { parseInboundSmsDecision } from '@/lib/notifications/domain';
import { hashContact } from '@/lib/notifications/contact-crypto';
import { verifyTwilioSignature } from '@/lib/notifications/twilio-signature';
import { D1LibraryRepository } from '@/lib/persistence/d1-repository';

interface ActionableRow {
  requestId: string;
  communityId: string;
  ownerId: string;
}

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function twiml(message?: string) {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(message)}</Message></Response>`
    : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  return new Response(body, {
    headers: {
      'content-type': 'text/xml; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function requiredEnvironment() {
  const values = {
    publicAppUrl: process.env.PUBLIC_APP_URL,
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
    contactHashKey: process.env.CONTACT_HASH_KEY,
    contactEncryptionKey: process.env.CONTACT_ENCRYPTION_KEY,
  };
  if (!values.publicAppUrl || !values.accountSid || !values.authToken || !values.fromNumber || !values.contactHashKey) {
    throw new Error('twilio-webhook-not-configured');
  }
  return values as typeof values & {
    publicAppUrl: string;
    accountSid: string;
    authToken: string;
    fromNumber: string;
    contactHashKey: string;
  };
}

async function recordInbound(
  db: D1Database,
  input: { messageSid: string; senderHash: string; command?: string; requestId?: string; outcome: string },
) {
  await db.prepare(`
    INSERT OR IGNORE INTO inbound_messages (
      id, provider, provider_message_id, sender_hash, command,
      matched_request_id, outcome, received_at
    ) VALUES (?, 'twilio', ?, ?, ?, ?, ?, ?)
  `).bind(
    `inbound-${crypto.randomUUID()}`,
    input.messageSid,
    input.senderHash,
    input.command ?? null,
    input.requestId ?? null,
    input.outcome,
    Date.now(),
  ).run();
}

export async function POST(request: Request) {
  try {
    const config = requiredEnvironment();
    const values = Object.fromEntries(await request.formData()) as Record<string, string>;
    const signature = request.headers.get('x-twilio-signature') ?? '';
    const publicUrl = `${config.publicAppUrl.replace(/\/$/, '')}/api/webhooks/twilio/inbound`;
    if (!await verifyTwilioSignature({ authToken: config.authToken, publicUrl, formValues: values, signature })) {
      return new Response('Invalid signature', { status: 403 });
    }

    const messageSid = values.MessageSid;
    const sender = values.From;
    if (!messageSid || !sender || values.AccountSid !== config.accountSid || values.To !== config.fromNumber) {
      return new Response('Invalid request', { status: 400 });
    }
    const db = getD1Database();
    const duplicate = await db.prepare("SELECT 1 AS seen FROM inbound_messages WHERE provider = 'twilio' AND provider_message_id = ? LIMIT 1")
      .bind(messageSid)
      .first();
    if (duplicate) return twiml();

    const senderHash = await hashContact(sender, config.contactHashKey);
    const parsed = parseInboundSmsDecision(values.Body ?? '');
    if (parsed.kind === 'invalid') {
      await recordInbound(db, { messageSid, senderHash, command: undefined, outcome: 'invalid-reply' });
      return twiml('Reply 1 to accept or 2 to decline.');
    }

    const actionable = await db.prepare(`
      SELECT
        lr.id AS requestId,
        lr.community_id AS communityId,
        ci.owner_id AS ownerId
      FROM notification_endpoints endpoint
      INNER JOIN catalog_items ci ON ci.owner_id = endpoint.user_id
      INNER JOIN loan_requests lr ON lr.catalog_item_id = ci.id
      WHERE endpoint.kind = 'sms' AND endpoint.address_hash = ?
        AND endpoint.enabled = 1 AND endpoint.verified_at IS NOT NULL
        AND lr.status = 'pending' AND lr.expires_at > ?
        AND ci.status = 'available' AND ci.archived_at IS NULL
      ORDER BY lr.requested_at ASC
      LIMIT 2
    `).bind(senderHash, Date.now()).all<ActionableRow>();

    if (actionable.results.length !== 1) {
      const outcome = actionable.results.length === 0 ? 'no-actionable-request' : 'ambiguous';
      await recordInbound(db, { messageSid, senderHash, command: parsed.decision, outcome });
      return twiml(actionable.results.length === 0
        ? 'There is no active request for this number.'
        : 'You have multiple active requests. Please respond in Hana Seed Book.');
    }

    const match = actionable.results[0];
    const repository = new D1LibraryRepository(db, {
      baseUrl: config.publicAppUrl,
      contactEncryptionKey: config.contactEncryptionKey,
      contactHashKey: config.contactHashKey,
    });
    await repository.respondToBorrowRequest({
      actorId: match.ownerId,
      communityId: match.communityId,
      idempotencyKey: `twilio-${messageSid}`,
    }, match.requestId, parsed.decision);
    await recordInbound(db, {
      messageSid,
      senderHash,
      command: parsed.decision,
      requestId: match.requestId,
      outcome: 'applied',
    });
    return twiml(parsed.decision === 'accepted' ? 'Request accepted.' : 'Request declined.');
  } catch (error) {
    console.error('twilio_inbound_failed', error instanceof Error ? error.name : 'unknown');
    return new Response('Webhook unavailable', { status: 503 });
  }
}
