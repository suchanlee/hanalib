'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  BookOpen,
  Camera,
  Check,
  CircleAlert,
  ImagePlus,
  Keyboard,
  LoaderCircle,
  RefreshCw,
  ScanLine,
  Sparkles,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useHanaApp } from '@/features/app/app-context';
import type { AddBookInput, AppLocale, CatalogItem } from '@/lib/domain/types';
import { parseIsbn } from '@/lib/isbn/isbn';
import { ResolvedBookProvider, type StitchedBookMetadata } from '@/lib/isbn/providers';
import type { IScannerControls } from '@zxing/browser';

type IntakeStage = 'idle' | 'permission' | 'scanning' | 'lookup' | 'confirm' | 'error' | 'success';

interface IntakeDraft {
  isbn13: string;
  title: string;
  titleEn: string;
  authors: string;
  publisher: string;
  publishedYear: string;
  language: AddBookInput['language'];
  pageCount: string;
  coverUrl: string;
  condition: CatalogItem['condition'];
  ownerNotes: string;
  provenance: Record<string, string>;
}

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

const DEMO_ISBN = '9788936434267';

const intakeCopy = {
  ko: {
    eyebrow: '새 도서 추가',
    title: '바코드 한 번이면 끝나요',
    intro: '책 뒤의 ISBN 바코드를 비추면 한국어·영어 도서 정보를 찾아 한 화면에서 확인할 수 있어요.',
    scan: '바코드 스캔',
    scanHelp: '카메라는 바코드를 읽는 동안에만 사용해요.',
    permission: '카메라 연결 중…',
    scanning: 'ISBN 바코드를 프레임 안에 맞춰 주세요',
    scanningHelp: '자동으로 읽히면 바로 도서 정보를 찾아요.',
    detectorUnavailable: '자동 인식을 시작하지 못했어요. 촬영 화면 아래 ISBN 입력을 이용해 주세요.',
    simulate: '샘플 바코드 스캔',
    stop: '스캔 그만두기',
    manualTitle: 'ISBN 직접 입력',
    manualHelp: '카메라를 쓸 수 없거나 인식이 안 될 때 이용하세요.',
    isbnPlaceholder: '예: 9788936434267',
    find: '도서 찾기',
    looking: '가장 좋은 도서 정보를 찾는 중…',
    lookingHelp: '여러 도서 제공처에서 ISBN이 정확히 일치하는 판본을 비교해요.',
    invalidTitle: 'ISBN을 확인해 주세요',
    invalidBody: '10자리 또는 13자리 ISBN을 정확히 입력해 주세요. 하이픈은 있어도 괜찮아요.',
    notFoundTitle: '일치하는 도서를 찾지 못했어요',
    notFoundBody: 'ISBN은 유효하지만 제공처에 정보가 없어요. 기본 정보를 직접 입력해 추가할 수 있어요.',
    lookupTitle: '도서 정보 제공처에 연결할 수 없어요',
    lookupBody: '잠시 후 다시 시도하거나 아래에서 ISBN과 도서 정보를 직접 입력해 주세요.',
    cameraTitle: '카메라를 열 수 없어요',
    cameraBody: '브라우저의 카메라 권한을 확인하거나 ISBN을 직접 입력해 주세요.',
    enterManually: '정보 직접 입력',
    retry: '다시 시도',
    confirmEyebrow: '정보 확인',
    confirmTitle: '이 책이 맞나요?',
    confirmHelp: '여러 제공처의 정보를 합쳤어요. 필요한 부분만 고쳐 주세요.',
    titleLabel: '제목',
    titleEnLabel: '영문 제목 (선택)',
    authorLabel: '저자',
    authorHelp: '여러 명이면 쉼표로 구분해 주세요.',
    publisherLabel: '출판사',
    yearLabel: '출판 연도',
    languageLabel: '언어',
    pagesLabel: '쪽수 (선택)',
    conditionLabel: '책 상태',
    notesLabel: '소유자 메모 (선택)',
    notesPlaceholder: '접힌 곳, 밑줄 등 빌리는 분이 알면 좋은 점',
    coverLabel: '표지',
    uploadCover: '표지 사진 올리기',
    coverHelp: '제공처 표지가 없거나 정확하지 않다면 휴대폰 사진으로 바꿀 수 있어요. 최대 8MB.',
    coverError: '8MB 이하의 이미지 파일을 선택해 주세요.',
    uploadFailed: '표지 사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
    saveFailed: '도서를 추가하지 못했어요. 잠시 후 다시 시도해 주세요.',
    requiredError: '제목, 저자, 출판사, 출판 연도를 확인해 주세요.',
    back: 'ISBN으로 돌아가기',
    create: '내 도서로 추가',
    creating: '도서 추가 중…',
    createdEyebrow: '추가 완료',
    createdTitle: '도서관에 책을 추가했어요',
    createdBody: '이제 다른 회원들이 도서를 찾고 대여를 요청할 수 있어요.',
    viewBook: '도서 상세 보기',
    addAnother: '다른 책 추가',
    korean: '한국어',
    english: '영어',
    other: '기타',
    likeNew: '새 책 같음',
    good: '좋음',
    loved: '사용감 있음',
    required: '필수 입력',
  },
  en: {
    eyebrow: 'Add a new book',
    title: 'One scan, then you’re done',
    intro: 'Point your camera at the ISBN barcode. We’ll find Korean or English metadata for you to review in one place.',
    scan: 'Scan barcode',
    scanHelp: 'Your camera is used only while the scanner is open.',
    permission: 'Connecting to your camera…',
    scanning: 'Place the ISBN barcode inside the frame',
    scanningHelp: 'We’ll look up the book as soon as it is detected.',
    detectorUnavailable: 'Automatic detection could not start. Enter the ISBN below the camera instead.',
    simulate: 'Scan sample barcode',
    stop: 'Stop scanning',
    manualTitle: 'Enter ISBN instead',
    manualHelp: 'Use this if the camera is unavailable or the barcode will not scan.',
    isbnPlaceholder: 'e.g. 9788936434267',
    find: 'Find book',
    looking: 'Finding the best book information…',
    lookingHelp: 'Comparing exact-edition ISBN matches across book providers.',
    invalidTitle: 'Check the ISBN',
    invalidBody: 'Enter a valid 10- or 13-digit ISBN. Hyphens are okay.',
    notFoundTitle: 'We couldn’t find a matching book',
    notFoundBody: 'The ISBN is valid, but the providers had no metadata. You can still add the details yourself.',
    lookupTitle: 'The book providers are unavailable',
    lookupBody: 'Try again shortly, or enter the ISBN and book details manually below.',
    cameraTitle: 'We couldn’t open the camera',
    cameraBody: 'Check camera permission in your browser, or enter the ISBN manually.',
    enterManually: 'Enter details manually',
    retry: 'Try again',
    confirmEyebrow: 'Review details',
    confirmTitle: 'Is this the right book?',
    confirmHelp: 'We combined the best fields from multiple providers. Change anything that needs fixing.',
    titleLabel: 'Title',
    titleEnLabel: 'English title (optional)',
    authorLabel: 'Author',
    authorHelp: 'Separate multiple authors with commas.',
    publisherLabel: 'Publisher',
    yearLabel: 'Published year',
    languageLabel: 'Language',
    pagesLabel: 'Page count (optional)',
    conditionLabel: 'Condition',
    notesLabel: 'Owner note (optional)',
    notesPlaceholder: 'Mention folds, notes, or anything a borrower should know',
    coverLabel: 'Cover',
    uploadCover: 'Upload cover photo',
    coverHelp: 'If the provider cover is missing or wrong, use a phone photo up to 8MB.',
    coverError: 'Choose an image file no larger than 8MB.',
    uploadFailed: 'We couldn’t save the cover photo. Please try again.',
    saveFailed: 'We couldn’t add the book. Please try again.',
    requiredError: 'Check the title, author, publisher, and published year.',
    back: 'Back to ISBN',
    create: 'Add to my library',
    creating: 'Adding book…',
    createdEyebrow: 'All set',
    createdTitle: 'Your book is in the library',
    createdBody: 'Other members can now discover it and ask to borrow it.',
    viewBook: 'View book details',
    addAnother: 'Add another book',
    korean: 'Korean',
    english: 'English',
    other: 'Other',
    likeNew: 'Like new',
    good: 'Good',
    loved: 'Well loved',
    required: 'Required',
  },
} as const;

function createDraft(metadata: StitchedBookMetadata): IntakeDraft {
  return {
    isbn13: metadata.isbn13,
    title: metadata.title,
    titleEn: metadata.titleEn ?? '',
    authors: metadata.authors.join(', '),
    publisher: metadata.publisher,
    publishedYear: String(metadata.publishedYear),
    language: metadata.language,
    pageCount: metadata.pageCount ? String(metadata.pageCount) : '',
    coverUrl: metadata.coverUrl ?? '',
    condition: 'good',
    ownerNotes: '',
    provenance: metadata.provenance,
  };
}

function blankDraft(isbn13: string, locale: AppLocale): IntakeDraft {
  return createDraft({
    isbn13,
    title: '',
    authors: [],
    publisher: '',
    publishedYear: new Date().getFullYear(),
    language: locale === 'ko' ? 'ko' : 'en',
    provenance: { isbn13: 'member' },
  });
}

function barcodeDetectorConstructor() {
  return (globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

interface UploadedCover {
  assetId: string;
  coverUrl: string;
  byteSize: number;
  contentType: string;
}

async function uploadMemberCover(file: File, memberId: string) {
  const headers = new Headers({ 'content-type': file.type, 'x-file-name': file.name });
  if (process.env.NODE_ENV !== 'production') headers.set('x-hana-demo-member-id', memberId);
  const response = await fetch('/api/covers', {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: file,
  });
  if (!response.ok) throw new Error(`Cover upload failed (${response.status}).`);
  return await response.json() as UploadedCover;
}

function ManualIsbnForm({
  locale,
  value,
  disabled,
  onChange,
  onSubmit,
}: {
  locale: AppLocale;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const c = intakeCopy[locale];

  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader className="gap-1 pb-3">
        <div className="flex items-center gap-2">
          <Keyboard aria-hidden="true" className="size-4 text-primary" />
          <CardTitle className="text-base">{c.manualTitle}</CardTitle>
        </div>
        <CardDescription>{c.manualHelp}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="min-w-0 flex-1">
            <Label className="sr-only" htmlFor="manual-isbn">ISBN</Label>
            <Input
              autoCapitalize="characters"
              autoComplete="off"
              className="h-11 font-mono text-base"
              data-testid="manual-isbn"
              disabled={disabled}
              id="manual-isbn"
              inputMode="text"
              onChange={(event) => onChange(event.target.value)}
              placeholder={c.isbnPlaceholder}
              value={value}
            />
          </div>
          <Button className="h-11 px-4" data-testid="manual-lookup" disabled={disabled || !value.trim()} type="submit">
            {c.find}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function IntakeView() {
  const { state, actions } = useHanaApp();
  const locale = state.locale;
  const c = intakeCopy[locale];
  const [stage, setStage] = useState<IntakeStage>('idle');
  const [manualIsbn, setManualIsbn] = useState('');
  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [errorKind, setErrorKind] = useState<'invalid' | 'not-found' | 'camera' | 'lookup'>('invalid');
  const [formError, setFormError] = useState('');
  const [coverError, setCoverError] = useState('');
  const [coverFile, setCoverFile] = useState<File>();
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [createdItemId, setCreatedItemId] = useState<string>();
  const [autoDetectionAvailable, setAutoDetectionAvailable] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionTimerRef = useRef<number | undefined>(undefined);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const uploadUrlRef = useRef<string | undefined>(undefined);
  const lookupSequenceRef = useRef(0);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const cameraAttemptRef = useRef(0);

  const stopCamera = useCallback(() => {
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    if (detectionTimerRef.current !== undefined) {
      window.clearTimeout(detectionTimerRef.current);
      detectionTimerRef.current = undefined;
    }
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => {
    cameraAttemptRef.current += 1;
    stopCamera();
    lookupAbortRef.current?.abort();
    if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current);
  }, [stopCamera]);

  const performLookup = useCallback(async (rawIsbn: string, allowDevelopmentFixture = false) => {
    const parsed = parseIsbn(rawIsbn);
    stopCamera();
    if (!parsed) {
      setErrorKind('invalid');
      setStage('error');
      return;
    }

    const sequence = ++lookupSequenceRef.current;
    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;
    setManualIsbn(parsed.isbn13);
    setStage('lookup');
    let metadata: StitchedBookMetadata | null;
    try {
      metadata = await new ResolvedBookProvider('/api/isbn/lookup', allowDevelopmentFixture, state.currentUserId).lookup(
        parsed.isbn13,
        locale,
        controller.signal,
      );
    } catch (error) {
      if (controller.signal.aborted || sequence !== lookupSequenceRef.current) return;
      console.error('book-metadata-lookup-failed', error);
      setDraft(blankDraft(parsed.isbn13, locale));
      setErrorKind('lookup');
      setStage('error');
      return;
    }
    if (sequence !== lookupSequenceRef.current) return;
    if (!metadata) {
      setDraft(blankDraft(parsed.isbn13, locale));
      setErrorKind('not-found');
      setStage('error');
      return;
    }
    setDraft(createDraft(metadata));
    setFormError('');
    setStage('confirm');
  }, [locale, state.currentUserId, stopCamera]);

  useEffect(() => {
    if (stage !== 'scanning' || !streamRef.current || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play();

    const Detector = barcodeDetectorConstructor();
    let canceled = false;

    if (!Detector) {
      const startZxing = async () => {
        try {
          const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
            import('@zxing/browser'),
            import('@zxing/library'),
          ]);
          if (canceled || !streamRef.current) return;
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
          const reader = new BrowserMultiFormatOneDReader(hints, { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 500 });
          zxingControlsRef.current = await reader.decodeFromStream(streamRef.current, video, (result, _error, controls) => {
            const value = result?.getText();
            if (value && parseIsbn(value)) {
              controls.stop();
              void performLookup(value);
            }
          });
        } catch {
          if (!canceled) setAutoDetectionAvailable(false);
        }
      };
      void startZxing();
      return () => {
        canceled = true;
        zxingControlsRef.current?.stop();
        zxingControlsRef.current = null;
      };
    }

    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });

    const detect = async () => {
      if (canceled || stage !== 'scanning') return;
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const results = await detector.detect(video);
          const isbn = results.find((result) => parseIsbn(result.rawValue));
          if (isbn) {
            void performLookup(isbn.rawValue);
            return;
          }
        }
      } catch {
        setAutoDetectionAvailable(false);
      }
      detectionTimerRef.current = window.setTimeout(detect, 300);
    };
    void detect();

    return () => {
      canceled = true;
      if (detectionTimerRef.current !== undefined) window.clearTimeout(detectionTimerRef.current);
    };
  }, [performLookup, stage]);

  const startCamera = async () => {
    setFormError('');
    setAutoDetectionAvailable(true);
    setStage('permission');
    const attempt = ++cameraAttemptRef.current;
    let timeoutId: number | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera-unavailable');
      stopCamera();
      const pendingStream = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      void pendingStream.then((lateStream) => {
        if (attempt !== cameraAttemptRef.current) {
          for (const track of lateStream.getTracks()) track.stop();
        }
      }).catch(() => undefined);
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('camera-timeout')), 10_000);
      });
      const stream = await Promise.race([pendingStream, timeout]);
      if (attempt !== cameraAttemptRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      setStage('scanning');
    } catch {
      cameraAttemptRef.current += 1;
      stopCamera();
      setErrorKind('camera');
      setStage('error');
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
  };

  const reset = () => {
    cameraAttemptRef.current += 1;
    lookupSequenceRef.current += 1;
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
    stopCamera();
    if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current);
    uploadUrlRef.current = undefined;
    setCoverPreviewUrl('');
    setStage('idle');
    setDraft(null);
    setCoverFile(undefined);
    setManualIsbn('');
    setCreatedItemId(undefined);
    setFormError('');
    setCoverError('');
  };

  const editDraft = <Key extends keyof IntakeDraft>(key: Key, value: IntakeDraft[Key]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setFormError('');
  };

  const useManualDetails = () => {
    const parsed = parseIsbn(manualIsbn);
    if (!parsed) {
      setErrorKind('invalid');
      return;
    }
    setDraft((current) => current ?? blankDraft(parsed.isbn13, locale));
    setFormError('');
    setStage('confirm');
  };

  const handleCoverUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setCoverError(c.coverError);
      event.target.value = '';
      return;
    }
    if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current);
    const previewUrl = URL.createObjectURL(file);
    uploadUrlRef.current = previewUrl;
    setCoverFile(file);
    setCoverPreviewUrl(previewUrl);
    setDraft((current) => current ? { ...current, provenance: { ...current.provenance, coverUrl: 'member' } } : current);
    setCoverError('');
  };

  const createBook = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    const authors = draft.authors.split(',').map((author) => author.trim()).filter(Boolean);
    const publishedYear = Number(draft.publishedYear);
    const pageCount = draft.pageCount ? Number(draft.pageCount) : undefined;
    if (!draft.title.trim() || authors.length === 0 || !draft.publisher.trim() || !Number.isInteger(publishedYear) || publishedYear < 1000 || publishedYear > 2200) {
      setFormError(c.requiredError);
      return;
    }

    setIsSaving(true);
    let persistedCoverUrl = draft.coverUrl || undefined;
    if (coverFile) {
      try {
        const upload = await uploadMemberCover(coverFile, state.currentUserId);
        persistedCoverUrl = upload.coverUrl;
      } catch {
        setFormError(c.uploadFailed);
        setIsSaving(false);
        return;
      }
    }

    let itemId: string;
    try {
      itemId = await actions.addBook({
        isbn13: draft.isbn13,
        title: draft.title.trim(),
        titleEn: draft.titleEn.trim() || undefined,
        authors,
        publisher: draft.publisher.trim(),
        publishedYear,
        language: draft.language,
        pageCount: pageCount && pageCount > 0 ? pageCount : undefined,
        coverUrl: persistedCoverUrl,
        condition: draft.condition,
        ownerNotes: draft.ownerNotes.trim() || undefined,
        provenance: draft.provenance,
      });
    } catch {
      setFormError(c.saveFailed);
      setIsSaving(false);
      return;
    }
    setCreatedItemId(itemId);
    setCoverFile(undefined);
    if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current);
    uploadUrlRef.current = undefined;
    setCoverPreviewUrl('');
    setIsSaving(false);
    setStage('success');
    actions.setScreen('intake');
  };

  const errorTitle = errorKind === 'invalid' ? c.invalidTitle : errorKind === 'not-found' ? c.notFoundTitle : errorKind === 'camera' ? c.cameraTitle : c.lookupTitle;
  const errorBody = errorKind === 'invalid' ? c.invalidBody : errorKind === 'not-found' ? c.notFoundBody : errorKind === 'camera' ? c.cameraBody : c.lookupBody;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5 sm:px-6" data-testid="intake-view">
      {stage === 'idle' && (
        <div className="space-y-5">
          <section className="pt-3">
            <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">{c.eyebrow}</p>
            <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{c.title}</h1>
            <p className="mt-3 max-w-xl text-pretty leading-7 text-muted-foreground">{c.intro}</p>
          </section>

          <Card className="overflow-hidden border-0 bg-primary text-primary-foreground shadow-lg shadow-primary/15">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-8 flex items-center justify-between">
                <div className="grid size-12 place-items-center rounded-2xl bg-white/15">
                  <ScanLine aria-hidden="true" className="size-6" />
                </div>
                <Badge className="border-white/15 bg-white/10 text-primary-foreground">
                  ISBN 10 · 13
                </Badge>
              </div>
              <h2 className="text-xl font-semibold">{c.scan}</h2>
              <p className="mt-1 text-sm text-primary-foreground/75">{c.scanHelp}</p>
              <Button
                className="mt-5 h-12 w-full bg-white text-primary hover:bg-white/90"
                data-testid="start-scan"
                onClick={() => void startCamera()}
              >
                <Camera aria-hidden="true" className="size-5" />
                {c.scan}
              </Button>
            </CardContent>
          </Card>

          <ManualIsbnForm disabled={false} locale={locale} onChange={setManualIsbn} onSubmit={() => void performLookup(manualIsbn)} value={manualIsbn} />
          {process.env.NODE_ENV !== 'production' && (
            <Button className="h-10 w-full text-muted-foreground" data-testid="simulate-scan" onClick={() => void performLookup(DEMO_ISBN, true)} variant="ghost">
              <Sparkles aria-hidden="true" />
              {c.simulate}
            </Button>
          )}
        </div>
      )}

      {stage === 'permission' && (
        <section aria-live="polite" className="grid min-h-[60vh] place-items-center text-center">
          <div>
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-secondary">
              <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-primary" />
            </div>
            <h1 className="mt-5 text-xl font-semibold">{c.permission}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{c.scanHelp}</p>
          </div>
        </section>
      )}

      {stage === 'scanning' && (
        <div className="space-y-5">
          <section className="text-center">
            <h1 className="text-xl font-semibold">{c.scanning}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{c.scanningHelp}</p>
          </section>
          <div className="relative aspect-[3/4] max-h-[60vh] overflow-hidden rounded-3xl bg-foreground shadow-xl" data-testid="scanner-frame">
            <video aria-label={c.scanning} className="h-full w-full object-cover" data-testid="scan-video" muted playsInline ref={videoRef} />
            <div aria-hidden="true" className="absolute inset-x-[10%] top-1/2 h-36 -translate-y-1/2 rounded-2xl border-2 border-white shadow-[0_0_0_999px_rgb(0_0_0/0.28)]">
              <div className="absolute inset-x-5 top-1/2 h-px bg-red-400 shadow-[0_0_8px_rgb(248_113_113)]" />
            </div>
          </div>
          {!autoDetectionAvailable && (
            <Alert>
              <CircleAlert aria-hidden="true" />
              <AlertTitle>{c.manualTitle}</AlertTitle>
              <AlertDescription>{c.detectorUnavailable}</AlertDescription>
            </Alert>
          )}
          <div className={process.env.NODE_ENV !== 'production' ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
            {process.env.NODE_ENV !== 'production' && (
              <Button className="h-11" data-testid="simulate-scan" onClick={() => void performLookup(DEMO_ISBN, true)}>
                <Sparkles aria-hidden="true" />
                {c.simulate}
              </Button>
            )}
            <Button className="h-11" onClick={reset} variant="outline">
              {c.stop}
            </Button>
          </div>
          <ManualIsbnForm disabled={false} locale={locale} onChange={setManualIsbn} onSubmit={() => void performLookup(manualIsbn)} value={manualIsbn} />
        </div>
      )}

      {stage === 'lookup' && (
        <section aria-live="polite" className="grid min-h-[62vh] place-items-center text-center" data-testid="lookup-loading">
          <div>
            <div className="relative mx-auto size-24">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
              <div className="relative grid size-24 place-items-center rounded-full bg-secondary">
                <BookOpen aria-hidden="true" className="size-9 text-primary" />
              </div>
            </div>
            <h1 className="mt-6 text-xl font-semibold">{c.looking}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{c.lookingHelp}</p>
            <p className="mt-3 font-mono text-xs text-muted-foreground">{manualIsbn}</p>
          </div>
        </section>
      )}

      {stage === 'error' && (
        <div className="space-y-5 pt-12">
          <section className="text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-destructive/10 text-destructive">
              <CircleAlert aria-hidden="true" className="size-7" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold">{errorTitle}</h1>
            <p className="mx-auto mt-2 max-w-md text-pretty leading-6 text-muted-foreground">{errorBody}</p>
          </section>
          {(errorKind === 'not-found' || errorKind === 'lookup') && (
            <Button className="h-12 w-full" data-testid="enter-details-manually" onClick={useManualDetails}>
              <Keyboard aria-hidden="true" />
              {c.enterManually}
            </Button>
          )}
          <Button className="h-11 w-full" onClick={reset} variant="outline">
            <RefreshCw aria-hidden="true" />
            {c.retry}
          </Button>
          <ManualIsbnForm disabled={false} locale={locale} onChange={setManualIsbn} onSubmit={() => void performLookup(manualIsbn)} value={manualIsbn} />
        </div>
      )}

      {stage === 'confirm' && draft && (
        <form className="space-y-6" data-testid="confirm-form" onSubmit={createBook}>
          <section>
            <button className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground" onClick={reset} type="button">
              <ArrowLeft aria-hidden="true" className="size-4" />
              {c.back}
            </button>
            <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">{c.confirmEyebrow}</p>
            <h1 className="text-3xl font-semibold tracking-tight">{c.confirmTitle}</h1>
            <p className="mt-2 leading-6 text-muted-foreground">{c.confirmHelp}</p>
          </section>

          <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-4 rounded-2xl bg-muted/60 p-4 sm:grid-cols-[144px_minmax(0,1fr)]">
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-primary/10 shadow-sm">
              {(coverPreviewUrl || draft.coverUrl) ? (
                <Image alt={`${draft.title || c.coverLabel} cover`} className="object-cover" fill sizes="144px" src={coverPreviewUrl || draft.coverUrl} unoptimized />
              ) : (
                <div className="grid h-full place-items-center px-3 text-center text-xs text-muted-foreground">
                  <BookOpen aria-hidden="true" className="mx-auto mb-2 size-8" />
                  {c.coverLabel}
                </div>
              )}
            </div>
            <div className="min-w-0 self-center">
              <p className="font-mono text-xs text-muted-foreground">ISBN {draft.isbn13}</p>
              <p className="mt-2 line-clamp-3 text-lg font-semibold">{draft.title || c.required}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{draft.authors || c.required}</p>
              <Label className="mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium">
                <ImagePlus aria-hidden="true" className="size-4" />
                {c.uploadCover}
                <Input accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" data-testid="cover-upload" onChange={handleCoverUpload} type="file" />
              </Label>
            </div>
          </div>
          <p className="-mt-4 text-xs leading-5 text-muted-foreground">{c.coverHelp}</p>
          {coverError && <p className="-mt-4 text-sm text-destructive" role="alert">{coverError}</p>}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="book-title">{c.titleLabel}</Label>
              <Input className="h-11" data-testid="title-input" id="book-title" onChange={(event) => editDraft('title', event.target.value)} required value={draft.title} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-title-en">{c.titleEnLabel}</Label>
              <Input className="h-11" id="book-title-en" onChange={(event) => editDraft('titleEn', event.target.value)} value={draft.titleEn} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-authors">{c.authorLabel}</Label>
              <Input className="h-11" data-testid="author-input" id="book-authors" onChange={(event) => editDraft('authors', event.target.value)} required value={draft.authors} />
              <p className="text-xs text-muted-foreground">{c.authorHelp}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-publisher">{c.publisherLabel}</Label>
              <Input className="h-11" data-testid="publisher-input" id="book-publisher" onChange={(event) => editDraft('publisher', event.target.value)} required value={draft.publisher} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="book-year">{c.yearLabel}</Label>
                <Input className="h-11" id="book-year" inputMode="numeric" max="2200" min="1000" onChange={(event) => editDraft('publishedYear', event.target.value)} required type="number" value={draft.publishedYear} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="book-pages">{c.pagesLabel}</Label>
                <Input className="h-11" id="book-pages" inputMode="numeric" min="1" onChange={(event) => editDraft('pageCount', event.target.value)} type="number" value={draft.pageCount} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-language">{c.languageLabel}</Label>
              <NativeSelect className="w-full" id="book-language" onChange={(event) => editDraft('language', event.target.value as IntakeDraft['language'])} value={draft.language}>
                <NativeSelectOption value="ko">{c.korean}</NativeSelectOption>
                <NativeSelectOption value="en">{c.english}</NativeSelectOption>
                <NativeSelectOption value="other">{c.other}</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-condition">{c.conditionLabel}</Label>
              <NativeSelect className="w-full" id="book-condition" onChange={(event) => editDraft('condition', event.target.value as IntakeDraft['condition'])} value={draft.condition}>
                <NativeSelectOption value="like-new">{c.likeNew}</NativeSelectOption>
                <NativeSelectOption value="good">{c.good}</NativeSelectOption>
                <NativeSelectOption value="well-loved">{c.loved}</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-notes">{c.notesLabel}</Label>
              <Textarea id="book-notes" onChange={(event) => editDraft('ownerNotes', event.target.value)} placeholder={c.notesPlaceholder} rows={3} value={draft.ownerNotes} />
            </div>
          </div>

          {formError && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          )}
          <div className="sticky bottom-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
            <Button className="h-12 w-full text-base" data-testid="create-book" disabled={isSaving} type="submit">
              {isSaving ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Check aria-hidden="true" className="size-5" />}
              {isSaving ? c.creating : c.create}
            </Button>
          </div>
        </form>
      )}

      {stage === 'success' && (
        <section aria-live="polite" className="grid min-h-[65vh] place-items-center text-center" data-testid="intake-success">
          <div className="w-full max-w-sm">
            <div className="mx-auto grid size-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Check aria-hidden="true" className="size-9" />
            </div>
            <p className="mt-6 text-xs font-semibold tracking-[0.16em] text-primary uppercase">{c.createdEyebrow}</p>
            <h1 className="mt-2 text-2xl font-semibold">{c.createdTitle}</h1>
            <p className="mt-2 text-pretty leading-6 text-muted-foreground">{c.createdBody}</p>
            <Button className="mt-7 h-12 w-full" data-testid="view-created-book" disabled={!createdItemId} onClick={() => createdItemId && actions.selectItem(createdItemId)}>
              <BookOpen aria-hidden="true" />
              {c.viewBook}
            </Button>
            <Button className="mt-2 h-11 w-full" onClick={reset} variant="ghost">
              {c.addAnother}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
