import { getAuthenticatedMember } from '@/lib/auth/member';
import { operationalLog, requestLogContext, requestLogFields, safeErrorCode, withRequestId } from '@/lib/observability/log';

export async function GET(request: Request) {
  const logContext = requestLogContext(request);
  try {
    const member = await getAuthenticatedMember(request);
    return withRequestId(Response.json({ authenticated: Boolean(member), member }, {
      status: member ? 200 : 401,
      headers: { 'cache-control': 'no-store', pragma: 'no-cache' },
    }), logContext);
  } catch (error) {
    operationalLog('error', 'auth-session-failed', requestLogFields(logContext, 503, {
      operation: 'auth-session',
      errorCode: safeErrorCode(error, 'authentication-unavailable'),
    }));
    return withRequestId(Response.json({ error: 'authentication-unavailable' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    }), logContext);
  }
}
