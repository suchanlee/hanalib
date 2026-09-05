import { libraryError } from '../persistence/errors.ts';

export const MAX_JSON_BODY_BYTES = 64 * 1_024;

export async function readJsonObject(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw libraryError(
      'payload-too-large',
      'The JSON request body is too large.',
    );
  }

  const reader = request.body?.getReader();
  if (!reader)
    throw libraryError('invalid-input', 'A JSON request body is required.');
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw libraryError(
        'payload-too-large',
        'The JSON request body is too large.',
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw libraryError('invalid-input', 'A JSON request body is required.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw libraryError(
      'invalid-input',
      'The request body must be a JSON object.',
    );
  }
  return parsed as Record<string, unknown>;
}
