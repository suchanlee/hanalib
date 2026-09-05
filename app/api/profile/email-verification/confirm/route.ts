import { getD1Database } from '@/db';
import { readEmailVerificationToken } from '@/lib/auth/email-verification';
import { observedRoute } from '@/lib/http/observed-route';

function redirect(appUrl: string, result: 'verified' | 'invalid') {
  const location = new URL('/', appUrl);
  location.searchParams.set('emailVerification', result);
  return new Response(null, {
    status: 303,
    headers: {
      'cache-control': 'private, no-store',
      location: location.toString(),
    },
  });
}

export async function GET(request: Request) {
  return observedRoute(request, 'email-verification-confirm', async () => {
    const appUrl = process.env.PUBLIC_APP_URL;
    const secret = process.env.AUTH_TRANSACTION_SECRET;
    if (!appUrl || !secret) throw new Error('email-verification-not-configured');
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const payload = await readEmailVerificationToken(token, secret);
    if (!payload) return redirect(appUrl, 'invalid');
    const result = await getD1Database().prepare(`
      UPDATE notification_endpoints
      SET verified_at = ?
      WHERE user_id = ? AND kind = 'email' AND address_hash = ? AND enabled = 1
    `).bind(Date.now(), payload.profileId, payload.emailHash).run();
    return redirect(appUrl, Number(result.meta.changes ?? 0) === 1 ? 'verified' : 'invalid');
  });
}
