import { getD1Database } from '@/db';
import { normalizeEmail } from '@/lib/auth/email-verification';
import { encryptContact, hashContact } from '@/lib/notifications/contact-crypto';
import { libraryError } from '@/lib/persistence/errors';
import { jsonObject, withLibraryApi } from '@/lib/persistence/server';

function required(key: string) {
  const value = process.env[key];
  if (!value) throw libraryError('server-misconfigured', `${key} is not configured.`);
  return value;
}

export async function POST(request: Request) {
  return withLibraryApi(request, async (_repository, context) => {
    const body = await jsonObject(request);
    const email = normalizeEmail(body.email);
    if (!email) throw libraryError('invalid-input', 'Enter a valid email address.');

    const emailHash = await hashContact(email, required('CONTACT_HASH_KEY'));
    const encrypted = await encryptContact(email, required('CONTACT_ENCRYPTION_KEY'));
    await getD1Database().prepare(`
      INSERT INTO notification_endpoints (
        id, user_id, kind, address_encrypted, address_hash, verified_at, enabled
      ) VALUES (?, ?, 'email', ?, ?, ?, 1)
      ON CONFLICT(user_id, kind) DO UPDATE SET
        address_encrypted = excluded.address_encrypted,
        address_hash = excluded.address_hash,
        verified_at = excluded.verified_at,
        enabled = 1
    `).bind(
      `endpoint-${crypto.randomUUID()}`,
      context.actorId,
      encrypted,
      emailHash,
      Date.now(),
    ).run();

    return { saved: true };
  }, {
    mutation: true,
    rateLimit: { name: 'email-contact', limit: 5, windowMs: 60 * 60_000 },
  });
}
