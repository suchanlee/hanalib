import type { UserIssue } from '../domain/types.ts';

const idPattern = /^[a-z0-9-]{1,80}$/i;
const tracePattern =
  /^client-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorTypes = new Set([
  'Error',
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
  'DOMException',
  'AbortError',
  'TimeoutError',
  'ApiError',
  'UnknownError',
]);
// Only code locations: never retain error messages, function arguments, URL queries,
// browser extensions, full hostnames, or local filesystem paths.
const locationPattern =
  /^\/(?:assets|_next\/static|features|components|lib|app)\/[a-z0-9_./-]+\.(?:[cm]?js|tsx?)(?::\d{1,9}){2}$/i;

export function sourceLocations(error: unknown): string[] {
  if (!(error instanceof Error) || typeof error.stack !== 'string') return [];
  return error.stack
    .split('\n')
    .slice(0, 30)
    .flatMap((line) => {
      // Firefox/Safari stacks can start with a frame instead of an error heading.
      if (!/^\s*at\s/.test(line) && !/^[^@]*@https?:\/\//.test(line)) return [];
      const match = line.match(/https?:\/\/[^\s()]+:(\d+):(\d+)\)?$/);
      if (!match) return [];
      try {
        const url = new URL(match[0].replace(/:\d+:\d+\)?$/, ''));
        if (
          typeof window !== 'undefined' &&
          url.origin !== window.location.origin
        )
          return [];
        const location = `${url.pathname}:${match[1]}:${match[2]}`;
        return location.length <= 240 && locationPattern.test(location)
          ? [location]
          : [];
      } catch {
        return [];
      }
    })
    .slice(0, 8);
}

export function errorType(error: unknown) {
  return error instanceof Error && errorTypes.has(error.name)
    ? error.name
    : 'UnknownError';
}

/** Used on both sides of the reporting boundary; unknown fields are discarded. */
export function sanitizeDiagnostic(value: unknown): UserIssue | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (
    typeof item.traceId !== 'string' ||
    !tracePattern.test(item.traceId) ||
    typeof item.operation !== 'string' ||
    !/^[a-z-]{1,60}$/.test(item.operation) ||
    typeof item.code !== 'string' ||
    !/^[a-z0-9_-]{1,80}$/i.test(item.code) ||
    typeof item.occurredAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(item.occurredAt) ||
    !Number.isFinite(Date.parse(item.occurredAt))
  )
    return undefined;
  return {
    traceId: item.traceId,
    operation: item.operation,
    code: item.code,
    occurredAt: item.occurredAt,
    status:
      typeof item.status === 'number' &&
      Number.isInteger(item.status) &&
      item.status >= 100 &&
      item.status <= 599
        ? item.status
        : 0,
    requestId:
      typeof item.requestId === 'string' && idPattern.test(item.requestId)
        ? item.requestId
        : undefined,
    serverDigest:
      typeof item.serverDigest === 'string' && idPattern.test(item.serverDigest)
        ? item.serverDigest
        : undefined,
    errorType:
      typeof item.errorType === 'string' && errorTypes.has(item.errorType)
        ? item.errorType
        : 'UnknownError',
    sourceLocations: Array.isArray(item.sourceLocations)
      ? item.sourceLocations
          .filter(
            (entry): entry is string =>
              typeof entry === 'string' &&
              entry.length <= 240 &&
              locationPattern.test(entry),
          )
          .slice(0, 8)
      : [],
  };
}
