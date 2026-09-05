import type { AppLocale } from '@/lib/domain/types';

interface BorrowRequestTemplateInput {
  locale: AppLocale;
  ownerName: string;
  borrowerName: string;
  bookTitle: string;
  expiresAt: Date;
  decisionUrl: string;
  bookUrl?: string;
  coverUrl?: string;
}

interface DecisionTemplateInput {
  locale: AppLocale;
  borrowerName: string;
  bookTitle: string;
  accepted: boolean;
  returnUrl?: string;
}

interface ReturnCheckTemplateInput {
  locale: AppLocale;
  borrowerName: string;
  bookTitle: string;
  returnUrl: string;
}

interface RequestClosedTemplateInput {
  locale: AppLocale;
  ownerName: string;
  borrowerName: string;
  bookTitle: string;
  bookUrl: string;
  reason: 'canceled' | 'expired';
}

interface BookReturnedTemplateInput {
  locale: AppLocale;
  ownerName: string;
  borrowerName: string;
  bookTitle: string;
  bookUrl: string;
}

interface HoldOfferTemplateInput {
  locale: AppLocale;
  memberName: string;
  bookTitle: string;
  expiresAt: Date;
  offerUrl: string;
  coverUrl?: string;
  reminder?: boolean;
}

export interface NotificationTemplate {
  subject: string;
  text: string;
  primaryUrl?: string;
  imageUrl?: string;
  actions?: Array<{ label: string; url: string }>;
}

function date(locale: AppLocale, value: Date) {
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short',
  }).format(value);
}

export function borrowRequestTemplate(
  input: BorrowRequestTemplateInput,
): NotificationTemplate {
  if (input.locale === 'ko') {
    return {
      subject: `${input.bookTitle} 대여 요청`,
      text: `${input.ownerName}님, ${input.borrowerName}님이 『${input.bookTitle}』을 빌리고 싶어 해요. 앱에서 수락 또는 거절해 주세요. ${date(input.locale, input.expiresAt)}까지 유효해요.`,
      primaryUrl: input.bookUrl,
      imageUrl: input.coverUrl,
      actions: [
        { label: '요청 확인', url: input.decisionUrl },
        ...(input.bookUrl ? [{ label: '도서 보기', url: input.bookUrl }] : []),
      ],
    };
  }
  return {
    subject: `Request to borrow ${input.bookTitle}`,
    text: `${input.ownerName}, ${input.borrowerName} would like to borrow “${input.bookTitle}.” Accept or decline in the app. This request expires ${date(input.locale, input.expiresAt)}.`,
    primaryUrl: input.bookUrl,
    imageUrl: input.coverUrl,
    actions: [
      { label: 'View request', url: input.decisionUrl },
      ...(input.bookUrl ? [{ label: 'View book', url: input.bookUrl }] : []),
    ],
  };
}

export function borrowRequestReminderTemplate(
  input: BorrowRequestTemplateInput,
): NotificationTemplate {
  if (input.locale === 'ko') {
    return {
      subject: `${input.bookTitle} 대여 요청이 곧 만료돼요`,
      text: `${input.ownerName}님, ${input.borrowerName}님의 『${input.bookTitle}』 대여 요청이 24시간 후 만료돼요. 앱에서 수락 또는 거절해 주세요.`,
      primaryUrl: input.bookUrl,
      imageUrl: input.coverUrl,
      actions: [
        { label: '요청 확인', url: input.decisionUrl },
        ...(input.bookUrl ? [{ label: '도서 보기', url: input.bookUrl }] : []),
      ],
    };
  }
  return {
    subject: `Borrow request for ${input.bookTitle} expires soon`,
    text: `${input.ownerName}, ${input.borrowerName}’s request to borrow “${input.bookTitle}” expires in 24 hours. Accept or decline in the app.`,
    primaryUrl: input.bookUrl,
    imageUrl: input.coverUrl,
    actions: [
      { label: 'View request', url: input.decisionUrl },
      ...(input.bookUrl ? [{ label: 'View book', url: input.bookUrl }] : []),
    ],
  };
}

export function decisionTemplate(
  input: DecisionTemplateInput,
): NotificationTemplate {
  const outcome = input.locale === 'ko'
    ? input.accepted ? '수락되었어요' : '거절되었어요'
    : input.accepted ? 'was accepted' : 'was declined';

  return input.locale === 'ko'
    ? {
        subject: `${input.bookTitle} 요청 ${input.accepted ? '수락' : '거절'}`,
        text: `${input.borrowerName}님, 『${input.bookTitle}』 대여 요청이 ${outcome}.`,
        actions: input.accepted && input.returnUrl ? [{ label: '대여 보기', url: input.returnUrl }] : undefined,
      }
    : {
        subject: `${input.bookTitle} request ${input.accepted ? 'accepted' : 'declined'}`,
        text: `${input.borrowerName}, your request to borrow “${input.bookTitle}” ${outcome}.`,
        actions: input.accepted && input.returnUrl ? [{ label: 'View loan', url: input.returnUrl }] : undefined,
      };
}

export function returnCheckTemplate(
  input: ReturnCheckTemplateInput,
): NotificationTemplate {
  return input.locale === 'ko'
    ? {
        subject: `${input.bookTitle} 반납 확인`,
        text: `${input.borrowerName}님, 『${input.bookTitle}』을 반납하셨나요? 반납했다면 앱에서 확인해 주세요.`,
        actions: [{ label: '반납 확인', url: input.returnUrl }],
      }
    : {
        subject: `Return check for ${input.bookTitle}`,
        text: `${input.borrowerName}, have you returned “${input.bookTitle}”? If so, confirm it in the app.`,
        actions: [{ label: 'Confirm return', url: input.returnUrl }],
      };
}

export function requestClosedTemplate(input: RequestClosedTemplateInput): NotificationTemplate {
  const canceled = input.reason === 'canceled';
  if (input.locale === 'ko') {
    return {
      subject: `${input.bookTitle} 대여 요청 ${canceled ? '취소' : '만료'}`,
      text: canceled
        ? `${input.ownerName}님, ${input.borrowerName}님이 『${input.bookTitle}』 대여 요청을 취소했어요.`
        : `${input.ownerName}님, ${input.borrowerName}님의 『${input.bookTitle}』 대여 요청이 48시간이 지나 만료되었어요.`,
      primaryUrl: input.bookUrl,
      actions: [{ label: '도서 보기', url: input.bookUrl }],
    };
  }
  return {
    subject: `${input.bookTitle} request ${canceled ? 'canceled' : 'expired'}`,
    text: canceled
      ? `${input.ownerName}, ${input.borrowerName} canceled their request to borrow “${input.bookTitle}.”`
      : `${input.ownerName}, ${input.borrowerName}’s request to borrow “${input.bookTitle}” expired after 48 hours.`,
    primaryUrl: input.bookUrl,
    actions: [{ label: 'View book', url: input.bookUrl }],
  };
}

export function bookReturnedTemplate(input: BookReturnedTemplateInput): NotificationTemplate {
  if (input.locale === 'ko') {
    return {
      subject: `${input.bookTitle} 반납 완료`,
      text: `${input.ownerName}님, ${input.borrowerName}님이 『${input.bookTitle}』을 반납 완료로 표시했어요.`,
      primaryUrl: input.bookUrl,
      actions: [{ label: '도서 보기', url: input.bookUrl }],
    };
  }
  return {
    subject: `${input.bookTitle} returned`,
    text: `${input.ownerName}, ${input.borrowerName} marked “${input.bookTitle}” as returned.`,
    primaryUrl: input.bookUrl,
    actions: [{ label: 'View book', url: input.bookUrl }],
  };
}

export function holdOfferTemplate(input: HoldOfferTemplateInput): NotificationTemplate {
  const expiry = date(input.locale, input.expiresAt);
  if (input.locale === 'ko') {
    return {
      subject: input.reminder ? `${input.bookTitle} 대기 순서 알림` : `${input.bookTitle}, 이제 빌릴 수 있어요`,
      text: `${input.memberName}님, 기다리던 『${input.bookTitle}』을 빌릴 차례예요. ${expiry}까지 요청하거나 다음 분에게 넘겨주세요.`,
      primaryUrl: input.offerUrl,
      imageUrl: input.coverUrl,
      actions: [{ label: '내 차례 확인', url: input.offerUrl }],
    };
  }
  return {
    subject: input.reminder ? `Reminder: ${input.bookTitle} is waiting` : `${input.bookTitle} is ready for you`,
    text: `${input.memberName}, it is your turn to borrow “${input.bookTitle}.” Request it or pass by ${expiry}.`,
    primaryUrl: input.offerUrl,
    imageUrl: input.coverUrl,
    actions: [{ label: 'View my offer', url: input.offerUrl }],
  };
}
