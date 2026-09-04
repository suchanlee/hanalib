import { borrowRequestExpiresAt, firstReturnCheckAt } from '../domain/rules.ts';
import type {
  AddBookInput,
  AppLocale,
  BorrowRequest,
  CatalogItem,
  CatalogStatus,
  Loan,
  Member,
  NotificationChannel,
  RequestStatus,
} from '../domain/types.ts';
import { parseIsbn } from '../isbn/isbn.ts';
import { decryptContact, encryptContact, hashContact } from '../notifications/contact-crypto.ts';
import type { LibraryBootstrap, LibraryRepository, RequestContext } from './contracts.ts';
import { libraryError } from './errors.ts';
import type { OutboxPayloadByType } from './outbox.ts';

const CATALOG_SELECT = `
  SELECT
    ci.id AS itemId,
    ci.owner_id AS ownerId,
    ci.status AS itemStatus,
    ci.condition AS itemCondition,
    ci.owner_notes AS ownerNotes,
    ci.created_at AS itemCreatedAt,
    be.id AS editionId,
    be.isbn10 AS isbn10,
    be.isbn13 AS isbn13,
    be.title AS title,
    be.title_en AS titleEn,
    be.authors_json AS authorsJson,
    be.authors_en_json AS authorsEnJson,
    be.publisher AS publisher,
    be.published_on AS publishedOn,
    be.language AS language,
    be.page_count AS pageCount,
    be.description AS description,
    be.cover_source_url AS coverSourceUrl,
    be.cover_storage_path AS coverStoragePath,
    be.cover_tone AS coverTone,
    be.field_provenance_json AS provenanceJson
  FROM catalog_items ci
  INNER JOIN book_editions be ON be.id = ci.edition_id
`;

interface CatalogRow {
  itemId: string;
  ownerId: string;
  itemStatus: string;
  itemCondition: string;
  ownerNotes: string | null;
  itemCreatedAt: number;
  editionId: string;
  isbn10: string | null;
  isbn13: string | null;
  title: string;
  titleEn: string | null;
  authorsJson: string;
  authorsEnJson: string;
  publisher: string | null;
  publishedOn: string | null;
  language: string | null;
  pageCount: number | null;
  description: string | null;
  coverSourceUrl: string | null;
  coverStoragePath: string | null;
  coverTone: string;
  provenanceJson: string;
}

interface MemberRow {
  id: string;
  displayName: string;
  displayNameKo: string;
  locale: string;
  notificationChannel: string;
  phone: string;
  email: string;
}

interface ContactRow {
  kind: string;
  addressEncrypted: string;
}

interface RequestRow {
  id: string;
  catalogItemId: string;
  requesterId: string;
  status: string;
  requestedAt: number;
  expiresAt: number;
}

interface LoanRow {
  id: string;
  catalogItemId: string;
  requestId: string;
  ownerId: string;
  borrowerId: string;
  status: string;
  startedAt: number;
  nextCheckAt: number;
  returnedAt: number | null;
  returnedBy: string | null;
}

interface RequestInfoRow extends RequestRow {
  communityId: string;
  ownerId: string;
  itemStatus: string;
  bookTitle: string;
  requesterDisplayName: string;
  requesterDisplayNameKo: string;
  requesterLocale: string;
  ownerDisplayName: string;
  ownerDisplayNameKo: string;
  ownerLocale: string;
}

interface ItemRequestInfoRow {
  itemId: string;
  ownerId: string;
  itemStatus: string;
  bookTitle: string;
  ownerDisplayName: string;
  ownerDisplayNameKo: string;
  ownerLocale: string;
  actorDisplayName: string;
  actorDisplayNameKo: string;
}

export interface D1LibraryRepositoryOptions {
  now?: () => Date;
  baseUrl?: string;
  contactEncryptionKey?: string;
  contactHashKey?: string;
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function iso(milliseconds: number) {
  return new Date(milliseconds).toISOString();
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function locale(value: string): AppLocale {
  return value === 'en' ? 'en' : 'ko';
}

function notificationChannel(value: string): NotificationChannel {
  return value === 'sms' || value === 'both' ? value : 'email';
}

function memberInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1
    ? `${Array.from(words[0])[0] ?? ''}${Array.from(words.at(-1) ?? '')[0] ?? ''}`.toUpperCase()
    : Array.from(words[0] ?? '').slice(0, 2).join('').toUpperCase();
}

function mapMember(row: MemberRow): Member {
  return {
    id: row.id,
    displayName: row.displayName,
    displayNameKo: row.displayNameKo,
    initials: memberInitials(row.displayName || row.displayNameKo),
    locale: locale(row.locale),
    notificationChannel: notificationChannel(row.notificationChannel),
    phone: row.phone,
    email: row.email,
  };
}

function catalogStatus(value: string): CatalogStatus {
  return value === 'borrowed' || value === 'archived' ? value : 'available';
}

function mapCatalogItem(row: CatalogRow): CatalogItem {
  const language = row.language === 'en' || row.language === 'other' ? row.language : 'ko';
  const condition = row.itemCondition === 'like-new' || row.itemCondition === 'well-loved' ? row.itemCondition : 'good';
  const coverTone = ['amber', 'blue', 'green', 'rose', 'ink', 'violet'].includes(row.coverTone)
    ? row.coverTone as CatalogItem['edition']['coverTone']
    : 'blue';
  const year = Number.parseInt(row.publishedOn?.slice(0, 4) ?? '', 10);
  return {
    id: row.itemId,
    ownerId: row.ownerId,
    status: catalogStatus(row.itemStatus),
    condition,
    ownerNotes: row.ownerNotes ?? undefined,
    createdAt: iso(row.itemCreatedAt),
    edition: {
      id: row.editionId,
      isbn13: row.isbn13 ?? '',
      isbn10: row.isbn10 ?? undefined,
      title: row.title,
      titleEn: row.titleEn ?? undefined,
      authors: parseJson<string[]>(row.authorsJson, []),
      authorsEn: parseJson<string[]>(row.authorsEnJson, []),
      publisher: row.publisher ?? '',
      publishedYear: Number.isFinite(year) ? year : 0,
      language,
      pageCount: row.pageCount ?? undefined,
      description: row.description ?? undefined,
      coverUrl: row.coverSourceUrl ?? (row.coverStoragePath ? `/api/covers/${encodeURIComponent(row.coverStoragePath)}` : undefined),
      coverTone,
      provenance: parseJson<Record<string, string>>(row.provenanceJson, {}),
    },
  };
}

function requestStatus(value: string): RequestStatus {
  const statuses: RequestStatus[] = ['pending', 'accepted', 'declined', 'canceled', 'expired', 'superseded'];
  return statuses.includes(value as RequestStatus) ? value as RequestStatus : 'expired';
}

function mapRequest(row: RequestRow): BorrowRequest {
  return {
    id: row.id,
    catalogItemId: row.catalogItemId,
    requesterId: row.requesterId,
    status: requestStatus(row.status),
    requestedAt: iso(row.requestedAt),
    expiresAt: iso(row.expiresAt),
  };
}

function mapLoan(row: LoanRow): Loan {
  return {
    id: row.id,
    catalogItemId: row.catalogItemId,
    requestId: row.requestId,
    ownerId: row.ownerId,
    borrowerId: row.borrowerId,
    status: row.status === 'returned' ? 'returned' : 'active',
    startedAt: iso(row.startedAt),
    nextCheckAt: iso(row.nextCheckAt),
    returnedAt: row.returnedAt == null ? undefined : iso(row.returnedAt),
    returnedBy: row.returnedBy ?? undefined,
  };
}

function localizedName(row: { locale: string; displayName: string; displayNameKo: string }) {
  return row.locale === 'ko' ? row.displayNameKo : row.displayName;
}

function affected(result: D1Result<unknown>) {
  return Number(result.meta.changes ?? 0);
}

function requireIdempotency(context: RequestContext, operation: string) {
  const raw = context.idempotencyKey.trim();
  if (!raw || raw.length > 160) throw libraryError('missing-idempotency-key', 'A valid Idempotency-Key header is required.');
  return `${operation}:${context.actorId}:${raw}`;
}

function validCondition(value: unknown): value is CatalogItem['condition'] {
  return value === 'like-new' || value === 'good' || value === 'well-loved';
}

function coverToneFor(title: string): CatalogItem['edition']['coverTone'] {
  const tones: CatalogItem['edition']['coverTone'][] = ['amber', 'blue', 'green', 'rose', 'ink', 'violet'];
  const hash = Array.from(title).reduce((total, character) => total + (character.codePointAt(0) ?? 0), 0);
  return tones[hash % tones.length];
}

export class D1LibraryRepository implements LibraryRepository {
  private readonly db: D1Database;
  private readonly now: () => Date;
  private readonly baseUrl: string;
  private readonly contactEncryptionKey?: string;
  private readonly contactHashKey?: string;

  constructor(db: D1Database, options: D1LibraryRepositoryOptions = {}) {
    this.db = db;
    this.now = options.now ?? (() => new Date());
    this.baseUrl = (options.baseUrl ?? 'https://hanalib.app').replace(/\/$/, '');
    this.contactEncryptionKey = options.contactEncryptionKey;
    this.contactHashKey = options.contactHashKey;
  }

  private async assertActiveMember(context: Pick<RequestContext, 'actorId' | 'communityId'>) {
    const membership = await this.db.prepare(`
      SELECT 1 AS active
      FROM community_members
      WHERE community_id = ? AND user_id = ? AND status = 'active'
      LIMIT 1
    `).bind(context.communityId, context.actorId).first<{ active: number }>();
    if (!membership) throw libraryError('forbidden', 'An active community membership is required.');
  }

  private async catalogItem(itemId: string, communityId: string) {
    return this.db.prepare(`${CATALOG_SELECT} WHERE ci.id = ? AND ci.community_id = ? LIMIT 1`)
      .bind(itemId, communityId)
      .first<CatalogRow>();
  }

  private async request(requestId: string, communityId: string) {
    return this.db.prepare(`
      SELECT
        lr.id,
        lr.catalog_item_id AS catalogItemId,
        lr.requester_id AS requesterId,
        lr.status,
        lr.requested_at AS requestedAt,
        lr.expires_at AS expiresAt
      FROM loan_requests lr
      WHERE lr.id = ? AND lr.community_id = ?
      LIMIT 1
    `).bind(requestId, communityId).first<RequestRow>();
  }

  private async loan(loanId: string, communityId: string) {
    return this.db.prepare(`
      SELECT
        id,
        catalog_item_id AS catalogItemId,
        request_id AS requestId,
        owner_id AS ownerId,
        borrower_id AS borrowerId,
        status,
        started_at AS startedAt,
        next_check_at AS nextCheckAt,
        returned_at AS returnedAt,
        returned_by AS returnedBy
      FROM loans
      WHERE id = ? AND community_id = ?
      LIMIT 1
    `).bind(loanId, communityId).first<LoanRow>();
  }

  async getBootstrap(context: Pick<RequestContext, 'actorId' | 'communityId'>): Promise<LibraryBootstrap> {
    await this.assertActiveMember(context);
    const results = await this.db.batch([
      this.db.prepare(`
        SELECT
          p.id,
          p.display_name AS displayName,
          p.display_name_ko AS displayNameKo,
          p.locale,
          p.notification_channel AS notificationChannel,
          '' AS phone,
          '' AS email
        FROM community_members cm
        INNER JOIN profiles p ON p.id = cm.user_id
        WHERE cm.community_id = ? AND cm.status = 'active'
        ORDER BY p.display_name
      `).bind(context.communityId),
      this.db.prepare(`${CATALOG_SELECT} WHERE ci.community_id = ? AND ci.archived_at IS NULL AND ci.status <> 'archived' ORDER BY ci.created_at DESC`)
        .bind(context.communityId),
      this.db.prepare(`
        SELECT
          id,
          catalog_item_id AS catalogItemId,
          requester_id AS requesterId,
          status,
          requested_at AS requestedAt,
          expires_at AS expiresAt
        FROM loan_requests
        WHERE community_id = ?
        ORDER BY requested_at DESC
      `).bind(context.communityId),
      this.db.prepare(`
        SELECT
          id,
          catalog_item_id AS catalogItemId,
          request_id AS requestId,
          owner_id AS ownerId,
          borrower_id AS borrowerId,
          status,
          started_at AS startedAt,
          next_check_at AS nextCheckAt,
          returned_at AS returnedAt,
          returned_by AS returnedBy
        FROM loans
        WHERE community_id = ?
        ORDER BY started_at DESC
      `).bind(context.communityId),
      this.db.prepare(`
        SELECT kind, address_encrypted AS addressEncrypted
        FROM notification_endpoints
        WHERE user_id = ? AND enabled = 1
      `).bind(context.actorId),
      this.db.prepare(`
        SELECT email
        FROM auth_identities
        WHERE profile_id = ?
        ORDER BY last_signed_in_at DESC
        LIMIT 1
      `).bind(context.actorId),
    ]);
    const members = (results[0].results as unknown as MemberRow[]).map(mapMember);
    const profile = members.find((member) => member.id === context.actorId);
    if (!profile) throw libraryError('forbidden', 'The signed-in profile is not active in this community.');
    const contacts = results[4].results as unknown as ContactRow[];
    const encryptedPhone = contacts.find((contact) => contact.kind === 'sms')?.addressEncrypted;
    const phone = encryptedPhone && this.contactEncryptionKey
      ? await decryptContact(encryptedPhone, this.contactEncryptionKey)
      : '';
    const email = (results[5].results[0] as { email?: string } | undefined)?.email ?? '';
    const hydratedProfile = { ...profile, phone, email };
    return {
      profile: hydratedProfile,
      members: members.map((member) => member.id === hydratedProfile.id ? hydratedProfile : member),
      items: (results[1].results as unknown as CatalogRow[]).map(mapCatalogItem),
      requests: (results[2].results as unknown as RequestRow[]).map(mapRequest),
      loans: (results[3].results as unknown as LoanRow[]).map(mapLoan),
    };
  }

  async listCatalog(context: Pick<RequestContext, 'actorId' | 'communityId'>) {
    await this.assertActiveMember(context);
    const result = await this.db.prepare(`${CATALOG_SELECT} WHERE ci.community_id = ? AND ci.archived_at IS NULL AND ci.status <> 'archived' ORDER BY ci.created_at DESC`)
      .bind(context.communityId)
      .all<CatalogRow>();
    return result.results.map(mapCatalogItem);
  }

  async createCatalogItem(context: RequestContext, input: AddBookInput) {
    await this.assertActiveMember(context);
    const operationKey = requireIdempotency(context, 'catalog-create');
    const existing = await this.db.prepare('SELECT id FROM catalog_items WHERE community_id = ? AND owner_id = ? AND idempotency_key = ? LIMIT 1')
      .bind(context.communityId, context.actorId, operationKey)
      .first<{ id: string }>();
    if (existing) {
      const item = await this.catalogItem(existing.id, context.communityId);
      if (item) return mapCatalogItem(item);
    }

    const parsedIsbn = parseIsbn(input.isbn13);
    if (!parsedIsbn || !input.title.trim() || !input.authors.length || !validCondition(input.condition)) {
      throw libraryError('invalid-input', 'ISBN, title, author, and condition are required.');
    }
    if (!Number.isInteger(input.publishedYear) || input.publishedYear < 1000 || input.publishedYear > 9999) {
      throw libraryError('invalid-input', 'Published year must be a four-digit year.');
    }

    const editionId = id('edition');
    const itemId = id('item');
    const now = this.now().getTime();
    const results = await this.db.batch([
      this.db.prepare(`
        INSERT INTO book_editions (
          id, isbn13, title, title_en, authors_json, authors_en_json, publisher,
          published_on, language, page_count, cover_source_url, cover_tone,
          field_provenance_json, resolver_version, resolved_at
        ) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(isbn13) DO UPDATE SET
          title = excluded.title,
          title_en = excluded.title_en,
          authors_json = excluded.authors_json,
          publisher = excluded.publisher,
          published_on = excluded.published_on,
          language = excluded.language,
          page_count = excluded.page_count,
          cover_source_url = excluded.cover_source_url,
          field_provenance_json = excluded.field_provenance_json,
          resolved_at = excluded.resolved_at
      `).bind(
        editionId,
        parsedIsbn.isbn13,
        input.title.trim(),
        input.titleEn?.trim() || null,
        JSON.stringify(input.authors.map((author) => author.trim()).filter(Boolean)),
        input.publisher.trim(),
        String(input.publishedYear),
        input.language,
        input.pageCount ?? null,
        input.coverUrl ?? null,
        coverToneFor(input.title),
        JSON.stringify(input.provenance),
        now,
      ),
      this.db.prepare(`
        INSERT INTO catalog_items (
          id, community_id, edition_id, owner_id, status, condition, owner_notes,
          idempotency_key, version, created_at, updated_at
        )
        SELECT ?, ?, be.id, ?, 'available', ?, ?, ?, 1, ?, ?
        FROM book_editions be
        WHERE be.isbn13 = ?
      `).bind(
        itemId,
        context.communityId,
        context.actorId,
        input.condition,
        input.ownerNotes?.trim() || null,
        operationKey,
        now,
        now,
        parsedIsbn.isbn13,
      ),
    ]);
    if (affected(results[1]) !== 1) throw libraryError('conflict', 'The book could not be added.');
    const item = await this.catalogItem(itemId, context.communityId);
    if (!item) throw libraryError('not-found', 'The newly created book could not be loaded.');
    return mapCatalogItem(item);
  }

  async updateCatalogItem(
    context: RequestContext,
    itemId: string,
    changes: Pick<CatalogItem, 'condition' | 'ownerNotes'>,
  ) {
    await this.assertActiveMember(context);
    if (!validCondition(changes.condition)) throw libraryError('invalid-input', 'Invalid book condition.');
    const result = await this.db.prepare(`
      UPDATE catalog_items
      SET condition = ?, owner_notes = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND community_id = ? AND owner_id = ? AND archived_at IS NULL
    `).bind(
      changes.condition,
      changes.ownerNotes?.trim() || null,
      this.now().getTime(),
      itemId,
      context.communityId,
      context.actorId,
    ).run();
    if (affected(result) !== 1) throw libraryError('not-found', 'Only the owner can edit an active listing.');
    const item = await this.catalogItem(itemId, context.communityId);
    if (!item) throw libraryError('not-found', 'Book not found.');
    return mapCatalogItem(item);
  }

  async archiveCatalogItem(context: RequestContext, itemId: string) {
    await this.assertActiveMember(context);
    const existing = await this.catalogItem(itemId, context.communityId);
    if (!existing || existing.ownerId !== context.actorId) throw libraryError('not-found', 'Only the owner can remove this listing.');
    if (existing.itemStatus === 'borrowed') throw libraryError('conflict', 'A borrowed book cannot be removed.');
    const now = this.now().getTime();
    const result = await this.db.prepare(`
      UPDATE catalog_items
      SET status = 'archived', archived_at = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND community_id = ? AND owner_id = ? AND status <> 'borrowed'
        AND NOT EXISTS (
          SELECT 1 FROM loans WHERE catalog_item_id = catalog_items.id AND status = 'active'
        )
    `).bind(now, now, itemId, context.communityId, context.actorId).run();
    if (affected(result) !== 1) throw libraryError('conflict', 'A borrowed book cannot be removed.');
  }

  async createBorrowRequest(context: RequestContext, itemId: string) {
    await this.assertActiveMember(context);
    const operationKey = requireIdempotency(context, 'borrow-request');
    const existing = await this.db.prepare(`
      SELECT
        id,
        catalog_item_id AS catalogItemId,
        requester_id AS requesterId,
        status,
        requested_at AS requestedAt,
        expires_at AS expiresAt
      FROM loan_requests
      WHERE community_id = ? AND requester_id = ? AND idempotency_key = ?
      LIMIT 1
    `).bind(context.communityId, context.actorId, operationKey).first<RequestRow>();
    if (existing) return mapRequest(existing);

    const info = await this.db.prepare(`
      SELECT
        ci.id AS itemId,
        ci.owner_id AS ownerId,
        ci.status AS itemStatus,
        be.title AS bookTitle,
        owner.display_name AS ownerDisplayName,
        owner.display_name_ko AS ownerDisplayNameKo,
        owner.locale AS ownerLocale,
        actor.display_name AS actorDisplayName,
        actor.display_name_ko AS actorDisplayNameKo
      FROM catalog_items ci
      INNER JOIN book_editions be ON be.id = ci.edition_id
      INNER JOIN profiles owner ON owner.id = ci.owner_id
      INNER JOIN profiles actor ON actor.id = ?
      WHERE ci.id = ? AND ci.community_id = ? AND ci.archived_at IS NULL
      LIMIT 1
    `).bind(context.actorId, itemId, context.communityId).first<ItemRequestInfoRow>();
    if (!info) throw libraryError('not-found', 'Book not found.');
    if (info.ownerId === context.actorId) throw libraryError('conflict', 'Owners cannot borrow their own books.');
    if (info.itemStatus !== 'available') throw libraryError('conflict', 'This book is not available.');

    const requestedAt = this.now();
    const expiresAt = borrowRequestExpiresAt(requestedAt);
    const requestId = id('request');
    const outboxId = id('event');
    const payload: OutboxPayloadByType['borrow_requested'] = {
      bookTitle: info.bookTitle,
      recipientName: localizedName({ locale: info.ownerLocale, displayName: info.ownerDisplayName, displayNameKo: info.ownerDisplayNameKo }),
      actorName: info.ownerLocale === 'ko' ? info.actorDisplayNameKo : info.actorDisplayName,
      expiresAt: expiresAt.toISOString(),
      decisionUrl: `${this.baseUrl}/borrowing?request=${encodeURIComponent(requestId)}`,
    };

    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE loan_requests
        SET status = 'expired'
        WHERE catalog_item_id = ? AND requester_id = ? AND status = 'pending' AND expires_at <= ?
      `).bind(itemId, context.actorId, requestedAt.getTime()),
      this.db.prepare(`
        INSERT INTO loan_requests (
          id, community_id, catalog_item_id, requester_id, status, requested_at,
          expires_at, sms_actionable_at, idempotency_key
        )
        SELECT ?, ?, ci.id, ?, 'pending', ?, ?, ?, ?
        FROM catalog_items ci
        WHERE ci.id = ? AND ci.community_id = ? AND ci.status = 'available'
          AND ci.owner_id <> ? AND ci.archived_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM loan_requests active
            WHERE active.catalog_item_id = ci.id AND active.requester_id = ?
              AND active.status = 'pending' AND active.expires_at > ?
          )
      `).bind(
        requestId,
        context.communityId,
        context.actorId,
        requestedAt.getTime(),
        expiresAt.getTime(),
        requestedAt.getTime(),
        operationKey,
        itemId,
        context.communityId,
        context.actorId,
        context.actorId,
        requestedAt.getTime(),
      ),
      this.db.prepare(`
        INSERT INTO outbox_events (
          id, event_type, aggregate_type, aggregate_id, recipient_id, locale,
          payload_json, available_at, attempt_count
        )
        SELECT ?, 'borrow_requested', 'loan_request', lr.id, ?, ?, ?, ?, 0
        FROM loan_requests lr
        WHERE lr.id = ? AND lr.status = 'pending'
      `).bind(
        outboxId,
        info.ownerId,
        locale(info.ownerLocale),
        JSON.stringify(payload),
        requestedAt.getTime(),
        requestId,
      ),
    ]);
    if (affected(results[1]) !== 1 || affected(results[2]) !== 1) {
      throw libraryError('conflict', 'A live request already exists or the book is no longer available.');
    }
    const request = await this.request(requestId, context.communityId);
    if (!request) throw libraryError('not-found', 'The new request could not be loaded.');
    return mapRequest(request);
  }

  async cancelBorrowRequest(
    context: Pick<RequestContext, 'actorId' | 'communityId'>,
    requestId: string,
  ) {
    await this.assertActiveMember(context);
    const existing = await this.request(requestId, context.communityId);
    if (!existing || existing.requesterId !== context.actorId) throw libraryError('not-found', 'Borrow request not found.');
    if (existing.status === 'canceled') return mapRequest(existing);
    const now = this.now().getTime();
    if (existing.status === 'pending' && existing.expiresAt <= now) {
      await this.db.prepare("UPDATE loan_requests SET status = 'expired' WHERE id = ? AND status = 'pending'")
        .bind(requestId).run();
      throw libraryError('request-expired', 'This borrow request has expired.');
    }
    const result = await this.db.prepare(`
      UPDATE loan_requests
      SET status = 'canceled', responded_at = ?, responded_by = ?
      WHERE id = ? AND community_id = ? AND requester_id = ? AND status = 'pending' AND expires_at > ?
    `).bind(now, context.actorId, requestId, context.communityId, context.actorId, now).run();
    if (affected(result) !== 1) throw libraryError('conflict', 'Only a pending request can be canceled.');
    const request = await this.request(requestId, context.communityId);
    if (!request) throw libraryError('not-found', 'Borrow request not found.');
    return mapRequest(request);
  }

  async respondToBorrowRequest(
    context: RequestContext,
    requestId: string,
    decision: 'accepted' | 'declined',
  ) {
    await this.assertActiveMember(context);
    requireIdempotency(context, 'borrow-response');
    const info = await this.db.prepare(`
      SELECT
        lr.id,
        lr.community_id AS communityId,
        lr.catalog_item_id AS catalogItemId,
        lr.requester_id AS requesterId,
        lr.status,
        lr.requested_at AS requestedAt,
        lr.expires_at AS expiresAt,
        ci.owner_id AS ownerId,
        ci.status AS itemStatus,
        be.title AS bookTitle,
        requester.display_name AS requesterDisplayName,
        requester.display_name_ko AS requesterDisplayNameKo,
        requester.locale AS requesterLocale,
        owner.display_name AS ownerDisplayName,
        owner.display_name_ko AS ownerDisplayNameKo,
        owner.locale AS ownerLocale
      FROM loan_requests lr
      INNER JOIN catalog_items ci ON ci.id = lr.catalog_item_id
      INNER JOIN book_editions be ON be.id = ci.edition_id
      INNER JOIN profiles requester ON requester.id = lr.requester_id
      INNER JOIN profiles owner ON owner.id = ci.owner_id
      WHERE lr.id = ? AND lr.community_id = ?
      LIMIT 1
    `).bind(requestId, context.communityId).first<RequestInfoRow>();
    if (!info || info.ownerId !== context.actorId) throw libraryError('not-found', 'Only the book owner can respond to this request.');

    if (info.status === decision) {
      const request = mapRequest(info);
      const existingLoan = decision === 'accepted'
        ? await this.db.prepare('SELECT id FROM loans WHERE request_id = ? LIMIT 1').bind(requestId).first<{ id: string }>()
        : null;
      const loan = existingLoan ? await this.loan(existingLoan.id, context.communityId) : null;
      return { request, loan: loan ? mapLoan(loan) : undefined };
    }
    if (info.status !== 'pending') throw libraryError('conflict', 'This request has already been resolved.');

    const now = this.now();
    if (info.expiresAt <= now.getTime()) {
      await this.db.prepare("UPDATE loan_requests SET status = 'expired' WHERE id = ? AND status = 'pending'")
        .bind(requestId).run();
      throw libraryError('request-expired', 'This borrow request has expired.');
    }

    const recipientName = info.requesterLocale === 'ko' ? info.requesterDisplayNameKo : info.requesterDisplayName;
    const actorName = info.requesterLocale === 'ko' ? info.ownerDisplayNameKo : info.ownerDisplayName;
    if (decision === 'declined') {
      const payload: OutboxPayloadByType['borrow_declined'] = { bookTitle: info.bookTitle, recipientName, actorName };
      const results = await this.db.batch([
        this.db.prepare(`
          UPDATE loan_requests
          SET status = 'declined', responded_at = ?, responded_by = ?
          WHERE id = ? AND community_id = ? AND status = 'pending' AND expires_at > ?
            AND EXISTS (
              SELECT 1 FROM catalog_items ci
              WHERE ci.id = loan_requests.catalog_item_id AND ci.owner_id = ?
            )
        `).bind(now.getTime(), context.actorId, requestId, context.communityId, now.getTime(), context.actorId),
        this.db.prepare(`
          INSERT INTO outbox_events (
            id, event_type, aggregate_type, aggregate_id, recipient_id, locale,
            payload_json, available_at, attempt_count
          )
          SELECT ?, 'borrow_declined', 'loan_request', lr.id, lr.requester_id, ?, ?, ?, 0
          FROM loan_requests lr
          WHERE lr.id = ? AND lr.status = 'declined' AND lr.responded_at = ?
        `).bind(id('event'), locale(info.requesterLocale), JSON.stringify(payload), now.getTime(), requestId, now.getTime()),
      ]);
      if (affected(results[0]) !== 1 || affected(results[1]) !== 1) throw libraryError('conflict', 'The request could not be declined.');
      const request = await this.request(requestId, context.communityId);
      if (!request) throw libraryError('not-found', 'Borrow request not found.');
      return { request: mapRequest(request) };
    }

    if (info.itemStatus !== 'available') throw libraryError('conflict', 'The book is no longer available.');
    const loanId = id('loan');
    const checkinId = id('checkin');
    const nextCheckAt = firstReturnCheckAt(now);
    const returnUrl = `${this.baseUrl}/borrowing?loan=${encodeURIComponent(loanId)}`;
    const acceptedPayload: OutboxPayloadByType['borrow_accepted'] = {
      bookTitle: info.bookTitle,
      recipientName,
      actorName,
      returnUrl,
    };
    const returnPayload: OutboxPayloadByType['return_check_due'] = {
      bookTitle: info.bookTitle,
      recipientName,
      actorName,
      returnUrl,
    };
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE loan_requests
        SET status = 'accepted', responded_at = ?, responded_by = ?
        WHERE id = ? AND community_id = ? AND status = 'pending' AND expires_at > ?
          AND EXISTS (
            SELECT 1 FROM catalog_items ci
            WHERE ci.id = loan_requests.catalog_item_id AND ci.owner_id = ?
              AND ci.status = 'available' AND ci.archived_at IS NULL
          )
      `).bind(now.getTime(), context.actorId, requestId, context.communityId, now.getTime(), context.actorId),
      this.db.prepare(`
        UPDATE catalog_items
        SET status = 'borrowed', version = version + 1, updated_at = ?
        WHERE id = ? AND community_id = ? AND owner_id = ? AND status = 'available'
          AND EXISTS (
            SELECT 1 FROM loan_requests lr
            WHERE lr.id = ? AND lr.status = 'accepted' AND lr.responded_at = ?
          )
      `).bind(now.getTime(), info.catalogItemId, context.communityId, context.actorId, requestId, now.getTime()),
      this.db.prepare(`
        UPDATE loan_requests
        SET status = 'superseded', responded_at = ?, responded_by = ?
        WHERE catalog_item_id = ? AND id <> ? AND status = 'pending'
      `).bind(now.getTime(), context.actorId, info.catalogItemId, requestId),
      this.db.prepare(`
        INSERT INTO loans (
          id, community_id, catalog_item_id, request_id, owner_id, borrower_id,
          status, started_at, next_check_at, version
        )
        SELECT ?, lr.community_id, lr.catalog_item_id, lr.id, ?, lr.requester_id,
          'active', ?, ?, 1
        FROM loan_requests lr
        WHERE lr.id = ? AND lr.status = 'accepted' AND lr.responded_at = ?
      `).bind(loanId, context.actorId, now.getTime(), nextCheckAt.getTime(), requestId, now.getTime()),
      this.db.prepare(`
        INSERT INTO return_checkins (id, loan_id, scheduled_for)
        SELECT ?, l.id, l.next_check_at FROM loans l WHERE l.id = ? AND l.status = 'active'
      `).bind(checkinId, loanId),
      this.db.prepare(`
        INSERT INTO outbox_events (
          id, event_type, aggregate_type, aggregate_id, recipient_id, locale,
          payload_json, available_at, attempt_count
        )
        SELECT ?, 'borrow_accepted', 'loan_request', lr.id, lr.requester_id, ?, ?, ?, 0
        FROM loan_requests lr
        WHERE lr.id = ? AND lr.status = 'accepted' AND lr.responded_at = ?
      `).bind(id('event'), locale(info.requesterLocale), JSON.stringify(acceptedPayload), now.getTime(), requestId, now.getTime()),
      this.db.prepare(`
        INSERT INTO outbox_events (
          id, event_type, aggregate_type, aggregate_id, recipient_id, locale,
          payload_json, available_at, attempt_count
        )
        SELECT ?, 'return_check_due', 'loan', l.id, l.borrower_id, ?, ?, l.next_check_at, 0
        FROM loans l
        WHERE l.id = ? AND l.status = 'active'
      `).bind(id('event'), locale(info.requesterLocale), JSON.stringify(returnPayload), loanId),
    ]);
    if (affected(results[0]) !== 1 || affected(results[1]) !== 1 || affected(results[3]) !== 1 || affected(results[4]) !== 1 || affected(results[5]) !== 1 || affected(results[6]) !== 1) {
      throw libraryError('conflict', 'The request could not be accepted.');
    }
    const [request, loan] = await Promise.all([
      this.request(requestId, context.communityId),
      this.loan(loanId, context.communityId),
    ]);
    if (!request || !loan) throw libraryError('not-found', 'The accepted loan could not be loaded.');
    return { request: mapRequest(request), loan: mapLoan(loan) };
  }

  async markReturned(context: RequestContext, loanId: string) {
    await this.assertActiveMember(context);
    requireIdempotency(context, 'loan-return');
    const existing = await this.loan(loanId, context.communityId);
    if (!existing || (existing.ownerId !== context.actorId && existing.borrowerId !== context.actorId)) {
      throw libraryError('not-found', 'Only the borrower or owner can return this book.');
    }
    if (existing.status === 'returned') return mapLoan(existing);
    const now = this.now().getTime();
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE loans
        SET status = 'returned', returned_at = ?, returned_by = ?, version = version + 1
        WHERE id = ? AND community_id = ? AND status = 'active'
          AND (owner_id = ? OR borrower_id = ?)
      `).bind(now, context.actorId, loanId, context.communityId, context.actorId, context.actorId),
      this.db.prepare(`
        UPDATE catalog_items
        SET status = 'available', version = version + 1, updated_at = ?
        WHERE id = ? AND community_id = ?
          AND EXISTS (SELECT 1 FROM loans l WHERE l.id = ? AND l.status = 'returned' AND l.returned_at = ?)
      `).bind(now, existing.catalogItemId, context.communityId, loanId, now),
      this.db.prepare(`
        UPDATE return_checkins
        SET response = 'returned', responded_at = ?, next_scheduled_for = NULL
        WHERE loan_id = ? AND response IS NULL
      `).bind(now, loanId),
    ]);
    if (affected(results[0]) !== 1 || affected(results[1]) !== 1) throw libraryError('conflict', 'The return could not be recorded.');
    const loan = await this.loan(loanId, context.communityId);
    if (!loan) throw libraryError('not-found', 'Loan not found.');
    return mapLoan(loan);
  }

  async updateProfile(
    context: Pick<RequestContext, 'actorId' | 'communityId'>,
    changes: Partial<Member>,
  ) {
    await this.assertActiveMember(context);
    const existing = await this.db.prepare(`
      SELECT
        p.id,
        p.display_name AS displayName,
        p.display_name_ko AS displayNameKo,
        p.locale,
        p.notification_channel AS notificationChannel,
        '' AS phone,
        COALESCE((
          SELECT ai.email FROM auth_identities ai
          WHERE ai.profile_id = p.id ORDER BY ai.last_signed_in_at DESC LIMIT 1
        ), '') AS email
      FROM profiles p
      WHERE p.id = ?
      LIMIT 1
    `).bind(context.actorId).first<MemberRow>();
    if (!existing) throw libraryError('not-found', 'Profile not found.');

    const next = {
      displayName: changes.displayName?.trim() ?? existing.displayName,
      displayNameKo: changes.displayNameKo?.trim() ?? existing.displayNameKo,
      locale: changes.locale ?? locale(existing.locale),
      notificationChannel: changes.notificationChannel ?? notificationChannel(existing.notificationChannel),
      phone: changes.phone?.replace(/[\s().-]/g, '') ?? existing.phone,
    };
    if (!next.displayName || !next.displayNameKo) throw libraryError('invalid-input', 'Both display names are required.');
    if (next.locale !== 'ko' && next.locale !== 'en') throw libraryError('invalid-input', 'Invalid locale.');
    if (!['email', 'sms', 'both'].includes(next.notificationChannel)) throw libraryError('invalid-input', 'Invalid notification channel.');
    if (next.phone && !/^\+1[2-9]\d{9}$/.test(next.phone)) throw libraryError('invalid-input', 'Phone numbers must be valid US +1 E.164 numbers.');

    const profileStatement = this.db.prepare(`
      UPDATE profiles
      SET display_name = ?, display_name_ko = ?, locale = ?, notification_channel = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      next.displayName,
      next.displayNameKo,
      next.locale,
      next.notificationChannel,
      this.now().getTime(),
      context.actorId,
    );
    if (changes.phone !== undefined) {
      if (!this.contactEncryptionKey || !this.contactHashKey) {
        throw libraryError('server-misconfigured', 'Contact encryption is not configured.');
      }
      const encrypted = await encryptContact(next.phone, this.contactEncryptionKey);
      const hashed = await hashContact(next.phone, this.contactHashKey);
      const results = await this.db.batch([
        profileStatement,
        this.db.prepare(`
          INSERT INTO notification_endpoints (
            id, user_id, kind, address_encrypted, address_hash, verified_at, enabled
          ) VALUES (?, ?, 'sms', ?, ?, NULL, 1)
          ON CONFLICT(user_id, kind) DO UPDATE SET
            address_encrypted = excluded.address_encrypted,
            address_hash = excluded.address_hash,
            verified_at = NULL,
            enabled = 1
        `).bind(id('endpoint'), context.actorId, encrypted, hashed),
      ]);
      if (affected(results[0]) !== 1 || affected(results[1]) !== 1) throw libraryError('not-found', 'Profile not found.');
    } else {
      const result = await profileStatement.run();
      if (affected(result) !== 1) throw libraryError('not-found', 'Profile not found.');
    }
    return mapMember({ ...existing, ...next });
  }
}
