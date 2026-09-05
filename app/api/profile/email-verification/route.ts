import { getD1Database } from '@/db';
import { createEmailVerificationToken, normalizeEmail } from '@/lib/auth/email-verification';
import { encryptContact, hashContact } from '@/lib/notifications/contact-crypto';
import { sendResendEmail } from '@/lib/notifications/sender';
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

    const encryptionKey = required('CONTACT_ENCRYPTION_KEY');
    const hashKey = required('CONTACT_HASH_KEY');
    const appUrl = required('PUBLIC_APP_URL');
    const emailHash = await hashContact(email, hashKey);
    const encrypted = await encryptContact(email, encryptionKey);
    await getD1Database().prepare(`
      INSERT INTO notification_endpoints (
        id, user_id, kind, address_encrypted, address_hash, verified_at, enabled
      ) VALUES (?, ?, 'email', ?, ?, NULL, 1)
      ON CONFLICT(user_id, kind) DO UPDATE SET
        address_encrypted = excluded.address_encrypted,
        address_hash = excluded.address_hash,
        verified_at = CASE
          WHEN notification_endpoints.address_hash = excluded.address_hash
          THEN notification_endpoints.verified_at
          ELSE NULL
        END,
        enabled = 1
    `).bind(`endpoint-${crypto.randomUUID()}`, context.actorId, encrypted, emailHash).run();

    const token = await createEmailVerificationToken(
      context.actorId,
      emailHash,
      required('AUTH_TRANSACTION_SECRET'),
    );
    const verificationUrl = new URL('/api/profile/email-verification/confirm', appUrl);
    verificationUrl.searchParams.set('token', token);
    await sendResendEmail({
      resendApiKey: required('RESEND_API_KEY'),
      emailFrom: required('EMAIL_FROM'),
    }, email, {
      subject: '씨앗 도서관 이메일 인증 · Verify your email',
      text: [
        '씨앗 도서관에서 대여 요청과 반납 알림을 받으려면 아래 링크로 이메일을 인증해 주세요.',
        verificationUrl.toString(),
        '',
        'Verify your email to receive borrowing and return notifications from Hana Seed Library.',
        verificationUrl.toString(),
        '',
        '이 링크는 1시간 후 만료됩니다. This link expires in one hour.',
      ].join('\n'),
    });
    return { sent: true };
  }, {
    mutation: true,
    rateLimit: { name: 'email-verification', limit: 5, windowMs: 60 * 60_000 },
  });
}
