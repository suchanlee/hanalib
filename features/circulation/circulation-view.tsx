'use client';

import {
  BellRing,
  BookCheck,
  BookOpen,
  Check,
  Clock3,
  MessageSquareText,
  RotateCcw,
  Send,
  UserRound,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHanaApp } from '@/features/app/app-context';
import type {
  AppLocale,
  BorrowRequest,
  CatalogItem,
  Loan,
  Member,
} from '@/lib/domain/types';
import { memberName } from '@/lib/i18n/copy';

const coverClasses: Record<CatalogItem['edition']['coverTone'], string> = {
  amber: 'book-cover-amber',
  blue: 'book-cover-blue',
  green: 'book-cover-green',
  rose: 'book-cover-rose',
  ink: 'book-cover-ink',
  violet: 'book-cover-violet',
};

function t(locale: AppLocale, ko: string, en: string) {
  return locale === 'ko' ? ko : en;
}

function shortDate(locale: AppLocale, value: string) {
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(value));
}

function expiresLabel(locale: AppLocale, expiresAt: string) {
  const hours = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 3_600_000));
  if (hours === 0) return t(locale, '응답 기간 만료', 'Response window expired');
  return t(locale, `${hours}시간 안에 응답`, `Respond within ${hours}h`);
}

function BookThumb({ item }: { item: CatalogItem }) {
  return (
    <div
      aria-hidden="true"
      className={`${coverClasses[item.edition.coverTone]} grid h-24 w-16 shrink-0 place-items-center rounded-md p-2 text-center text-[10px] leading-tight font-semibold text-white shadow-sm`}
    >
      {item.edition.title}
    </div>
  );
}

function EmptyState({
  locale,
  kind,
}: {
  locale: AppLocale;
  kind: 'requests' | 'borrowed' | 'lent';
}) {
  const labels = {
    requests: t(locale, '진행 중인 요청이 없어요', 'No requests in progress'),
    borrowed: t(locale, '빌린 책이 없어요', 'No borrowed books'),
    lent: t(locale, '빌려준 책이 없어요', 'No books currently lent'),
  };
  return (
    <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed bg-muted/25 p-8 text-center">
      <div>
        <BookOpen aria-hidden="true" className="mx-auto mb-3 size-7 text-muted-foreground" />
        <p className="font-medium">{labels[kind]}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, '도서 상세에서 대여를 요청할 수 있어요.', 'Request a book from its detail page.')}
        </p>
      </div>
    </div>
  );
}

function RequestCard({
  request,
  item,
  requester,
  direction,
  locale,
  onAccept,
  onDecline,
  onCancel,
}: {
  request: BorrowRequest;
  item: CatalogItem;
  requester: Member;
  direction: 'incoming' | 'outgoing';
  locale: AppLocale;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  const incoming = direction === 'incoming';
  return (
    <Card data-testid={`borrow-request-${direction}-${request.id}`}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <BookThumb item={item} />
          <div className="min-w-0 flex-1">
            <Badge className="mb-2" variant={incoming ? 'default' : 'secondary'}>
              {incoming ? t(locale, '받은 요청', 'Incoming') : t(locale, '보낸 요청', 'Sent')}
            </Badge>
            <CardTitle className="line-clamp-2">{item.edition.title}</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-1.5">
              <UserRound aria-hidden="true" className="size-3.5" />
              {incoming
                ? t(locale, `${memberName(locale, requester)}님이 빌리고 싶어 해요`, `${memberName(locale, requester)} would like to borrow it`)
                : t(locale, `${memberName(locale, requester)}님에게 요청함`, `Requested from ${memberName(locale, requester)}`)}
            </CardDescription>
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <Clock3 aria-hidden="true" className="size-3.5" />
              {expiresLabel(locale, request.expiresAt)}
            </p>
          </div>
        </div>
      </CardHeader>

      {incoming && (
        <CardContent>
          <div className="flex gap-2.5 rounded-xl bg-secondary/70 p-3 text-sm leading-5 text-secondary-foreground">
            <MessageSquareText aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {t(
                locale,
                '알림 문자에 1로 답장하면 수락, 2로 답장하면 거절돼요. 앱에서도 바로 선택할 수 있어요.',
                'Reply 1 to the alert to accept or 2 to decline. You can also decide here.',
              )}
            </span>
          </div>
        </CardContent>
      )}

      <CardFooter className="gap-2">
        {incoming ? (
          <>
            <Button
              className="h-10 flex-1"
              data-testid={`request-accept-${request.id}`}
              onClick={onAccept}
            >
              <Check aria-hidden="true" />
              {t(locale, '수락', 'Accept')}
            </Button>
            <Button
              className="h-10 flex-1"
              data-testid={`request-decline-${request.id}`}
              onClick={onDecline}
              variant="outline"
            >
              <X aria-hidden="true" />
              {t(locale, '거절', 'Decline')}
            </Button>
          </>
        ) : (
          <Button
            className="h-10 w-full"
            data-testid={`request-cancel-${request.id}`}
            onClick={onCancel}
            variant="outline"
          >
            {t(locale, '요청 취소', 'Cancel request')}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function LoanCard({
  loan,
  item,
  otherMember,
  view,
  locale,
  onReturn,
}: {
  loan: Loan;
  item: CatalogItem;
  otherMember: Member;
  view: 'borrowed' | 'lent';
  locale: AppLocale;
  onReturn: () => void;
}) {
  const borrowed = view === 'borrowed';
  return (
    <Card data-testid={`loan-${view}-${loan.id}`}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <BookThumb item={item} />
          <div className="min-w-0 flex-1">
            <Badge className="mb-2" variant="secondary">
              {borrowed ? t(locale, '빌린 책', 'Borrowed') : t(locale, '빌려준 책', 'Lent')}
            </Badge>
            <CardTitle className="line-clamp-2">{item.edition.title}</CardTitle>
            <CardDescription className="mt-1">
              {borrowed
                ? t(locale, `소유자 · ${memberName(locale, otherMember)}`, `Owner · ${memberName(locale, otherMember)}`)
                : t(locale, `대여자 · ${memberName(locale, otherMember)}`, `Borrower · ${memberName(locale, otherMember)}`)}
            </CardDescription>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(locale, `${shortDate(locale, loan.startedAt)}부터 대여 중`, `On loan since ${shortDate(locale, loan.startedAt)}`)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-2.5 rounded-xl border bg-background p-3">
          <BellRing aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="text-sm leading-5">
            <p className="font-medium">
              {t(locale, `다음 반납 확인 · ${shortDate(locale, loan.nextCheckAt)}`, `Next return check · ${shortDate(locale, loan.nextCheckAt)}`)}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {t(locale, '대여 7일째부터 매주 대여자에게 확인해요.', 'We check with the borrower on day 7, then weekly.')}
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          className="h-10 w-full"
          data-testid={`loan-return-${loan.id}`}
          onClick={onReturn}
          variant={borrowed ? 'default' : 'outline'}
        >
          {borrowed ? <BookCheck aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
          {t(locale, '반납 완료', 'Mark returned')}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function CirculationView() {
  const { state, actions } = useHanaApp();
  const locale = state.locale;
  const itemById = new Map(state.items.map((item) => [item.id, item]));
  const memberById = new Map(state.members.map((member) => [member.id, member]));

  const pending = state.requests.filter((request) => {
    if (request.status !== 'pending') return false;
    const item = itemById.get(request.catalogItemId);
    return request.requesterId === state.currentUserId || item?.ownerId === state.currentUserId;
  });
  const borrowed = state.loans.filter((loan) => loan.status === 'active' && loan.borrowerId === state.currentUserId);
  const lent = state.loans.filter((loan) => loan.status === 'active' && loan.ownerId === state.currentUserId);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-28 sm:px-6" data-testid="circulation-view">
      <header className="mb-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          <Send aria-hidden="true" className="size-3.5" />
          {t(locale, '함께 읽는 기록', 'Sharing activity')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {t(locale, '대여 관리', 'Borrowing')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, '요청과 반납 상태를 한곳에서 확인하세요.', 'Keep requests and returns in one place.')}
        </p>
      </header>

      <Tabs defaultValue="requests">
        <TabsList aria-label={t(locale, '대여 보기', 'Borrowing views')} className="grid h-11 w-full grid-cols-3 rounded-xl p-1">
          <TabsTrigger className="h-full" data-testid="circulation-tab-requests" value="requests">
            {t(locale, '요청', 'Requests')}
            {pending.length > 0 && <span className="rounded-full bg-primary/12 px-1.5 text-[11px] text-primary">{pending.length}</span>}
          </TabsTrigger>
          <TabsTrigger className="h-full" data-testid="circulation-tab-borrowed" value="borrowed">
            {t(locale, '빌린 책', 'Borrowed')}
            {borrowed.length > 0 && <span className="text-[11px]">{borrowed.length}</span>}
          </TabsTrigger>
          <TabsTrigger className="h-full" data-testid="circulation-tab-lent" value="lent">
            {t(locale, '빌려준 책', 'Lent')}
            {lent.length > 0 && <span className="text-[11px]">{lent.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent className="mt-4 space-y-3" value="requests">
          {pending.length === 0 && <EmptyState kind="requests" locale={locale} />}
          {pending.map((request) => {
            const item = itemById.get(request.catalogItemId);
            if (!item) return null;
            const incoming = item.ownerId === state.currentUserId;
            const other = memberById.get(incoming ? request.requesterId : item.ownerId);
            if (!other) return null;
            return (
              <RequestCard
                direction={incoming ? 'incoming' : 'outgoing'}
                item={item}
                key={request.id}
                locale={locale}
                onAccept={() => actions.respondToRequest(request.id, 'accepted')}
                onCancel={() => actions.cancelRequest(request.id)}
                onDecline={() => actions.respondToRequest(request.id, 'declined')}
                request={request}
                requester={other}
              />
            );
          })}
        </TabsContent>

        <TabsContent className="mt-4 space-y-3" value="borrowed">
          {borrowed.length === 0 && <EmptyState kind="borrowed" locale={locale} />}
          {borrowed.map((loan) => {
            const item = itemById.get(loan.catalogItemId);
            const owner = memberById.get(loan.ownerId);
            if (!item || !owner) return null;
            return (
              <LoanCard
                item={item}
                key={loan.id}
                loan={loan}
                locale={locale}
                onReturn={() => actions.markReturned(loan.id)}
                otherMember={owner}
                view="borrowed"
              />
            );
          })}
        </TabsContent>

        <TabsContent className="mt-4 space-y-3" value="lent">
          {lent.length === 0 && <EmptyState kind="lent" locale={locale} />}
          {lent.map((loan) => {
            const item = itemById.get(loan.catalogItemId);
            const borrower = memberById.get(loan.borrowerId);
            if (!item || !borrower) return null;
            return (
              <LoanCard
                item={item}
                key={loan.id}
                loan={loan}
                locale={locale}
                onReturn={() => actions.markReturned(loan.id)}
                otherMember={borrower}
                view="lent"
              />
            );
          })}
        </TabsContent>
      </Tabs>
    </section>
  );
}
