import { handleOAuthStart } from '@/lib/auth/handlers';
import { operationalLog, requestLogContext, requestLogFields, safeErrorCode, withRequestId } from '@/lib/observability/log';

export async function GET(request: Request) {
  const logContext = requestLogContext(request);
  try {
    return withRequestId(await handleOAuthStart(request, 'kakao'), logContext);
  } catch (error) {
    operationalLog('error', 'oauth-start-failed', requestLogFields(logContext, 503, {
      operation: 'oauth-start',
      provider: 'kakao',
      errorCode: safeErrorCode(error, 'auth-not-configured'),
    }));
    return withRequestId(Response.json({ error: 'kakao-auth-not-configured' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    }), logContext);
  }
}
