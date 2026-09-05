import type { AuthProvider } from '@/lib/domain/types';

export interface OAuthProviderConfig {
  id: AuthProvider;
  label: string;
  startPath: string;
  callbackPath: string;
  clientIdSecretName: string;
  serverSecretNames: readonly string[];
}

export const oauthProviders: Readonly<Record<AuthProvider, OAuthProviderConfig>> = {
  google: {
    id: 'google',
    label: 'Google',
    startPath: '/api/auth/google/start',
    callbackPath: '/api/auth/google/callback',
    clientIdSecretName: 'GOOGLE_CLIENT_ID',
    serverSecretNames: ['GOOGLE_CLIENT_SECRET'],
  },
  kakao: {
    id: 'kakao',
    label: 'Kakao',
    startPath: '/api/auth/kakao/start',
    callbackPath: '/api/auth/kakao/callback',
    clientIdSecretName: 'KAKAO_REST_API_KEY',
    serverSecretNames: ['KAKAO_CLIENT_SECRET'],
  },
};

export function oauthStartUrl(provider: AuthProvider, returnTo = '/') {
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
  return `${oauthProviders[provider].startPath}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}
