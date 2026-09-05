import { getD1Database } from '@/db';
import { AuthenticationRequiredError, requireAuthenticatedMember } from '@/lib/auth/member';
import { isSameOriginMutation } from '@/lib/auth/session';
import { sendWebPushToUser, webPushConfig } from '@/lib/notifications/web-push';

export async function POST(request: Request) {
  try {
    const configured = process.env.PUBLIC_APP_URL;
    if (!configured || !isSameOriginMutation(request, configured)) {
      return Response.json({ error: { code: 'forbidden' } }, { status: 403 });
    }
    const member = await requireAuthenticatedMember(request);
    const korean = member.locale !== 'en';
    const result = await sendWebPushToUser(
      getD1Database(),
      member.id,
      {
        subject: korean ? '씨앗책장 알림 테스트' : 'Hana Seed Books notification test',
        text: korean
          ? '알림이 잘 연결되었어요. 이제 대여 요청과 반납 알림을 받을 수 있어요.'
          : 'Notifications are connected. You can now receive borrowing and return updates.',
        primaryUrl: new URL('/settings', request.url).toString(),
      },
      `push-test-${crypto.randomUUID()}`,
      webPushConfig(),
    );
    if (result.attempted === 0) {
      return Response.json({ error: { code: 'no-push-subscription' } }, { status: 409 });
    }
    if (result.delivered === 0) {
      return Response.json({ error: { code: 'push-delivery-failed' }, data: result }, { status: 503 });
    }
    return Response.json({ data: result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json(
      { error: { code: error instanceof AuthenticationRequiredError ? 'unauthenticated' : 'push-test-failed' } },
      { status: error instanceof AuthenticationRequiredError ? 401 : 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
