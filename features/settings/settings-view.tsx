'use client';

import { useState, type SyntheticEvent } from 'react';
import {
  Bell,
  CheckCircle2,
  Globe2,
  LogOut,
  Mail,
  MessageSquare,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { useHanaApp } from '@/features/app/app-context';
import type { AppLocale, NotificationChannel } from '@/lib/domain/types';
import { memberName } from '@/lib/i18n/copy';
import { isValidUsPhone, normalizeUsPhone } from './validation';

function t(locale: AppLocale, ko: string, en: string) {
  return locale === 'ko' ? ko : en;
}

export function SettingsView() {
  const { state, actions } = useHanaApp();
  const member = state.members.find((candidate) => candidate.id === state.currentUserId) ?? state.members[0];
  const locale = state.locale;
  const [displayName, setDisplayName] = useState(member.displayName);
  const [displayNameKo, setDisplayNameKo] = useState(member.displayNameKo);
  const [phone, setPhone] = useState(member.phone);
  const [channel, setChannel] = useState<NotificationChannel>(member.notificationChannel);
  const [saved, setSaved] = useState(false);

  const needsPhone = channel === 'sms' || channel === 'both';
  const phoneValid = !needsPhone || isValidUsPhone(phone);
  const namesValid = displayName.trim().length > 0 && displayNameKo.trim().length > 0;

  function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phoneValid || !namesValid) return;
    actions.updateProfile({
      displayName: displayName.trim(),
      displayNameKo: displayNameKo.trim(),
      phone: normalizeUsPhone(phone),
      notificationChannel: channel,
    });
    setSaved(true);
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
                <CardDescription className="truncate">{member.email}</CardDescription>
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
              <div className="space-y-2">
                <Label htmlFor="settings-email">{t(locale, '이메일', 'Email')}</Label>
                <div className="relative">
                  <Mail aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" disabled id="settings-email" value={member.email} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(locale, '로그인 제공자가 관리하는 주소예요.', 'Managed by your sign-in provider.')}
                </p>
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

          <Card>
            <CardHeader>
              <CardTitle>{t(locale, '알림', 'Notifications')}</CardTitle>
              <CardDescription>
                {t(locale, '대여 요청, 결과, 반납 확인을 받을 방법을 선택하세요.', 'Choose how to receive requests, decisions, and return checks.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-channel">{t(locale, '알림 방법', 'Notification channel')}</Label>
                <NativeSelect className="w-full" id="settings-channel" value={channel} onChange={(event) => { setChannel(event.target.value as NotificationChannel); setSaved(false); }}>
                  <NativeSelectOption value="email">{t(locale, '이메일', 'Email')}</NativeSelectOption>
                  <NativeSelectOption value="sms">{t(locale, '문자 메시지', 'Text message')}</NativeSelectOption>
                  <NativeSelectOption value="both">{t(locale, '이메일 + 문자', 'Email + text')}</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-phone">{t(locale, '미국 휴대폰 번호', 'US mobile number')}</Label>
                <div className="relative">
                  <MessageSquare aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-describedby="settings-phone-help"
                    aria-invalid={!phoneValid}
                    className="pl-9"
                    data-testid="settings-phone"
                    id="settings-phone"
                    inputMode="tel"
                    onChange={(event) => { setPhone(event.target.value); setSaved(false); }}
                    placeholder="+14155550123"
                    value={phone}
                  />
                </div>
                <p className={phoneValid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'} id="settings-phone-help">
                  {phoneValid
                    ? t(locale, '미국 파일럿은 +1로 시작하는 번호를 지원해요.', 'The US pilot supports numbers beginning with +1.')
                    : t(locale, '+1과 지역 번호를 포함한 미국 번호를 입력하세요.', 'Enter a US number with +1 and area code.')}
                </p>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
                <Bell aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <p>
                  {t(locale, '문자로 받은 요청은 1(수락) 또는 2(거절)로 답장할 수 있어요.', 'For a texted request, reply 1 to accept or 2 to decline.')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Button
            className="h-11 w-full"
            data-testid="settings-save"
            disabled={!phoneValid || !namesValid}
            type="submit"
          >
            {saved && <CheckCircle2 aria-hidden="true" />}
            {saved ? t(locale, '저장했어요', 'Saved') : t(locale, '설정 저장', 'Save settings')}
          </Button>
        </form>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound aria-hidden="true" />
              {t(locale, '로컬 데모 사용자', 'Local demo identity')}
            </CardTitle>
            <CardDescription>
              {t(locale, '대여 흐름을 시험하기 위한 미리보기 전용 도구예요. 실제 서비스에는 표시되지 않아요.', 'Preview-only tool for testing both sides of a loan. It is hidden in production.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label className="sr-only" htmlFor="demo-user">{t(locale, '데모 사용자', 'Demo user')}</Label>
            <NativeSelect
              className="w-full"
              data-testid="settings-demo-user"
              id="demo-user"
              onChange={(event) => actions.switchDemoUser(event.target.value)}
              value={state.currentUserId}
            >
              {state.members.map((candidate) => (
                <NativeSelectOption key={candidate.id} value={candidate.id}>
                  {candidate.displayNameKo} · {candidate.displayName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </CardContent>
        </Card>

        <Separator />
        <Button
          className="h-11 w-full"
          data-testid="settings-sign-out"
          onClick={() => actions.signOut()}
          variant="ghost"
        >
          <LogOut aria-hidden="true" />
          {t(locale, '로그아웃', 'Sign out')}
        </Button>
      </div>
    </section>
  );
}
