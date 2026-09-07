'use client';

import { categoryLabels, type ThemaCode } from '@/lib/books/categories';
import { YouthBookToggle } from './youth-book-toggle';
import { CategoryPicker } from './category-picker';

import { useEffect, useState, type ChangeEvent } from 'react';
import { ArrowLeft, BookMarked, CalendarDays, Check, CircleAlert, Clock3, Hash, ImagePlus, Languages, Library, Pencil, RefreshCw, Trash2, UserRound, UsersRound } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { issueMessage, userIssue } from '@/features/app/user-issue';
import { useHanaApp } from '@/features/app/app-context';
import { ReturnConfirmationDialog } from '@/features/circulation/return-confirmation-dialog';
import type { BookEdition, CatalogItem } from '@/lib/domain/types';
import { memberName } from '@/lib/i18n/copy';
import { uploadMemberCover, validCoverFile } from '@/lib/storage/client-cover';
import { BookCover } from './book-cover';
import { BookDescription } from './book-description';
import { DescriptionEditor } from './description-editor';
import { catalogCopy, conditionLabel, languageLabel, statusLabel } from './catalog-copy';

type Feedback = { tone: 'success' | 'error'; text: string } | null;

interface EditListingDraft {
  isYouthBook: boolean;
  youthChanged: boolean;
  categoryCodes: ThemaCode[];
  categoriesChanged: boolean;
  title: string;
  titleEn: string;
  authors: string;
  authorsEn: string;
  publisher: string;
  publishedYear: string;
  language: BookEdition['language'];
  pageCount: string;
  description: string;
  descriptionProvenance?: Record<string, string>;
  condition: CatalogItem['condition'];
  ownerNotes: string;
}

function editListingDraft(item?: CatalogItem): EditListingDraft {
  return {
    categoryCodes: item?.edition.categories?.codes ?? [],
    categoriesChanged: false,
    isYouthBook: item?.edition.isYouthBook ?? false,
    youthChanged: false,
    title: item?.edition.title ?? '',
    titleEn: item?.edition.titleEn ?? '',
    authors: item?.edition.authors.join(', ') ?? '',
    authorsEn: item?.edition.authorsEn?.join(', ') ?? '',
    publisher: item?.edition.publisher ?? '',
    publishedYear: item ? String(item.edition.publishedYear) : '',
    language: item?.edition.language ?? 'ko',
    pageCount: item?.edition.pageCount ? String(item.edition.pageCount) : '',
    description: item?.edition.description ?? '',
    condition: item?.condition ?? 'good',
    ownerNotes: item?.ownerNotes ?? '',
  };
}

export function BookDetailView() {
  const { state, actions } = useHanaApp();
  const t = catalogCopy[state.locale];
  const item = state.items.find((candidate) => candidate.id === state.selectedItemId);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<EditListingDraft>(() => editListingDraft(item));
  const [editError, setEditError] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [coverFile, setCoverFile] = useState<File>();
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [coverError, setCoverError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingCover, setIsRefreshingCover] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [holdClaimDialogOpen, setHoldClaimDialogOpen] = useState(false);

  useEffect(() => () => {
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
  }, [coverPreviewUrl]);

  if (!item || item.status === 'archived') {
    return (
      <div className="mx-auto flex min-h-[65dvh] w-full max-w-lg flex-col items-center justify-center px-6 pb-28 text-center" data-testid="detail-missing">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><BookMarked className="size-7" /></div>
        <h1 className="mt-4 text-xl font-semibold">{t.missingTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.missingHelp}</p>
        <Button type="button" className="mt-6 h-11" onClick={() => actions.setScreen('catalog')} data-testid="detail-back">{t.back}</Button>
      </div>
    );
  }

  const owner = state.members.find((member) => member.id === item.ownerId);
  const isOwner = item.ownerId === state.currentUserId;
  const pendingRequest = state.requests.find((request) => request.catalogItemId === item.id && request.requesterId === state.currentUserId && request.status === 'pending');
  const pendingOwnerRequests = state.requests.filter((request) => request.catalogItemId === item.id && request.status === 'pending');
  const activeLoan = state.loans.find((loan) => loan.catalogItemId === item.id && loan.status === 'active');
  const borrower = activeLoan ? state.members.find((member) => member.id === activeLoan.borrowerId) : undefined;
  const isCurrentBorrower = activeLoan?.borrowerId === state.currentUserId;
  const canReturn = Boolean(activeLoan && (activeLoan.ownerId === state.currentUserId || activeLoan.borrowerId === state.currentUserId));
  const ownHold = state.holds.find((hold) => hold.catalogItemId === item.id && (hold.status === 'queued' || hold.status === 'offered'));
  const holdCount = state.holdCounts[item.id] ?? 0;
  const itemId = item.id;
  const itemStatus = item.status;

  async function saveListing() {
    if (!isOwner) {
      setFeedback({ tone: 'error', text: state.locale === 'ko' ? '소유자만 이 도서를 수정할 수 있어요.' : 'Only the owner can edit this listing.' });
      return;
    }

    const publishedYear = Number(editDraft.publishedYear);
    const pageCount = editDraft.pageCount.trim() ? Number(editDraft.pageCount) : null;
    if (
      !editDraft.title.trim() ||
      !Number.isInteger(publishedYear) ||
      publishedYear < 1000 ||
      publishedYear > 2200 ||
      (pageCount !== null && (!Number.isInteger(pageCount) || pageCount <= 0))
    ) {
      setEditError(t.editValidation);
      return;
    }

    setIsSaving(true);
    setCoverError('');
    setEditError('');
    let coverAssetId: string | undefined;
    if (coverFile) {
      try {
        coverAssetId = (await uploadMemberCover(coverFile, state.currentUserId)).assetId;
      } catch (error) {
        actions.reportError(error, 'upload-cover');
        setCoverError(t.coverUploadFailed);
        setIsSaving(false);
        return;
      }
    }
    try {
      await actions.updateItem(itemId, {
        isYouthBook: editDraft.youthChanged ? editDraft.isYouthBook : undefined,
        categoryCodes: editDraft.categoriesChanged ? editDraft.categoryCodes : undefined,
        title: editDraft.title.trim(),
        titleEn: editDraft.titleEn.trim() || null,
        authors: editDraft.authors.split(',').map((author) => author.trim()).filter(Boolean),
        authorsEn: editDraft.authorsEn.split(',').map((author) => author.trim()).filter(Boolean),
        publisher: editDraft.publisher.trim(),
        publishedYear,
        language: editDraft.language,
        pageCount,
        description: editDraft.description.trim() || null,
        descriptionProvenance: editDraft.descriptionProvenance,
        condition: editDraft.condition,
        ownerNotes: editDraft.ownerNotes.trim() || undefined,
        coverAssetId,
      });
      setCoverFile(undefined);
      setCoverPreviewUrl('');
      setEditOpen(false);
      setFeedback({ tone: 'success', text: t.saved });
    } catch {
      setCoverError(state.locale === 'ko' ? '변경사항을 저장하지 못했어요.' : 'We couldn’t save your changes.');
    } finally {
      setIsSaving(false);
    }
  }

  function editField<K extends keyof EditListingDraft>(field: K, value: EditListingDraft[K]) {
    setEditDraft((current) => ({ ...current, [field]: value }));
  }

  function selectCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!validCoverFile(file)) {
      setCoverError(t.coverError);
      event.target.value = '';
      return;
    }
    setCoverFile(file);
    setCoverPreviewUrl(URL.createObjectURL(file));
    setCoverError('');
  }

  async function refreshCover() {
    if (!isOwner) return;
    setIsRefreshingCover(true);
    setCoverError('');
    try {
      await actions.refreshItemCover(itemId);
      setCoverFile(undefined);
      setCoverPreviewUrl('');
      setFeedback({ tone: 'success', text: t.coverRefreshed });
    } catch {
      setCoverError(t.coverRefreshFailed);
    } finally {
      setIsRefreshingCover(false);
    }
  }

  function removeListing() {
    if (!isOwner || itemStatus === 'borrowed') {
      setFeedback({ tone: 'error', text: t.removeBlocked });
      return;
    }
    return actions.archiveItem(itemId).catch(() => {});
  }

  async function requestBook() {
    if (isOwner) {
      setFeedback({ tone: 'error', text: t.ownBook });
      return;
    }
    if (itemStatus !== 'available') {
      setFeedback({ tone: 'error', text: t.unavailable });
      return;
    }
    setIsRequesting(true);
    try {
      await actions.requestBorrow(itemId);
      setRequestDialogOpen(false);
      setFeedback({ tone: 'success', text: t.requested });
    } catch (error) {
      setFeedback({ tone: 'error', text: issueMessage(userIssue(error), state.locale) });
    } finally {
      setIsRequesting(false);
    }
  }

  async function cancelRequest() {
    if (!pendingRequest) return;
    setFeedback(null);
    try {
      await actions.cancelRequest(pendingRequest.id);
      setFeedback({ tone: 'success', text: t.requestCanceled });
    } catch { /* The app displays the error and recovery instructions. */ }
  }

  async function returnBook() {
    if (!activeLoan || !canReturn) {
      setFeedback({ tone: 'error', text: state.locale === 'ko' ? '대여자나 소유자만 반납을 기록할 수 있어요.' : 'Only the borrower or owner can record a return.' });
      return;
    }
    setFeedback(null);
    try {
      await actions.markReturned(activeLoan.id);
      setFeedback({ tone: 'success', text: t.returned });
    } catch { /* The app displays the error and recovery instructions. */ }
  }

  async function joinWaitlist() {
    setIsHolding(true);
    try {
      await actions.joinHold(itemId);
      setFeedback({ tone: 'success', text: t.joinedWaitlist });
    } catch (error) {
      setFeedback({ tone: 'error', text: issueMessage(userIssue(error), state.locale) });
    } finally {
      setIsHolding(false);
    }
  }

  async function leaveWaitlist() {
    if (!ownHold) return;
    setIsHolding(true);
    try {
      await actions.cancelHold(ownHold.id);
      setFeedback({ tone: 'success', text: state.locale === 'ko' ? '대기 목록에서 나왔어요.' : 'You left the waitlist.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: issueMessage(userIssue(error), state.locale) });
    } finally {
      setIsHolding(false);
    }
  }

  async function claimWaitlistOffer() {
    if (!ownHold || ownHold.status !== 'offered') return;
    setIsHolding(true);
    try {
      await actions.claimHold(ownHold.id);
      setHoldClaimDialogOpen(false);
      setFeedback({ tone: 'success', text: t.requested });
    } catch (error) {
      setFeedback({ tone: 'error', text: issueMessage(userIssue(error), state.locale) });
    } finally {
      setIsHolding(false);
    }
  }

  const holdExpiry = ownHold?.expiresAt
    ? new Intl.DateTimeFormat(state.locale === 'ko' ? 'ko-KR' : 'en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
      }).format(new Date(ownHold.expiresAt))
    : '';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-32 pt-3 sm:px-6 sm:pt-6" data-testid="book-detail-view">
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
            {holdCount > 0 ? <Badge variant="outline"><UsersRound className="size-3" />{t.waitingCount(holdCount)}</Badge> : null}
            {activeLoan?.borrowerId === state.currentUserId ? <Badge>{t.onLoanToYou}</Badge> : null}
            {activeLoan?.ownerId === state.currentUserId ? <Badge>{t.lentByYou}</Badge> : null}
          </div>

          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.04em] text-balance sm:text-4xl" data-testid="detail-title">{item.edition.title}</h1>
          {item.edition.titleEn && item.edition.titleEn !== item.edition.title ? (
            <p className="mt-2 text-base text-muted-foreground">{item.edition.titleEn}</p>
          ) : null}
          {item.edition.isYouthBook && <Badge variant="secondary">{state.locale === 'ko' ? '어린이·청소년' : 'Kids & teens'}</Badge>}
          <div className="mt-3 flex flex-wrap gap-2" data-testid="book-categories">
            <span className="text-sm">{categoryLabels(item.edition.categories, state.locale).join(', ')}</span>
            {item.edition.categories?.status === 'review' && <Badge variant="outline">{state.locale === 'ko' ? '분류 확인 필요' : 'Categories need review'}</Badge>}
            {item.edition.categories?.status === 'suggested' && <span className="text-sm text-muted-foreground">{state.locale === 'ko' ? '자동 분류' : 'Suggested categories'}</span>}
          </div>
          <p className="mt-4 text-lg">{item.edition.authors.join(', ') || (state.locale === 'ko' ? '저자 정보 없음' : 'Author not listed')}</p>
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
            ) : !isCurrentBorrower && ownHold?.status === 'offered' ? (
              <div className="rounded-2xl border border-primary/30 bg-secondary/60 p-4 sm:col-span-2" data-testid="hold-offer">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">{t.holdReady}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t.holdReadyHelp(holdExpiry)}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <AlertDialog open={holdClaimDialogOpen} onOpenChange={(open) => { if (!isHolding) setHoldClaimDialogOpen(open); }}>
                    <AlertDialogTrigger render={<Button type="button" className="h-11" data-testid="claim-hold" />}>
                      {t.claimHold}
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogMedia><BookMarked /></AlertDialogMedia>
                        <AlertDialogTitle>{t.requestConfirmTitle}</AlertDialogTitle>
                        <AlertDialogDescription>{t.requestConfirmHelp(owner ? memberName(state.locale, owner) : '—')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="h-11" disabled={isHolding}>{t.cancel}</AlertDialogCancel>
                        <AlertDialogAction className="h-11" disabled={isHolding} onClick={claimWaitlistOffer} data-testid="confirm-claim-hold">
                          {isHolding ? t.requesting : t.confirmRequest}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button type="button" variant="outline" className="h-11" disabled={isHolding} onClick={leaveWaitlist} data-testid="pass-hold">
                    {t.passHold}
                  </Button>
                </div>
              </div>
            ) : !isCurrentBorrower && ownHold?.status === 'queued' ? (
              <div className="rounded-2xl border bg-muted/40 p-4 sm:col-span-2" data-testid="hold-queued">
                <p className="font-semibold">{t.waitlistPosition(ownHold.position, holdCount)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.joinWaitlistHelp}</p>
                <Button type="button" variant="outline" className="mt-4 h-11 w-full" disabled={isHolding} onClick={leaveWaitlist} data-testid="cancel-hold">
                  {t.leaveWaitlist}
                </Button>
              </div>
            ) : !isOwner && !isCurrentBorrower && item.status !== 'available' ? (
              <div className="rounded-2xl border bg-muted/40 p-4 sm:col-span-2">
                <p className="font-semibold">{t.waitingCount(holdCount)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.joinWaitlistHelp}</p>
                <Button type="button" className="mt-4 h-11 w-full" disabled={isHolding} onClick={joinWaitlist} data-testid="join-hold">
                  {t.joinWaitlist}
                </Button>
              </div>
            ) : !isOwner && item.status === 'available' ? (
              <AlertDialog open={requestDialogOpen} onOpenChange={(open) => { if (!isRequesting) setRequestDialogOpen(open); }}>
                <AlertDialogTrigger
                  render={<Button type="button" className="h-12 sm:col-span-2" data-testid="request-borrow" />}
                >
                  {t.request}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia><BookMarked /></AlertDialogMedia>
                    <AlertDialogTitle>{t.requestConfirmTitle}</AlertDialogTitle>
                    <AlertDialogDescription>{t.requestConfirmHelp(owner ? memberName(state.locale, owner) : '—')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="h-11" disabled={isRequesting} data-testid="cancel-borrow-confirmation">{t.cancel}</AlertDialogCancel>
                    <AlertDialogAction
                      type="button"
                      className="h-11"
                      disabled={isRequesting}
                      onClick={requestBook}
                      data-testid="confirm-borrow-request"
                    >
                      {isRequesting ? t.requesting : t.confirmRequest}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}

            {canReturn ? (
              <ReturnConfirmationDialog
                bookTitle={item.edition.title}
                locale={state.locale}
                onConfirm={returnBook}
                trigger={(
                  <Button type="button" className="h-12 sm:col-span-2" data-testid="mark-returned">
                    <Check className="size-5" />
                    {t.returnBook}
                  </Button>
                )}
              />
            ) : null}

            {isOwner ? (
              <>
                <Dialog open={editOpen} onOpenChange={(open) => { if (!isSaving) setEditOpen(open); }}>
                  <DialogTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12"
                        data-testid="edit-listing"
                        onClick={() => {
                          setEditDraft(editListingDraft(item));
                          setEditError('');
                          setCoverFile(undefined);
                          setCoverPreviewUrl('');
                          setCoverError('');
                          setEditOpen(true);
                        }}
                      />
                    }
                  >
                    <Pencil className="size-4" />
                    {t.edit}
                  </DialogTrigger>
                  <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{t.editTitle}</DialogTitle>
                      <DialogDescription>{t.editHelp}</DialogDescription>
                    </DialogHeader>
                    <form id="edit-listing-form" className="min-h-0 space-y-4 overflow-y-auto pr-1" onSubmit={(event) => { event.preventDefault(); void saveListing(); }}>
                      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-4 rounded-2xl bg-muted/60 p-3">
                        <BookCover
                          edition={coverPreviewUrl ? { ...item.edition, coverUrl: coverPreviewUrl } : item.edition}
                          className="aspect-[2/3] w-[72px] rounded-xl"
                        />
                        <div className="min-w-0">
                          <Label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium">
                            <ImagePlus aria-hidden="true" className="size-4" />
                            {t.replaceCover}
                            <input
                              accept="image/jpeg,image/png,image/webp"
                              capture="environment"
                              className="sr-only"
                              data-testid="edit-cover-upload"
                              disabled={isSaving}
                              onChange={selectCover}
                              type="file"
                            />
                          </Label>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">{t.coverHelp}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            className="mt-2 h-10 px-2"
                            disabled={isSaving || isRefreshingCover}
                            onClick={refreshCover}
                            data-testid="refresh-cover"
                          >
                            <RefreshCw aria-hidden="true" className={`size-4 ${isRefreshingCover ? 'animate-spin' : ''}`} />
                            {isRefreshingCover ? t.refreshingCover : t.refreshCover}
                          </Button>
                        </div>
                      </div>
                      {coverError ? <p className="text-sm text-destructive" role="alert">{coverError}</p> : null}
                      <div className="space-y-2">
                        <Label htmlFor="item-isbn">ISBN</Label>
                        <Input id="item-isbn" className="h-11 bg-muted/40 text-muted-foreground" readOnly value={item.edition.isbn13} />
                        <p className="text-xs text-muted-foreground">{t.isbnHelp}</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="item-title">{t.titleLabel}</Label>
                        <Input id="item-title" className="h-11" required value={editDraft.title} onChange={(event) => editField('title', event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="item-title-en">{t.titleEnLabel}</Label>
                        <Input id="item-title-en" className="h-11" value={editDraft.titleEn} onChange={(event) => editField('titleEn', event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="item-authors">{t.authorsLabel}</Label>
                        <Input id="item-authors" className="h-11" value={editDraft.authors} onChange={(event) => editField('authors', event.target.value)} />
                        <p className="text-xs text-muted-foreground">{t.authorsHelp}</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="item-authors-en">{t.authorsEnLabel}</Label>
                        <Input id="item-authors-en" className="h-11" value={editDraft.authorsEn} onChange={(event) => editField('authorsEn', event.target.value)} />
                        <p className="text-xs text-muted-foreground">{t.authorsHelp}</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="item-publisher">{t.publisherLabel}</Label>
                        <Input id="item-publisher" className="h-11" value={editDraft.publisher} onChange={(event) => editField('publisher', event.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="item-published-year">{t.publishedYearLabel}</Label>
                          <Input id="item-published-year" className="h-11" inputMode="numeric" min="1000" max="2200" required type="number" value={editDraft.publishedYear} onChange={(event) => editField('publishedYear', event.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="item-page-count">{t.pageCountLabel}</Label>
                          <Input id="item-page-count" className="h-11" inputMode="numeric" min="1" type="number" value={editDraft.pageCount} onChange={(event) => editField('pageCount', event.target.value)} />
                        </div>
                      </div>
                      <YouthBookToggle locale={state.locale} checked={editDraft.isYouthBook}
                        onChange={(isYouthBook) => setEditDraft((current) => ({ ...current, isYouthBook, youthChanged: true }))} />
                      <CategoryPicker locale={state.locale} codes={editDraft.categoryCodes}
                        status={editDraft.categoriesChanged ? 'confirmed' : item.edition.categories?.status}
                        onChange={(categoryCodes) => setEditDraft((current) => ({ ...current, categoryCodes, categoriesChanged: true }))} />
                      <div className="space-y-2">
                        <Label htmlFor="item-language">{t.language}</Label>
                        <NativeSelect
                          id="item-language"
                          className="w-full [&_select]:h-11 [&_select]:bg-background [&_select]:px-3 [&_select]:text-base"
                          value={editDraft.language}
                          onChange={(event) => editField('language', event.target.value as EditListingDraft['language'])}
                        >
                          <NativeSelectOption value="ko">{t.korean}</NativeSelectOption>
                          <NativeSelectOption value="en">{t.english}</NativeSelectOption>
                        </NativeSelect>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="item-condition">{t.condition}</Label>
                        <NativeSelect
                          id="item-condition"
                          className="w-full [&_select]:h-11 [&_select]:bg-background [&_select]:px-3 [&_select]:text-base"
                          value={editDraft.condition}
                          onChange={(event) => editField('condition', event.target.value as EditListingDraft['condition'])}
                          data-testid="item-condition"
                        >
                          <NativeSelectOption value="like-new">{t.likeNew}</NativeSelectOption>
                          <NativeSelectOption value="good">{t.good}</NativeSelectOption>
                          <NativeSelectOption value="well-loved">{t.wellLoved}</NativeSelectOption>
                        </NativeSelect>
                      </div>
                      <DescriptionEditor id="item-description" isbn13={item.edition.isbn13} locale={state.locale} bookLanguage={editDraft.language}
                        value={editDraft.description} onChange={(value, provenance) => { setEditDraft((draft) => ({ ...draft, description: value, descriptionProvenance: provenance })); setEditError(''); }} />
                      <div className="space-y-2">
                        <Label htmlFor="owner-notes">{t.ownerNote}</Label>
                        <Textarea id="owner-notes" value={editDraft.ownerNotes} onChange={(event) => editField('ownerNotes', event.target.value)} maxLength={280} className="min-h-24" data-testid="owner-notes" />
                      </div>
                      {editError ? <p className="text-sm text-destructive" role="alert">{editError}</p> : null}
                    </form>
                    <DialogFooter>
                      <Button type="button" variant="outline" className="h-11" disabled={isSaving} onClick={() => setEditOpen(false)}>{t.cancel}</Button>
                      <Button type="submit" form="edit-listing-form" className="h-11" loading={isSaving} disabled={isSaving} data-testid="save-listing">{isSaving ? t.saving : t.save}</Button>
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
        {item.edition.description ? <BookDescription key={`${item.id}:${item.edition.description}`} description={item.edition.description} locale={state.locale} /> : null}
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metadata icon={<CalendarDays />} label={t.published} value={item.edition.publisher ? `${item.edition.publisher} · ${item.edition.publishedYear}` : String(item.edition.publishedYear)} />
          <Metadata icon={<Hash />} label={t.isbn} value={item.edition.isbn13} />
          <Metadata icon={<Languages />} label={t.language} value={languageLabel(state.locale, item.edition.language)} />
          <Metadata icon={<BookMarked />} label={t.condition} value={conditionLabel(state.locale, item.condition)} />
          {item.edition.pageCount ? <Metadata icon={<Library />} label={state.locale === 'ko' ? '분량' : 'Length'} value={`${item.edition.pageCount} ${t.pages}`} /> : null}
        </dl>
        <div className="mt-3 rounded-xl border bg-card p-4">
          <dt className="text-xs font-medium text-muted-foreground">{t.ownerNote}</dt>
          <dd className="mt-1 text-sm leading-relaxed">{item.ownerNotes || t.noOwnerNote}</dd>
        </div>
      </section>
    </div>
  );
}

function Metadata({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
      <span className="mt-0.5 text-primary [&>svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}
