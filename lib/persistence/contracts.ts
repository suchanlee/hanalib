import type { AddBookInput, BorrowRequest, CatalogItem, Hold, Loan, Member, ReturnCheck, UpdateCatalogItemInput } from '@/lib/domain/types';

export interface LibraryBootstrap {
  profile: Member;
  members: Member[];
  items: CatalogItem[];
  requests: BorrowRequest[];
  loans: Loan[];
  holds: Hold[];
  holdCounts: Record<string, number>;
  returnChecks: ReturnCheck[];
}

export interface RequestContext {
  actorId: string;
  communityId: string;
  idempotencyKey: string;
}

export interface LibraryRepository {
  getBootstrap(context: Pick<RequestContext, 'actorId' | 'communityId'>): Promise<LibraryBootstrap>;
  listCatalog(context: Pick<RequestContext, 'actorId' | 'communityId'>): Promise<CatalogItem[]>;
  createCatalogItem(context: RequestContext, input: AddBookInput): Promise<CatalogItem>;
  updateCatalogItem(context: RequestContext, itemId: string, changes: UpdateCatalogItemInput): Promise<CatalogItem>;
  refreshCatalogItemCover(context: RequestContext, itemId: string, coverUrl: string, source: string): Promise<CatalogItem>;
  archiveCatalogItem(context: RequestContext, itemId: string): Promise<void>;
  createBorrowRequest(context: RequestContext, itemId: string): Promise<BorrowRequest>;
  cancelBorrowRequest(context: Pick<RequestContext, 'actorId' | 'communityId'>, requestId: string): Promise<BorrowRequest>;
  respondToBorrowRequest(context: RequestContext, requestId: string, decision: 'accepted' | 'declined'): Promise<{ request: BorrowRequest; loan?: Loan }>;
  markReturned(context: RequestContext, loanId: string): Promise<Loan>;
  createHold(context: RequestContext, itemId: string): Promise<Hold>;
  cancelHold(context: Pick<RequestContext, 'actorId' | 'communityId'>, holdId: string): Promise<Hold>;
  claimHold(context: RequestContext, holdId: string): Promise<BorrowRequest>;
  respondToReturnCheck(context: RequestContext, checkId: string, returned: boolean): Promise<ReturnCheck>;
  updateProfile(context: Pick<RequestContext, 'actorId' | 'communityId'>, changes: Partial<Member>): Promise<Member>;
}

export interface CoverStorage {
  putCover(input: { actorId: string; bytes: ArrayBuffer; contentType: 'image/jpeg' | 'image/png' | 'image/webp' }): Promise<{ assetId: string; storagePath: string }>;
  getCoverUrl(storagePath: string): Promise<string>;
}
