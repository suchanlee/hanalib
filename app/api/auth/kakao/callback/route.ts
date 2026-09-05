import { handleOAuthCallback } from '@/lib/auth/handlers';
import { operationalLog, requestLogContext, requestLogFields, safeErrorCode, withRequestId } from '@/lib/observability/log';

export async function GET(request: Request) {
  const logContext = requestLogContext(request);
  const url = new URL(request.url);
  try {
    return withRequestId(await handleOAuthCallback(request, 'kakao', {
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state'),
      error: url.searchParams.get('error'),
    }), logContext);
  } catch (error) {
    operationalLog('error', 'oauth-callback-failed', requestLogFields(logContext, 503, {
      operation: 'oauth-callback',
      provider: 'kakao',
      errorCode: safeErrorCode(error, 'sign-in-failed'),
    }));
    return withRequestId(Response.json({ error: 'kakao-sign-in-failed' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    }), logContext);
  }
}
