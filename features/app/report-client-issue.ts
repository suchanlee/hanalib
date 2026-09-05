import type { UserIssue } from '../../lib/domain/types.ts';
import { sanitizeDiagnostic } from '../../lib/observability/client-diagnostic.ts';

export type ReportStatus = 'recorded' | 'unavailable';
const reports = new Map<string, Promise<ReportStatus>>();
let windowStart = 0;

/** Best effort only: reporting must never break recovery or recursively report itself. */
export function reportClientIssue(issue: UserIssue): Promise<ReportStatus> {
  const existing = reports.get(issue.traceId);
  if (existing) return existing;
  if (Date.now() - windowStart >= 60_000) {
    reports.clear();
    windowStart = Date.now();
  }
  if (reports.size >= 10) return Promise.resolve('unavailable');
  const job = (async (): Promise<ReportStatus> => {
    try {
      const diagnostic = sanitizeDiagnostic(issue);
      if (!diagnostic) return 'unavailable';
      console.error(
        JSON.stringify({ schema: 'hana.client-error.v1', ...diagnostic }),
      );
      const response = await fetch('/api/diagnostics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(diagnostic),
        keepalive: true,
        signal: AbortSignal.timeout(5_000),
      });
      return response.status === 204 ? 'recorded' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  })();
  reports.set(issue.traceId, job);
  return job;
}
