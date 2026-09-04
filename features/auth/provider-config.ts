import type { AuthProvider } from '@/lib/domain/types';

export interface OAuthProviderConfig {
  id: AuthProvider;
  label: string;
  startPath: string;
  clientIdSecretName: string;
  clientSecretName: string;
}

export const oauthProviders: Readonly<Record<AuthProvider, OAuthProviderConfig>> = {
  google: {
    id: 'google',
    label: 'Google',
    startPath: '/api/auth/google/start',
    clientIdSecretName: 'GOOGLE_CLIENT_ID',
    clientSecretName: 'GOOGLE_CLIENT_SECRET',
  },
  apple: {
    id: 'apple',
    label: 'Apple',
    startPath: '/api/auth/apple/start',
    clientIdSecretName: 'APPLE_CLIENT_ID',
    clientSecretName: 'APPLE_CLIENT_SECRET',
  },
};

export function oauthStartUrl(provider: AuthProvider, returnTo = '/') {
  return `${oauthProviders[provider].startPath}?returnTo=${encodeURIComponent(returnTo)}`;
}
