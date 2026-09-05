import { errorRedirect, handleOAuthStart } from '@/lib/auth/handlers';
import { operationalLog, requestLogContext, requestLogFields, safeErrorCode, withRequestId } from '@/lib/observability/log';

export async function GET(request: Request) {
  const logContext = requestLogContext(request);
  try {
    return withRequestId(await handleOAuthStart(request, 'google'), logContext);
  } catch (error) {
    operationalLog('error', 'oauth-start-failed', requestLogFields(logContext, 503, {
      operation: 'oauth-start',
      provider: 'google',
      errorCode: safeErrorCode(error, 'auth-not-configured'),
    }));
    return withRequestId(errorRedirect(new URL(request.url).origin, 'sign_in_failed', new URL(request.url).protocol === 'https:', logContext.requestId), logContext);
  }
}
