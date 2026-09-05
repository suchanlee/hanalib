import { handleOAuthCallback } from '@/lib/auth/handlers';

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    return await handleOAuthCallback(request, 'kakao', {
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state'),
      error: url.searchParams.get('error'),
    });
  } catch {
    return Response.json({ error: 'kakao-sign-in-failed' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
