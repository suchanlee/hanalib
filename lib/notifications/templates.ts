import type { AppLocale } from '@/lib/domain/types';

interface BorrowRequestTemplateInput {
  locale: AppLocale;
  ownerName: string;
  borrowerName: string;
  bookTitle: string;
  expiresAt: Date;
}

interface DecisionTemplateInput {
  locale: AppLocale;
  borrowerName: string;
  bookTitle: string;
  accepted: boolean;
}

interface ReturnCheckTemplateInput {
  locale: AppLocale;
  borrowerName: string;
  bookTitle: string;
  returnUrl: string;
}

export interface NotificationTemplate {
  subject: string;
  text: string;
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
      text: `${input.ownerName}님, ${input.borrowerName}님이 『${input.bookTitle}』을 빌리고 싶어 해요. 수락은 1, 거절은 2로 답장해 주세요. ${date(input.locale, input.expiresAt)}까지 유효해요.`,
    };
  }
  return {
    subject: `Request to borrow ${input.bookTitle}`,
    text: `${input.ownerName}, ${input.borrowerName} would like to borrow “${input.bookTitle}.” Reply 1 to accept or 2 to decline. This request expires ${date(input.locale, input.expiresAt)}.`,
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
      }
    : {
        subject: `${input.bookTitle} request ${input.accepted ? 'accepted' : 'declined'}`,
        text: `${input.borrowerName}, your request to borrow “${input.bookTitle}” ${outcome}.`,
      };
}

export function returnCheckTemplate(
  input: ReturnCheckTemplateInput,
): NotificationTemplate {
  return input.locale === 'ko'
    ? {
        subject: `${input.bookTitle} 반납 확인`,
        text: `${input.borrowerName}님, 『${input.bookTitle}』을 반납하셨나요? 반납했다면 여기에서 확인해 주세요: ${input.returnUrl}`,
      }
    : {
        subject: `Return check for ${input.bookTitle}`,
        text: `${input.borrowerName}, have you returned “${input.bookTitle}”? If so, confirm here: ${input.returnUrl}`,
      };
}
