import { base64UrlDecode, base64UrlEncode, jsonBase64Url, parseJsonBase64Url, utf8 } from './encoding.ts';
import { callbackUrl, type AuthProviderId, type ProviderAuthConfig } from './config.ts';
import { pkceChallenge, type OAuthTransaction } from './oauth-transaction.ts';

export const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
export const APPLE_AUTHORIZATION_ENDPOINT = 'https://appleid.apple.com/auth/authorize';
export const APPLE_TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
export const APPLE_JWKS_ENDPOINT = 'https://appleid.apple.com/auth/keys';

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
  if (config.provider === 'google') {
    const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
    url.searchParams.set('client_id', config.credentials.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', transaction.state);
    url.searchParams.set('nonce', transaction.nonce);
    url.searchParams.set('code_challenge', await pkceChallenge(transaction.verifier));
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', 'select_account');
    return url;
  }

  const url = new URL(APPLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', config.credentials.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('scope', 'name email');
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('nonce', transaction.nonce);
  return url;
}

function pemBytes(pem: string) {
  const encoded = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  if (!encoded) throw new Error('APPLE_PRIVATE_KEY must be a PKCS#8 private key');
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function createAppleClientSecret(
  credentials: { clientId: string; teamId: string; keyId: string; privateKey: string },
  now = new Date(),
) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = jsonBase64Url({ alg: 'ES256', kid: credentials.keyId, typ: 'JWT' });
  const payload = jsonBase64Url({
    iss: credentials.teamId,
    iat: issuedAt,
    exp: issuedAt + 5 * 60,
    aud: 'https://appleid.apple.com',
    sub: credentials.clientId,
  });
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemBytes(credentials.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    utf8(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

interface TokenResponse {
  id_token?: unknown;
}

async function tokenResponse(response: Response) {
  if (!response.ok) throw new OAuthProtocolError('token_exchange_failed');
  const payload = await response.json() as TokenResponse;
  if (typeof payload.id_token !== 'string') throw new OAuthProtocolError('token_exchange_failed');
  return payload.id_token;
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
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  if (config.provider === 'google') {
    body.set('client_secret', config.credentials.clientSecret);
    body.set('code_verifier', transaction.verifier);
    const response = await fetcher(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const idToken = await tokenResponse(response);
    return verifyOidcIdToken(idToken, {
      audience: config.credentials.clientId,
      issuers: ['https://accounts.google.com', 'accounts.google.com'],
      jwksUrl: GOOGLE_JWKS_ENDPOINT,
      nonce: transaction.nonce,
      fetcher,
    });
  }

  body.set('client_secret', await createAppleClientSecret(config.credentials));
  const response = await fetcher(APPLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const idToken = await tokenResponse(response);
  return verifyOidcIdToken(idToken, {
    audience: config.credentials.clientId,
    issuers: ['https://appleid.apple.com'],
    jwksUrl: APPLE_JWKS_ENDPOINT,
    nonce: transaction.nonce,
    fetcher,
  });
}

export function identityFromClaims(
  provider: AuthProviderId,
  claims: OidcClaims,
  applePostedName?: string,
) {
  const email = typeof claims.email === 'string' ? claims.email.trim().slice(0, 320) : '';
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (provider === 'google' && (!email || !emailVerified)) {
    throw new OAuthProtocolError('invalid_identity_token');
  }
  if (email && claims.email_verified !== undefined && !emailVerified) {
    throw new OAuthProtocolError('invalid_identity_token');
  }
  const claimedName = provider === 'apple' ? applePostedName : claims.name;
  const displayName = sanitizeExternalName(claimedName) || (provider === 'apple' ? 'Apple member' : 'Google member');
  let avatarUrl: string | undefined;
  if (provider === 'google' && typeof claims.picture === 'string' && claims.picture.length < 2_048) {
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
