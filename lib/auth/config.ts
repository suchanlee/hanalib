export type AuthProviderId = 'google' | 'apple';

export type AuthEnvSource = Record<string, string | undefined>;

export interface AuthBaseConfig {
  publicAppUrl: string;
  sessionSecret: string;
  transactionSecret: string;
  launchCommunityId: string;
  launchCommunityName: string;
  demoMode: boolean;
}

export interface AuthServerConfig extends AuthBaseConfig {
  google: { clientId: string; clientSecret: string };
  apple: {
    clientId: string;
    teamId: string;
    keyId: string;
    privateKey: string;
  };
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
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/') {
    throw new Error('PUBLIC_APP_URL must be an http(s) origin with no path, credentials, query, or fragment');
  }
  return parsed.origin;
}

export function readAuthBaseConfig(source: AuthEnvSource = process.env): AuthBaseConfig {
  const launchCommunityId = source.LAUNCH_COMMUNITY_ID?.trim() || 'hana-launch';
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/u.test(launchCommunityId)) {
    throw new Error('LAUNCH_COMMUNITY_ID must be a stable lowercase identifier');
  }

  return {
    publicAppUrl: appUrl(source),
    sessionSecret: signingSecret(source, 'AUTH_SESSION_SECRET'),
    transactionSecret: signingSecret(source, 'AUTH_TRANSACTION_SECRET'),
    launchCommunityId,
    launchCommunityName: source.LAUNCH_COMMUNITY_NAME?.trim() || 'Hana Library',
    demoMode: source.AUTH_DEMO_MODE === 'true',
  };
}

export function readAuthServerConfig(source: AuthEnvSource = process.env): AuthServerConfig {
  return {
    ...readAuthBaseConfig(source),
    google: {
      clientId: required(source, 'GOOGLE_CLIENT_ID'),
      clientSecret: required(source, 'GOOGLE_CLIENT_SECRET'),
    },
    apple: {
      clientId: required(source, 'APPLE_CLIENT_ID'),
      teamId: required(source, 'APPLE_TEAM_ID'),
      keyId: required(source, 'APPLE_KEY_ID'),
      privateKey: required(source, 'APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    },
  };
}

export function readProviderAuthConfig(provider: AuthProviderId, source: AuthEnvSource = process.env) {
  const base = readAuthBaseConfig(source);
  return provider === 'google'
    ? {
        ...base,
        provider,
        credentials: {
          clientId: required(source, 'GOOGLE_CLIENT_ID'),
          clientSecret: required(source, 'GOOGLE_CLIENT_SECRET'),
        },
      } as const
    : {
        ...base,
        provider,
        credentials: {
          clientId: required(source, 'APPLE_CLIENT_ID'),
          teamId: required(source, 'APPLE_TEAM_ID'),
          keyId: required(source, 'APPLE_KEY_ID'),
          privateKey: required(source, 'APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
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
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}
