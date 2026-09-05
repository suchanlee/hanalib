import type { AppLocale, UserIssue } from '../../lib/domain/types.ts';
import { ApiError } from '../../lib/http/client.ts';
import {
  errorType,
  sourceLocations,
} from '../../lib/observability/client-diagnostic.ts';

export type { UserIssue } from '../../lib/domain/types.ts';

const traces = new WeakMap<object, string>();

export function userIssue(error: unknown, operation = 'app'): UserIssue {
  const object =
    error !== null && (typeof error === 'object' || typeof error === 'function')
      ? error
      : undefined;
  const traceId =
    (object && traces.get(object)) || `client-${crypto.randomUUID()}`;
  if (object) traces.set(object, traceId);
  return {
    traceId,
    errorType: errorType(error),
    sourceLocations: sourceLocations(error),
    serverDigest:
      error instanceof Error &&
      'digest' in error &&
      typeof error.digest === 'string' &&
      /^[a-z0-9-]{1,80}$/i.test(error.digest)
        ? error.digest
        : undefined,
    code: error instanceof ApiError ? error.code : 'unexpected-error',
    status: error instanceof ApiError ? error.status : 0,
    requestId: error instanceof ApiError ? error.requestId : undefined,
    operation: /^[a-z-]{1,60}$/.test(operation) ? operation : 'app',
    occurredAt: new Date().toISOString(),
  };
}

export function issueMessage(issue: UserIssue, locale: AppLocale) {
  const ko = locale === 'ko';
  if (issue.operation === 'sign-out')
    return ko
      ? '로그아웃을 확인하지 못했어요. 아직 로그인되어 있을 수 있어요. 연결을 확인하고 로그아웃을 다시 눌러 주세요.'
      : 'We couldn’t confirm sign-out. You may still be signed in. Check your connection and try signing out again.';
  if (issue.code === 'sync-failed')
    return ko
      ? '변경사항은 저장했지만 최신 목록을 불러오지 못했어요. 같은 작업을 반복하지 말고 새로고침해 주세요.'
      : 'Your change was saved, but we couldn’t load the updated list. Refresh the list instead of repeating the action.';
  if (issue.status === 401)
    return ko
      ? '로그인이 만료됐어요. 다시 로그인해 주세요.'
      : 'Your session has expired. Please sign in again.';
  if (issue.code === 'access_denied')
    return ko
      ? '로그인을 취소했어요. 계속하려면 다시 로그인해 주세요.'
      : 'Sign-in was canceled. Sign in again when you’re ready.';
  if (['invalid_state', 'missing_code'].includes(issue.code))
    return ko
      ? '로그인 연결이 만료됐어요. 로그인 방법을 다시 선택해 주세요.'
      : 'The sign-in link expired. Select a sign-in option to try again.';
  if (issue.operation === 'sign-in')
    return ko
      ? '로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요. 계속 실패하면 아래 오류 정보를 운영자에게 보내 주세요.'
      : 'We couldn’t complete sign-in. Try again shortly. If it keeps failing, send the details below to the library organizer.';
  if (issue.operation === 'book-lookup')
    return ko
      ? '도서 정보를 불러오지 못했어요. ISBN을 확인하고 다시 검색하거나 직접 입력해 주세요.'
      : 'We couldn’t load the book details. Check the ISBN and search again, or enter the details manually.';
  if (issue.operation === 'notification-settings' && issue.status !== 429)
    return ko
      ? '알림 설정을 확인하지 못했어요. 이 페이지를 다시 열고 설정을 확인해 주세요. 계속 실패하면 아래 오류 정보를 보내 주세요.'
      : 'We couldn’t confirm your notification settings. Reopen this page and check their current state. If it keeps failing, send the details below.';
  if (issue.status === 403)
    return ko
      ? '이 작업을 할 권한이 없어요. 올바른 계정인지 확인하거나 운영자에게 문의해 주세요.'
      : 'This account cannot perform that action. Check your account or contact the library organizer.';
  if (issue.status === 409 || issue.status === 404)
    return ko
      ? '이 도서나 요청의 상태가 변경됐어요. 최신 목록을 불러온 뒤 다시 확인해 주세요.'
      : 'This book or request has changed or is no longer available. Refresh the list and check its current status.';
  if (issue.status === 429)
    return ko
      ? '요청 한도에 도달했어요. 잠시 기다린 후 다시 시도해 주세요. 계속되면 운영자에게 문의해 주세요.'
      : 'You’ve reached a request limit. Wait before trying again. Contact the organizer if this continues.';
  if (issue.status === 413)
    return ko
      ? '파일이나 입력 내용이 너무 커요. 더 작은 파일이나 짧은 내용을 사용해 주세요.'
      : 'The file or input is too large. Use a smaller file or shorten the input.';
  if (issue.status === 400 || issue.status === 415)
    return ko
      ? '입력 내용이나 파일 형식을 확인하고 다시 시도해 주세요. 계속 실패하면 아래 오류 정보를 보내 주세요.'
      : 'Check the entered details or file format and try again. If it still fails, send the details below.';
  if (issue.operation === 'load-library')
    return ko
      ? '도서관을 불러오지 못했어요. 연결을 확인하고 다시 불러와 주세요.'
      : 'We couldn’t load the library. Check your connection and try loading it again.';
  if (issue.operation === 'sign-in-options')
    return ko
      ? '로그인 옵션을 불러오지 못했어요. 연결을 확인하고 로그인 옵션을 다시 불러와 주세요.'
      : 'We couldn’t load sign-in options. Check your connection and reload the sign-in options.';
  return ko
    ? '작업 결과를 확인하지 못했어요. 연결을 확인하고 최신 상태를 불러온 뒤 다시 시도해 주세요. 계속 실패하면 아래 오류 정보를 운영자에게 보내 주세요.'
    : 'We couldn’t confirm the result. Check your connection and refresh the current state before trying again. If it keeps failing, send the details below to the library organizer.';
}

export function issueDetails(issue: UserIssue) {
  return [
    'Hana library',
    `Trace: ${issue.traceId}`,
    `Operation: ${issue.operation}`,
    `Code: ${issue.code}`,
    `Error type: ${issue.errorType}`,
    `Status: ${issue.status || 'no HTTP response'}`,
    `Request: ${issue.requestId ?? 'none (browser error or no server response)'}`,
    ...(issue.serverDigest ? [`Server digest: ${issue.serverDigest}`] : []),
    `Time: ${issue.occurredAt}`,
    `Source locations: ${issue.sourceLocations.length ? '\n' + issue.sourceLocations.join('\n') : 'not supplied by the browser'}`,
  ].join('\n');
}
