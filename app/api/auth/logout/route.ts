import { handleLogout } from '@/lib/auth/handlers';
import { operationalLog, requestLogContext, requestLogFields, safeErrorCode, withRequestId } from '@/lib/observability/log';

export async function POST(request: Request) {
  const context = requestLogContext(request);
  try {
    return withRequestId(await handleLogout(request), context);
  } catch (error) {
    operationalLog('error', 'logout-failed', requestLogFields(context, 503, {
      operation: 'sign-out', errorCode: safeErrorCode(error, 'authentication-unavailable'),
    }));
    return withRequestId(Response.json({ error: 'authentication-unavailable' }, {
      status: 503, headers: { 'cache-control': 'no-store' },
    }), context);
  }
}
