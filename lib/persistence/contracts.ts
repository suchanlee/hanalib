import type { AddBookInput, BorrowRequest, CatalogItem, Loan, Member } from '@/lib/domain/types';

export interface LibraryBootstrap {
  profile: Member;
  members: Member[];
  items: CatalogItem[];
  requests: BorrowRequest[];
  loans: Loan[];
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
  updateCatalogItem(context: RequestContext, itemId: string, changes: Pick<CatalogItem, 'condition' | 'ownerNotes'>): Promise<CatalogItem>;
  archiveCatalogItem(context: RequestContext, itemId: string): Promise<void>;
  createBorrowRequest(context: RequestContext, itemId: string): Promise<BorrowRequest>;
  cancelBorrowRequest(context: Pick<RequestContext, 'actorId' | 'communityId'>, requestId: string): Promise<BorrowRequest>;
  respondToBorrowRequest(context: RequestContext, requestId: string, decision: 'accepted' | 'declined'): Promise<{ request: BorrowRequest; loan?: Loan }>;
  markReturned(context: RequestContext, loanId: string): Promise<Loan>;
  updateProfile(context: Pick<RequestContext, 'actorId' | 'communityId'>, changes: Partial<Member>): Promise<Member>;
}

export interface CoverStorage {
  putCover(input: { actorId: string; bytes: ArrayBuffer; contentType: 'image/jpeg' | 'image/png' | 'image/webp' }): Promise<{ assetId: string; storagePath: string }>;
  getCoverUrl(storagePath: string): Promise<string>;
}
