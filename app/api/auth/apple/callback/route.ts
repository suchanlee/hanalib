import { handleOAuthCallback } from '@/lib/auth/handlers';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return Response.json({ error: 'unsupported-content-type' }, {
      status: 415,
      headers: { 'cache-control': 'no-store' },
    });
  }

  try {
    const body = await request.formData();
    const code = body.get('code');
    const state = body.get('state');
    const error = body.get('error');
    const user = body.get('user');
    return await handleOAuthCallback(request, 'apple', {
      code: typeof code === 'string' ? code : null,
      state: typeof state === 'string' ? state : null,
      error: typeof error === 'string' ? error : null,
      appleUser: typeof user === 'string' ? user : null,
    });
  } catch {
    return Response.json({ error: 'apple-sign-in-failed' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
