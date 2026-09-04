const encoder = new TextEncoder();

export const MEMBER_SESSION_COOKIE = 'hana_session';

export interface MemberSessionClaims {
  sub: string;
  exp: number;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export function cookieValue(cookieHeader: string | null, name: string) {
  for (const part of cookieHeader?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}

export async function createMemberSessionToken(claims: MemberSessionClaims, secret: string) {
  if (secret.length < 32) throw new Error('SESSION_SIGNING_SECRET must be at least 32 characters.');
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyMemberSessionToken(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (secret.length < 32) return undefined;
  const [payload, encodedSignature, extra] = token.split('.');
  if (!payload || !encodedSignature || extra) return undefined;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret),
      fromBase64Url(encodedSignature),
      encoder.encode(payload),
    );
    if (!valid) return undefined;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Partial<MemberSessionClaims>;
    if (typeof claims.sub !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(claims.sub)) return undefined;
    if (typeof claims.exp !== 'number' || !Number.isInteger(claims.exp) || claims.exp <= nowSeconds) return undefined;
    return claims as MemberSessionClaims;
  } catch {
    return undefined;
  }
}

