import { errorRedirect, handleOAuthCallback } from '@/lib/auth/handlers';
import { operationalLog, requestLogContext, requestLogFields, safeErrorCode, withRequestId } from '@/lib/observability/log';

export async function GET(request: Request) {
  const logContext = requestLogContext(request);
  const url = new URL(request.url);
  try {
    return withRequestId(await handleOAuthCallback(request, 'google', {
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state'),
      error: url.searchParams.get('error'),
    }), logContext);
  } catch (error) {
    operationalLog('error', 'oauth-callback-failed', requestLogFields(logContext, 503, {
      operation: 'oauth-callback',
      provider: 'google',
      errorCode: safeErrorCode(error, 'sign-in-failed'),
    }));
    return withRequestId(errorRedirect(new URL(request.url).origin, 'sign_in_failed', new URL(request.url).protocol === 'https:', logContext.requestId), logContext);
  }
}
