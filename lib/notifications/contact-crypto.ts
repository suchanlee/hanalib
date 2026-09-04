function decodeBase64(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function importAesKey(encodedKey: string) {
  const bytes = decodeBase64(encodedKey);
  if (bytes.byteLength !== 32) throw new Error('CONTACT_ENCRYPTION_KEY must encode exactly 32 bytes.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptContact(address: string, encodedKey: string) {
  const key = await importAesKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(address),
  );
  return `v1.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(encrypted))}`;
}

export async function decryptContact(value: string, encodedKey: string) {
  const [version, encodedIv, encodedCiphertext, extra] = value.split('.');
  if (version !== 'v1' || !encodedIv || !encodedCiphertext || extra) {
    throw new Error('Unsupported encrypted contact value.');
  }
  const key = await importAesKey(encodedKey);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(encodedIv) },
    key,
    decodeBase64(encodedCiphertext),
  );
  return new TextDecoder().decode(decrypted);
}

export async function hashContact(address: string, hashKey: string) {
  if (hashKey.length < 32) throw new Error('CONTACT_HASH_KEY must be at least 32 characters.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(hashKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(address));
  return encodeBase64(new Uint8Array(digest));
}
