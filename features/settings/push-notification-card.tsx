'use client';

import { useEffect, useState } from 'react';
import {
  getCurrentSubscription,
  getNotificationPermission,
  isPushSupported,
  serializeSubscription,
  subscribe,
  unsubscribe,
} from '@mmmike/web-push/client';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Download,
  Loader2,
  Send,
  Share2,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppLocale } from '@/lib/domain/types';

type PushState = 'loading' | 'install-ios' | 'available' | 'subscribed' | 'denied' | 'unsupported' | 'error';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function t(locale: AppLocale, ko: string, en: string) {
  return locale === 'ko' ? ko : en;
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

async function publicKey() {
  const response = await fetch('/api/push/config', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('push-config-unavailable');
  const payload = await response.json() as { data?: { publicKey?: string } };
  if (!payload.data?.publicKey) throw new Error('push-config-unavailable');
  return payload.data.publicKey;
}

async function persist(subscription: PushSubscription) {
  const response = await fetch('/api/push/subscriptions', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serializeSubscription(subscription)),
  });
  if (!response.ok) throw new Error('push-subscription-save-failed');
}

export function PushNotificationCard({ locale }: { locale: AppLocale }) {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();

  useEffect(() => {
    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    let active = true;
    void (async () => {
      try {
        if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js');
        if (isIosDevice() && !isStandalone()) {
          if (active) setState('install-ios');
          return;
        }
        if (!isPushSupported()) {
          if (active) setState('unsupported');
          return;
        }
        if (getNotificationPermission() === 'denied') {
          if (active) setState('denied');
          return;
        }
        const current = await getCurrentSubscription();
        if (current) {
          await persist(current);
          if (active) setState('subscribed');
        } else if (active) {
          setState('available');
        }
      } catch {
        if (active) setState('error');
      }
    })();
    return () => {
      active = false;
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    setBusy(true);
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(undefined);
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    setBusy(true);
    setTestSent(false);
    try {
      if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js');
      const result = await subscribe(await publicKey());
      if (result.status === 'denied') {
        setState('denied');
      } else if (result.status === 'unsupported') {
        setState('unsupported');
      } else {
        await persist(result.subscription);
        setState('subscribed');
      }
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setTestSent(false);
    try {
      const endpoint = await unsubscribe();
      if (endpoint) {
        const response = await fetch('/api/push/subscriptions', {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
        if (!response.ok) throw new Error('push-unsubscribe-failed');
      }
      setState('available');
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setTestSent(false);
    try {
      const response = await fetch('/api/push/test', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('push-test-failed');
      setTestSent(true);
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="push-notification-card">
      <CardHeader>
        <CardTitle>{t(locale, '앱 설치 및 알림', 'App & notifications')}</CardTitle>
        <CardDescription>
          {t(
            locale,
            '앱을 닫아도 대여 요청, 결과, 반납 확인을 바로 받아요.',
            'Receive borrowing requests, decisions, and return checks even when the app is closed.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === 'loading' && (
          <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-sm">
            <Loader2 aria-hidden="true" className="size-4 animate-spin text-primary" />
            {t(locale, '알림 상태를 확인하는 중…', 'Checking notification status…')}
          </div>
        )}

        {state === 'install-ios' && (
          <div className="space-y-3" data-testid="push-ios-install-guide">
            <div className="flex items-start gap-2.5 rounded-xl bg-muted/60 p-3 text-sm">
              <Smartphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>{t(locale, 'iPhone에서는 먼저 홈 화면에 앱을 추가해야 알림을 켤 수 있어요.', 'On iPhone, add the app to your Home Screen before enabling notifications.')}</p>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="font-semibold text-foreground">1.</span><span>{t(locale, 'Safari 아래쪽의 공유 버튼을 누르세요.', 'Tap Safari’s Share button.')}</span><Share2 aria-hidden="true" className="size-4 shrink-0" /></li>
              <li className="flex gap-2"><span className="font-semibold text-foreground">2.</span><span>{t(locale, '‘홈 화면에 추가’를 선택하세요.', 'Choose “Add to Home Screen.”')}</span></li>
              <li className="flex gap-2"><span className="font-semibold text-foreground">3.</span><span>{t(locale, '홈 화면에서 앱을 열고 여기로 돌아오세요.', 'Open the app from your Home Screen, then return here.')}</span></li>
            </ol>
          </div>
        )}

        {(state === 'available' || state === 'subscribed') && (
          <div className="flex items-start gap-2.5 rounded-xl bg-muted/60 p-3 text-sm">
            {state === 'subscribed'
              ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              : <BellRing aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />}
            <div>
              <p className="font-medium" data-testid="push-notification-status">
                {state === 'subscribed'
                  ? t(locale, '이 기기에서 알림을 받고 있어요', 'Notifications are on for this device')
                  : t(locale, '알림을 켜면 중요한 요청을 놓치지 않아요', 'Turn on notifications so you don’t miss requests')}
              </p>
              <p className="mt-1 text-muted-foreground">
                {t(locale, '각 휴대폰에서 한 번씩 켜 주세요.', 'Enable them once on each phone you use.')}
              </p>
            </div>
          </div>
        )}

        {(state === 'denied' || state === 'unsupported' || state === 'error') && (
          <div className="flex items-start gap-2.5 rounded-xl bg-destructive/8 p-3 text-sm">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p data-testid="push-notification-error">
              {state === 'denied'
                ? t(locale, '알림이 차단되어 있어요. 휴대폰의 사이트 또는 앱 설정에서 알림을 허용해 주세요.', 'Notifications are blocked. Allow them in your phone’s site or app settings.')
                : state === 'unsupported'
                  ? t(locale, '이 브라우저에서는 알림을 사용할 수 없어요. 최신 Safari 또는 Chrome을 이용해 주세요.', 'Notifications are unavailable in this browser. Use a current Safari or Chrome.')
                  : t(locale, '알림을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', 'We couldn’t connect notifications. Please try again.')}
            </p>
          </div>
        )}

        {installPrompt && state !== 'install-ios' && (
          <Button className="h-11 w-full" disabled={busy} onClick={() => void install()} type="button" variant="outline">
            <Download aria-hidden="true" />
            {t(locale, '홈 화면에 앱 설치', 'Install app')}
          </Button>
        )}

        {state === 'available' && (
          <Button className="h-11 w-full" data-testid="push-enable" disabled={busy} onClick={() => void enable()} type="button">
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <BellRing aria-hidden="true" />}
            {t(locale, '알림 켜기', 'Turn on notifications')}
          </Button>
        )}

        {state === 'subscribed' && (
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-11" data-testid="push-test" disabled={busy} onClick={() => void sendTest()} type="button">
              {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : testSent ? <CheckCircle2 aria-hidden="true" /> : <Send aria-hidden="true" />}
              {testSent ? t(locale, '보냈어요', 'Sent') : t(locale, '테스트', 'Send test')}
            </Button>
            <Button className="h-11" data-testid="push-disable" disabled={busy} onClick={() => void disable()} type="button" variant="outline">
              {t(locale, '이 기기에서 끄기', 'Turn off here')}
            </Button>
          </div>
        )}

        {state === 'error' && (
          <Button className="h-11 w-full" disabled={busy} onClick={() => void enable()} type="button" variant="outline">
            {t(locale, '다시 시도', 'Try again')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
