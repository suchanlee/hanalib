import { handleDemoSignIn } from '@/lib/auth/handlers';

export async function POST(request: Request) {
  try {
    return await handleDemoSignIn(request);
  } catch {
    return Response.json({ error: 'demo-sign-in-unavailable' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
