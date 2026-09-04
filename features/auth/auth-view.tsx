'use client';

import { BookHeart, Globe2, LockKeyhole, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHanaApp } from '@/features/app/app-context';

export function AuthView() {
  const { state, actions } = useHanaApp();
  const ko = state.locale === 'ko';

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-background px-5 py-7 sm:px-8">
      <div aria-hidden="true" className="absolute -top-24 -right-32 -z-10 size-80 rounded-full bg-primary/12 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-32 -left-32 -z-10 size-80 rounded-full bg-amber-300/15 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-md flex-col justify-between gap-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="grid size-9 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <BookHeart aria-hidden="true" className="size-5" />
            </span>
            <span>{ko ? '하나도서관' : 'Hana Library'}</span>
          </div>
          <Button
            aria-label={ko ? 'English로 변경' : '한국어로 변경'}
            className="rounded-full"
            data-testid="auth-locale-toggle"
            onClick={() => actions.setLocale(ko ? 'en' : 'ko')}
            size="sm"
            variant="ghost"
          >
            <Globe2 aria-hidden="true" />
            {ko ? 'EN' : '한국어'}
          </Button>
        </div>

        <section className="space-y-7">
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              {ko ? '우리 동네 책장' : 'Our neighborhood shelf'}
            </p>
            <h1 className="max-w-sm text-4xl leading-[1.08] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
              {ko ? '함께 읽고, 가볍게 나눠요' : 'Read together, share simply'}
            </h1>
            <p className="max-w-sm text-base leading-7 text-muted-foreground">
              {ko
                ? '가까운 이웃의 책을 발견하고, 바코드 한 번으로 내 책도 나눠 보세요.'
                : 'Discover books from nearby members and share your own with one quick scan.'}
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border bg-card/80 p-4 shadow-sm backdrop-blur">
            <div className="flex gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                <UsersRound aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="font-medium">{ko ? '누구나 가입 가능' : 'Open registration'}</p>
                <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                  {ko ? 'Google 또는 Apple 계정으로 출시 커뮤니티에 바로 가입해요.' : 'Join the launch community with a Google or Apple account.'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                <LockKeyhole aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="font-medium">{ko ? '회원 전용 도서 목록' : 'Members-only catalog'}</p>
                <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                  {ko ? '로그인한 활성 회원만 도서와 소유자 정보를 볼 수 있어요.' : 'Only signed-in active members can view books and owners.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-label={ko ? '로그인' : 'Sign in'} className="space-y-3">
          <Button
            className="h-12 w-full rounded-xl bg-foreground text-base text-background hover:bg-foreground/85"
            data-testid="auth-google"
            onClick={() => actions.signIn('google')}
          >
            <span aria-hidden="true" className="text-base font-bold">G</span>
            {ko ? 'Google로 계속' : 'Continue with Google'}
          </Button>
          <Button
            className="h-12 w-full rounded-xl text-base"
            data-testid="auth-apple"
            onClick={() => actions.signIn('apple')}
            variant="outline"
          >
            <span aria-hidden="true" className="text-lg leading-none">●</span>
            {ko ? 'Apple로 계속' : 'Continue with Apple'}
          </Button>
          <p className="px-4 text-center text-xs leading-5 text-muted-foreground" data-testid="auth-demo-note">
            {ko
              ? '로컬 미리보기에서는 지우의 데모 계정으로 로그인합니다. 실제 배포에서는 OAuth 서버 연결로 교체됩니다.'
              : 'Local preview signs in as Jiwoo’s demo account. Production uses the configured OAuth server flow.'}
          </p>
        </section>
      </div>
    </main>
  );
}
