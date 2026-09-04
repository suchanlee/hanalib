import { getD1Database } from '../../db/index';
import { AuthenticationRequiredError, requireAuthenticatedMember } from '../auth/member.ts';
import { isSameOriginMutation } from '../auth/session.ts';
import { processReadyOutbox } from '../notifications/outbox-worker.ts';
import type { RequestContext } from './contracts.ts';
import { D1LibraryRepository } from './d1-repository.ts';
import { LibraryError, libraryError } from './errors.ts';

interface HandlerOptions {
  dispatchNotifications?: boolean;
  mutation?: boolean;
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
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw libraryError('invalid-input', 'A JSON request body is required.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw libraryError('invalid-input', 'The request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

export async function withLibraryApi<T>(
  request: Request,
  handler: (repository: D1LibraryRepository, context: RequestContext) => Promise<T>,
  options: HandlerOptions = {},
) {
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
    const repository = new D1LibraryRepository(getD1Database(), {
      baseUrl: config.baseUrl,
      contactEncryptionKey: config.contactEncryptionKey,
      contactHashKey: config.contactHashKey,
    });
    const data = await handler(repository, context);
    if (options.dispatchNotifications) {
      await processReadyOutbox(getD1Database(), {
        contactEncryptionKey: process.env.CONTACT_ENCRYPTION_KEY,
        publicAppUrl: process.env.PUBLIC_APP_URL,
        resendApiKey: process.env.RESEND_API_KEY,
        emailFrom: process.env.EMAIL_FROM,
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
        twilioFromNumber: process.env.TWILIO_FROM_NUMBER,
      });
    }
    return Response.json({ data }, {
      status: options.status ?? 200,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof LibraryError) {
      return Response.json({ error: { code: error.code, message: error.message } }, {
        status: error.status,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    if (error instanceof AuthenticationRequiredError) {
      return Response.json({ error: { code: 'unauthenticated', message: error.message } }, {
        status: 401,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    console.error('library_api_error', error instanceof Error ? error.name : 'unknown');
    return Response.json({ error: { code: 'internal-error', message: 'The library service is temporarily unavailable.' } }, {
      status: 500,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
