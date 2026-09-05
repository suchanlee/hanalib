import { env } from 'cloudflare:workers';
import { operationalLog, requestLogContext, requestLogFields, safeErrorCode, withRequestId } from '@/lib/observability/log';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const logContext = requestLogContext(request);
  try {
    if (!env.DB || !env.FILES) throw new Error('Storage bindings unavailable.');
    await env.DB.prepare('SELECT 1 AS ok').first();
    return withRequestId(Response.json(
      { status: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } },
    ), logContext);
  } catch (error) {
    operationalLog('error', 'health-check-failed', requestLogFields(logContext, 503, {
      operation: 'storage-health-check',
      errorCode: safeErrorCode(error, 'storage-unavailable'),
    }));
    return withRequestId(Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    ), logContext);
  }
}
