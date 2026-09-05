import type { SessionProviderId } from './config.ts';
import { cookieName, parseCookies, serializeCookie } from './cookies.ts';
import { signToken, verifyToken } from './signed-token.ts';

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionPayload {
  version: 1;
  profileId: string;
  communityId: string;
  provider: SessionProviderId;
  issuedAt: number;
  expiresAt: number;
}

interface SessionOptions {
  secret: string;
  secure: boolean;
  now?: Date;
}

export async function createSessionToken(
  member: Pick<SessionPayload, 'profileId' | 'communityId' | 'provider'>,
  options: SessionOptions,
) {
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  return signToken({
    version: 1,
    ...member,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS,
  } satisfies SessionPayload, options.secret);
}

export async function verifySessionToken(token: string, options: SessionOptions) {
  const payload = await verifyToken<SessionPayload>(token, options.secret);
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (
    !payload ||
    payload.version !== 1 ||
    typeof payload.profileId !== 'string' ||
    typeof payload.communityId !== 'string' ||
    !['kakao', 'demo'].includes(payload.provider) ||
    !Number.isSafeInteger(payload.issuedAt) ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.issuedAt > now + 60 ||
    payload.expiresAt <= now
  ) return null;
  return payload;
}

export function sessionCookieName(secure: boolean) {
  return cookieName('hana_session', secure);
}

export function sessionCookie(token: string, secure: boolean) {
  return serializeCookie(sessionCookieName(secure), token, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    sameSite: 'Lax',
    secure,
  });
}

export function clearSessionCookie(secure: boolean) {
  return serializeCookie(sessionCookieName(secure), '', {
    httpOnly: true,
    maxAge: 0,
    sameSite: 'Lax',
    secure,
  });
}

export async function sessionFromRequest(request: Request, options: SessionOptions) {
  const token = parseCookies(request.headers.get('cookie')).get(sessionCookieName(options.secure));
  return token ? verifySessionToken(token, options) : null;
}

export function isSameOriginMutation(request: Request, publicAppUrl: string) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(publicAppUrl).origin;
  } catch {
    return false;
  }
}
