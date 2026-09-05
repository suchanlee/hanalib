import { getD1Database } from '@/db';
import { decryptContact, hashContact } from '@/lib/notifications/contact-crypto';
import { sendTwilioSms } from '@/lib/notifications/sender';
import { libraryError } from '@/lib/persistence/errors';
import { jsonObject, withLibraryApi } from '@/lib/persistence/server';

interface EndpointRow {
  addressEncrypted: string;
  addressHash: string;
}

interface VerificationRow extends EndpointRow {
  codeHash: string;
  expiresAt: number;
  attemptCount: number;
}

function required(key: string) {
  const value = process.env[key];
  if (!value) throw libraryError('server-misconfigured', `${key} is not configured.`);
  return value;
}

function verificationCode() {
  const maximum = 0x1_0000_0000 - (0x1_0000_0000 % 1_000_000);
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= maximum);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

function verificationHash(memberId: string, addressHash: string, code: string, hashKey: string) {
  return hashContact(`${memberId}:${addressHash}:${code}`, hashKey);
}

export async function POST(request: Request) {
  return withLibraryApi(request, async (_repository, context) => {
    const db = getD1Database();
    const now = Date.now();
    const recent = await db.prepare('SELECT created_at AS createdAt FROM phone_verifications WHERE user_id = ? LIMIT 1')
      .bind(context.actorId)
      .first<{ createdAt: number }>();
    if (recent && recent.createdAt > now - 60_000) {
      throw libraryError('conflict', 'Wait one minute before requesting another code.');
    }
    const endpoint = await db.prepare(`
      SELECT address_encrypted AS addressEncrypted, address_hash AS addressHash
      FROM notification_endpoints
      WHERE user_id = ? AND kind = 'sms' AND enabled = 1
      LIMIT 1
    `).bind(context.actorId).first<EndpointRow>();
    if (!endpoint) throw libraryError('not-found', 'Save a mobile number before requesting verification.');

    const encryptionKey = required('CONTACT_ENCRYPTION_KEY');
    const hashKey = required('CONTACT_HASH_KEY');
    const code = verificationCode();
    const expiresAt = now + 10 * 60_000;
    const phone = await decryptContact(endpoint.addressEncrypted, encryptionKey);
    await db.prepare(`
      INSERT INTO phone_verifications (user_id, code_hash, expires_at, attempt_count, created_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        attempt_count = 0,
        created_at = excluded.created_at
    `).bind(
      context.actorId,
      await verificationHash(context.actorId, endpoint.addressHash, code, hashKey),
      expiresAt,
      now,
    ).run();
    try {
      await sendTwilioSms({
        twilioAccountSid: required('TWILIO_ACCOUNT_SID'),
        twilioAuthToken: required('TWILIO_AUTH_TOKEN'),
        twilioFromNumber: required('TWILIO_FROM_NUMBER'),
      }, phone, {
        subject: 'Hana Seed Books verification',
        text: `Hana Seed Books verification code: ${code}. It expires in 10 minutes.`,
      });
    } catch (error) {
      await db.prepare('DELETE FROM phone_verifications WHERE user_id = ?').bind(context.actorId).run();
      throw error;
    }
    return { sent: true, expiresAt: new Date(expiresAt).toISOString() };
  }, { mutation: true });
}

export async function PATCH(request: Request) {
  return withLibraryApi(request, async (_repository, context) => {
    const body = await jsonObject(request);
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!/^\d{6}$/.test(code)) throw libraryError('invalid-input', 'Enter the six-digit code.');
    const db = getD1Database();
    const verification = await db.prepare(`
      SELECT
        pv.code_hash AS codeHash,
        pv.expires_at AS expiresAt,
        pv.attempt_count AS attemptCount,
        ne.address_hash AS addressHash,
        ne.address_encrypted AS addressEncrypted
      FROM phone_verifications pv
      INNER JOIN notification_endpoints ne ON ne.user_id = pv.user_id AND ne.kind = 'sms'
      WHERE pv.user_id = ? AND ne.enabled = 1
      LIMIT 1
    `).bind(context.actorId).first<VerificationRow>();
    if (!verification || verification.expiresAt <= Date.now() || verification.attemptCount >= 5) {
      throw libraryError('conflict', 'Request a new verification code.');
    }
    const candidate = await verificationHash(
      context.actorId,
      verification.addressHash,
      code,
      required('CONTACT_HASH_KEY'),
    );
    if (candidate !== verification.codeHash) {
      await db.prepare('UPDATE phone_verifications SET attempt_count = attempt_count + 1 WHERE user_id = ?')
        .bind(context.actorId)
        .run();
      throw libraryError('invalid-input', 'The verification code is incorrect.');
    }
    const now = Date.now();
    await db.batch([
      db.prepare("UPDATE notification_endpoints SET verified_at = ? WHERE user_id = ? AND kind = 'sms' AND enabled = 1")
        .bind(now, context.actorId),
      db.prepare('DELETE FROM phone_verifications WHERE user_id = ?').bind(context.actorId),
    ]);
    return { verified: true };
  }, { mutation: true });
}
