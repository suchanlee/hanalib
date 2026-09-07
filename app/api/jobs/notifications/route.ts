import { waitUntil } from 'cloudflare:workers';
import { processDescriptionJobs } from '@/lib/books/description-jobs';
import { lookupProviderConfig } from '@/lib/isbn/config';
import { getD1Database } from '@/db';
import { processReadyOutbox } from '@/lib/notifications/outbox-worker';
import { expireStaleBorrowRequests } from '@/lib/persistence/borrow-request-expiry';
import { expireHoldOffers, remindHoldOffers } from '@/lib/persistence/hold-queue';
import { operationalLog, requestLogContext, requestLogFields, safeErrorCode, withRequestId } from '@/lib/observability/log';

function authorized(request: Request) {
  const secret = process.env.INTERNAL_JOB_SECRET;
  const provided = request.headers.get('authorization');
  return Boolean(secret && secret.length >= 32 && provided === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  const logContext = requestLogContext(request);
  if (!authorized(request)) return withRequestId(Response.json({ error: 'unauthorized' }, { status: 401 }), logContext);
  try {
    const db = getD1Database();
    waitUntil(processDescriptionJobs(db, lookupProviderConfig()).catch(() => {
      operationalLog('error', 'description-job-failed', { operation: 'description-hydration', errorCode: 'dispatch-failed' });
    }));
    const now = Date.now();
    const baseUrl = process.env.PUBLIC_APP_URL ?? 'https://hanalib.app';
    const expired = await expireStaleBorrowRequests(db, now, baseUrl);
    const holdOffersExpired = await expireHoldOffers(db, now, baseUrl);
    const holdReminders = await remindHoldOffers(db, now, baseUrl);
    const delivery = await processReadyOutbox(db, {
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
    if (delivery.failed > 0) {
      operationalLog('warn', 'notification-job-incomplete', requestLogFields(logContext, 200, {
        operation: 'notification-job',
        claimed: delivery.claimed,
        sent: delivery.sent,
        failed: delivery.failed,
        expired,
      }));
    }
    return withRequestId(Response.json(
      { data: { expired, holdOffersExpired, holdReminders, delivery } },
      { headers: { 'cache-control': 'no-store' } },
    ), logContext);
  } catch (error) {
    operationalLog('error', 'notification-job-failed', requestLogFields(logContext, 503, {
      operation: 'notification-job',
      errorCode: safeErrorCode(error, 'job-failed'),
    }));
    return withRequestId(Response.json(
      { error: 'notification-job-unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    ), logContext);
  }
}
