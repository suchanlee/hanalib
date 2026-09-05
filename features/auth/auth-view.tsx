'use client';

import { Globe2, MessageCircle } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useHanaApp } from '@/features/app/app-context';
import { oauthStartUrl } from './provider-config';

interface AuthProviders {
  demo: boolean;
  kakao: boolean;
}

export function AuthView() {
  const { state, actions } = useHanaApp();
  const ko = state.locale === 'ko';
  const [providers, setProviders] = useState<AuthProviders>();

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/auth/providers', {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('provider-status-unavailable');
        return response.json() as Promise<AuthProviders>;
      })
      .then(setProviders)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setProviders({ demo: false, kakao: false });
        }
      });
    return () => controller.abort();
  }, []);

  function beginSignIn() {
    window.location.assign(oauthStartUrl('kakao', `${window.location.pathname}${window.location.search}${window.location.hash}`));
  }

  async function demoSignIn(persona: 'owner' | 'borrower' | 'holder' | 'holder-2') {
    const response = await fetch('/api/auth/demo', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ persona }),
    });
    if (response.ok) await actions.refresh();
  }

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-background px-5 py-7 sm:px-8">
      <div aria-hidden="true" className="absolute -top-24 -right-32 -z-10 size-80 rounded-full bg-primary/12 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-32 -left-32 -z-10 size-80 rounded-full bg-amber-300/15 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-md flex-col gap-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Image src="/seed-logo.svg" alt="" aria-hidden="true" width={36} height={36} className="size-9 shrink-0" />
            <span>{ko ? '도서관' : 'Books'}</span>
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

        <section className="my-auto space-y-7">
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">
              {ko ? '우리 교회 책장' : 'Our neighborhood shelf'}
            </p>
            <h1 className="max-w-sm break-keep text-4xl leading-[1.08] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
              {ko ? '함께 읽고 나눠요' : 'Read together, share simply'}
            </h1>
            <p className="max-w-sm text-base leading-7 text-muted-foreground">
              {ko
                ? '가까운 교인의 책을 발견하고, 바코드 한 번으로 내 책도 나눠 보세요.'
                : 'Discover books from nearby members and share your own with one quick scan.'}
            </p>
          </div>

          <section aria-label={ko ? '로그인' : 'Sign in'} className="space-y-3">
            <Button
              className="h-12 w-full rounded-xl bg-[#FEE500] text-base font-semibold text-[#191919] hover:bg-[#F5DC00]"
              data-testid="auth-kakao"
              disabled={providers?.kakao !== true}
              onClick={beginSignIn}
            >
              <MessageCircle aria-hidden="true" className="size-5 fill-current" />
              {ko ? '카카오로 계속' : 'Continue with Kakao'}
            </Button>
            {providers && !providers.kakao && (
              <output className="block px-2 text-center text-xs leading-5 text-muted-foreground" data-testid="auth-provider-status">
                {ko
                  ? '로그인 연결을 준비 중이에요. 운영자가 제공자 설정을 완료한 뒤 이용할 수 있어요.'
                  : 'Sign-in setup is still in progress. Access will open after the provider configuration is complete.'}
              </output>
            )}
            {providers?.demo && (
              <div className="rounded-xl border border-dashed p-3 text-center" data-testid="auth-demo-note">
                <p className="text-xs leading-5 text-muted-foreground">
                  {ko
                    ? '개발 모드가 켜져 있어요. 아래 계정은 로컬 미리보기에서만 사용할 수 있습니다.'
                    : 'Development mode is enabled. This account is available only in local preview.'}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button data-testid="auth-demo-owner" onClick={() => void demoSignIn('owner')} size="sm" variant="secondary">
                    {ko ? '소유자로 계속' : 'Continue as owner'}
                  </Button>
                  <Button data-testid="auth-demo-borrower" onClick={() => void demoSignIn('borrower')} size="sm" variant="outline">
                    {ko ? '대여자로 계속' : 'Continue as borrower'}
                  </Button>
                  <Button data-testid="auth-demo-holder" onClick={() => void demoSignIn('holder')} size="sm" variant="outline">
                    {ko ? '대기자로 계속' : 'Continue as waitlist member'}
                  </Button>
                  <Button data-testid="auth-demo-holder-2" onClick={() => void demoSignIn('holder-2')} size="sm" variant="outline">
                    {ko ? '두 번째 대기자로 계속' : 'Continue as second waitlist member'}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
