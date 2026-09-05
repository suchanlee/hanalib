'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHanaApp } from '@/features/app/app-context';

export function EmailCompletionDialog() {
  const { state, actions } = useHanaApp();
  const member = state.members.find((candidate) => candidate.id === state.currentUserId);
  const [open, setOpen] = useState(true);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const ko = state.locale === 'ko';

  useEffect(() => {
    if (member?.email) return;
    function reopen() {
      if (document.visibilityState === 'visible') setOpen(true);
    }
    window.addEventListener('pageshow', reopen);
    document.addEventListener('visibilitychange', reopen);
    return () => {
      window.removeEventListener('pageshow', reopen);
      document.removeEventListener('visibilitychange', reopen);
    };
  }, [member?.email]);

  if (!member || member.email) return null;

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailed(false);
    try {
      await actions.requestEmailVerification(email);
      setSent(true);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} data-testid="email-completion-dialog">
        <DialogHeader>
          <span className="grid size-10 place-items-center rounded-full bg-secondary text-primary">
            <MailCheck aria-hidden="true" className="size-5" />
          </span>
          <DialogTitle>
            {ko ? '알림 받을 이메일을 알려 주세요' : 'Add an email for notifications'}
          </DialogTitle>
          <DialogDescription>
            {ko
              ? '대여 요청과 반납 알림을 놓치지 않도록 이메일을 등록해 주세요. 인증 후에만 알림을 보내요.'
              : 'Add your email so you do not miss borrowing and return notifications. We only send notifications after verification.'}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="rounded-xl bg-muted/70 p-3 text-sm leading-6" data-testid="email-verification-sent">
            <p className="font-medium">{ko ? '인증 메일을 보냈어요' : 'Verification email sent'}</p>
            <p className="mt-1 break-all text-muted-foreground">
              {email.trim()} · {ko ? '1시간 안에 링크를 눌러 주세요.' : 'Open the link within one hour.'}
            </p>
          </div>
        ) : (
          <form className="space-y-4" id="email-completion-form" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="notification-email">{ko ? '이메일' : 'Email'}</Label>
              <Input
                id="notification-email"
                autoComplete="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                required
                type="email"
                value={email}
              />
            </div>
            {failed && (
              <p className="text-sm text-destructive" role="alert">
                {ko ? '인증 메일을 보내지 못했어요. 다시 시도해 주세요.' : 'We could not send the verification email. Please try again.'}
              </p>
            )}
          </form>
        )}

        <DialogFooter>
          <Button onClick={() => setOpen(false)} type="button" variant="ghost">
            {ko ? '나중에' : 'Not now'}
          </Button>
          {sent ? (
            <Button onClick={() => setOpen(false)} type="button">
              {ko ? '확인' : 'Done'}
            </Button>
          ) : (
            <Button disabled={state.isMutating || !email.trim()} form="email-completion-form" loading={state.isMutating} type="submit">
              {ko ? '인증 메일 보내기' : 'Send verification email'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
