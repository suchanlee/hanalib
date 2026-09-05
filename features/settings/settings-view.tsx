'use client';

import { useState, type SyntheticEvent } from 'react';
import {
  CheckCircle2,
  Globe2,
  LogOut,
  ShieldCheck,
  UserRoundCog,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useHanaApp } from '@/features/app/app-context';
import type { AppLocale } from '@/lib/domain/types';
import { memberName } from '@/lib/i18n/copy';
import { PushNotificationCard } from './push-notification-card';

function t(locale: AppLocale, ko: string, en: string) {
  return locale === 'ko' ? ko : en;
}

export function SettingsView() {
  const { state, actions } = useHanaApp();
  const member = state.members.find((candidate) => candidate.id === state.currentUserId) ?? state.members[0];
  const locale = state.locale;
  const [displayName, setDisplayName] = useState(member.displayName);
  const [displayNameKo, setDisplayNameKo] = useState(member.displayNameKo);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const namesValid = displayName.trim().length > 0 && displayNameKo.trim().length > 0;

  function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!namesValid) return;
    setSaving(true);
    setSaveError(false);
    void actions.updateProfile({
      displayName: displayName.trim(),
      displayNameKo: displayNameKo.trim(),
    }).then(() => setSaved(true))
      .catch(() => {
        setSaved(false);
        setSaveError(true);
      })
      .finally(() => setSaving(false));
  }

  async function signOut() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
    } finally {
      actions.signOut();
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-28 sm:px-6" data-testid="settings-view">
      <header className="mb-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          <UserRoundCog aria-hidden="true" className="size-3.5" />
          {t(locale, '내 계정', 'My account')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {t(locale, '개인 설정', 'Personal settings')}
        </h1>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">
                  {member.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <CardTitle>{memberName(locale, member)}</CardTitle>
                <CardDescription>{t(locale, '카카오 계정', 'Kakao account')}</CardDescription>
              </div>
              <Badge className="ml-auto" variant="secondary">
                <ShieldCheck aria-hidden="true" />
                {t(locale, '활성 회원', 'Active member')}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        <form className="space-y-4" onSubmit={save}>
          <Card>
            <CardHeader>
              <CardTitle>{t(locale, '프로필', 'Profile')}</CardTitle>
              <CardDescription>
                {t(locale, '다른 회원에게 표시되는 이름이에요.', 'These names are visible to other members.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-name-ko">{t(locale, '한국어 이름', 'Korean name')}</Label>
                <Input
                  aria-invalid={!displayNameKo.trim()}
                  data-testid="settings-name-ko"
                  id="settings-name-ko"
                  onChange={(event) => { setDisplayNameKo(event.target.value); setSaved(false); }}
                  value={displayNameKo}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-name-en">{t(locale, '영문 이름', 'English name')}</Label>
                <Input
                  aria-invalid={!displayName.trim()}
                  data-testid="settings-name-en"
                  id="settings-name-en"
                  onChange={(event) => { setDisplayName(event.target.value); setSaved(false); }}
                  value={displayName}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t(locale, '언어', 'Language')}</CardTitle>
              <CardDescription>
                {t(locale, '언제든 한국어와 English를 바꿀 수 있어요.', 'Switch between Korean and English anytime.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="sr-only">{t(locale, '언어 선택', 'Choose language')}</legend>
                <Button
                  className="h-11"
                  data-testid="settings-locale-ko"
                  onClick={() => actions.setLocale('ko')}
                  type="button"
                  variant={locale === 'ko' ? 'default' : 'outline'}
                >
                  <Globe2 aria-hidden="true" />
                  한국어
                </Button>
                <Button
                  className="h-11"
                  data-testid="settings-locale-en"
                  onClick={() => actions.setLocale('en')}
                  type="button"
                  variant={locale === 'en' ? 'default' : 'outline'}
                >
                  <Globe2 aria-hidden="true" />
                  English
                </Button>
              </fieldset>
            </CardContent>
          </Card>

          <PushNotificationCard locale={locale} />

          <Button
            className="h-11 w-full"
            data-testid="settings-save"
            disabled={!namesValid || saving}
            type="submit"
          >
            {saved && <CheckCircle2 aria-hidden="true" />}
            {saving
              ? t(locale, '저장 중…', 'Saving…')
              : saved ? t(locale, '저장했어요', 'Saved') : t(locale, '설정 저장', 'Save settings')}
          </Button>

          {saveError && (
            <p className="text-sm text-destructive" role="alert">
              {t(locale, '설정을 저장하지 못했어요.', 'We couldn’t save your settings.')}
            </p>
          )}
        </form>

        <Separator />
        <Button
          className="h-11 w-full"
          data-testid="settings-sign-out"
          onClick={() => void signOut()}
          variant="ghost"
        >
          <LogOut aria-hidden="true" />
          {t(locale, '로그아웃', 'Sign out')}
        </Button>
      </div>
    </section>
  );
}
