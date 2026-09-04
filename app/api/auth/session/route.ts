import { getAuthenticatedMember } from '@/lib/auth/member';

export async function GET(request: Request) {
  try {
    const member = await getAuthenticatedMember(request);
    return Response.json({ authenticated: Boolean(member), member }, {
      status: member ? 200 : 401,
      headers: { 'cache-control': 'no-store', pragma: 'no-cache' },
    });
  } catch {
    return Response.json({ error: 'authentication-unavailable' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
