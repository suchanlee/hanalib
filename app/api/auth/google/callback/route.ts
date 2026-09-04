import { handleOAuthCallback } from '@/lib/auth/handlers';

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    return await handleOAuthCallback(request, 'google', {
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state'),
      error: url.searchParams.get('error'),
      issuer: url.searchParams.get('iss'),
    });
  } catch {
    return Response.json({ error: 'google-sign-in-failed' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
