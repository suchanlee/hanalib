'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { initialAppState } from '@/lib/domain/seed';
import type {
  AddBookInput,
  BorrowRequest,
  CatalogItem,
  HanaAppActions,
  HanaAppState,
  Loan,
  Member,
} from '@/lib/domain/types';
import type { LibraryBootstrap } from '@/lib/persistence/contracts';

interface HanaContextValue {
  state: HanaAppState;
  actions: HanaAppActions;
}

interface ApiEnvelope<Value> {
  data?: Value;
  error?: { code?: string; message?: string };
}

const HanaContext = createContext<HanaContextValue | null>(null);

const emptyState: HanaAppState = {
  ...initialAppState,
  currentUserId: '',
  members: [],
  items: [],
  requests: [],
  loans: [],
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function apiData<Value>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  if (init?.body) headers.set('content-type', 'application/json');
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers,
  });
  const envelope = await response.json().catch(() => ({})) as ApiEnvelope<Value>;
  if (!response.ok || envelope.data === undefined) {
    throw new ApiError(
      response.status,
      envelope.error?.code ?? 'request-failed',
      envelope.error?.message ?? 'The library service is temporarily unavailable.',
    );
  }
  return envelope.data;
}

function mutationInit(method: 'POST' | 'PATCH' | 'DELETE', body?: object): RequestInit {
  return {
    method,
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: body ? JSON.stringify(body) : undefined,
  };
}

function withBootstrap(current: HanaAppState, bootstrap: LibraryBootstrap): HanaAppState {
  return {
    ...current,
    isAuthenticated: true,
    currentUserId: bootstrap.profile.id,
    locale: bootstrap.profile.locale,
    members: bootstrap.members,
    items: bootstrap.items,
    requests: bootstrap.requests,
    loans: bootstrap.loans,
  };
}

function failureAnnouncement(locale: HanaAppState['locale']) {
  return locale === 'ko'
    ? '저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.'
    : 'We couldn’t save that. Check your connection and try again.';
}

export function HanaAppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HanaAppState>(emptyState);

  const refresh = useCallback(async () => {
    try {
      const bootstrap = await apiData<LibraryBootstrap>('/api/app');
      setState((current) => withBootstrap(current, bootstrap));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState((current) => ({
          ...current,
          isAuthenticated: false,
          currentUserId: '',
          members: [],
          items: [],
          requests: [],
          loans: [],
        }));
      } else {
        setState((current) => ({ ...current, announcement: failureAnnouncement(current.locale) }));
      }
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const actions = useMemo<HanaAppActions>(() => ({
    refresh,
    signOut() {
      setState((current) => ({
        ...current,
        isAuthenticated: false,
        authProvider: undefined,
        currentUserId: '',
        members: [],
        items: [],
        requests: [],
        loans: [],
        screen: 'catalog',
        selectedItemId: undefined,
      }));
    },
    setLocale(locale) {
      setState((current) => ({
        ...current,
        locale,
        members: current.members.map((member) => member.id === current.currentUserId ? { ...member, locale } : member),
      }));
      void apiData<Member>('/api/profile', mutationInit('PATCH', { locale })).catch(() => {
        setState((current) => ({ ...current, announcement: failureAnnouncement(current.locale) }));
      });
    },
    setScreen(screen) {
      setState((current) => ({ ...current, screen }));
    },
    selectItem(itemId) {
      setState((current) => current.items.some((item) => item.id === itemId)
        ? { ...current, selectedItemId: itemId, screen: 'detail' }
        : current);
    },
    setSearchQuery(searchQuery) {
      setState((current) => ({ ...current, searchQuery }));
    },
    setFilters(filters) {
      setState((current) => ({ ...current, filters: { ...current.filters, ...filters } }));
    },
    async addBook(input: AddBookInput) {
      try {
        const item = await apiData<CatalogItem>('/api/catalog', mutationInit('POST', input));
        setState((current) => ({
          ...current,
          items: [item, ...current.items.filter((candidate) => candidate.id !== item.id)],
          selectedItemId: item.id,
          announcement: current.locale === 'ko' ? '도서를 추가했어요.' : 'Book added.',
        }));
        return item.id;
      } catch (error) {
        setState((current) => ({ ...current, announcement: failureAnnouncement(current.locale) }));
        throw error;
      }
    },
    updateItem(itemId, changes) {
      void apiData<CatalogItem>(`/api/catalog/${encodeURIComponent(itemId)}`, mutationInit('PATCH', changes))
        .then((item) => {
          setState((current) => ({
            ...current,
            items: current.items.map((candidate) => candidate.id === item.id ? item : candidate),
            announcement: current.locale === 'ko' ? '도서 정보를 저장했어요.' : 'Book details saved.',
          }));
        })
        .catch(() => setState((current) => ({ ...current, announcement: failureAnnouncement(current.locale) })));
    },
    archiveItem(itemId) {
      void apiData<{ id: string; archived: boolean }>(`/api/catalog/${encodeURIComponent(itemId)}`, mutationInit('DELETE'))
        .then(() => {
          setState((current) => ({
            ...current,
            items: current.items.filter((candidate) => candidate.id !== itemId),
            screen: 'catalog',
            selectedItemId: undefined,
            announcement: current.locale === 'ko' ? '도서를 목록에서 삭제했어요.' : 'Book removed from the catalog.',
          }));
        })
        .catch(() => setState((current) => ({ ...current, announcement: failureAnnouncement(current.locale) })));
    },
    requestBorrow(itemId) {
      void apiData<BorrowRequest>('/api/borrow-requests', mutationInit('POST', { itemId }))
        .then((request) => {
          setState((current) => ({
            ...current,
            requests: [request, ...current.requests.filter((candidate) => candidate.id !== request.id)],
            announcement: current.locale === 'ko' ? '소유자에게 대여 요청을 보냈어요.' : 'Borrow request sent to the owner.',
          }));
        })
        .catch(() => setState((current) => ({ ...current, announcement: failureAnnouncement(current.locale) })));
    },
    cancelRequest(requestId) {
      void apiData<BorrowRequest>(`/api/borrow-requests/${encodeURIComponent(requestId)}`, mutationInit('DELETE'))
        .then((request) => {
          setState((current) => ({
            ...current,
            requests: current.requests.map((candidate) => candidate.id === request.id ? request : candidate),
            announcement: current.locale === 'ko' ? '요청을 취소했어요.' : 'Request canceled.',
          }));
        })
        .catch(() => setState((current) => ({ ...current, announcement: failureAnnouncement(current.locale) })));
    },
    respondToRequest(requestId, decision) {
      void apiData<{ request: BorrowRequest; loan?: Loan }>(
        `/api/borrow-requests/${encodeURIComponent(requestId)}`,
        mutationInit('PATCH', { decision }),
      ).then(refresh)
        .then(() => {
          setState((current) => ({
            ...current,
            announcement: decision === 'accepted'
              ? current.locale === 'ko' ? '요청을 수락하고 대여를 시작했어요.' : 'Request accepted and loan started.'
              : current.locale === 'ko' ? '요청을 거절했어요.' : 'Request declined.',
          }));
        })
        .catch(() => setState((current) => ({ ...current, announcement: failureAnnouncement(current.locale) })));
    },
    markReturned(loanId) {
      void apiData<Loan>(`/api/loans/${encodeURIComponent(loanId)}/return`, mutationInit('POST'))
        .then(refresh)
        .then(() => setState((current) => ({
          ...current,
          announcement: current.locale === 'ko' ? '반납을 기록했어요.' : 'Return recorded.',
        })))
        .catch(() => setState((current) => ({ ...current, announcement: failureAnnouncement(current.locale) })));
    },
    updateProfile(changes) {
      void apiData<Member>('/api/profile', mutationInit('PATCH', changes))
        .then((member) => {
          setState((current) => ({
            ...current,
            locale: member.locale,
            members: current.members.map((candidate) => candidate.id === member.id ? member : candidate),
            announcement: current.locale === 'ko' ? '설정을 저장했어요.' : 'Settings saved.',
          }));
        })
        .catch(() => setState((current) => ({ ...current, announcement: failureAnnouncement(current.locale) })));
    },
  }), [refresh]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <HanaContext.Provider value={value}>{children}</HanaContext.Provider>;
}

export function useHanaApp() {
  const value = useContext(HanaContext);
  if (!value) throw new Error('useHanaApp must be used inside HanaAppProvider');
  return value;
}
