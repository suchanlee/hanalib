import type { KakaoOAuthTokenSet } from './oauth.ts';
import { encryptContact, hashContact } from '../notifications/contact-crypto.ts';

interface KakaoNotificationEnv {
  [key: string]: string | undefined;
  CONTACT_ENCRYPTION_KEY?: string;
  CONTACT_HASH_KEY?: string;
}

export interface StoredKakaoCredential extends KakaoOAuthTokenSet {
  version: 1;
}

export async function persistKakaoNotificationCredential(
  db: D1Database,
  profileId: string,
  providerSubject: string,
  tokenSet: KakaoOAuthTokenSet,
  source: KakaoNotificationEnv = process.env,
) {
  if (!tokenSet.scopes.includes('talk_message')) return false;
  if (!source.CONTACT_ENCRYPTION_KEY || !source.CONTACT_HASH_KEY) {
    throw new Error('Kakao notification credential encryption is not configured');
  }

  const now = Date.now();
  const encrypted = await encryptContact(JSON.stringify({ version: 1, ...tokenSet }), source.CONTACT_ENCRYPTION_KEY);
  const hashed = await hashContact(`kakao:${providerSubject}`, source.CONTACT_HASH_KEY);
  await db.batch([
    db.prepare(`
      INSERT INTO notification_endpoints (
        id, user_id, kind, address_encrypted, address_hash, verified_at, enabled
      ) VALUES (?, ?, 'kakao', ?, ?, ?, 1)
      ON CONFLICT(user_id, kind) DO UPDATE SET
        address_encrypted = excluded.address_encrypted,
        address_hash = excluded.address_hash,
        verified_at = excluded.verified_at,
        enabled = 1
    `).bind(`endpoint-${crypto.randomUUID()}`, profileId, encrypted, hashed, now),
    db.prepare("UPDATE profiles SET notification_channel = 'kakao', updated_at = ? WHERE id = ?")
      .bind(now, profileId),
  ]);
  return true;
}
