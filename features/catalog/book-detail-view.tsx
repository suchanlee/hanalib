'use client';

import { useState } from 'react';
import { ArrowLeft, BookMarked, CalendarDays, Check, CircleAlert, Hash, Languages, Library, Pencil, Trash2, UserRound } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useHanaApp } from '@/features/app/app-context';
import type { CatalogItem } from '@/lib/domain/types';
import { memberName } from '@/lib/i18n/copy';
import { BookCover } from './book-cover';
import { catalogCopy, conditionLabel, languageLabel, statusLabel } from './catalog-copy';

type Feedback = { tone: 'success' | 'error'; text: string } | null;

export function BookDetailView() {
  const { state, actions } = useHanaApp();
  const t = catalogCopy[state.locale];
  const item = state.items.find((candidate) => candidate.id === state.selectedItemId);
  const [editOpen, setEditOpen] = useState(false);
  const [condition, setCondition] = useState<CatalogItem['condition']>(item?.condition ?? 'good');
  const [ownerNotes, setOwnerNotes] = useState(item?.ownerNotes ?? '');
  const [feedback, setFeedback] = useState<Feedback>(null);

  if (!item || item.status === 'archived') {
    return (
      <main className="mx-auto flex min-h-[65dvh] w-full max-w-lg flex-col items-center justify-center px-6 pb-28 text-center" data-testid="detail-missing">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><BookMarked className="size-7" /></div>
        <h1 className="mt-4 text-xl font-semibold">{t.missingTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.missingHelp}</p>
        <Button type="button" className="mt-6 h-11" onClick={() => actions.setScreen('catalog')} data-testid="detail-back">{t.back}</Button>
      </main>
    );
  }

  const owner = state.members.find((member) => member.id === item.ownerId);
  const isOwner = item.ownerId === state.currentUserId;
  const pendingRequest = state.requests.find((request) => request.catalogItemId === item.id && request.requesterId === state.currentUserId && request.status === 'pending');
  const pendingOwnerRequests = state.requests.filter((request) => request.catalogItemId === item.id && request.status === 'pending');
  const activeLoan = state.loans.find((loan) => loan.catalogItemId === item.id && loan.status === 'active');
  const borrower = activeLoan ? state.members.find((member) => member.id === activeLoan.borrowerId) : undefined;
  const canReturn = Boolean(activeLoan && (activeLoan.ownerId === state.currentUserId || activeLoan.borrowerId === state.currentUserId));
  const itemId = item.id;
  const itemStatus = item.status;

  function saveListing() {
    if (!isOwner) {
      setFeedback({ tone: 'error', text: state.locale === 'ko' ? '소유자만 이 도서를 수정할 수 있어요.' : 'Only the owner can edit this listing.' });
      return;
    }
    actions.updateItem(itemId, { condition, ownerNotes: ownerNotes.trim() || undefined });
    setEditOpen(false);
    setFeedback({ tone: 'success', text: t.saved });
  }

  function removeListing() {
    if (!isOwner || itemStatus === 'borrowed') {
      setFeedback({ tone: 'error', text: t.removeBlocked });
      return;
    }
    actions.archiveItem(itemId);
  }

  function requestBook() {
    if (isOwner) {
      setFeedback({ tone: 'error', text: t.ownBook });
      return;
    }
    if (itemStatus !== 'available') {
      setFeedback({ tone: 'error', text: t.unavailable });
      return;
    }
    actions.requestBorrow(itemId);
    setFeedback({ tone: 'success', text: t.requested });
  }

  function cancelRequest() {
    if (!pendingRequest) return;
    actions.cancelRequest(pendingRequest.id);
    setFeedback({ tone: 'success', text: t.requestCanceled });
  }

  function returnBook() {
    if (!activeLoan || !canReturn) {
      setFeedback({ tone: 'error', text: state.locale === 'ko' ? '대여자나 소유자만 반납을 기록할 수 있어요.' : 'Only the borrower or owner can record a return.' });
      return;
    }
    actions.markReturned(activeLoan.id);
    setFeedback({ tone: 'success', text: t.returned });
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-32 pt-3 sm:px-6 sm:pt-6" data-testid="book-detail-view">
      <Button type="button" variant="ghost" className="-ml-2 h-11" onClick={() => actions.setScreen('catalog')} data-testid="detail-back">
        <ArrowLeft className="size-5" />
        {t.back}
      </Button>

      <div className="mt-3 grid gap-7 md:grid-cols-[minmax(220px,320px)_1fr] md:gap-10">
        <div className="mx-auto w-full max-w-[270px] md:mx-0 md:max-w-none">
          <BookCover edition={item.edition} eager className="aspect-[2/3] w-full" />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.status === 'available' ? 'secondary' : 'outline'} data-testid="detail-status">{statusLabel(state.locale, item.status)}</Badge>
            {isOwner ? <Badge variant="outline">{t.mine}</Badge> : null}
            {activeLoan?.borrowerId === state.currentUserId ? <Badge>{t.onLoanToYou}</Badge> : null}
            {activeLoan?.ownerId === state.currentUserId ? <Badge>{t.lentByYou}</Badge> : null}
          </div>

          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.04em] text-balance sm:text-4xl" data-testid="detail-title">{item.edition.title}</h1>
          {item.edition.titleEn && item.edition.titleEn !== item.edition.title ? (
            <p className="mt-2 text-base text-muted-foreground">{item.edition.titleEn}</p>
          ) : null}
          <p className="mt-4 text-lg">{item.edition.authors.join(', ')}</p>
          {item.edition.authorsEn?.length ? <p className="mt-1 text-sm text-muted-foreground">{item.edition.authorsEn.join(', ')}</p> : null}

          <div className="mt-6 flex items-center gap-3 rounded-2xl border bg-card p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground">
              {owner?.initials ?? <UserRound className="size-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t.owner}</p>
              <p className="truncate font-semibold" data-testid="detail-owner">{owner ? memberName(state.locale, owner) : '—'}</p>
            </div>
            {pendingOwnerRequests.length && isOwner ? <Badge variant="outline" className="ml-auto">{t.pendingRequests(pendingOwnerRequests.length)}</Badge> : null}
          </div>

          {activeLoan && borrower ? (
            <div className="mt-3 flex items-start gap-3 rounded-2xl bg-muted p-4 text-sm">
              <Library className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">{t.borrowedBy(memberName(state.locale, borrower))}</p>
                <p className="mt-1 text-muted-foreground">
                  {state.locale === 'ko' ? '반납 예정일 없이 매주 상태를 확인해요.' : 'No due date; we check in weekly until it is returned.'}
                </p>
              </div>
            </div>
          ) : null}

          {feedback ? (
            <div
              className={`mt-4 flex items-start gap-2 rounded-2xl p-3 text-sm ${feedback.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`}
              role={feedback.tone === 'error' ? 'alert' : 'status'}
              data-testid="detail-feedback"
            >
              {feedback.tone === 'error' ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <Check className="mt-0.5 size-4 shrink-0" />}
              <p>{feedback.text}</p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {pendingRequest ? (
              <>
                <div className="rounded-2xl border border-primary/20 bg-secondary/50 p-4 sm:col-span-2">
                  <p className="font-semibold">{t.requestPending}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t.requestPendingHelp}</p>
                </div>
                <Button type="button" variant="outline" className="h-12 sm:col-span-2" onClick={cancelRequest} data-testid="cancel-borrow-request">{t.cancelRequest}</Button>
              </>
            ) : !isOwner && item.status === 'available' ? (
              <Button type="button" className="h-12 sm:col-span-2" onClick={requestBook} data-testid="request-borrow">{t.request}</Button>
            ) : null}

            {canReturn ? (
              <Button type="button" className="h-12 sm:col-span-2" onClick={returnBook} data-testid="mark-returned">
                <Check className="size-5" />
                {t.returnBook}
              </Button>
            ) : null}

            {isOwner ? (
              <>
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12"
                        data-testid="edit-listing"
                        onClick={() => {
                          setCondition(item.condition);
                          setOwnerNotes(item.ownerNotes ?? '');
                          setEditOpen(true);
                        }}
                      />
                    }
                  >
                    <Pencil className="size-4" />
                    {t.edit}
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>{t.editTitle}</DialogTitle>
                      <DialogDescription>{t.editHelp}</DialogDescription>
                    </DialogHeader>
                    <form id="edit-listing-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); saveListing(); }}>
                      <div className="space-y-2">
                        <Label htmlFor="item-condition">{t.condition}</Label>
                        <select
                          id="item-condition"
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                          value={condition}
                          onChange={(event) => setCondition(event.target.value as CatalogItem['condition'])}
                          data-testid="item-condition"
                        >
                          <option value="like-new">{t.likeNew}</option>
                          <option value="good">{t.good}</option>
                          <option value="well-loved">{t.wellLoved}</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="owner-notes">{t.ownerNote}</Label>
                        <Textarea id="owner-notes" value={ownerNotes} onChange={(event) => setOwnerNotes(event.target.value)} maxLength={280} className="min-h-24" data-testid="owner-notes" />
                      </div>
                    </form>
                    <DialogFooter>
                      <Button type="button" variant="outline" className="h-11" onClick={() => setEditOpen(false)}>{t.cancel}</Button>
                      <Button type="submit" form="edit-listing-form" className="h-11" data-testid="save-listing">{t.save}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <AlertDialog>
                  <AlertDialogTrigger render={<Button type="button" variant="destructive" className="h-12" data-testid="remove-listing" />}>
                    <Trash2 className="size-4" />
                    {t.remove}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogMedia className="text-destructive"><Trash2 /></AlertDialogMedia>
                      <AlertDialogTitle>{t.removeTitle}</AlertDialogTitle>
                      <AlertDialogDescription>{item.status === 'borrowed' ? t.removeBlocked : t.removeHelp}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="h-11">{t.cancel}</AlertDialogCancel>
                      <AlertDialogAction
                        type="button"
                        variant="destructive"
                        className="h-11"
                        disabled={item.status === 'borrowed'}
                        onClick={removeListing}
                        data-testid="confirm-remove-listing"
                      >
                        {t.confirmRemove}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <section className="mt-10 border-t pt-7" aria-labelledby="book-metadata-heading">
        <h2 id="book-metadata-heading" className="text-lg font-semibold">{t.details}</h2>
        {item.edition.description ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{item.edition.description}</p> : null}
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metadata icon={<CalendarDays />} label={t.published} value={`${item.edition.publisher} · ${item.edition.publishedYear}`} />
          <Metadata icon={<Hash />} label={t.isbn} value={item.edition.isbn13} />
          <Metadata icon={<Languages />} label={t.language} value={languageLabel(state.locale, item.edition.language)} />
          <Metadata icon={<BookMarked />} label={t.condition} value={conditionLabel(state.locale, item.condition)} />
          {item.edition.pageCount ? <Metadata icon={<Library />} label={state.locale === 'ko' ? '분량' : 'Length'} value={`${item.edition.pageCount} ${t.pages}`} /> : null}
        </dl>
        <div className="mt-3 rounded-2xl border bg-card p-4">
          <dt className="text-xs font-medium text-muted-foreground">{t.ownerNote}</dt>
          <dd className="mt-1 text-sm leading-relaxed">{item.ownerNotes || t.noOwnerNote}</dd>
        </div>
      </section>
    </main>
  );
}

function Metadata({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
      <span className="mt-0.5 text-primary [&>svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}
