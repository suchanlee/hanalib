import { libraryError } from './errors.ts';

export interface RateLimit {
  name: string;
  limit: number;
  windowMs: number;
}

export async function enforceRateLimit(
  db: D1Database,
  subject: string,
  policy: RateLimit,
  now = Date.now(),
) {
  const key = `${policy.name}:${subject}`;
  const expiresAt = now + policy.windowMs;
  await db
    .prepare('DELETE FROM rate_limits WHERE expires_at <= ?')
    .bind(now)
    .run();
  const row = await db
    .prepare(`
    INSERT INTO rate_limits (key, count, expires_at)
    VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.expires_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
      expires_at = CASE WHEN rate_limits.expires_at <= ? THEN excluded.expires_at ELSE rate_limits.expires_at END
    RETURNING count
  `)
    .bind(key, expiresAt, now, now)
    .first<{ count: number }>();
  if (!row)
    throw libraryError(
      'server-misconfigured',
      'The request limit could not be checked.',
    );
  if (Number(row.count) > policy.limit) {
    throw libraryError(
      'rate-limited',
      'Too many requests. Please try again later.',
    );
  }
}
