export const MAX_COVER_BYTES = 8 * 1024 * 1024;

export const COVER_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type CoverContentType = (typeof COVER_CONTENT_TYPES)[number];

const extensions: Record<CoverContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class CoverValidationError extends Error {
  readonly code: 'unsupported-type' | 'empty-file' | 'file-too-large' | 'content-mismatch';

  constructor(
    code: 'unsupported-type' | 'empty-file' | 'file-too-large' | 'content-mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'CoverValidationError';
    this.code = code;
  }
}

export function isCoverContentType(value: string): value is CoverContentType {
  return COVER_CONTENT_TYPES.includes(value.toLowerCase() as CoverContentType);
}

export function sniffCoverContentType(bytes: Uint8Array): CoverContentType | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return 'image/png';
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp';
  return undefined;
}

export function validateCoverUpload(declaredType: string, bytes: Uint8Array) {
  const normalizedType = declaredType.toLowerCase();
  if (!isCoverContentType(normalizedType)) {
    throw new CoverValidationError('unsupported-type', 'Only JPEG, PNG, and WebP covers are accepted.');
  }
  if (bytes.byteLength === 0) throw new CoverValidationError('empty-file', 'The cover file is empty.');
  if (bytes.byteLength > MAX_COVER_BYTES) throw new CoverValidationError('file-too-large', 'The cover exceeds 8 MiB.');
  const detectedType = sniffCoverContentType(bytes);
  if (detectedType !== normalizedType) {
    throw new CoverValidationError('content-mismatch', 'The image bytes do not match the declared content type.');
  }
  return { contentType: detectedType, extension: extensions[detectedType], byteSize: bytes.byteLength };
}

export function createCoverObjectKey(
  memberId: string,
  extension: string,
  options: { now?: Date; randomId?: string } = {},
) {
  const now = options.now ?? new Date();
  const randomId = options.randomId ?? crypto.randomUUID();
  const safeMemberId = memberId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `covers/${safeMemberId}/${now.getUTCFullYear()}/${month}/${randomId}.${extension}`;
}

export function safeOriginalFilename(value: string | null) {
  if (!value) return undefined;
  const printable = Array.from(value).filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code >= 32 && code !== 127;
  }).join('');
  const filename = printable.split(/[\\/]/).pop()?.trim();
  return filename ? filename.slice(0, 180) : undefined;
}
