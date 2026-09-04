import { handleLogout } from '@/lib/auth/handlers';

export async function POST(request: Request) {
  try {
    return await handleLogout(request);
  } catch {
    return Response.json({ error: 'authentication-unavailable' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
