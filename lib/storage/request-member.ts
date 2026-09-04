import { env } from 'cloudflare:workers';

import { cookieValue, MEMBER_SESSION_COOKIE, verifyMemberSessionToken } from './member-session';

export interface ActiveMember {
  memberId: string;
  communityId: string;
  isDevelopmentOverride: boolean;
}

function demoMemberId(request: Request) {
  const enabled = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_AUTH === 'true';
  if (!enabled) return undefined;
  const memberId = request.headers.get('x-hana-demo-member-id') ?? '';
  return /^[a-zA-Z0-9_-]{1,128}$/.test(memberId) ? memberId : undefined;
}

export async function requireActiveMember(request: Request): Promise<ActiveMember | undefined> {
  const developmentMember = demoMemberId(request);
  if (developmentMember) {
    return { memberId: developmentMember, communityId: 'hana-launch', isDevelopmentOverride: true };
  }

  const secret = process.env.SESSION_SIGNING_SECRET ?? '';
  const token = cookieValue(request.headers.get('cookie'), MEMBER_SESSION_COOKIE);
  const claims = token ? await verifyMemberSessionToken(token, secret) : undefined;
  if (!claims || !env.DB) return undefined;

  const membership = await env.DB.prepare(
    `SELECT user_id, community_id
       FROM community_members
      WHERE user_id = ? AND status = 'active'
      ORDER BY joined_at ASC
      LIMIT 1`,
  ).bind(claims.sub).first<{ user_id: string; community_id: string }>();
  if (!membership) return undefined;
  return { memberId: membership.user_id, communityId: membership.community_id, isDevelopmentOverride: false };
}

export function unauthorizedResponse() {
  return Response.json(
    { error: 'authentication-required' },
    { status: 401, headers: { 'cache-control': 'no-store', 'www-authenticate': 'Session realm="Hana Library"' } },
  );
}

