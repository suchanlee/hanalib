import {
  isSecureDeployment,
  readAuthBaseConfig,
  readProviderAuthConfig,
  safeReturnTo,
  type AuthEnvSource,
  type AuthProviderId,
} from './config';
import { identityFromClaims, authorizationUrl, exchangeAuthorizationCode } from './oauth';
import {
  clearOAuthTransactionCookie,
  newOAuthTransaction,
  oauthTransactionCookie,
  oauthTransactionFromRequest,
} from './oauth-transaction';
import { provisionAuthenticatedMember } from './member';
import { persistKakaoNotificationCredential } from './kakao-notifications';
import { getD1Database } from '../../db';
import { demoIdentity } from './demo';
import { clearSessionCookie, createSessionToken, isSameOriginMutation, sessionCookie } from './session';
import { operationalLog, requestLogContext, requestLogFields, safeErrorCode, withRequestId } from '../observability/log.ts';
import { readJsonObject } from '../http/json.ts';
import { LibraryError } from '../persistence/errors.ts';

const noStoreHeaders = {
  'cache-control': 'no-store',
  pragma: 'no-cache',
  'referrer-policy': 'no-referrer',
};

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { ...noStoreHeaders, location } });
}

function errorRedirect(publicAppUrl: string, code: string, secure: boolean) {
  const url = new URL('/', publicAppUrl);
  url.searchParams.set('authError', code);
  const response = redirect(url.toString(), 303);
  response.headers.append('set-cookie', clearOAuthTransactionCookie(secure));
  return response;
}

export async function handleOAuthStart(
  request: Request,
  provider: AuthProviderId,
  source: AuthEnvSource = process.env,
) {
  const config = readProviderAuthConfig(provider, source);
  const secure = isSecureDeployment(config);
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('returnTo'));
  const transaction = newOAuthTransaction(provider, returnTo);
  const response = redirect((await authorizationUrl(config, transaction)).toString());
  response.headers.append(
    'set-cookie',
    await oauthTransactionCookie(transaction, config.transactionSecret, secure),
  );
  return response;
}

export interface OAuthCallbackInput {
  code?: string | null;
  state?: string | null;
  error?: string | null;
}

export async function handleOAuthCallback(
  request: Request,
  provider: AuthProviderId,
  input: OAuthCallbackInput,
  source: AuthEnvSource = process.env,
  fetcher: typeof fetch = fetch,
) {
  const logContext = requestLogContext(request);
  const config = readProviderAuthConfig(provider, source);
  const secure = isSecureDeployment(config);
  const transaction = await oauthTransactionFromRequest(
    request,
    config.transactionSecret,
    secure,
  );
  if (
    !transaction ||
    transaction.provider !== provider ||
    !input.state ||
    input.state !== transaction.state
  ) return withRequestId(errorRedirect(config.publicAppUrl, 'invalid_state', secure), logContext);
  if (input.error) return withRequestId(errorRedirect(config.publicAppUrl, 'access_denied', secure), logContext);
  if (!input.code) return withRequestId(errorRedirect(config.publicAppUrl, 'missing_code', secure), logContext);
  try {
    const { claims, tokenSet } = await exchangeAuthorizationCode(config, input.code, transaction, fetcher);
    const identity = identityFromClaims(provider, claims);
    const member = await provisionAuthenticatedMember(identity, config);
    await persistKakaoNotificationCredential(
      getD1Database(),
      member.id,
      identity.providerSubject,
      tokenSet,
      source,
    );
    const token = await createSessionToken({
      profileId: member.id,
      communityId: member.communityId,
      provider,
    }, { secret: config.sessionSecret, secure });
    const response = redirect(new URL(transaction.returnTo, config.publicAppUrl).toString(), 303);
    response.headers.append('set-cookie', sessionCookie(token, secure));
    response.headers.append('set-cookie', clearOAuthTransactionCookie(secure));
    return withRequestId(response, logContext);
  } catch (error) {
    operationalLog('error', 'oauth-callback-failed', requestLogFields(logContext, 503, {
      operation: 'oauth-callback',
      provider,
      errorCode: safeErrorCode(error, 'sign-in-failed'),
    }));
    return withRequestId(errorRedirect(config.publicAppUrl, 'sign_in_failed', secure), logContext);
  }
}

export async function handleLogout(request: Request, source: AuthEnvSource = process.env) {
  const config = readAuthBaseConfig(source);
  if (!isSameOriginMutation(request, config.publicAppUrl)) {
    return Response.json({ error: 'invalid-origin' }, { status: 403, headers: noStoreHeaders });
  }
  const response = Response.json({ ok: true }, { headers: noStoreHeaders });
  response.headers.append('set-cookie', clearSessionCookie(isSecureDeployment(config)));
  return response;
}

export async function handleDemoSignIn(request: Request, source: AuthEnvSource = process.env) {
  const config = readAuthBaseConfig(source);
  if (!config.demoMode) return Response.json({ error: 'not-found' }, { status: 404, headers: noStoreHeaders });
  if (!isSameOriginMutation(request, config.publicAppUrl)) {
    return Response.json({ error: 'invalid-origin' }, { status: 403, headers: noStoreHeaders });
  }
  let requestedPersona: unknown;
  try {
    requestedPersona = (await readJsonObject(request, 1_024)).persona;
  } catch (error) {
    if (error instanceof LibraryError && error.code === 'payload-too-large') {
      return Response.json({ error: 'payload-too-large' }, { status: 413, headers: noStoreHeaders });
    }
    // Existing clients send no body and continue to use the owner persona.
  }
  const member = await provisionAuthenticatedMember(demoIdentity(requestedPersona), config);
  const secure = isSecureDeployment(config);
  const token = await createSessionToken({
    profileId: member.id,
    communityId: member.communityId,
    provider: 'demo',
  }, { secret: config.sessionSecret, secure });
  const response = Response.json({ member }, { headers: noStoreHeaders });
  response.headers.append('set-cookie', sessionCookie(token, secure));
  return response;
}
