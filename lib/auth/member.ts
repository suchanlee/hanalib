import { env } from 'cloudflare:workers';
import type { AuthBaseConfig, AuthProviderId, SessionProviderId } from './config';
import { isSecureDeployment, readAuthBaseConfig } from './config';
import { sessionFromRequest } from './session';

export interface ProviderIdentity {
  provider: AuthProviderId | 'demo';
  providerSubject: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface AuthenticatedMember {
  id: string;
  communityId: string;
  role: string;
  status: 'active';
  displayName: string;
  displayNameKo: string;
  avatarUrl?: string;
  locale: 'ko' | 'en';
  provider: SessionProviderId;
}

interface IdentityRow {
  profileId: string;
}

interface MemberRow {
  id: string;
  communityId: string;
  role: string;
  status: string;
  displayName: string;
  displayNameKo: string;
  avatarUrl: string | null;
  locale: string;
}

function database() {
  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is required for authentication');
  return env.DB;
}

async function identityProfileId(provider: string, providerSubject: string) {
  return database()
    .prepare('SELECT profile_id AS profileId FROM auth_identities WHERE provider = ? AND provider_subject = ? LIMIT 1')
    .bind(provider, providerSubject)
    .first<IdentityRow>();
}

async function activeMember(profileId: string, communityId: string) {
  return database()
    .prepare(`
      SELECT
        p.id AS id,
        cm.community_id AS communityId,
        cm.role AS role,
        cm.status AS status,
        p.display_name AS displayName,
        p.display_name_ko AS displayNameKo,
        p.avatar_url AS avatarUrl,
        p.locale AS locale
      FROM profiles p
      INNER JOIN community_members cm ON cm.user_id = p.id
      WHERE p.id = ? AND cm.community_id = ? AND cm.status = 'active'
      LIMIT 1
    `)
    .bind(profileId, communityId)
    .first<MemberRow>();
}

async function migrateKakaoIdentity(
  identity: ProviderIdentity,
  storedIdentity: IdentityRow,
  config: AuthBaseConfig,
) {
  const migration = config.kakaoIdentityMigration;
  if (
    identity.provider !== 'kakao' ||
    !migration ||
    identity.providerSubject !== migration.kakaoSubject
  ) return storedIdentity;

  const target = await database().prepare(`
    SELECT profile_id AS profileId
    FROM auth_identities
    WHERE provider = 'google' AND lower(email) = ?
      AND (SELECT COUNT(*) FROM auth_identities WHERE provider = 'google' AND lower(email) = ?) = 1
    LIMIT 1
  `).bind(migration.googleEmail, migration.googleEmail).first<IdentityRow>();
  if (!target || target.profileId === storedIdentity.profileId) return storedIdentity;

  const sourceHasMemberData = await database().prepare(`
    SELECT (
      EXISTS(SELECT 1 FROM catalog_items WHERE owner_id = ?) OR
      EXISTS(SELECT 1 FROM loan_requests WHERE requester_id = ? OR responded_by = ?) OR
      EXISTS(SELECT 1 FROM loans WHERE owner_id = ? OR borrower_id = ? OR returned_by = ?) OR
      EXISTS(SELECT 1 FROM notification_endpoints WHERE user_id = ?) OR
      EXISTS(SELECT 1 FROM uploaded_assets WHERE owner_id = ?) OR
      EXISTS(SELECT 1 FROM outbox_events WHERE recipient_id = ?) OR
      EXISTS(SELECT 1 FROM notification_deliveries WHERE recipient_id = ?) OR
      EXISTS(SELECT 1 FROM audit_events WHERE actor_id = ?)
    ) AS hasMemberData
  `).bind(
    storedIdentity.profileId,
    storedIdentity.profileId,
    storedIdentity.profileId,
    storedIdentity.profileId,
    storedIdentity.profileId,
    storedIdentity.profileId,
    storedIdentity.profileId,
    storedIdentity.profileId,
    storedIdentity.profileId,
    storedIdentity.profileId,
    storedIdentity.profileId,
  ).first<{ hasMemberData: number }>();
  if (sourceHasMemberData?.hasMemberData) {
    throw new Error('Refusing to merge a Kakao identity that already owns member data');
  }

  await database().batch([
    database().prepare('DELETE FROM community_members WHERE user_id = ?').bind(storedIdentity.profileId),
    database().prepare(`
      UPDATE auth_identities
      SET profile_id = ?
      WHERE provider = 'kakao' AND provider_subject = ? AND profile_id = ?
    `).bind(target.profileId, identity.providerSubject, storedIdentity.profileId),
    database().prepare(`
      DELETE FROM auth_identities
      WHERE provider = 'google' AND lower(email) = ? AND profile_id = ?
    `).bind(migration.googleEmail, target.profileId),
  ]);

  const migratedIdentity = await identityProfileId(identity.provider, identity.providerSubject);
  if (migratedIdentity?.profileId !== target.profileId) {
    throw new Error('Unable to migrate the Kakao identity');
  }
  return migratedIdentity;
}

function toMember(row: MemberRow, provider: SessionProviderId): AuthenticatedMember {
  return {
    id: row.id,
    communityId: row.communityId,
    role: row.role,
    status: 'active',
    displayName: row.displayName,
    displayNameKo: row.displayNameKo,
    avatarUrl: row.avatarUrl ?? undefined,
    locale: row.locale === 'en' ? 'en' : 'ko',
    provider,
  };
}

/** Creates an active membership on first sign-in when the launch community is open. */
export async function provisionAuthenticatedMember(identity: ProviderIdentity, config: AuthBaseConfig) {
  const db = database();
  const now = Date.now();

  await db.prepare(`
    INSERT OR IGNORE INTO communities
      (id, name, default_locale, timezone, registration_mode, request_expiry_hours, created_at)
    VALUES (?, ?, 'ko', 'America/Los_Angeles', 'open', 48, ?)
  `).bind(config.launchCommunityId, config.launchCommunityName, now).run();

  const community = await db
    .prepare('SELECT registration_mode AS registrationMode FROM communities WHERE id = ? LIMIT 1')
    .bind(config.launchCommunityId)
    .first<{ registrationMode: string }>();
  if (!community || community.registrationMode !== 'open') {
    throw new Error('The launch community is not accepting registrations');
  }

  let storedIdentity = await identityProfileId(identity.provider, identity.providerSubject);
  if (storedIdentity) {
    await db.prepare(`
      UPDATE auth_identities
      SET email = ?, last_signed_in_at = ?
      WHERE provider = ? AND provider_subject = ?
    `).bind(identity.email, now, identity.provider, identity.providerSubject).run();
  } else {
    const candidateProfileId = crypto.randomUUID();
    const candidateIdentityId = crypto.randomUUID();
    await db.batch([
      db.prepare(`
        INSERT INTO profiles
          (id, display_name, display_name_ko, avatar_url, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'ko', ?, ?)
      `).bind(
        candidateProfileId,
        identity.displayName,
        identity.displayName,
        identity.avatarUrl ?? null,
        now,
        now,
      ),
      db.prepare(`
        INSERT OR IGNORE INTO auth_identities
          (id, profile_id, provider, provider_subject, email, created_at, last_signed_in_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        candidateIdentityId,
        candidateProfileId,
        identity.provider,
        identity.providerSubject,
        identity.email,
        now,
        now,
      ),
    ]);
    storedIdentity = await identityProfileId(identity.provider, identity.providerSubject);
    if (!storedIdentity) throw new Error('Unable to persist authentication identity');
    if (storedIdentity.profileId !== candidateProfileId) {
      await db.prepare(`
        DELETE FROM profiles
        WHERE id = ? AND NOT EXISTS (
          SELECT 1 FROM auth_identities WHERE profile_id = ?
        )
      `).bind(candidateProfileId, candidateProfileId).run();
    }
  }

  storedIdentity = await migrateKakaoIdentity(identity, storedIdentity, config);

  await db.prepare(`
    INSERT OR IGNORE INTO community_members
      (community_id, user_id, role, status, joined_at)
    VALUES (?, ?, 'member', 'active', ?)
  `).bind(config.launchCommunityId, storedIdentity.profileId, now).run();

  const member = await activeMember(storedIdentity.profileId, config.launchCommunityId);
  if (!member) throw new Error('Unable to activate community membership');
  return toMember(member, identity.provider);
}

export async function getAuthenticatedMember(request: Request, source = process.env) {
  const config = readAuthBaseConfig(source);
  const session = await sessionFromRequest(request, {
    secret: config.sessionSecret,
    secure: isSecureDeployment(config),
  });
  if (!session || session.communityId !== config.launchCommunityId) return null;
  const member = await activeMember(session.profileId, session.communityId);
  return member ? toMember(member, session.provider) : null;
}

export class AuthenticationRequiredError extends Error {
  readonly status = 401;
}

export async function requireAuthenticatedMember(request: Request, source = process.env) {
  const member = await getAuthenticatedMember(request, source);
  if (!member) throw new AuthenticationRequiredError('An active community membership is required');
  return member;
}
