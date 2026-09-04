function toBase64(bytes: ArrayBuffer) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(left: string, right: string) {
  const max = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < max; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function computeTwilioSignature(
  authToken: string,
  publicUrl: string,
  formValues: Readonly<Record<string, string>>,
) {
  const payload = Object.keys(formValues)
    .sort()
    .reduce((value, key) => `${value}${key}${formValues[key]}`, publicUrl);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  return toBase64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function verifyTwilioSignature(input: {
  authToken: string;
  publicUrl: string;
  formValues: Readonly<Record<string, string>>;
  signature: string;
}) {
  const expected = await computeTwilioSignature(input.authToken, input.publicUrl, input.formValues);
  return constantTimeEqual(expected, input.signature);
}
