import {
  operationalLog,
  requestLogContext,
  requestLogFields,
  safeErrorCode,
  withRequestId,
} from '../observability/log.ts';

/** Covers routes that have their own response contracts instead of withLibraryApi. */
export async function observedRoute(
  request: Request,
  operation: string,
  handler: () => Promise<Response>,
) {
  const context = requestLogContext(request);
  try {
    const response = await handler();
    if (response.status >= 500)
      operationalLog(
        'error',
        `${operation}-failed`,
        requestLogFields(context, response.status, { operation }),
      );
    return withRequestId(response, context);
  } catch (error) {
    operationalLog(
      'error',
      `${operation}-failed`,
      requestLogFields(context, 503, {
        operation,
        errorCode: safeErrorCode(error, 'service-unavailable'),
      }),
    );
    return withRequestId(
      Response.json(
        { error: { code: 'service-unavailable' } },
        {
          status: 503,
          headers: { 'cache-control': 'private, no-store' },
        },
      ),
      context,
    );
  }
}
