'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { initialAppState } from '@/lib/domain/seed';
import type { AddBookInput, HanaAppActions, HanaAppState } from '@/lib/domain/types';

interface HanaContextValue {
  state: HanaAppState;
  actions: HanaAppActions;
}

const HanaContext = createContext<HanaContextValue | null>(null);

function newId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export function HanaAppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HanaAppState>(initialAppState);

  const actions = useMemo<HanaAppActions>(() => ({
    signIn(provider) {
      setState((current) => ({ ...current, isAuthenticated: true, authProvider: provider, screen: 'catalog', announcement: current.locale === 'ko' ? '로그인했어요.' : 'Signed in.' }));
    },
    signOut() {
      setState((current) => ({ ...current, isAuthenticated: false, authProvider: undefined, screen: 'catalog', selectedItemId: undefined }));
    },
    switchDemoUser(userId) {
      setState((current) => current.members.some((member) => member.id === userId)
        ? { ...current, currentUserId: userId, screen: 'catalog', selectedItemId: undefined, announcement: current.locale === 'ko' ? '테스트 사용자를 변경했어요.' : 'Demo user changed.' }
        : current);
    },
    setLocale(locale) {
      setState((current) => ({
        ...current,
        locale,
        members: current.members.map((member) => member.id === current.currentUserId ? { ...member, locale } : member),
      }));
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
    addBook(input: AddBookInput) {
      const itemId = newId('item');
      setState((current) => ({
        ...current,
        items: [{
          id: itemId,
          ownerId: current.currentUserId,
          status: 'available',
          condition: input.condition,
          ownerNotes: input.ownerNotes,
          createdAt: new Date().toISOString(),
          edition: {
            id: newId('edition'),
            isbn13: input.isbn13,
            title: input.title,
            titleEn: input.titleEn,
            authors: input.authors,
            publisher: input.publisher,
            publishedYear: input.publishedYear,
            language: input.language,
            pageCount: input.pageCount,
            coverUrl: input.coverUrl,
            coverTone: 'blue',
            provenance: input.provenance,
          },
        }, ...current.items],
        selectedItemId: itemId,
        screen: 'detail',
        announcement: current.locale === 'ko' ? '도서를 추가했어요.' : 'Book added.',
      }));
      return itemId;
    },
    updateItem(itemId, changes) {
      setState((current) => ({
        ...current,
        items: current.items.map((item) => item.id === itemId && item.ownerId === current.currentUserId ? { ...item, ...changes } : item),
        announcement: current.locale === 'ko' ? '도서 정보를 저장했어요.' : 'Book details saved.',
      }));
    },
    archiveItem(itemId) {
      setState((current) => {
        const item = current.items.find((candidate) => candidate.id === itemId);
        if (!item || item.ownerId !== current.currentUserId || item.status === 'borrowed') return current;
        return {
          ...current,
          items: current.items.map((candidate) => candidate.id === itemId ? { ...candidate, status: 'archived' } : candidate),
          screen: 'catalog',
          selectedItemId: undefined,
          announcement: current.locale === 'ko' ? '도서를 목록에서 삭제했어요.' : 'Book removed from the catalog.',
        };
      });
    },
    requestBorrow(itemId) {
      setState((current) => {
        const item = current.items.find((candidate) => candidate.id === itemId);
        const alreadyPending = current.requests.some((request) => request.catalogItemId === itemId && request.requesterId === current.currentUserId && request.status === 'pending');
        if (!item || item.status !== 'available' || item.ownerId === current.currentUserId || alreadyPending) return current;
        const requestedAt = new Date();
        return {
          ...current,
          requests: [...current.requests, {
            id: newId('request'),
            catalogItemId: itemId,
            requesterId: current.currentUserId,
            status: 'pending',
            requestedAt: requestedAt.toISOString(),
            expiresAt: new Date(requestedAt.getTime() + 48 * 3_600_000).toISOString(),
          }],
          announcement: current.locale === 'ko' ? '소유자에게 대여 요청을 보냈어요.' : 'Borrow request sent to the owner.',
        };
      });
    },
    cancelRequest(requestId) {
      setState((current) => ({
        ...current,
        requests: current.requests.map((request) => request.id === requestId && request.requesterId === current.currentUserId && request.status === 'pending' ? { ...request, status: 'canceled' } : request),
        announcement: current.locale === 'ko' ? '요청을 취소했어요.' : 'Request canceled.',
      }));
    },
    respondToRequest(requestId, decision) {
      setState((current) => {
        const request = current.requests.find((candidate) => candidate.id === requestId);
        const item = request ? current.items.find((candidate) => candidate.id === request.catalogItemId) : undefined;
        if (!request || !item || request.status !== 'pending' || item.ownerId !== current.currentUserId) return current;
        const respondedRequests = current.requests.map((candidate) => candidate.id === requestId
          ? { ...candidate, status: decision }
          : decision === 'accepted' && candidate.catalogItemId === item.id && candidate.status === 'pending'
            ? { ...candidate, status: 'superseded' as const }
            : candidate);
        if (decision === 'declined') {
          return { ...current, requests: respondedRequests, announcement: current.locale === 'ko' ? '요청을 거절했어요.' : 'Request declined.' };
        }
        const startedAt = new Date();
        return {
          ...current,
          requests: respondedRequests,
          items: current.items.map((candidate) => candidate.id === item.id ? { ...candidate, status: 'borrowed' } : candidate),
          loans: [...current.loans, {
            id: newId('loan'),
            catalogItemId: item.id,
            requestId: request.id,
            ownerId: item.ownerId,
            borrowerId: request.requesterId,
            status: 'active',
            startedAt: startedAt.toISOString(),
            nextCheckAt: new Date(startedAt.getTime() + 7 * 86_400_000).toISOString(),
          }],
          announcement: current.locale === 'ko' ? '요청을 수락하고 대여를 시작했어요.' : 'Request accepted and loan started.',
        };
      });
    },
    markReturned(loanId) {
      setState((current) => {
        const loan = current.loans.find((candidate) => candidate.id === loanId);
        if (!loan || loan.status !== 'active' || (loan.ownerId !== current.currentUserId && loan.borrowerId !== current.currentUserId)) return current;
        const returnedAt = new Date().toISOString();
        return {
          ...current,
          loans: current.loans.map((candidate) => candidate.id === loanId ? { ...candidate, status: 'returned', returnedAt, returnedBy: current.currentUserId } : candidate),
          items: current.items.map((item) => item.id === loan.catalogItemId ? { ...item, status: 'available' } : item),
          announcement: current.locale === 'ko' ? '반납을 기록했어요.' : 'Return recorded.',
        };
      });
    },
    updateProfile(changes) {
      setState((current) => ({
        ...current,
        locale: changes.locale ?? current.locale,
        members: current.members.map((member) => member.id === current.currentUserId ? { ...member, ...changes } : member),
        announcement: current.locale === 'ko' ? '설정을 저장했어요.' : 'Settings saved.',
      }));
    },
  }), []);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <HanaContext.Provider value={value}>{children}</HanaContext.Provider>;
}

export function useHanaApp() {
  const value = useContext(HanaContext);
  if (!value) throw new Error('useHanaApp must be used inside HanaAppProvider');
  return value;
}
