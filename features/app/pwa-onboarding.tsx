'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentSubscription,
  getNotificationPermission,
  isPushSupported,
  serializeSubscription,
  subscribe,
} from '@mmmike/web-push/client';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Download,
  Loader2,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError, apiData, requestJson } from '@/lib/http/client';
import type { AppLocale } from '@/lib/domain/types';
import { useHanaApp } from './app-context';
import { detectPwaDevice } from './pwa-device';

type PromptState =
  | 'hidden'
  | 'install'
  | 'notifications'
  | 'denied'
  | 'unsupported'
  | 'success'
  | 'error';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'hana-pwa-onboarding-dismissed';

function t(locale: AppLocale, ko: string, en: string) {
  return locale === 'ko' ? ko : en;
}

function mediaMatches(query: string) {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  );
}

function wasDismissed() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    sessionStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // The prompt can still be hidden for this render when storage is unavailable.
  }
}

function currentDevice() {
  const browserNavigator = navigator as Navigator & { standalone?: boolean };
  return detectPwaDevice({
    userAgent: browserNavigator.userAgent,
    platform: browserNavigator.platform,
    maxTouchPoints: browserNavigator.maxTouchPoints,
    coarseMobile: mediaMatches('(max-width: 1023px) and (pointer: coarse)'),
    displayModeStandalone: mediaMatches('(display-mode: standalone)'),
    navigatorStandalone: Boolean(browserNavigator.standalone),
  });
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator)
    await navigator.serviceWorker.register('/sw.js');
}

async function publicKey() {
  const data = await apiData<{ publicKey?: string }>('/api/push/config');
  if (!data.publicKey) throw new ApiError(503, 'push-config-unavailable');
  return data.publicKey;
}

async function persist(subscription: PushSubscription) {
  await requestJson('/api/push/subscriptions', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serializeSubscription(subscription)),
  });
}

export function PwaOnboarding() {
  const { state } = useHanaApp();
  const [promptState, setPromptState] = useState<PromptState>('hidden');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkVersion, setCheckVersion] = useState(0);
  const locale = state.locale;
  const ios = typeof navigator !== 'undefined' && currentDevice().ios;

  useEffect(() => {
    void registerServiceWorker().catch(() => {
      // Installation guidance can still be useful if registration is temporarily unavailable.
    });

    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }
    function installed() {
      rememberDismissed();
      setPromptState('hidden');
      setInstallPrompt(undefined);
    }
    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      const device = currentDevice();
      if (!state.isAuthenticated || !device.mobile || wasDismissed()) {
        if (active) setPromptState('hidden');
        return;
      }
      if (!device.standalone) {
        if (active) setPromptState('install');
        return;
      }
      try {
        await registerServiceWorker();
        if (!isPushSupported()) {
          if (active) setPromptState('unsupported');
          return;
        }
        if (getNotificationPermission() === 'denied') {
          if (active) setPromptState('denied');
          return;
        }
        const current = await getCurrentSubscription();
        if (current) {
          await persist(current);
          if (active) setPromptState('hidden');
        } else if (active) {
          setPromptState('notifications');
        }
      } catch {
        if (active) setPromptState('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [checkVersion, installPrompt, state.isAuthenticated]);

  const dismiss = useCallback(() => {
    rememberDismissed();
    setPromptState('hidden');
  }, []);

  async function install() {
    if (!installPrompt) {
      setHelpOpen(true);
      return;
    }
    setBusy(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(undefined);
      if (choice.outcome === 'accepted') {
        rememberDismissed();
        setPromptState('hidden');
      }
    } catch {
      setPromptState('error');
    } finally {
      setBusy(false);
    }
  }

  async function enableNotifications() {
    setBusy(true);
    try {
      await registerServiceWorker();
      const result = await subscribe(await publicKey());
      if (result.status === 'denied') {
        setPromptState('denied');
      } else if (result.status === 'unsupported') {
        setPromptState('unsupported');
      } else {
        await persist(result.subscription);
        setPromptState('success');
        window.setTimeout(() => setPromptState('hidden'), 2500);
      }
    } catch {
      setPromptState('error');
    } finally {
      setBusy(false);
    }
  }

  if (promptState === 'hidden') return null;

  const installing = promptState === 'install';
  const notifications = promptState === 'notifications';
  const Icon = installing
    ? Download
    : notifications
      ? BellRing
      : promptState === 'success'
        ? CheckCircle2
        : AlertTriangle;

  return (
    <>
      <aside
        className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-2xl border border-primary/20 bg-card p-3 shadow-lg lg:hidden"
        data-testid="pwa-onboarding"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {installing
                ? t(locale, '씨앗 도서관을 설치하세요', 'Install Hana Library')
                : notifications
                  ? t(locale, '알림을 켜 주세요', 'Turn on notifications')
                  : promptState === 'success'
                    ? t(locale, '알림을 켰어요', 'Notifications are on')
                    : promptState === 'denied'
                      ? t(
                          locale,
                          '알림이 차단되어 있어요',
                          'Notifications are blocked',
                        )
                      : promptState === 'unsupported'
                        ? t(
                            locale,
                            '알림을 사용할 수 없어요',
                            'Notifications are unavailable',
                          )
                        : t(locale, '연결하지 못했어요', 'Couldn’t connect')}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {installing
                ? t(
                    locale,
                    '홈 화면에서 바로 열고 중요한 대여 알림을 받아요.',
                    'Open it from your Home Screen and receive important borrowing alerts.',
                  )
                : notifications
                  ? t(
                      locale,
                      '앱을 닫아도 대여 요청과 반납 확인을 바로 받아요.',
                      'Receive borrowing requests and return checks even when the app is closed.',
                    )
                  : promptState === 'success'
                    ? t(
                        locale,
                        '이 기기로 중요한 소식을 보내 드릴게요.',
                        'Important updates will arrive on this device.',
                      )
                    : promptState === 'denied'
                      ? t(
                          locale,
                          '휴대폰 설정에서 씨앗 도서관 알림을 허용해 주세요.',
                          'Allow Hana Library notifications in your phone settings.',
                        )
                      : promptState === 'unsupported'
                        ? t(
                            locale,
                            '최신 Safari 또는 Chrome에서 설치한 앱을 이용해 주세요.',
                            'Use the installed app from a current Safari or Chrome browser.',
                          )
                        : t(
                            locale,
                            '잠시 후 다시 시도해 주세요.',
                            'Please try again in a moment.',
                          )}
            </p>
          </div>
          <Button
            aria-label={t(locale, '나중에', 'Not now')}
            className="-mr-1 -mt-1"
            onClick={dismiss}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        {(installing || notifications || promptState === 'error') && (
          <Button
            className="mt-3 h-10 w-full"
            data-testid={
              installing
                ? 'pwa-install'
                : notifications
                  ? 'pwa-enable-notifications'
                  : 'pwa-retry'
            }
            disabled={busy}
            onClick={() => {
              if (installing) void install();
              else if (notifications) void enableNotifications();
              else setCheckVersion((value) => value + 1);
            }}
            type="button"
          >
            {busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : installing ? (
              <Download aria-hidden="true" />
            ) : (
              <BellRing aria-hidden="true" />
            )}
            {installing
              ? ios
                ? t(locale, '설치 방법 보기', 'See how to install')
                : t(locale, '앱 설치', 'Install app')
              : notifications
                ? t(locale, '알림 켜기', 'Turn on notifications')
                : t(locale, '다시 시도', 'Try again')}
          </Button>
        )}
      </aside>

      <Dialog onOpenChange={setHelpOpen} open={helpOpen}>
        <DialogContent data-testid="pwa-install-help">
          <DialogHeader>
            <DialogTitle>
              {t(
                locale,
                '홈 화면에 앱 추가',
                'Add the app to your Home Screen',
              )}
            </DialogTitle>
            <DialogDescription>
              {ios
                ? t(
                    locale,
                    'Apple 정책상 웹사이트가 설치 버튼을 대신 누를 수 없어요.',
                    'Apple requires you to confirm installation from Safari.',
                  )
                : t(
                    locale,
                    '브라우저 메뉴에서 앱을 설치할 수 있어요.',
                    'You can install the app from your browser menu.',
                  )}
            </DialogDescription>
          </DialogHeader>
          {ios ? (
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <Share2 aria-hidden="true" className="size-4 text-primary" />
                <span>
                  <strong>1.</strong>{' '}
                  {t(
                    locale,
                    'Safari의 공유 버튼을 누르세요.',
                    'Tap Safari’s Share button.',
                  )}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Smartphone
                  aria-hidden="true"
                  className="size-4 text-primary"
                />
                <span>
                  <strong>2.</strong>{' '}
                  {t(
                    locale,
                    '‘홈 화면에 추가’를 선택하세요.',
                    'Choose “Add to Home Screen.”',
                  )}
                </span>
              </li>
            </ol>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm">
              <Smartphone aria-hidden="true" className="size-4 text-primary" />
              <span>
                {t(
                  locale,
                  '브라우저 메뉴(⋮)에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.',
                  'Open the browser menu (⋮), then choose “Install app” or “Add to Home screen.”',
                )}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
