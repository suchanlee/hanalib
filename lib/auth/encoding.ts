const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(value: string) {
  return encoder.encode(value);
}

export function decodeUtf8(value: Uint8Array) {
  return decoder.decode(value);
}

export function base64UrlEncode(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

export function base64UrlDecode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Invalid base64url value');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function jsonBase64Url(value: unknown) {
  return base64UrlEncode(utf8(JSON.stringify(value)));
}

export function parseJsonBase64Url<T>(value: string): T {
  return JSON.parse(decodeUtf8(base64UrlDecode(value))) as T;
}

export function randomBase64Url(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64UrlEncode(value);
}
