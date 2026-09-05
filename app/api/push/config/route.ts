import { AuthenticationRequiredError, requireAuthenticatedMember } from '@/lib/auth/member';

export async function GET(request: Request) {
  try {
    await requireAuthenticatedMember(request);
    const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
    if (!publicKey) {
      return Response.json(
        { error: { code: 'push-not-configured', message: 'Push notifications are not configured.' } },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    return Response.json(
      { data: { publicKey } },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) {
      return Response.json(
        { error: { code: 'push-config-failed', message: 'Unable to load notification settings.' } },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    return Response.json(
      { error: { code: 'unauthenticated', message: 'Sign in to manage notifications.' } },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
