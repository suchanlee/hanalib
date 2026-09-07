import type { BookCategories, CategoryId, ThemaCode } from '../books/categories';

export type AppLocale = 'ko' | 'en';
export type AuthProvider = 'google' | 'kakao';
export type AppScreen = 'catalog' | 'intake' | 'detail' | 'borrowing' | 'settings';
export type CatalogStatus = 'available' | 'held' | 'borrowed' | 'archived';
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'canceled' | 'expired' | 'superseded';
export type LoanStatus = 'active' | 'returned';
export type HoldStatus = 'queued' | 'offered' | 'converted' | 'canceled' | 'expired';
export type NotificationChannel = 'email' | 'sms' | 'both' | 'kakao';

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
  categories?: BookCategories;
  isYouthBook?: boolean;
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

export interface Hold {
  id: string;
  catalogItemId: string;
  memberId: string;
  status: HoldStatus;
  createdAt: string;
  offeredAt?: string;
  expiresAt?: string;
  borrowRequestId?: string;
  position: number;
}

export interface ReturnCheck {
  id: string;
  loanId: string;
  scheduledFor: string;
  sentAt: string;
}

export interface CatalogFilters {
  audience?: 'general' | 'youth';
  category?: CategoryId | 'all' | 'uncategorized';
  ownerId: string;
  status: 'all' | 'available' | 'held' | 'borrowed';
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
  description?: string;
  coverUrl?: string;
  condition: CatalogItem['condition'];
  ownerNotes?: string;
  provenance: Record<string, string>;
  categories?: BookCategories;
  isYouthBook?: boolean;
}

export interface UpdateCatalogItemInput extends Pick<CatalogItem, 'condition' | 'ownerNotes'> {
  categoryCodes?: ThemaCode[];
  isYouthBook?: boolean;
  title?: string;
  titleEn?: string | null;
  authors?: string[];
  authorsEn?: string[];
  publisher?: string;
  publishedYear?: number;
  language?: BookEdition['language'];
  pageCount?: number | null;
  description?: string | null;
  descriptionProvenance?: Record<string, string>;
  coverAssetId?: string;
}

export interface HanaAppActions {
  refresh(): Promise<void>;
  signOut(): Promise<void>;
  reportError(error: unknown, operation?: string): void;
  dismissIssue(): void;
  setLocale(locale: AppLocale): void;
  setScreen(screen: AppScreen): void;
  selectItem(itemId: string): void;
  setSearchQuery(query: string): void;
  setFilters(filters: Partial<CatalogFilters>): void;
  addBook(input: AddBookInput): Promise<string>;
  updateItem(itemId: string, changes: UpdateCatalogItemInput): Promise<CatalogItem>;
  refreshItemCover(itemId: string): Promise<CatalogItem>;
  archiveItem(itemId: string): Promise<void>;
  requestBorrow(itemId: string): Promise<BorrowRequest>;
  cancelRequest(requestId: string): Promise<void>;
  respondToRequest(requestId: string, decision: 'accepted' | 'declined'): Promise<void>;
  markReturned(loanId: string): Promise<void>;
  joinHold(itemId: string): Promise<Hold>;
  cancelHold(holdId: string): Promise<void>;
  claimHold(holdId: string): Promise<BorrowRequest>;
  respondToReturnCheck(checkId: string, returned: boolean): Promise<void>;
  saveNotificationEmail(email: string): Promise<void>;
  updateProfile(changes: Partial<Pick<Member, 'displayName' | 'displayNameKo' | 'locale' | 'notificationChannel' | 'phone'>>): Promise<Member>;
}

export interface HanaAppState {
  isAuthenticated: boolean;
  loadStatus: 'loading' | 'ready' | 'error';
  isMutating: boolean;
  issue?: UserIssue;
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
  holds: Hold[];
  holdCounts: Record<string, number>;
  returnChecks: ReturnCheck[];
  announcement?: string;
}

export interface UserIssue {
  traceId: string;
  errorType: string;
  sourceLocations: string[];
  serverDigest?: string;
  code: string;
  status: number;
  requestId?: string;
  operation: string;
  occurredAt: string;
}
