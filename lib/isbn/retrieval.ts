import type { FetchLike, ProviderId } from './server-lookup.ts';

export interface RetrievalDiagnostic {
  provider: ProviderId;
  stage: string;
  outcome: 'ok' | 'not-found' | 'failed' | 'rejected' | 'skipped';
  attempts?: number;
  reason?: string;
  record?: string;
  descriptionCharacters?: number;
}

export interface RetrievalOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  basicOnly?: boolean;
  onDiagnostic?: (event: RetrievalDiagnostic) => void;
}

/** One deadline and at most one transient retry per request. Never emits URLs or credentials. */
export function retrievalClient(
  provider: ProviderId,
  options: RetrievalOptions,
  headers: HeadersInit = { accept: 'application/json' },
) {
  const signal = AbortSignal.timeout(
    Math.max(100, Math.min(options.timeoutMs ?? 8_000, 15_000)),
  );
  const events: RetrievalDiagnostic[] = [];
  let quotaExceeded = false;
  const report = (event: Omit<RetrievalDiagnostic, 'provider'>) => {
    const complete = { provider, ...event };
    events.push(complete);
    options.onDiagnostic?.(complete);
  };
  async function json<T>(url: string | URL, stage: string): Promise<T | null> {
    if (signal.aborted || quotaExceeded) {
      report({
        stage,
        outcome: 'skipped',
        reason: quotaExceeded ? 'quota-exhausted' : 'deadline-exceeded',
      });
      return null;
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await (options.fetchImpl ?? fetch)(url, {
          headers,
          signal,
        });
        if (response.status === 404) {
          report({ stage, outcome: 'not-found', attempts: attempt });
          return null;
        }
        if (response.status === 429) quotaExceeded = true;
        if (!response.ok) {
          if (
            (response.status === 408 || response.status >= 500) &&
            attempt === 1 &&
            !options.basicOnly &&
            !signal.aborted
          )
            continue;
          report({
            stage,
            outcome: 'failed',
            attempts: attempt,
            reason: `http-${response.status}`,
          });
          return null;
        }
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          report({
            stage,
            outcome: 'failed',
            attempts: attempt,
            reason: 'invalid-payload',
          });
          return null;
        }
        report({ stage, outcome: 'ok', attempts: attempt });
        return payload as T;
      } catch {
        if (attempt === 1 && !options.basicOnly && !signal.aborted) continue;
        report({
          stage,
          outcome: 'failed',
          attempts: attempt,
          reason: signal.aborted ? 'deadline-exceeded' : 'request-failed',
        });
        return null;
      }
    }
    return null;
  }
  return { json, report, events };
}

export function retrievalIncomplete(events: RetrievalDiagnostic[]) {
  return events.some(
    (event) =>
      event.outcome === 'failed' ||
      (event.outcome === 'skipped' &&
        ['deadline-exceeded', 'quota-exhausted'].includes(event.reason ?? '')),
  );
}
