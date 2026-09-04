export type LibraryErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'invalid-input'
  | 'request-expired'
  | 'missing-idempotency-key'
  | 'server-misconfigured';

export class LibraryError extends Error {
  readonly code: LibraryErrorCode;
  readonly status: number;

  constructor(
    code: LibraryErrorCode,
    status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LibraryError';
    this.code = code;
    this.status = status;
  }
}

export function libraryError(code: LibraryErrorCode, message: string) {
  const statusByCode: Record<LibraryErrorCode, number> = {
    unauthenticated: 401,
    forbidden: 403,
    'not-found': 404,
    conflict: 409,
    'invalid-input': 400,
    'request-expired': 409,
    'missing-idempotency-key': 400,
    'server-misconfigured': 500,
  };
  return new LibraryError(code, statusByCode[code], message);
}
