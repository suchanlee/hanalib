'use client';

import { BookOpen, Handshake, LibraryBig, ScanLine, UserRound } from 'lucide-react';
import { AuthView } from '@/features/auth';
import { BookDetailView, CatalogView } from '@/features/catalog';
import { CirculationView } from '@/features/circulation';
import { IntakeView } from '@/features/intake';
import { SettingsView } from '@/features/settings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppScreen } from '@/lib/domain/types';
import { HanaAppProvider, useHanaApp } from './app-context';
import { WebMcpBridge } from './webmcp-bridge';

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
            <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground"><LibraryBig className="size-5" /></span>
            <span><span className="block font-semibold tracking-tight">하나북</span><span className="block text-xs text-muted-foreground">Hana Seed Book</span></span>
          </button>
          <nav aria-label={state.locale === 'ko' ? '주요 메뉴' : 'Main navigation'} className="space-y-1.5">
            {navItems.map(({ screen, icon: Icon, ko, en, testId }) => (
              <Button key={screen} data-testid={`${testId}-desktop`} variant={activeScreen === screen ? 'secondary' : 'ghost'} className="h-11 w-full justify-start gap-3 px-3" onClick={() => actions.setScreen(screen)}>
                <Icon className="size-5" /> {state.locale === 'ko' ? ko : en}
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
              <button className="flex items-center gap-2 text-left lg:hidden" onClick={() => actions.setScreen('catalog')} aria-label="Hana Seed Book catalog">
                <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><LibraryBig className="size-4.5" /></span>
                <span className="font-semibold tracking-tight">{state.locale === 'ko' ? '하나북' : 'Hana Seed Book'}</span>
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
            {state.screen === 'catalog' && <CatalogView />}
            {state.screen === 'detail' && <BookDetailView />}
            {state.screen === 'intake' && <IntakeView />}
            {state.screen === 'borrowing' && <CirculationView />}
            {state.screen === 'settings' && <SettingsView />}
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
              className={cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition-colors', activeScreen === screen ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground')}
              onClick={() => actions.setScreen(screen)}
            >
              <Icon className="size-5" />
              <span>{state.locale === 'ko' ? ko : en}</span>
            </button>
          ))}
        </div>
      </nav>

      <output aria-live="polite" className="sr-only">{state.announcement}</output>
    </div>
  );
}

export function HanaApp({ initialScreen = 'catalog' }: { initialScreen?: AppScreen }) {
  return <HanaAppProvider initialScreen={initialScreen}><LibraryShell /></HanaAppProvider>;
}
