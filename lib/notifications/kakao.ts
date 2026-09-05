import type { StoredKakaoCredential } from '../auth/kakao-notifications.ts';
import type { NotificationTemplate } from './templates.ts';

const KAKAO_TOKEN_ENDPOINT = 'https://kauth.kakao.com/oauth/token';
const KAKAO_SELF_MESSAGE_ENDPOINT = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';

interface KakaoClientConfig {
  kakaoRestApiKey?: string;
  kakaoClientSecret?: string;
}

function boundedToken(value: unknown) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 8_192 ? value : undefined;
}

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function parseKakaoCredential(value: string): StoredKakaoCredential {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('invalid-kakao-credential');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('invalid-kakao-credential');
  const candidate = parsed as Record<string, unknown>;
  const accessToken = boundedToken(candidate.accessToken);
  const refreshToken = boundedToken(candidate.refreshToken);
  const accessExpiresAt = positiveInteger(candidate.accessExpiresAt);
  const refreshExpiresAt = positiveInteger(candidate.refreshExpiresAt);
  if (
    candidate.version !== 1 || !accessToken || !refreshToken || !accessExpiresAt || !refreshExpiresAt ||
    !Array.isArray(candidate.scopes) || !candidate.scopes.every((scope) => typeof scope === 'string' && scope.length <= 100) ||
    !candidate.scopes.includes('talk_message')
  ) throw new Error('invalid-kakao-credential');
  return {
    version: 1,
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    scopes: candidate.scopes,
  };
}

export async function refreshKakaoCredential(
  config: KakaoClientConfig,
  credential: StoredKakaoCredential,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  if (!config.kakaoRestApiKey || !config.kakaoClientSecret) {
    throw new Error('Kakao message delivery is not configured.');
  }
  if (credential.refreshExpiresAt <= now) throw new Error('kakao-refresh-token-expired');
  const response = await fetcher(KAKAO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.kakaoRestApiKey,
      client_secret: config.kakaoClientSecret,
      refresh_token: credential.refreshToken,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`kakao-token-refresh-failed-${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const accessToken = boundedToken(payload.access_token);
  const expiresIn = positiveInteger(payload.expires_in);
  if (!accessToken || !expiresIn) throw new Error('invalid-kakao-token-refresh');
  const refreshedToken = payload.refresh_token === undefined
    ? credential.refreshToken
    : boundedToken(payload.refresh_token);
  if (!refreshedToken) throw new Error('invalid-kakao-token-refresh');
  const refreshedExpiry = payload.refresh_token_expires_in === undefined
    ? credential.refreshExpiresAt
    : positiveInteger(payload.refresh_token_expires_in);
  if (!refreshedExpiry) throw new Error('invalid-kakao-token-refresh');
  return {
    ...credential,
    accessToken,
    refreshToken: refreshedToken,
    accessExpiresAt: now + expiresIn * 1_000,
    refreshExpiresAt: payload.refresh_token_expires_in === undefined
      ? refreshedExpiry
      : now + refreshedExpiry * 1_000,
  } satisfies StoredKakaoCredential;
}

function actionUrl(value: string, appOrigin: string) {
  const parsed = new URL(value, appOrigin);
  if (parsed.origin !== appOrigin || !['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('invalid-kakao-message-action');
  }
  return parsed.toString();
}

export async function sendKakaoSelfMessage(
  accessToken: string,
  publicAppUrl: string,
  message: NotificationTemplate,
  fetcher: typeof fetch = fetch,
) {
  const token = boundedToken(accessToken);
  if (!token) throw new Error('invalid-kakao-access-token');
  const appOrigin = new URL(publicAppUrl).origin;
  const rootUrl = `${appOrigin}/`;
  const templateObject = {
    object_type: 'text',
    text: message.text.slice(0, 200),
    link: { web_url: rootUrl, mobile_web_url: rootUrl },
    buttons: message.actions?.slice(0, 2).map((action) => {
      const url = actionUrl(action.url, appOrigin);
      return {
        title: action.label.slice(0, 14),
        link: { web_url: url, mobile_web_url: url },
      };
    }),
  };
  const response = await fetcher(KAKAO_SELF_MESSAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`kakao-message-delivery-failed-${response.status}`);
  const result = await response.json() as { result_code?: unknown };
  if (result.result_code !== 0) throw new Error('kakao-message-delivery-rejected');
  return { channel: 'kakao' as const, providerMessageId: `kakao-self-${crypto.randomUUID()}` };
}
