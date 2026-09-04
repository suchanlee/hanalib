import {
  base64UrlDecode,
  base64UrlEncode,
  jsonBase64Url,
  parseJsonBase64Url,
  utf8,
} from './encoding.ts';

const MIN_SECRET_LENGTH = 32;

async function hmacKey(secret: string) {
  if (utf8(secret).byteLength < MIN_SECRET_LENGTH) {
    throw new Error(`Signing secrets must be at least ${MIN_SECRET_LENGTH} bytes`);
  }
  return crypto.subtle.importKey(
    'raw',
    utf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signToken(payload: object, secret: string) {
  const encodedPayload = jsonBase64Url(payload);
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), utf8(encodedPayload));
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyToken<T extends object>(token: string, secret: string): Promise<T | null> {
  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra) return null;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      base64UrlDecode(encodedSignature),
      utf8(encodedPayload),
    );
    if (!valid) return null;
    const payload = parseJsonBase64Url<T>(encodedPayload);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}
