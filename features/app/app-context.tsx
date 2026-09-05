'use client';

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, apiData, requestJson } from '@/lib/http/client';
import { userIssue } from './user-issue';
import { HanaContext } from './hana-context';
import { initialAppState } from '@/lib/domain/seed';
import type {
  AddBookInput,
  BorrowRequest,
  CatalogItem,
  Hold,
  HanaAppActions,
  HanaAppState,
  AppScreen,
  Loan,
  Member,
} from '@/lib/domain/types';
import type { LibraryBootstrap, LibraryItemDetail } from '@/lib/persistence/contracts';
import {
  APP_HISTORY_STATE_KEY,
  appHref,
  appRouteFromLocation,
  sameAppRoute,
  type AppRoute,
} from './app-history';

const emptyState: HanaAppState = {
  ...initialAppState,
  currentUserId: '',
  members: [],
  items: [],
  requests: [],
  loans: [],
  holds: [],
  holdCounts: {},
  returnChecks: [],
};

function mutationInit(
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: object,
): RequestInit {
  return {
    method,
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: body ? JSON.stringify(body) : undefined,
  };
}

function withBootstrap(
  current: HanaAppState,
  bootstrap: LibraryBootstrap,
): HanaAppState {
  return {
    ...current,
    isAuthenticated: true,
    loadStatus: 'ready',
    issue: undefined,
    currentUserId: bootstrap.profile.id,
    locale: bootstrap.profile.locale,
    members: bootstrap.members,
    items: bootstrap.items,
    requests: bootstrap.requests,
    loans: bootstrap.loans,
    holds: bootstrap.holds,
    holdCounts: bootstrap.holdCounts,
    returnChecks: bootstrap.returnChecks,
  };
}

function browserRoute() {
  if (typeof window === 'undefined') return undefined;
  return appRouteFromLocation(window.location.pathname, window.location.search);
}

function writeBrowserRoute(route: AppRoute, mode: 'push' | 'replace' = 'push') {
  if (typeof window === 'undefined' || sameAppRoute(browserRoute(), route))
    return;
  const currentState =
    window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {};
  window.history[`${mode}State`](
    { ...currentState, [APP_HISTORY_STATE_KEY]: true },
    '',
    appHref(route.screen, route.selectedItemId),
  );
}

export function HanaAppProvider({
  children,
  initialScreen = 'catalog',
}: {
  children: ReactNode;
  initialScreen?: AppScreen;
}) {
  const [state, setState] = useState<HanaAppState>(() => {
    const route = browserRoute();
    return {
      ...emptyState,
      screen: route?.screen ?? initialScreen,
      selectedItemId: route?.selectedItemId,
    };
  });
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const refreshVersion = useRef(0);
  const mutating = useRef(false);
  const reportError = useCallback((error: unknown, operation = 'app') => {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      operation !== 'sign-out'
    ) {
      refreshVersion.current += 1;
      setState((current) => ({
        ...emptyState,
        locale: current.locale,
        loadStatus: 'ready',
        issue: userIssue(error, operation),
      }));
    } else {
      setState((current) => ({
        ...current,
        announcement: undefined,
        issue: userIssue(error, operation),
      }));
    }
  }, []);

  useEffect(() => {
    function unexpectedRejection(event: PromiseRejectionEvent) {
      reportError(event.reason, 'unhandled-promise');
    }
    function unexpectedError(event: ErrorEvent) {
      // Resource errors (for example a cover image fallback) have no exception.
      if (event.error) reportError(event.error, 'browser-event');
    }
    window.addEventListener('unhandledrejection', unexpectedRejection);
    window.addEventListener('error', unexpectedError);
    return () => {
      window.removeEventListener('unhandledrejection', unexpectedRejection);
      window.removeEventListener('error', unexpectedError);
    };
  }, [reportError]);

  const refresh = useCallback(async (background = false) => {
    const version = ++refreshVersion.current;
    try {
      const bootstrap = await apiData<LibraryBootstrap>('/api/app', {
        cache: 'no-store',
      });
      if (version === refreshVersion.current)
        setState((current) => ({
          ...withBootstrap(current, bootstrap),
          issue: background ? current.issue : undefined,
        }));
    } catch (error) {
      if (version !== refreshVersion.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setState((current) => ({
          ...emptyState,
          locale: current.locale,
          loadStatus: 'ready',
          issue: current.isAuthenticated
            ? userIssue(error, 'load-library')
            : current.issue,
        }));
      } else if (background) {
        // A transient background failure should not interrupt the current task.
        return;
      } else {
        setState((current) => ({
          ...current,
          loadStatus: 'error',
          announcement: undefined,
          issue: userIssue(error, 'load-library'),
        }));
      }
      throw error;
    }
  }, []);

  const backgroundRefreshing = useRef(false);
  const refreshInBackground = useCallback(() => {
    if (
      !stateRef.current.isAuthenticated ||
      document.visibilityState !== 'visible' ||
      !navigator.onLine ||
      mutating.current ||
      backgroundRefreshing.current
    )
      return;
    backgroundRefreshing.current = true;
    void refresh(true)
      .catch(() => {
        /* refresh handles expired sessions */
      })
      .finally(() => {
        backgroundRefreshing.current = false;
      });
  }, [refresh]);

  const itemRefreshVersion = useRef(0);
  const refreshItemInBackground = useCallback((itemId: string) => {
    if (
      !stateRef.current.isAuthenticated ||
      document.visibilityState !== 'visible' ||
      !navigator.onLine ||
      mutating.current
    )
      return;
    const itemVersion = ++itemRefreshVersion.current;
    const appVersion = refreshVersion.current;
    void apiData<LibraryItemDetail>(
      `/api/catalog/${encodeURIComponent(itemId)}`,
      { cache: 'no-store' },
    )
      .then((detail) => {
        if (
          itemVersion !== itemRefreshVersion.current ||
          appVersion !== refreshVersion.current ||
          stateRef.current.selectedItemId !== itemId
        )
          return;
        setState((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === itemId ? detail.item : item,
          ),
          requests: [
            ...current.requests.filter(
              (request) => request.catalogItemId !== itemId,
            ),
            ...detail.requests,
          ],
          loans: [
            ...current.loans.filter((loan) => loan.catalogItemId !== itemId),
            ...detail.loans,
          ],
          holds: [
            ...current.holds.filter((hold) => hold.catalogItemId !== itemId),
            ...detail.holds,
          ],
          holdCounts: { ...current.holdCounts, [itemId]: detail.holdCount },
        }));
      })
      .catch((error) => {
        if (
          itemVersion !== itemRefreshVersion.current ||
          appVersion !== refreshVersion.current
        )
          return;
        if (error instanceof ApiError && error.status === 401) {
          reportError(error, 'refresh-book');
        } else if (error instanceof ApiError && error.status === 404) {
          setState((current) => ({
            ...current,
            items: current.items.filter((item) => item.id !== itemId),
            requests: current.requests.filter(
              (request) => request.catalogItemId !== itemId,
            ),
            loans: current.loans.filter((loan) => loan.catalogItemId !== itemId),
            holds: current.holds.filter((hold) => hold.catalogItemId !== itemId),
            holdCounts: Object.fromEntries(
              Object.entries(current.holdCounts).filter(([id]) => id !== itemId),
            ),
          }));
        }
        // Other background failures leave the last usable snapshot in place.
      });
  }, [reportError]);

  useEffect(() => {
    if (!state.isAuthenticated) return;
    const serviceWorker = navigator.serviceWorker;
    function onMessage(event: MessageEvent) {
      if (event.data?.type === 'library-updated') refreshInBackground();
    }
    window.addEventListener('focus', refreshInBackground);
    window.addEventListener('pageshow', refreshInBackground);
    window.addEventListener('online', refreshInBackground);
    document.addEventListener('visibilitychange', refreshInBackground);
    serviceWorker?.addEventListener('message', onMessage);
    const interval = window.setInterval(refreshInBackground, 30_000);
    return () => {
      window.removeEventListener('focus', refreshInBackground);
      window.removeEventListener('pageshow', refreshInBackground);
      window.removeEventListener('online', refreshInBackground);
      document.removeEventListener('visibilitychange', refreshInBackground);
      serviceWorker?.removeEventListener('message', onMessage);
      window.clearInterval(interval);
    };
  }, [state.isAuthenticated, refreshInBackground]);

  const previousRoute = useRef({
    screen: state.screen,
    selectedItemId: state.selectedItemId,
  });
  useEffect(() => {
    const route = {
      screen: state.screen,
      selectedItemId: state.selectedItemId,
    };
    if (!sameAppRoute(previousRoute.current, route)) {
      if (route.screen === 'detail' && route.selectedItemId) {
        refreshItemInBackground(route.selectedItemId);
      } else {
        refreshInBackground();
      }
    }
    previousRoute.current = route;
  }, [
    state.screen,
    state.selectedItemId,
    refreshInBackground,
    refreshItemInBackground,
  ]);

  const syncAfterMutation = useCallback(async () => {
    try {
      await refresh();
    } catch (error) {
      throw new ApiError(
        error instanceof ApiError ? error.status : 0,
        'sync-failed',
        error instanceof ApiError ? error.requestId : undefined,
      );
    }
  }, [refresh]);

  const perform = useCallback(
    async <T,>(operation: string, work: () => Promise<T>): Promise<T> => {
      if (mutating.current) throw new ApiError(409, 'action-in-progress');
      mutating.current = true;
      // An older read must not overwrite the result of this mutation.
      refreshVersion.current += 1;
      setState((current) => ({
        ...current,
        isMutating: true,
        issue: undefined,
        announcement: undefined,
      }));
      try {
        return await work();
      } catch (error) {
        reportError(error, operation);
        throw error;
      } finally {
        mutating.current = false;
        setState((current) => ({ ...current, isMutating: false }));
      }
    },
    [reportError],
  );

  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch(() => {
        /* refresh already surfaces the failure */
      });
    return () => {
      refreshVersion.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    function restoreBrowserRoute() {
      const route = browserRoute();
      if (!route) return;
      setState((current) =>
        sameAppRoute(
          { screen: current.screen, selectedItemId: current.selectedItemId },
          route,
        )
          ? current
          : {
              ...current,
              screen: route.screen,
              selectedItemId: route.selectedItemId,
            },
      );
    }

    window.addEventListener('popstate', restoreBrowserRoute);
    return () => window.removeEventListener('popstate', restoreBrowserRoute);
  }, []);

  const actions = useMemo<HanaAppActions>(
    () => ({
      refresh,
      reportError,
      dismissIssue() {
        setState((current) => ({ ...current, issue: undefined }));
      },
      signOut: () =>
        perform('sign-out', async () => {
          await requestJson<{ ok?: boolean }>(
            '/api/auth/logout',
            { method: 'POST' },
            (result) => result.ok === true,
          );
          refreshVersion.current += 1;
          writeBrowserRoute({ screen: 'catalog' }, 'replace');
          setState((current) => ({
            ...emptyState,
            locale: current.locale,
            loadStatus: 'ready',
            screen: 'catalog',
          }));
        }),
      setLocale(locale) {
        if (!stateRef.current.isAuthenticated) {
          setState((current) => ({ ...current, locale }));
          return;
        }
        return perform('change-language', async () => {
          const member = await apiData<Member>(
            '/api/profile',
            mutationInit('PATCH', { locale }),
          );
          setState((current) => ({
            ...current,
            locale: member.locale,
            members: current.members.map((candidate) =>
              candidate.id === member.id ? member : candidate,
            ),
          }));
        }).catch(() => {
          /* perform already surfaces the failure */
        });
      },
      setScreen(screen) {
        const selectedItemId =
          screen === 'detail' ? stateRef.current.selectedItemId : undefined;
        writeBrowserRoute({ screen, selectedItemId });
        setState((current) => ({ ...current, screen, selectedItemId }));
      },
      selectItem(itemId) {
        if (!stateRef.current.items.some((item) => item.id === itemId)) return;
        writeBrowserRoute({ screen: 'detail', selectedItemId: itemId });
        setState((current) => ({
          ...current,
          selectedItemId: itemId,
          screen: 'detail',
        }));
      },
      setSearchQuery(searchQuery) {
        setState((current) => ({ ...current, searchQuery }));
      },
      setFilters(filters) {
        setState((current) => ({
          ...current,
          filters: { ...current.filters, ...filters },
        }));
      },
      addBook: (input: AddBookInput) =>
        perform('add-book', async () => {
          const item = await apiData<CatalogItem>(
            '/api/catalog',
            mutationInit('POST', input),
          );
          setState((current) => ({
            ...current,
            items: [
              item,
              ...current.items.filter((candidate) => candidate.id !== item.id),
            ],
            selectedItemId: item.id,
            announcement:
              current.locale === 'ko' ? '도서를 추가했어요.' : 'Book added.',
          }));
          return item.id;
        }),
      updateItem: (itemId, changes) =>
        perform('edit-book', async () => {
          const item = await apiData<CatalogItem>(
            `/api/catalog/${encodeURIComponent(itemId)}`,
            mutationInit('PATCH', changes),
          );
          setState((current) => ({
            ...current,
            items: current.items.map((candidate) =>
              candidate.id === item.id ? item : candidate,
            ),
            announcement:
              current.locale === 'ko'
                ? '도서 정보를 저장했어요.'
                : 'Book details saved.',
          }));
          return item;
        }),
      refreshItemCover: (itemId) =>
        perform('refresh-cover', async () => {
          const item = await apiData<CatalogItem>(
            `/api/catalog/${encodeURIComponent(itemId)}/cover/refresh`,
            mutationInit('POST'),
          );
          setState((current) => ({
            ...current,
            items: current.items.map((candidate) =>
              candidate.id === item.id ? item : candidate,
            ),
            announcement:
              current.locale === 'ko'
                ? '더 선명한 온라인 표지를 찾았어요.'
                : 'Found a sharper online cover.',
          }));
          return item;
        }),
      archiveItem: (itemId) =>
        perform('remove-book', async () => {
          await apiData(
            `/api/catalog/${encodeURIComponent(itemId)}`,
            mutationInit('DELETE'),
          );
          writeBrowserRoute({ screen: 'catalog' }, 'replace');
          setState((current) => ({
            ...current,
            items: current.items.filter((candidate) => candidate.id !== itemId),
            screen: 'catalog',
            selectedItemId: undefined,
            announcement:
              current.locale === 'ko'
                ? '도서를 목록에서 삭제했어요.'
                : 'Book removed from the catalog.',
          }));
        }),
      requestBorrow: (itemId) =>
        perform('request-book', async () => {
          const request = await apiData<BorrowRequest>(
            '/api/borrow-requests',
            mutationInit('POST', { itemId }),
          );
          setState((current) => ({
            ...current,
            requests: [
              request,
              ...current.requests.filter(
                (candidate) => candidate.id !== request.id,
              ),
            ],
            announcement:
              current.locale === 'ko'
                ? '소유자에게 대여 요청을 보냈어요.'
                : 'Borrow request sent to the owner.',
          }));
          return request;
        }),
      cancelRequest: (requestId) =>
        perform('cancel-request', async () => {
          const request = await apiData<BorrowRequest>(
            `/api/borrow-requests/${encodeURIComponent(requestId)}`,
            mutationInit('DELETE'),
          );
          setState((current) => ({
            ...current,
            requests: current.requests.map((candidate) =>
              candidate.id === request.id ? request : candidate,
            ),
            announcement:
              current.locale === 'ko'
                ? '요청을 취소했어요.'
                : 'Request canceled.',
          }));
        }),
      respondToRequest: (requestId, decision) =>
        perform('respond-to-request', async () => {
          await apiData(
            `/api/borrow-requests/${encodeURIComponent(requestId)}`,
            mutationInit('PATCH', { decision }),
          );
          await syncAfterMutation();
          setState((current) => ({
            ...current,
            announcement:
              decision === 'accepted'
                ? current.locale === 'ko'
                  ? '요청을 수락하고 대여를 시작했어요.'
                  : 'Request accepted and loan started.'
                : current.locale === 'ko'
                  ? '요청을 거절했어요.'
                  : 'Request declined.',
          }));
        }),
      markReturned: (loanId) =>
        perform('return-book', async () => {
          await apiData<Loan>(
            `/api/loans/${encodeURIComponent(loanId)}/return`,
            mutationInit('POST'),
          );
          await syncAfterMutation();
          setState((current) => ({
            ...current,
            announcement:
              current.locale === 'ko'
                ? '반납을 기록했어요.'
                : 'Return recorded.',
          }));
        }),
      joinHold: (itemId) =>
        perform('join-waitlist', async () => {
          const hold = await apiData<Hold>(
            '/api/holds',
            mutationInit('POST', { itemId }),
          );
          await syncAfterMutation();
          setState((current) => ({
            ...current,
            announcement:
              current.locale === 'ko'
                ? '대기 목록에 등록했어요.'
                : 'You joined the waitlist.',
          }));
          return hold;
        }),
      cancelHold: (holdId) =>
        perform('leave-waitlist', async () => {
          await apiData(
            `/api/holds/${encodeURIComponent(holdId)}`,
            mutationInit('DELETE'),
          );
          await syncAfterMutation();
          setState((current) => ({
            ...current,
            announcement:
              current.locale === 'ko'
                ? '대기 목록에서 나왔어요.'
                : 'You left the waitlist.',
          }));
        }),
      claimHold: (holdId) =>
        perform('claim-hold', async () => {
          const request = await apiData<BorrowRequest>(
            `/api/holds/${encodeURIComponent(holdId)}/claim`,
            mutationInit('POST'),
          );
          await syncAfterMutation();
          setState((current) => ({
            ...current,
            announcement:
              current.locale === 'ko'
                ? '소유자에게 대여 요청을 보냈어요.'
                : 'Borrow request sent to the owner.',
          }));
          return request;
        }),
      respondToReturnCheck: (checkId, returned) =>
        perform('answer-return-check', async () => {
          await apiData(
            `/api/return-checks/${encodeURIComponent(checkId)}`,
            mutationInit('POST', { returned }),
          );
          await syncAfterMutation();
          setState((current) => ({
            ...current,
            announcement: returned
              ? current.locale === 'ko'
                ? '반납을 기록했어요.'
                : 'Return recorded.'
              : current.locale === 'ko'
                ? '아직 대여 중으로 기록했어요.'
                : 'Recorded as still borrowing.',
          }));
        }),
      requestEmailVerification: (email) =>
        perform('verify-email', async () => {
          await apiData<{ sent: boolean }>(
            '/api/profile/email-verification',
            mutationInit('POST', { email }),
          );
          setState((current) => ({
            ...current,
            announcement:
              current.locale === 'ko'
                ? '인증 메일을 보냈어요.'
                : 'Verification email sent.',
          }));
        }),
      updateProfile: (changes) =>
        perform('save-settings', async () => {
          const member = await apiData<Member>(
            '/api/profile',
            mutationInit('PATCH', changes),
          );
          setState((current) => ({
            ...current,
            locale: member.locale,
            members: current.members.map((candidate) =>
              candidate.id === member.id ? member : candidate,
            ),
            announcement:
              current.locale === 'ko'
                ? '설정을 저장했어요.'
                : 'Settings saved.',
          }));
          return member;
        }),
    }),
    [refresh, reportError, perform, syncAfterMutation],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <HanaContext.Provider value={value}>{children}</HanaContext.Provider>;
}

export function useHanaApp() {
  const value = useContext(HanaContext);
  if (!value) throw new Error('useHanaApp must be used inside HanaAppProvider');
  return value;
}
