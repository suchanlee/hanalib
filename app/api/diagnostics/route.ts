import { isSameOriginMutation } from '@/lib/auth/session';
import { readJsonObject } from '@/lib/http/json';
import { sanitizeDiagnostic } from '@/lib/observability/client-diagnostic';
import { requestLogContext, withRequestId } from '@/lib/observability/log';
import { LibraryError } from '@/lib/persistence/errors';

// No auth/database dependency: sign-in and bootstrap failures need reporting too.
// Bound log volume per Worker isolate, without collecting IPs or member identities.
let windowStart = 0;
let reports = 0;

export async function POST(request: Request) {
  const context = requestLogContext(request);
  const respond = (status: number) =>
    withRequestId(
      new Response(null, {
        status,
        headers: { 'cache-control': 'private, no-store' },
      }),
      context,
    );
  if (!isSameOriginMutation(request, process.env.PUBLIC_APP_URL || request.url))
    return respond(403);
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    return respond(415);
  if (Date.now() - windowStart >= 60_000) {
    windowStart = Date.now();
    reports = 0;
  }
  if (++reports > 120) return respond(429);
  try {
    const diagnostic = sanitizeDiagnostic(await readJsonObject(request, 4_096));
    if (!diagnostic) return respond(400);
    console.error(
      JSON.stringify({
        schema: 'hana.client-error.v1',
        event: 'client-error-reported',
        ...diagnostic,
        reportRequestId: context.requestId,
      }),
    );
    return respond(204);
  } catch (error) {
    // Do not recursively send/log a failed diagnostic report.
    return respond(error instanceof LibraryError ? error.status : 503);
  }
}
