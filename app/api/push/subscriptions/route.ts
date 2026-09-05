import { getD1Database } from '@/db';
import { AuthenticationRequiredError, requireAuthenticatedMember } from '@/lib/auth/member';
import { isSameOriginMutation } from '@/lib/auth/session';
import {
  removeWebPushSubscription,
  saveWebPushSubscription,
  webPushConfig,
} from '@/lib/notifications/web-push';

function sameOrigin(request: Request) {
  const configured = process.env.PUBLIC_APP_URL;
  return Boolean(configured && isSameOriginMutation(request, configured));
}

function status(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return 401;
  const code = error instanceof Error ? error.message : '';
  if (code === 'invalid-web-push-subscription') return 400;
  if (code === 'web-push-storage-not-configured') return 503;
  return 500;
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: { code: 'forbidden' } }, { status: 403 });
    const member = await requireAuthenticatedMember(request);
    const body = await request.json() as unknown;
    const data = await saveWebPushSubscription(getD1Database(), member.id, body, webPushConfig());
    return Response.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const responseStatus = status(error);
    return Response.json(
      { error: { code: responseStatus === 400 ? 'invalid-subscription' : responseStatus === 401 ? 'unauthenticated' : 'push-subscription-failed' } },
      { status: responseStatus, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: { code: 'forbidden' } }, { status: 403 });
    const member = await requireAuthenticatedMember(request);
    const body = await request.json() as { endpoint?: unknown };
    if (typeof body.endpoint !== 'string') {
      return Response.json({ error: { code: 'invalid-subscription' } }, { status: 400 });
    }
    const data = await removeWebPushSubscription(
      getD1Database(),
      member.id,
      body.endpoint,
      webPushConfig(),
    );
    return Response.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const responseStatus = status(error);
    return Response.json(
      { error: { code: responseStatus === 400 ? 'invalid-subscription' : responseStatus === 401 ? 'unauthenticated' : 'push-subscription-failed' } },
      { status: responseStatus, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
