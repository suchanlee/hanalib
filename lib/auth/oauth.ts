import { base64UrlDecode, parseJsonBase64Url, utf8 } from './encoding.ts';
import { callbackUrl, type AuthProviderId, type ProviderAuthConfig } from './config.ts';
import { pkceChallenge, type OAuthTransaction } from './oauth-transaction.ts';

export const KAKAO_AUTHORIZATION_ENDPOINT = 'https://kauth.kakao.com/oauth/authorize';
export const KAKAO_TOKEN_ENDPOINT = 'https://kauth.kakao.com/oauth/token';
export const KAKAO_JWKS_ENDPOINT = 'https://kauth.kakao.com/.well-known/jwks.json';
export const KAKAO_ISSUER = 'https://kauth.kakao.com';

export class OAuthProtocolError extends Error {
  readonly code: 'invalid_authorization' | 'token_exchange_failed' | 'invalid_identity_token';

  constructor(code: 'invalid_authorization' | 'token_exchange_failed' | 'invalid_identity_token') {
    super(code);
    this.code = code;
  }
}

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
}

export interface OidcClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  azp?: string;
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  nickname?: string;
}

interface ProviderJsonWebKey extends JsonWebKey {
  kid?: string;
}

interface JwkSet {
  keys?: ProviderJsonWebKey[];
}

interface VerifyIdTokenOptions {
  audience: string;
  issuers: readonly string[];
  jwksUrl: string;
  nonce: string;
  now?: Date;
  fetcher?: typeof fetch;
}

function claimAudienceMatches(claims: OidcClaims, expected: string) {
  if (typeof claims.aud === 'string') return claims.aud === expected;
  if (!Array.isArray(claims.aud) || !claims.aud.includes(expected)) return false;
  return claims.aud.length === 1 || claims.azp === expected;
}

export async function verifyOidcIdToken(token: string, options: VerifyIdTokenOptions): Promise<OidcClaims> {
  if (token.length > 20_000) throw new OAuthProtocolError('invalid_identity_token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new OAuthProtocolError('invalid_identity_token');

  try {
    const header = parseJsonBase64Url<JwtHeader>(parts[0]);
    const claims = parseJsonBase64Url<OidcClaims>(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 200) {
      throw new OAuthProtocolError('invalid_identity_token');
    }

    const response = await (options.fetcher ?? fetch)(options.jwksUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new OAuthProtocolError('invalid_identity_token');
    const jwks = await response.json() as JwkSet;
    const jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA');
    if (!jwk) throw new OAuthProtocolError('invalid_identity_token');

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const validSignature = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlDecode(parts[2]),
      utf8(`${parts[0]}.${parts[1]}`),
    );
    const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
    if (
      !validSignature ||
      !options.issuers.includes(claims.iss) ||
      !claimAudienceMatches(claims, options.audience) ||
      typeof claims.sub !== 'string' || claims.sub.length < 1 || claims.sub.length > 255 ||
      !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
      !Number.isSafeInteger(claims.iat) || claims.iat > now + 60 ||
      claims.nonce !== options.nonce
    ) throw new OAuthProtocolError('invalid_identity_token');
    return claims;
  } catch (error) {
    if (error instanceof OAuthProtocolError) throw error;
    throw new OAuthProtocolError('invalid_identity_token');
  }
}

export async function authorizationUrl(
  config: ProviderAuthConfig,
  transaction: OAuthTransaction,
) {
  const redirectUri = callbackUrl(config, config.provider);
  const url = new URL(KAKAO_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', config.credentials.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid,profile_nickname,talk_message');
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('nonce', transaction.nonce);
  url.searchParams.set('code_challenge', await pkceChallenge(transaction.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url;
}

interface TokenResponse {
  id_token?: unknown;
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  refresh_token_expires_in?: unknown;
  scope?: unknown;
}

export interface KakaoOAuthTokenSet {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  scopes: string[];
}

async function tokenResponse(response: Response, now = Date.now()) {
  if (!response.ok) throw new OAuthProtocolError('token_exchange_failed');
  const payload = await response.json() as TokenResponse;
  if (
    typeof payload.id_token !== 'string' ||
    typeof payload.access_token !== 'string' ||
    typeof payload.refresh_token !== 'string' ||
    typeof payload.expires_in !== 'number' || !Number.isSafeInteger(payload.expires_in) || payload.expires_in <= 0 ||
    typeof payload.refresh_token_expires_in !== 'number' || !Number.isSafeInteger(payload.refresh_token_expires_in) || payload.refresh_token_expires_in <= 0
  ) throw new OAuthProtocolError('token_exchange_failed');
  return {
    idToken: payload.id_token,
    tokenSet: {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      accessExpiresAt: now + payload.expires_in * 1_000,
      refreshExpiresAt: now + payload.refresh_token_expires_in * 1_000,
      scopes: typeof payload.scope === 'string'
        ? payload.scope.split(/[\s,]+/u).filter(Boolean)
        : [],
    } satisfies KakaoOAuthTokenSet,
  };
}

export async function exchangeAuthorizationCode(
  config: ProviderAuthConfig,
  code: string,
  transaction: OAuthTransaction,
  fetcher: typeof fetch = fetch,
) {
  if (code.length < 4 || code.length > 4_096) throw new OAuthProtocolError('invalid_authorization');
  const redirectUri = callbackUrl(config, config.provider);
  const body = new URLSearchParams({
    client_id: config.credentials.clientId,
    client_secret: config.credentials.clientSecret,
    code,
    code_verifier: transaction.verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const response = await fetcher(KAKAO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const { idToken, tokenSet } = await tokenResponse(response);
  const claims = await verifyOidcIdToken(idToken, {
    audience: config.credentials.clientId,
    issuers: [KAKAO_ISSUER],
    jwksUrl: KAKAO_JWKS_ENDPOINT,
    nonce: transaction.nonce,
    fetcher,
  });
  return { claims, tokenSet };
}

export function identityFromClaims(
  provider: AuthProviderId,
  claims: OidcClaims,
) {
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  const email = emailVerified && typeof claims.email === 'string'
    ? claims.email.trim().slice(0, 320)
    : '';
  const displayName = sanitizeExternalName(claims.nickname ?? claims.name) || 'Kakao member';
  let avatarUrl: string | undefined;
  if (typeof claims.picture === 'string' && claims.picture.length < 2_048) {
    try {
      const parsed = new URL(claims.picture);
      if (parsed.protocol === 'https:') avatarUrl = parsed.toString();
    } catch {
      // A profile image is optional; ignore malformed provider data.
    }
  }
  return {
    provider,
    providerSubject: claims.sub,
    email,
    displayName,
    avatarUrl,
  };
}

export function sanitizeExternalName(value: unknown) {
  if (typeof value !== 'string') return '';
  const withoutUnsafeCharacters = value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}<>]/gu, '');
  return withoutUnsafeCharacters
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 80);
}
