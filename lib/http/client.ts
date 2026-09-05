export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, requestId?: string) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = /^[a-z0-9_-]{1,80}$/i.test(code) ? code : 'request-failed';
    this.requestId =
      requestId && /^[a-z0-9-]{1,80}$/i.test(requestId) ? requestId : undefined;
  }
}

// A deadline covers both response headers and body. Mutations are never retried automatically.
export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  validate?: (value: T) => boolean,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  const deadline = AbortSignal.timeout(30_000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;
  let response: Response | undefined;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      signal,
      credentials: 'same-origin',
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (signal.aborted) throw signal.reason;
    const requestId = response.headers.get('x-request-id') ?? undefined;
    if (!response.ok) {
      const error =
        payload && typeof payload === 'object' && 'error' in payload
          ? payload.error
          : undefined;
      const code =
        typeof error === 'string'
          ? error
          : error &&
              typeof error === 'object' &&
              'code' in error &&
              typeof error.code === 'string'
            ? error.code
            : 'request-failed';
      throw new ApiError(response.status, code, requestId);
    }
    if (
      !payload ||
      typeof payload !== 'object' ||
      (validate && !validate(payload as T))
    )
      throw new ApiError(response.status, 'invalid-response', requestId);
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (init.signal?.aborted) throw init.signal.reason;
    throw new ApiError(
      0,
      deadline.aborted ? 'request-timeout' : 'network-error',
      response?.headers.get('x-request-id') ?? undefined,
    );
  }
}

export async function apiData<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('content-type', 'application/json');
  const result = await requestJson<{ data?: T }>(
    path,
    { ...init, headers },
    (value) => value.data !== undefined,
  );
  if (result.data === undefined) throw new ApiError(200, 'invalid-response');
  return result.data;
}
