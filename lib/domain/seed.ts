import type { BookEdition, CatalogItem, HanaAppState, Member } from './types';

const now = new Date('2026-09-04T17:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const daysFromNow = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

export const seedMembers: Member[] = [
  { id: 'jiwoo', displayName: 'Jiwoo', displayNameKo: '지우', initials: 'JW', locale: 'ko', notificationChannel: 'both', phone: '+14155552481', phoneVerified: true, email: 'jiwoo@example.com' },
  { id: 'seoyeon', displayName: 'Seoyeon', displayNameKo: '서연', initials: 'SY', locale: 'ko', notificationChannel: 'sms', phone: '+14155550177', phoneVerified: true, email: 'seoyeon@example.com' },
  { id: 'minji', displayName: 'Minji', displayNameKo: '민지', initials: 'MJ', locale: 'ko', notificationChannel: 'email', phone: '+14155550862', phoneVerified: true, email: 'minji@example.com' },
  { id: 'alex', displayName: 'Alex', displayNameKo: '알렉스', initials: 'AK', locale: 'en', notificationChannel: 'email', phone: '+14155551354', phoneVerified: true, email: 'alex@example.com' },
];

const editions: BookEdition[] = [
  { id: 'ed-almond', isbn13: '9788936434267', title: '아몬드', titleEn: 'Almond', authors: ['손원평'], authorsEn: ['Won-pyung Sohn'], publisher: '창비', publishedYear: 2017, language: 'ko', pageCount: 263, description: '감정을 느끼기 어려운 소년 윤재의 성장 이야기.', coverTone: 'amber', provenance: { title: 'nlk', cover: 'naver', description: 'google-books' } },
  { id: 'ed-part', isbn13: '9788954682152', title: '작별하지 않는다', titleEn: 'We Do Not Part', authors: ['한강'], authorsEn: ['Han Kang'], publisher: '문학동네', publishedYear: 2021, language: 'ko', pageCount: 332, coverTone: 'blue', provenance: { title: 'nlk', cover: 'naver' } },
  { id: 'ed-fish', isbn13: '9788965964474', title: '물고기는 존재하지 않는다', titleEn: "Why Fish Don't Exist", authors: ['룰루 밀러'], authorsEn: ['Lulu Miller'], publisher: '곰출판', publishedYear: 2021, language: 'ko', pageCount: 300, coverTone: 'green', provenance: { title: 'nlk', cover: 'naver' } },
  { id: 'ed-tomorrow', isbn13: '9780593321201', title: 'Tomorrow, and Tomorrow, and Tomorrow', authors: ['Gabrielle Zevin'], publisher: 'Knopf', publishedYear: 2022, language: 'en', pageCount: 416, coverTone: 'rose', provenance: { title: 'google-books', cover: 'google-books' } },
  { id: 'ed-light', isbn13: '9788936434274', title: '우리가 빛의 속도로 갈 수 없다면', titleEn: 'If We Cannot Move at the Speed of Light', authors: ['김초엽'], authorsEn: ['Kim Cho-yeop'], publisher: '허블', publishedYear: 2019, language: 'ko', pageCount: 352, coverTone: 'violet', provenance: { title: 'nlk', cover: 'naver' } },
  { id: 'ed-crying', isbn13: '9780593685217', title: 'Crying in H Mart', authors: ['Michelle Zauner'], publisher: 'Vintage', publishedYear: 2022, language: 'en', pageCount: 256, coverTone: 'ink', provenance: { title: 'google-books', cover: 'google-books' } },
];

export const seedItems: CatalogItem[] = editions.map((edition, index) => ({
  id: `item-${edition.id}`,
  edition,
  ownerId: ['seoyeon', 'minji', 'jiwoo', 'alex', 'minji', 'jiwoo'][index],
  status: index === 3 || index === 4 ? 'borrowed' : 'available',
  condition: index === 2 ? 'well-loved' : 'good',
  ownerNotes: index === 0 ? '표지에 작은 접힘이 있어요.' : undefined,
  createdAt: daysAgo(index + 1),
}));

export const initialAppState: HanaAppState = {
  isAuthenticated: false,
  loadStatus: 'loading',
  isMutating: false,
  currentUserId: 'jiwoo',
  locale: 'ko',
  screen: 'catalog',
  searchQuery: '',
  filters: { ownerId: 'all', status: 'all', language: 'all' },
  members: seedMembers,
  items: seedItems,
  requests: [
    { id: 'request-pending', catalogItemId: 'item-ed-almond', requesterId: 'jiwoo', status: 'pending', requestedAt: daysAgo(0), expiresAt: daysFromNow(2) },
  ],
  loans: [
    { id: 'loan-light', catalogItemId: 'item-ed-light', requestId: 'request-light', ownerId: 'minji', borrowerId: 'jiwoo', status: 'active', startedAt: daysAgo(6), nextCheckAt: daysFromNow(1) },
    { id: 'loan-tomorrow', catalogItemId: 'item-ed-tomorrow', requestId: 'request-tomorrow', ownerId: 'alex', borrowerId: 'seoyeon', status: 'active', startedAt: daysAgo(9), nextCheckAt: daysAgo(2) },
  ],
  holds: [],
  holdCounts: {},
  returnChecks: [],
};
