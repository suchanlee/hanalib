import { getAuthenticatedMember } from '@/lib/auth/member';

export interface ActiveMember {
  memberId: string;
  communityId: string;
}

export async function requireActiveMember(request: Request): Promise<ActiveMember | undefined> {
  try {
    const member = await getAuthenticatedMember(request);
    return member ? { memberId: member.id, communityId: member.communityId } : undefined;
  } catch {
    return undefined;
  }
}

export function unauthorizedResponse() {
  return Response.json(
    { error: 'authentication-required' },
    { status: 401, headers: { 'cache-control': 'no-store', 'www-authenticate': 'Session realm="Hana Seed Books"' } },
  );
}
