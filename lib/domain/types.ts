export type AppLocale = 'ko' | 'en';
export type AuthProvider = 'kakao';
export type AppScreen = 'catalog' | 'intake' | 'detail' | 'borrowing' | 'settings';
export type CatalogStatus = 'available' | 'borrowed' | 'archived';
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'canceled' | 'expired' | 'superseded';
export type LoanStatus = 'active' | 'returned';
export type NotificationChannel = 'email' | 'sms' | 'both';

export interface Member {
  id: string;
  displayName: string;
  displayNameKo: string;
  initials: string;
  locale: AppLocale;
  notificationChannel: NotificationChannel;
  phone: string;
  phoneVerified: boolean;
  email: string;
}

export interface BookEdition {
  id: string;
  isbn13: string;
  isbn10?: string;
  title: string;
  titleEn?: string;
  authors: string[];
  authorsEn?: string[];
  publisher: string;
  publishedYear: number;
  language: 'ko' | 'en' | 'other';
  pageCount?: number;
  description?: string;
  coverUrl?: string;
  coverTone: 'amber' | 'blue' | 'green' | 'rose' | 'ink' | 'violet';
  provenance: Record<string, string>;
}

export interface CatalogItem {
  id: string;
  edition: BookEdition;
  ownerId: string;
  status: CatalogStatus;
  condition: 'like-new' | 'good' | 'well-loved';
  ownerNotes?: string;
  createdAt: string;
}

export interface BorrowRequest {
  id: string;
  catalogItemId: string;
  requesterId: string;
  status: RequestStatus;
  requestedAt: string;
  expiresAt: string;
}

export interface Loan {
  id: string;
  catalogItemId: string;
  requestId: string;
  ownerId: string;
  borrowerId: string;
  status: LoanStatus;
  startedAt: string;
  nextCheckAt: string;
  returnedAt?: string;
  returnedBy?: string;
}

export interface CatalogFilters {
  ownerId: string;
  status: 'all' | 'available' | 'borrowed';
  language: 'all' | 'ko' | 'en' | 'other';
}

export interface AddBookInput {
  isbn13: string;
  title: string;
  titleEn?: string;
  authors: string[];
  publisher: string;
  publishedYear: number;
  language: 'ko' | 'en' | 'other';
  pageCount?: number;
  coverUrl?: string;
  condition: CatalogItem['condition'];
  ownerNotes?: string;
  provenance: Record<string, string>;
}

export interface HanaAppActions {
  refresh(): Promise<void>;
  signOut(): void;
  setLocale(locale: AppLocale): void;
  setScreen(screen: AppScreen): void;
  selectItem(itemId: string): void;
  setSearchQuery(query: string): void;
  setFilters(filters: Partial<CatalogFilters>): void;
  addBook(input: AddBookInput): Promise<string>;
  updateItem(itemId: string, changes: Pick<CatalogItem, 'condition' | 'ownerNotes'>): void;
  archiveItem(itemId: string): void;
  requestBorrow(itemId: string): void;
  cancelRequest(requestId: string): void;
  respondToRequest(requestId: string, decision: 'accepted' | 'declined'): void;
  markReturned(loanId: string): void;
  updateProfile(changes: Partial<Pick<Member, 'displayName' | 'displayNameKo' | 'locale' | 'notificationChannel' | 'phone'>>): Promise<Member>;
}

export interface HanaAppState {
  isAuthenticated: boolean;
  authProvider?: AuthProvider;
  currentUserId: string;
  locale: AppLocale;
  screen: AppScreen;
  selectedItemId?: string;
  searchQuery: string;
  filters: CatalogFilters;
  members: Member[];
  items: CatalogItem[];
  requests: BorrowRequest[];
  loans: Loan[];
  announcement?: string;
}
