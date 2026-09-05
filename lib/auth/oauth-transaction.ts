import type { AuthProviderId } from './config.ts';
import { cookieName, parseCookies, serializeCookie } from './cookies.ts';
import { randomBase64Url } from './encoding.ts';
import { signToken, verifyToken } from './signed-token.ts';

export const OAUTH_TRANSACTION_TTL_SECONDS = 10 * 60;

export interface OAuthTransaction {
  version: 1;
  provider: AuthProviderId;
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  expiresAt: number;
}

export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

export function newOAuthTransaction(provider: AuthProviderId, returnTo: string, now = new Date()): OAuthTransaction {
  return {
    version: 1,
    provider,
    state: randomBase64Url(),
    nonce: randomBase64Url(),
    verifier: randomBase64Url(48),
    returnTo,
    expiresAt: Math.floor(now.getTime() / 1000) + OAUTH_TRANSACTION_TTL_SECONDS,
  };
}

export async function oauthTransactionCookie(transaction: OAuthTransaction, secret: string, secure: boolean) {
  const token = await signToken(transaction, secret);
  return serializeCookie(cookieName('hana_oauth', secure), token, {
    httpOnly: true,
    maxAge: OAUTH_TRANSACTION_TTL_SECONDS,
    sameSite: 'Lax',
    secure,
  });
}

export function clearOAuthTransactionCookie(secure: boolean) {
  return serializeCookie(cookieName('hana_oauth', secure), '', {
    httpOnly: true,
    maxAge: 0,
    sameSite: 'Lax',
    secure,
  });
}

export async function oauthTransactionFromRequest(
  request: Request,
  secret: string,
  secure: boolean,
  now = new Date(),
) {
  const token = parseCookies(request.headers.get('cookie')).get(cookieName('hana_oauth', secure));
  if (!token) return null;
  const value = await verifyToken<OAuthTransaction>(token, secret);
  if (
    !value ||
    value.version !== 1 ||
    (value.provider !== 'google' && value.provider !== 'kakao') ||
    typeof value.state !== 'string' || value.state.length < 32 ||
    typeof value.nonce !== 'string' || value.nonce.length < 32 ||
    typeof value.verifier !== 'string' || value.verifier.length < 43 ||
    typeof value.returnTo !== 'string' ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt <= Math.floor(now.getTime() / 1000)
  ) return null;
  return value;
}
