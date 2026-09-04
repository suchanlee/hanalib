import type { AuthProvider } from '@/lib/domain/types';

export interface OAuthProviderConfig {
  id: AuthProvider;
  label: string;
  startPath: string;
  clientIdSecretName: string;
  serverSecretNames: readonly string[];
}

export const oauthProviders: Readonly<Record<AuthProvider, OAuthProviderConfig>> = {
  google: {
    id: 'google',
    label: 'Google',
    startPath: '/api/auth/google/start',
    clientIdSecretName: 'GOOGLE_CLIENT_ID',
    serverSecretNames: ['GOOGLE_CLIENT_SECRET'],
  },
  apple: {
    id: 'apple',
    label: 'Apple',
    startPath: '/api/auth/apple/start',
    clientIdSecretName: 'APPLE_CLIENT_ID',
    serverSecretNames: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'],
  },
};

export function oauthStartUrl(provider: AuthProvider, returnTo = '/') {
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
  return `${oauthProviders[provider].startPath}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}
