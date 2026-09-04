import { handleOAuthStart } from '@/lib/auth/handlers';

export async function GET(request: Request) {
  try {
    return await handleOAuthStart(request, 'google');
  } catch {
    return Response.json({ error: 'google-auth-not-configured' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
