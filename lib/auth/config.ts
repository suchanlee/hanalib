export type AuthProviderId = 'kakao';
export type SessionProviderId = AuthProviderId | 'google' | 'apple' | 'demo';

export type AuthEnvSource = Record<string, string | undefined>;

export interface AuthBaseConfig {
  publicAppUrl: string;
  sessionSecret: string;
  transactionSecret: string;
  launchCommunityId: string;
  launchCommunityName: string;
  demoMode: boolean;
  kakaoIdentityMigration?: {
    kakaoSubject: string;
    googleEmail: string;
  };
}

export interface AuthServerConfig extends AuthBaseConfig {
  kakao: { clientId: string; clientSecret: string };
}

function required(source: AuthEnvSource, key: string) {
  const value = source[key]?.trim();
  if (!value) throw new Error(`Missing required authentication environment variable: ${key}`);
  return value;
}

function signingSecret(source: AuthEnvSource, key: string) {
  const value = required(source, key);
  if (new TextEncoder().encode(value).byteLength < 32) {
    throw new Error(`${key} must be at least 32 bytes`);
  }
  return value;
}

function appUrl(source: AuthEnvSource) {
  const value = required(source, 'PUBLIC_APP_URL');
  const parsed = new URL(value);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username || parsed.password ||
    parsed.pathname !== '/' || parsed.search || parsed.hash
  ) {
    throw new Error('PUBLIC_APP_URL must be an http(s) origin with no path, credentials, query, or fragment');
  }
  return parsed.origin;
}

export function readAuthBaseConfig(source: AuthEnvSource = process.env): AuthBaseConfig {
  const launchCommunityId = source.LAUNCH_COMMUNITY_ID?.trim() || 'hana-launch';
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/u.test(launchCommunityId)) {
    throw new Error('LAUNCH_COMMUNITY_ID must be a stable lowercase identifier');
  }

  const kakaoSubject = source.KAKAO_MIGRATION_SUBJECT?.trim();
  const googleEmail = source.KAKAO_MIGRATION_GOOGLE_EMAIL?.trim().toLowerCase();
  if (Boolean(kakaoSubject) !== Boolean(googleEmail)) {
    throw new Error('Kakao identity migration requires both subject and Google email');
  }
  if (kakaoSubject && !/^\d{1,30}$/u.test(kakaoSubject)) {
    throw new Error('KAKAO_MIGRATION_SUBJECT must be a Kakao numeric subject');
  }
  if (googleEmail && (googleEmail.length > 320 || !googleEmail.includes('@'))) {
    throw new Error('KAKAO_MIGRATION_GOOGLE_EMAIL must be a valid email address');
  }

  return {
    publicAppUrl: appUrl(source),
    sessionSecret: signingSecret(source, 'AUTH_SESSION_SECRET'),
    transactionSecret: signingSecret(source, 'AUTH_TRANSACTION_SECRET'),
    launchCommunityId,
    launchCommunityName: source.LAUNCH_COMMUNITY_NAME?.trim() || 'Hana Library',
    demoMode: source.AUTH_DEMO_MODE === 'true',
    kakaoIdentityMigration: kakaoSubject && googleEmail
      ? { kakaoSubject, googleEmail }
      : undefined,
  };
}

export function readAuthServerConfig(source: AuthEnvSource = process.env): AuthServerConfig {
  return {
    ...readAuthBaseConfig(source),
    kakao: {
      clientId: required(source, 'KAKAO_REST_API_KEY'),
      clientSecret: required(source, 'KAKAO_CLIENT_SECRET'),
    },
  };
}

export function readProviderAuthConfig(provider: AuthProviderId, source: AuthEnvSource = process.env) {
  const base = readAuthBaseConfig(source);
  return {
    ...base,
    provider,
    credentials: {
      clientId: required(source, 'KAKAO_REST_API_KEY'),
      clientSecret: required(source, 'KAKAO_CLIENT_SECRET'),
    },
  } as const;
}

export type ProviderAuthConfig = ReturnType<typeof readProviderAuthConfig>;

export function isSecureDeployment(config: Pick<AuthBaseConfig, 'publicAppUrl'>) {
  return new URL(config.publicAppUrl).protocol === 'https:';
}

export function callbackUrl(config: Pick<AuthBaseConfig, 'publicAppUrl'>, provider: AuthProviderId) {
  return `${config.publicAppUrl}/api/auth/${provider}/callback`;
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const base = new URL('https://return.hana.invalid');
    const parsed = new URL(value, base);
    return parsed.origin === base.origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/';
  } catch {
    return '/';
  }
}
