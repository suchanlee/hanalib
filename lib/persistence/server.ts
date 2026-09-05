import { getD1Database } from '../../db/index';
import { AuthenticationRequiredError, requireAuthenticatedMember } from '../auth/member.ts';
import { isSameOriginMutation } from '../auth/session.ts';
import { readJsonObject } from '../http/json.ts';
import { processReadyOutbox } from '../notifications/outbox-worker.ts';
import {
  operationalLog,
  requestLogContext,
  requestLogFields,
  safeErrorCode,
  withRequestId,
} from '../observability/log.ts';
import type { RequestContext } from './contracts.ts';
import { D1LibraryRepository } from './d1-repository.ts';
import { LibraryError, libraryError } from './errors.ts';
import { enforceRateLimit, type RateLimit } from './rate-limit.ts';

interface HandlerOptions {
  dispatchNotifications?: boolean;
  mutation?: boolean;
  rateLimit?: RateLimit;
  status?: number;
}

function environment() {
  return {
    baseUrl: process.env.PUBLIC_APP_URL,
    contactEncryptionKey: process.env.CONTACT_ENCRYPTION_KEY,
    contactHashKey: process.env.CONTACT_HASH_KEY,
  };
}

export async function jsonObject(request: Request) {
  return readJsonObject(request);
}

export async function withLibraryApi<T>(
  request: Request,
  handler: (repository: D1LibraryRepository, context: RequestContext) => Promise<T>,
  options: HandlerOptions = {},
) {
  const logContext = requestLogContext(request);
  try {
    const config = environment();
    const member = await requireAuthenticatedMember(request);
    if (options.mutation && (!process.env.PUBLIC_APP_URL || !isSameOriginMutation(request, process.env.PUBLIC_APP_URL))) {
      throw libraryError('forbidden', 'Mutations require a same-origin browser request.');
    }
    const idempotencyKey = options.mutation ? request.headers.get('idempotency-key')?.trim() ?? '' : 'read';
    if (options.mutation && !idempotencyKey) {
      throw libraryError('missing-idempotency-key', 'An Idempotency-Key header is required for mutations.');
    }
    const context: RequestContext = { actorId: member.id, communityId: member.communityId, idempotencyKey };
    const database = getD1Database();
    if (options.mutation) {
      await enforceRateLimit(database, member.id, options.rateLimit ?? {
        name: 'library-mutation', limit: 120, windowMs: 60 * 60 * 1_000,
      });
    }
    const repository = new D1LibraryRepository(database, {
      baseUrl: config.baseUrl,
      contactEncryptionKey: config.contactEncryptionKey,
      contactHashKey: config.contactHashKey,
    });
    const data = await handler(repository, context);
    if (options.dispatchNotifications) {
      await processReadyOutbox(database, {
        contactEncryptionKey: process.env.CONTACT_ENCRYPTION_KEY,
        contactHashKey: process.env.CONTACT_HASH_KEY,
        vapidPublicKey: process.env.WEB_PUSH_PUBLIC_KEY,
        vapidPrivateKey: process.env.WEB_PUSH_PRIVATE_KEY,
        vapidSubject: process.env.WEB_PUSH_SUBJECT,
        publicAppUrl: process.env.PUBLIC_APP_URL,
        resendApiKey: process.env.RESEND_API_KEY,
        emailFrom: process.env.EMAIL_FROM,
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
        twilioFromNumber: process.env.TWILIO_FROM_NUMBER,
        kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
        kakaoClientSecret: process.env.KAKAO_CLIENT_SECRET,
      }, { requestId: logContext.requestId });
    }
    return withRequestId(Response.json({ data }, {
      status: options.status ?? 200,
      headers: { 'Cache-Control': 'private, no-store' },
    }), logContext);
  } catch (error) {
    if (error instanceof LibraryError) {
      if (error.status >= 500) {
        operationalLog('error', 'library-api-failed', requestLogFields(logContext, error.status, {
          operation: 'library-api',
          errorCode: error.code,
        }));
      }
      return withRequestId(Response.json({ error: { code: error.code, message: error.message } }, {
        status: error.status,
        headers: { 'Cache-Control': 'private, no-store' },
      }), logContext);
    }
    if (error instanceof AuthenticationRequiredError) {
      return withRequestId(Response.json({ error: { code: 'unauthenticated', message: error.message } }, {
        status: 401,
        headers: { 'Cache-Control': 'private, no-store' },
      }), logContext);
    }
    operationalLog('error', 'library-api-failed', requestLogFields(logContext, 500, {
      operation: 'library-api',
      errorCode: safeErrorCode(error, 'internal-error'),
    }));
    return withRequestId(Response.json({ error: { code: 'internal-error', message: 'The library service is temporarily unavailable.' } }, {
      status: 500,
      headers: { 'Cache-Control': 'private, no-store' },
    }), logContext);
  }
}
