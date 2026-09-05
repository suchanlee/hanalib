import { signToken, verifyToken } from './signed-token.ts';

const EMAIL_VERIFICATION_LIFETIME_MS = 60 * 60_000;

interface EmailVerificationPayload {
  version: 1;
  purpose: 'verify-email';
  profileId: string;
  emailHash: string;
  issuedAt: number;
  expiresAt: number;
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const email = value.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) return undefined;
  return email;
}

export async function createEmailVerificationToken(
  profileId: string,
  emailHash: string,
  secret: string,
  now = Date.now(),
) {
  return signToken({
    version: 1,
    purpose: 'verify-email',
    profileId,
    emailHash,
    issuedAt: now,
    expiresAt: now + EMAIL_VERIFICATION_LIFETIME_MS,
  } satisfies EmailVerificationPayload, secret);
}

export async function readEmailVerificationToken(
  token: string,
  secret: string,
  now = Date.now(),
) {
  const payload = await verifyToken<EmailVerificationPayload>(token, secret);
  if (
    payload?.version !== 1 ||
    payload.purpose !== 'verify-email' ||
    typeof payload.profileId !== 'string' ||
    !payload.profileId ||
    typeof payload.emailHash !== 'string' ||
    !payload.emailHash ||
    !Number.isSafeInteger(payload.issuedAt) ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.issuedAt > now + 60_000 ||
    payload.expiresAt <= now
  ) return null;
  return payload;
}
