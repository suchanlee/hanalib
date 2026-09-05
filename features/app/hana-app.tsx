'use client';

import { BookOpen, Handshake, ScanLine, UserRound } from 'lucide-react';
import Image from 'next/image';
import { AuthView } from '@/features/auth';
import { BookDetailView, CatalogView } from '@/features/catalog';
import { CirculationView } from '@/features/circulation';
import { IntakeView } from '@/features/intake';
import { SettingsView } from '@/features/settings';
import { EmailCompletionDialog } from '@/features/settings/email-completion-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppScreen } from '@/lib/domain/types';
import { HanaAppProvider, useHanaApp } from './app-context';
import { ErrorNotice } from './error-notice';
import { WebMcpBridge } from './webmcp-bridge';
import { PwaOnboarding } from './pwa-onboarding';

const navItems: Array<{ screen: Exclude<AppScreen, 'detail'>; icon: typeof BookOpen; ko: string; en: string; testId: string }> = [
  { screen: 'catalog', icon: BookOpen, ko: '도서', en: 'Catalog', testId: 'nav-catalog' },
  { screen: 'intake', icon: ScanLine, ko: '스캔', en: 'Scan', testId: 'nav-intake' },
  { screen: 'borrowing', icon: Handshake, ko: '대여', en: 'Borrowing', testId: 'nav-borrowing' },
  { screen: 'settings', icon: UserRound, ko: '설정', en: 'Settings', testId: 'nav-settings' },
];

function LibraryShell() {
  const { state, actions } = useHanaApp();
  const currentMember = state.members.find((member) => member.id === state.currentUserId);
  const activeScreen = state.screen === 'detail' ? 'catalog' : state.screen;
  const itemById = new Map(state.items.map((item) => [item.id, item]));
  const actionableCount = state.requests.filter((request) => (
    request.status === 'pending' && itemById.get(request.catalogItemId)?.ownerId === state.currentUserId
  )).length
    + state.holds.filter((hold) => hold.status === 'offered').length
    + state.returnChecks.length;
  const actionableLabel = actionableCount > 9 ? '9+' : String(actionableCount);

  if (!state.isAuthenticated && state.loadStatus !== 'ready') {
    return <main className="mx-auto grid min-h-dvh max-w-md content-center gap-4 p-6" data-testid="bootstrap-status">
      <h1 className="text-2xl font-semibold">{state.loadStatus === 'loading'
        ? state.locale === 'ko' ? '도서관을 불러오는 중…' : 'Loading your library…'
        : state.locale === 'ko' ? '도서관에 연결하지 못했어요' : 'Unable to load the library'}</h1>
      {state.loadStatus === 'error' && <Button onClick={() => actions.refresh().catch(() => {})}>{state.locale === 'ko' ? '다시 불러오기' : 'Try loading again'}</Button>}
    </main>;
  }

  if (!state.isAuthenticated) {
    return (
      <>
        <WebMcpBridge />
        <AuthView />
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <WebMcpBridge />
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card px-4 py-6 lg:flex">
          <button className="mb-8 flex items-center gap-3 px-2 text-left" onClick={() => actions.setScreen('catalog')}>
            <Image src="/seed-logo.svg" alt="" aria-hidden="true" width={36} height={36} className="size-9 shrink-0" />
            <span className="font-semibold tracking-tight">{state.locale === 'ko' ? '도서관' : 'Books'}</span>
          </button>
          <nav aria-label={state.locale === 'ko' ? '주요 메뉴' : 'Main navigation'} className="space-y-1.5">
            {navItems.map(({ screen, icon: Icon, ko, en, testId }) => (
              <Button key={screen} data-testid={`${testId}-desktop`} variant={activeScreen === screen ? 'secondary' : 'ghost'} className="h-11 w-full justify-start gap-3 px-3" onClick={() => actions.setScreen(screen)}>
                <Icon className="size-5" /> {state.locale === 'ko' ? ko : en}
                {screen === 'borrowing' && actionableCount > 0 ? (
                  <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground" data-testid="borrowing-action-count-desktop">{actionableLabel}</span>
                ) : null}
              </Button>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border bg-background p-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">{currentMember?.initials}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{state.locale === 'ko' ? currentMember?.displayNameKo : currentMember?.displayName}</span><span className="block truncate text-xs text-muted-foreground">{currentMember?.email}</span></span>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b bg-background/92 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              <button className="flex items-center gap-2 text-left lg:hidden" onClick={() => actions.setScreen('catalog')} aria-label="Hana Seed Books catalog">
                <Image src="/seed-logo.svg" alt="" aria-hidden="true" width={32} height={32} className="size-8 shrink-0" />
                <span className="font-semibold tracking-tight">{state.locale === 'ko' ? '도서관' : 'Books'}</span>
              </button>
              <div className="hidden lg:block">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{state.locale === 'ko' ? '함께 읽는 우리 동네' : 'Read together locally'}</p>
              </div>
              <Button data-testid="header-profile" variant="ghost" size="sm" className="h-9 rounded-full px-2.5" onClick={() => actions.setScreen('settings')}>
                <span className="grid size-6 place-items-center rounded-full bg-secondary text-[10px] font-bold">{currentMember?.initials}</span>
                <span className="max-w-24 truncate">{state.locale === 'ko' ? currentMember?.displayNameKo : currentMember?.displayName}</span>
              </Button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-5xl pb-28 lg:pb-10">
            <fieldset disabled={state.isMutating} aria-busy={state.isMutating} className="min-w-0">
            {state.screen === 'catalog' && <CatalogView />}
            {state.screen === 'detail' && <BookDetailView />}
            {state.screen === 'intake' && <IntakeView />}
            {state.screen === 'borrowing' && <CirculationView />}
            {state.screen === 'settings' && <SettingsView />}
            </fieldset>
          </main>
        </div>
      </div>

      <nav aria-label={state.locale === 'ko' ? '주요 메뉴' : 'Main navigation'} className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-2 pt-2 shadow-[0_-10px_30px_rgba(20,50,42,0.08)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3">
          {navItems.filter(({ screen }) => screen !== 'settings').map(({ screen, icon: Icon, ko, en, testId }) => (
            <button
              key={screen}
              data-testid={testId}
              aria-current={activeScreen === screen ? 'page' : undefined}
              className={cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors', activeScreen === screen ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground')}
              onClick={() => actions.setScreen(screen)}
            >
              <span className="relative">
                <Icon className="size-5" />
                {screen === 'borrowing' && actionableCount > 0 ? (
                  <span className="absolute -right-3 -top-2 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground" data-testid="borrowing-action-count">{actionableLabel}</span>
                ) : null}
              </span>
              <span>{state.locale === 'ko' ? ko : en}</span>
            </button>
          ))}
        </div>
      </nav>

      <output aria-live="polite" className="sr-only">{state.announcement}</output>
      <EmailCompletionDialog />
    </div>
  );
}

function GlobalFeedback() {
  const { state, actions } = useHanaApp();
  if (!state.issue) return null;
  return <div className="fixed inset-x-3 bottom-24 z-[60] mx-auto max-h-[60dvh] max-w-xl overflow-y-auto lg:bottom-6">
    <ErrorNotice key={state.issue.occurredAt} issue={state.issue} locale={state.locale}
      onDismiss={() => actions.dismissIssue()}
      onRetry={state.issue.operation === 'sign-out' || state.issue.operation === 'sign-in' || state.issue.operation === 'sign-in-options' ? undefined : () => actions.refresh()} />
  </div>;
}

export function HanaApp({ initialScreen = 'catalog' }: { initialScreen?: AppScreen }) {
  return <HanaAppProvider initialScreen={initialScreen}><PwaOnboarding /><LibraryShell /><GlobalFeedback /></HanaAppProvider>;
}
