import type { AppLocale } from '@/lib/domain/types';

export const copy = {
  ko: {
    brand: '하나북', catalog: '도서', scan: '스캔', borrowing: '대여', settings: '설정',
    available: '대여 가능', borrowed: '대여 중', owner: '소유자', searchPlaceholder: '제목, 저자, ISBN 검색',
    signInTitle: '함께 읽고, 가볍게 나눠요', signInBody: '누구나 가입할 수 있지만 도서 목록은 회원에게만 보여요.',
    continueKakao: '카카오로 계속', requestBorrow: '대여 요청', markReturned: '반납 완료',
  },
  en: {
    brand: 'Hana Seed Book', catalog: 'Catalog', scan: 'Scan', borrowing: 'Borrowing', settings: 'Settings',
    available: 'Available', borrowed: 'Borrowed', owner: 'Owner', searchPlaceholder: 'Search title, author, or ISBN',
    signInTitle: 'Read together, share simply', signInBody: 'Anyone can register, but the catalog is visible only to members.',
    continueKakao: 'Continue with Kakao', requestBorrow: 'Request to borrow', markReturned: 'Mark returned',
  },
} as const;

export function memberName(locale: AppLocale, member: { displayName: string; displayNameKo: string }) {
  return locale === 'ko' ? member.displayNameKo : member.displayName;
}
