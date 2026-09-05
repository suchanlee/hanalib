import { borrowRequestExpiresAt, firstReturnCheckAt } from '../domain/rules.ts';
import type {
  AddBookInput,
  AppLocale,
  BorrowRequest,
  CatalogItem,
  CatalogStatus,
  Hold,
  HoldStatus,
  Loan,
  Member,
  NotificationChannel,
  RequestStatus,
  ReturnCheck,
  UpdateCatalogItemInput,
} from '../domain/types.ts';
import { parseIsbn } from '../isbn/isbn.ts';
import { decryptContact, encryptContact, hashContact } from '../notifications/contact-crypto.ts';
import type { LibraryBootstrap, LibraryRepository, RequestContext } from './contracts.ts';
import { libraryError } from './errors.ts';
import type { OutboxPayloadByType } from './outbox.ts';
import { offerNextHold } from './hold-queue.ts';

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
    COALESCE(json_extract(ci.metadata_overrides_json, '$.title'), be.title) AS title,
    CASE WHEN ci.metadata_overrides_json IS NULL THEN be.title_en ELSE json_extract(ci.metadata_overrides_json, '$.titleEn') END AS titleEn,
    COALESCE(json_extract(ci.metadata_overrides_json, '$.authors'), be.authors_json) AS authorsJson,
    COALESCE(json_extract(ci.metadata_overrides_json, '$.authorsEn'), be.authors_en_json) AS authorsEnJson,
    CASE WHEN ci.metadata_overrides_json IS NULL THEN be.publisher ELSE json_extract(ci.metadata_overrides_json, '$.publisher') END AS publisher,
    COALESCE(json_extract(ci.metadata_overrides_json, '$.publishedOn'), be.published_on) AS publishedOn,
    COALESCE(json_extract(ci.metadata_overrides_json, '$.language'), be.language) AS language,
    CASE WHEN ci.metadata_overrides_json IS NULL THEN be.page_count ELSE json_extract(ci.metadata_overrides_json, '$.pageCount') END AS pageCount,
    CASE WHEN ci.metadata_overrides_json IS NULL THEN be.description ELSE json_extract(ci.metadata_overrides_json, '$.description') END AS description,
    (
      SELECT ua.id
      FROM uploaded_assets ua
      WHERE ua.catalog_item_id = ci.id AND ua.kind = 'cover'
      ORDER BY ua.created_at DESC
      LIMIT 1
    ) AS coverOverrideAssetId,
    COALESCE(ci.cover_source_override_url, be.cover_source_url) AS coverSourceUrl,
    be.cover_storage_path AS coverStoragePath,
    COALESCE(json_extract(ci.metadata_overrides_json, '$.coverTone'), be.cover_tone) AS coverTone,
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
  coverOverrideAssetId: string | null;
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
  phoneVerified: number | boolean;
  email: string;
  phoneEncrypted?: string | null;
}

interface ContactRow {
  kind: string;
  addressEncrypted: string;
  verifiedAt: number | null;
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

interface HoldRow {
  id: string;
  catalogItemId: string;
  memberId: string;
  status: string;
  createdAt: number;
  offeredAt: number | null;
  expiresAt: number | null;
  borrowRequestId: string | null;
  position: number;
}

interface ReturnCheckRow {
  id: string;
  loanId: string;
  scheduledFor: number;
  sentAt: number;
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
  coverSourceUrl: string | null;
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
  return value === 'sms' || value === 'both' || value === 'kakao' ? value : 'email';
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
    phoneVerified: Boolean(row.phoneVerified),
    email: row.email,
  };
}

function catalogStatus(value: string): CatalogStatus {
  return value === 'held' || value === 'borrowed' || value === 'archived' ? value : 'available';
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
      coverUrl: row.coverOverrideAssetId
        ? `/api/covers/${encodeURIComponent(row.coverOverrideAssetId)}`
        : row.coverSourceUrl ?? (row.coverStoragePath ? `/api/covers/${encodeURIComponent(row.coverStoragePath)}` : undefined),
      coverTone,
      provenance: parseJson<Record<string, string>>(row.provenanceJson, {}),
    },
  };
}

const coverAssetIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function coverAssetIdFromUrl(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^\/api\/covers\/([0-9a-f-]{36})$/i);
  return match && coverAssetIdPattern.test(match[1]) ? match[1] : undefined;
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

function holdStatus(value: string): HoldStatus {
  const statuses: HoldStatus[] = ['queued', 'offered', 'converted', 'canceled', 'expired'];
  return statuses.includes(value as HoldStatus) ? value as HoldStatus : 'expired';
}

function mapHold(row: HoldRow): Hold {
  return {
    id: row.id,
    catalogItemId: row.catalogItemId,
    memberId: row.memberId,
    status: holdStatus(row.status),
    createdAt: iso(row.createdAt),
    offeredAt: row.offeredAt == null ? undefined : iso(row.offeredAt),
    expiresAt: row.expiresAt == null ? undefined : iso(row.expiresAt),
    borrowRequestId: row.borrowRequestId ?? undefined,
    position: Number(row.position),
  };
}

function mapReturnCheck(row: ReturnCheckRow): ReturnCheck {
  return {
    id: row.id,
    loanId: row.loanId,
    scheduledFor: iso(row.scheduledFor),
    sentAt: iso(row.sentAt),
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

const MAX_CATALOG_ITEMS_PER_MEMBER = 500;

function boundedText(value: string, maxLength: number) {
  return value.trim().length <= maxLength;
}

function validAuthors(value: string[]) {
  return value.length <= 12 && value.every((author) => Boolean(author.trim()) && boundedText(author, 120));
}

function validProvenance(value: Record<string, unknown>) {
  const entries = Object.entries(value);
  return entries.length <= 24 && entries.every(([key, source]) => (
    typeof source === 'string' && boundedText(key, 64) && boundedText(source, 200)
  ));
}

function metadataOverrides(item: CatalogItem) {
  return {
    title: item.edition.title,
    titleEn: item.edition.titleEn ?? null,
    authors: item.edition.authors,
    authorsEn: item.edition.authorsEn,
    publisher: item.edition.publisher || null,
    publishedOn: String(item.edition.publishedYear),
    language: item.edition.language,
    pageCount: item.edition.pageCount ?? null,
    description: item.edition.description ?? null,
    coverTone: item.edition.coverTone,
  };
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

  private async hold(holdId: string, communityId: string, memberId: string) {
    return this.db.prepare(`
      SELECT
        h.id,
        h.catalog_item_id AS catalogItemId,
        h.member_id AS memberId,
        h.status,
        h.created_at AS createdAt,
        h.offered_at AS offeredAt,
        h.expires_at AS expiresAt,
        h.borrow_request_id AS borrowRequestId,
        CASE WHEN h.status IN ('queued', 'offered') THEN (
          SELECT COUNT(*) FROM holds ahead
          WHERE ahead.catalog_item_id = h.catalog_item_id
            AND ahead.status IN ('queued', 'offered')
            AND (ahead.created_at < h.created_at OR (ahead.created_at = h.created_at AND ahead.id <= h.id))
        ) ELSE 0 END AS position
      FROM holds h
      WHERE h.id = ? AND h.community_id = ? AND h.member_id = ?
      LIMIT 1
    `).bind(holdId, communityId, memberId).first<HoldRow>();
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
          0 AS phoneVerified,
          '' AS email
        FROM community_members cm
        INNER JOIN profiles p ON p.id = cm.user_id
        WHERE cm.community_id = ? AND cm.status = 'active'
        ORDER BY p.display_name
        LIMIT 500
      `).bind(context.communityId),
      this.db.prepare(`${CATALOG_SELECT} WHERE ci.community_id = ? AND ci.archived_at IS NULL AND ci.status <> 'archived' ORDER BY ci.created_at DESC LIMIT 500`)
        .bind(context.communityId),
      this.db.prepare(`
        SELECT
          lr.id,
          lr.catalog_item_id AS catalogItemId,
          lr.requester_id AS requesterId,
          lr.status,
          lr.requested_at AS requestedAt,
          lr.expires_at AS expiresAt
        FROM loan_requests lr
        INNER JOIN catalog_items ci ON ci.id = lr.catalog_item_id
        WHERE lr.community_id = ? AND (lr.requester_id = ? OR ci.owner_id = ?)
        ORDER BY lr.requested_at DESC
        LIMIT 200
      `).bind(context.communityId, context.actorId, context.actorId),
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
        WHERE community_id = ? AND (owner_id = ? OR borrower_id = ?)
        ORDER BY started_at DESC
        LIMIT 200
      `).bind(context.communityId, context.actorId, context.actorId),
      this.db.prepare(`
        SELECT kind, address_encrypted AS addressEncrypted, verified_at AS verifiedAt
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
      this.db.prepare(`
        SELECT
          h.id,
          h.catalog_item_id AS catalogItemId,
          h.member_id AS memberId,
          h.status,
          h.created_at AS createdAt,
          h.offered_at AS offeredAt,
          h.expires_at AS expiresAt,
          h.borrow_request_id AS borrowRequestId,
          (
            SELECT COUNT(*) FROM holds ahead
            WHERE ahead.catalog_item_id = h.catalog_item_id
              AND ahead.status IN ('queued', 'offered')
              AND (ahead.created_at < h.created_at OR (ahead.created_at = h.created_at AND ahead.id <= h.id))
          ) AS position
        FROM holds h
        WHERE h.community_id = ? AND h.member_id = ? AND h.status IN ('queued', 'offered')
        ORDER BY h.created_at ASC
        LIMIT 100
      `).bind(context.communityId, context.actorId),
      this.db.prepare(`
        SELECT catalog_item_id AS catalogItemId, COUNT(*) AS count
        FROM holds
        WHERE community_id = ? AND status IN ('queued', 'offered')
        GROUP BY catalog_item_id
        LIMIT 500
      `).bind(context.communityId),
      this.db.prepare(`
        SELECT
          rc.id,
          rc.loan_id AS loanId,
          rc.scheduled_for AS scheduledFor,
          rc.sent_at AS sentAt
        FROM return_checkins rc
        INNER JOIN loans l ON l.id = rc.loan_id
        WHERE l.community_id = ? AND l.status = 'active'
          AND (l.owner_id = ? OR l.borrower_id = ?)
          AND rc.sent_at IS NOT NULL AND rc.response IS NULL
          AND rc.scheduled_for = (
            SELECT MAX(latest.scheduled_for)
            FROM return_checkins latest
            WHERE latest.loan_id = rc.loan_id AND latest.sent_at IS NOT NULL AND latest.response IS NULL
          )
        ORDER BY rc.sent_at DESC
        LIMIT 100
      `).bind(context.communityId, context.actorId, context.actorId),
    ]);
    const members = (results[0].results as unknown as MemberRow[]).map(mapMember);
    const profile = members.find((member) => member.id === context.actorId);
    if (!profile) throw libraryError('forbidden', 'The signed-in profile is not active in this community.');
    const contacts = results[4].results as unknown as ContactRow[];
    const phoneContact = contacts.find((contact) => contact.kind === 'sms');
    const encryptedPhone = phoneContact?.addressEncrypted;
    const phone = encryptedPhone && this.contactEncryptionKey
      ? await decryptContact(encryptedPhone, this.contactEncryptionKey)
      : '';
    const email = (results[5].results[0] as { email?: string } | undefined)?.email ?? '';
    const hydratedProfile = { ...profile, phone, phoneVerified: Boolean(phoneContact?.verifiedAt), email };
    return {
      profile: hydratedProfile,
      members: members.map((member) => member.id === hydratedProfile.id ? hydratedProfile : member),
      items: (results[1].results as unknown as CatalogRow[]).map(mapCatalogItem),
      requests: (results[2].results as unknown as RequestRow[]).map(mapRequest),
      loans: (results[3].results as unknown as LoanRow[]).map(mapLoan),
      holds: (results[6].results as unknown as HoldRow[]).map(mapHold),
      holdCounts: Object.fromEntries(
        (results[7].results as unknown as Array<{ catalogItemId: string; count: number }>).map((row) => [row.catalogItemId, Number(row.count)]),
      ),
      returnChecks: (results[8].results as unknown as ReturnCheckRow[]).map(mapReturnCheck),
    };
  }

  async listCatalog(context: Pick<RequestContext, 'actorId' | 'communityId'>) {
    await this.assertActiveMember(context);
    const result = await this.db.prepare(`${CATALOG_SELECT} WHERE ci.community_id = ? AND ci.archived_at IS NULL AND ci.status <> 'archived' ORDER BY ci.created_at DESC LIMIT 500`)
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

    if (
      !input ||
      typeof input.isbn13 !== 'string' ||
      typeof input.title !== 'string' ||
      !Array.isArray(input.authors) ||
      !input.authors.every((author) => typeof author === 'string') ||
      typeof input.publisher !== 'string' ||
      (input.titleEn !== undefined && typeof input.titleEn !== 'string') ||
      (input.ownerNotes !== undefined && typeof input.ownerNotes !== 'string') ||
      (input.coverUrl !== undefined && typeof input.coverUrl !== 'string') ||
      (input.pageCount !== undefined && (!Number.isInteger(input.pageCount) || input.pageCount <= 0)) ||
      !['ko', 'en', 'other'].includes(input.language) ||
      !input.provenance ||
      typeof input.provenance !== 'object' ||
      Array.isArray(input.provenance)
    ) {
      throw libraryError('invalid-input', 'ISBN, title, language, and provenance are required.');
    }
    const parsedIsbn = parseIsbn(input.isbn13);
    if (!parsedIsbn || !input.title.trim() || !validCondition(input.condition)) {
      throw libraryError('invalid-input', 'ISBN, title, and condition are required.');
    }
    if (
      !boundedText(input.title, 300) ||
      (input.titleEn !== undefined && !boundedText(input.titleEn, 300)) ||
      !validAuthors(input.authors) ||
      !boundedText(input.publisher, 200) ||
      (input.ownerNotes !== undefined && !boundedText(input.ownerNotes, 1_000)) ||
      (input.coverUrl !== undefined && input.coverUrl.length > 2_048) ||
      !validProvenance(input.provenance)
    ) throw libraryError('invalid-input', 'One or more book details exceed the allowed length.');
    if (!Number.isInteger(input.publishedYear) || input.publishedYear < 1000 || input.publishedYear > 9999) {
      throw libraryError('invalid-input', 'Published year must be a four-digit year.');
    }
    const ownedCount = await this.db.prepare(`
      SELECT COUNT(*) AS count FROM catalog_items
      WHERE community_id = ? AND owner_id = ? AND archived_at IS NULL
    `).bind(context.communityId, context.actorId).first<{ count: number }>();
    if (Number(ownedCount?.count ?? 0) >= MAX_CATALOG_ITEMS_PER_MEMBER) {
      throw libraryError('rate-limited', 'The maximum number of active book listings has been reached.');
    }

    const uploadedCoverId = coverAssetIdFromUrl(input.coverUrl);
    if (input.coverUrl?.startsWith('/api/covers/') && !uploadedCoverId) {
      throw libraryError('invalid-input', 'The uploaded cover reference is invalid.');
    }
    if (uploadedCoverId) {
      const cover = await this.db.prepare(`
        SELECT id
        FROM uploaded_assets
        WHERE id = ? AND owner_id = ? AND kind = 'cover' AND catalog_item_id IS NULL
        LIMIT 1
      `).bind(uploadedCoverId, context.actorId).first<{ id: string }>();
      if (!cover) throw libraryError('invalid-input', 'The uploaded cover is unavailable.');
    }

    const editionId = id('edition');
    const itemId = id('item');
    const now = this.now().getTime();
    const statements = [
      this.db.prepare(`
        INSERT INTO book_editions (
          id, isbn13, title, title_en, authors_json, authors_en_json, publisher,
          published_on, language, page_count, cover_source_url, cover_tone,
          field_provenance_json, resolver_version, resolved_at
        ) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(isbn13) DO NOTHING
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
        uploadedCoverId ? null : input.coverUrl ?? null,
        coverToneFor(input.title),
        JSON.stringify(input.provenance),
        now,
      ),
      this.db.prepare(`
        INSERT INTO catalog_items (
          id, community_id, edition_id, owner_id, status, condition, owner_notes,
          metadata_overrides_json, cover_source_override_url, idempotency_key,
          version, created_at, updated_at
        )
        SELECT ?, ?, be.id, ?, 'available', ?, ?, ?, ?, ?, 1, ?, ?
        FROM book_editions be
        WHERE be.isbn13 = ?
      `).bind(
        itemId,
        context.communityId,
        context.actorId,
        input.condition,
        input.ownerNotes?.trim() || null,
        JSON.stringify({
          title: input.title.trim(), titleEn: input.titleEn?.trim() || null,
          authors: input.authors.map((author) => author.trim()), authorsEn: [],
          publisher: input.publisher.trim() || null, publishedOn: String(input.publishedYear),
          language: input.language, pageCount: input.pageCount ?? null, description: null,
          coverTone: coverToneFor(input.title),
        }),
        uploadedCoverId ? null : input.coverUrl ?? null,
        operationKey,
        now,
        now,
        parsedIsbn.isbn13,
      ),
    ];
    if (uploadedCoverId) {
      statements.push(this.db.prepare(`
        UPDATE uploaded_assets
        SET catalog_item_id = ?
        WHERE id = ? AND owner_id = ? AND kind = 'cover' AND catalog_item_id IS NULL
      `).bind(itemId, uploadedCoverId, context.actorId));
    }
    const results = await this.db.batch(statements);
    if (affected(results[1]) !== 1) throw libraryError('conflict', 'The book could not be added.');
    if (uploadedCoverId && affected(results[2]) !== 1) throw libraryError('conflict', 'The cover could not be attached.');
    const item = await this.catalogItem(itemId, context.communityId);
    if (!item) throw libraryError('not-found', 'The newly created book could not be loaded.');
    return mapCatalogItem(item);
  }

  async updateCatalogItem(
    context: RequestContext,
    itemId: string,
    changes: UpdateCatalogItemInput,
  ) {
    await this.assertActiveMember(context);
    if (!validCondition(changes.condition)) throw libraryError('invalid-input', 'Invalid book condition.');
    if (
      (changes.title !== undefined && (typeof changes.title !== 'string' || !changes.title.trim())) ||
      (changes.titleEn !== undefined && changes.titleEn !== null && typeof changes.titleEn !== 'string') ||
      (changes.authors !== undefined && (!Array.isArray(changes.authors) || !changes.authors.every((author) => typeof author === 'string'))) ||
      (changes.authorsEn !== undefined && (!Array.isArray(changes.authorsEn) || !changes.authorsEn.every((author) => typeof author === 'string'))) ||
      (changes.publisher !== undefined && typeof changes.publisher !== 'string') ||
      (changes.publishedYear !== undefined && (!Number.isInteger(changes.publishedYear) || changes.publishedYear < 1000 || changes.publishedYear > 2200)) ||
      (changes.language !== undefined && !['ko', 'en', 'other'].includes(changes.language)) ||
      (changes.pageCount !== undefined && changes.pageCount !== null && (!Number.isInteger(changes.pageCount) || changes.pageCount <= 0)) ||
      (changes.description !== undefined && changes.description !== null && typeof changes.description !== 'string')
    ) {
      throw libraryError('invalid-input', 'Invalid book details.');
    }
    if (
      (changes.title !== undefined && !boundedText(changes.title, 300)) ||
      (changes.titleEn != null && !boundedText(changes.titleEn, 300)) ||
      (changes.authors !== undefined && !validAuthors(changes.authors)) ||
      (changes.authorsEn !== undefined && !validAuthors(changes.authorsEn)) ||
      (changes.publisher !== undefined && !boundedText(changes.publisher, 200)) ||
      (changes.description != null && !boundedText(changes.description, 5_000)) ||
      (changes.ownerNotes !== undefined && !boundedText(changes.ownerNotes, 1_000))
    ) throw libraryError('invalid-input', 'One or more book details exceed the allowed length.');
    const ownedRow = await this.catalogItem(itemId, context.communityId);
    if (!ownedRow || ownedRow.ownerId !== context.actorId || ownedRow.itemStatus === 'archived') {
      throw libraryError('not-found', 'Only the owner can edit an active listing.');
    }
    const overrides = metadataOverrides(mapCatalogItem(ownedRow));
    if (changes.title !== undefined) {
      overrides.title = changes.title.trim();
      overrides.coverTone = coverToneFor(changes.title);
    }
    if (changes.titleEn !== undefined) overrides.titleEn = changes.titleEn?.trim() || null;
    if (changes.authors !== undefined) overrides.authors = changes.authors.map((author) => author.trim());
    if (changes.authorsEn !== undefined) overrides.authorsEn = changes.authorsEn.map((author) => author.trim());
    if (changes.publisher !== undefined) overrides.publisher = changes.publisher.trim() || null;
    if (changes.publishedYear !== undefined) overrides.publishedOn = String(changes.publishedYear);
    if (changes.language !== undefined) overrides.language = changes.language;
    if (changes.pageCount !== undefined) overrides.pageCount = changes.pageCount;
    if (changes.description !== undefined) overrides.description = changes.description?.trim() || null;

    if (changes.coverAssetId !== undefined) {
      if (!coverAssetIdPattern.test(changes.coverAssetId)) {
        throw libraryError('invalid-input', 'The uploaded cover reference is invalid.');
      }
      const cover = await this.db.prepare(`
        SELECT id
        FROM uploaded_assets
        WHERE id = ? AND owner_id = ? AND kind = 'cover'
          AND (catalog_item_id IS NULL OR catalog_item_id = ?)
        LIMIT 1
      `).bind(changes.coverAssetId, context.actorId, itemId).first<{ id: string }>();
      if (!cover) throw libraryError('invalid-input', 'The uploaded cover is unavailable.');
    }

    const statements = [this.db.prepare(`
      UPDATE catalog_items
      SET condition = ?, owner_notes = ?, metadata_overrides_json = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND community_id = ? AND owner_id = ? AND archived_at IS NULL
    `).bind(
      changes.condition,
      changes.ownerNotes?.trim() || null,
      JSON.stringify(overrides),
      this.now().getTime(),
      itemId,
      context.communityId,
      context.actorId,
    )];
    if (changes.coverAssetId) {
      statements.push(
        this.db.prepare(`
          UPDATE uploaded_assets
          SET catalog_item_id = NULL
          WHERE catalog_item_id = ? AND owner_id = ? AND kind = 'cover' AND id <> ?
        `).bind(itemId, context.actorId, changes.coverAssetId),
        this.db.prepare(`
          UPDATE uploaded_assets
          SET catalog_item_id = ?
          WHERE id = ? AND owner_id = ? AND kind = 'cover'
            AND (catalog_item_id IS NULL OR catalog_item_id = ?)
        `).bind(itemId, changes.coverAssetId, context.actorId, itemId),
      );
    }
    const results = await this.db.batch(statements);
    if (affected(results[0]) !== 1) throw libraryError('not-found', 'Only the owner can edit an active listing.');
    if (changes.coverAssetId && affected(results[results.length - 1]) !== 1) throw libraryError('conflict', 'The cover could not be attached.');
    const item = await this.catalogItem(itemId, context.communityId);
    if (!item) throw libraryError('not-found', 'Book not found.');
    return mapCatalogItem(item);
  }

  async refreshCatalogItemCover(
    context: RequestContext,
    itemId: string,
    coverUrl: string,
    source: string,
  ) {
    await this.assertActiveMember(context);
    let parsedCoverUrl: URL;
    try {
      parsedCoverUrl = new URL(coverUrl);
    } catch {
      throw libraryError('invalid-input', 'The provider cover URL is invalid.');
    }
    if (parsedCoverUrl.protocol !== 'https:') {
      throw libraryError('invalid-input', 'The provider cover must use HTTPS.');
    }
    if (coverUrl.length > 2_048 || !boundedText(source, 200)) {
      throw libraryError('invalid-input', 'The provider cover details are too long.');
    }

    const now = this.now().getTime();
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE catalog_items
        SET cover_source_override_url = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND community_id = ? AND owner_id = ? AND archived_at IS NULL
      `).bind(coverUrl, now, itemId, context.communityId, context.actorId),
      this.db.prepare(`
        UPDATE uploaded_assets
        SET catalog_item_id = NULL
        WHERE catalog_item_id = ? AND owner_id = ? AND kind = 'cover'
      `).bind(itemId, context.actorId),
    ]);
    if (affected(results[0]) !== 1) {
      throw libraryError('not-found', 'Only the owner can refresh an active listing cover.');
    }
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

    const requestedAt = this.now();
    const recentRequest = await this.db.prepare(`
      SELECT 1 AS recent FROM loan_requests
      WHERE community_id = ? AND catalog_item_id = ? AND requester_id = ? AND requested_at > ?
      LIMIT 1
    `).bind(context.communityId, itemId, context.actorId, requestedAt.getTime() - 5 * 60 * 1_000).first<{ recent: number }>();
    if (recentRequest) throw libraryError('rate-limited', 'Please wait before requesting this book again.');

    const info = await this.db.prepare(`
      SELECT
        ci.id AS itemId,
        ci.owner_id AS ownerId,
        ci.status AS itemStatus,
        COALESCE(json_extract(ci.metadata_overrides_json, '$.title'), be.title) AS bookTitle,
        COALESCE(ci.cover_source_override_url, be.cover_source_url) AS coverSourceUrl,
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

    const expiresAt = borrowRequestExpiresAt(requestedAt);
    const requestId = id('request');
    const outboxId = id('event');
    const payload: OutboxPayloadByType['borrow_requested'] = {
      bookTitle: info.bookTitle,
      recipientName: localizedName({ locale: info.ownerLocale, displayName: info.ownerDisplayName, displayNameKo: info.ownerDisplayNameKo }),
      actorName: info.ownerLocale === 'ko' ? info.actorDisplayNameKo : info.actorDisplayName,
      expiresAt: expiresAt.toISOString(),
      decisionUrl: `${this.baseUrl}/borrowing?request=${encodeURIComponent(requestId)}`,
      bookUrl: `${this.baseUrl}/?book=${encodeURIComponent(info.itemId)}`,
      ...(info.coverSourceUrl ? { coverUrl: info.coverSourceUrl } : {}),
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

  async createHold(context: RequestContext, itemId: string) {
    await this.assertActiveMember(context);
    const operationKey = requireIdempotency(context, 'hold-create');
    const previous = await this.db.prepare('SELECT id FROM holds WHERE idempotency_key = ? LIMIT 1')
      .bind(operationKey)
      .first<{ id: string }>();
    if (previous) {
      const existing = await this.hold(previous.id, context.communityId, context.actorId);
      if (existing) return mapHold(existing);
    }

    const item = await this.db.prepare(`
      SELECT id, owner_id AS ownerId, status
      FROM catalog_items
      WHERE id = ? AND community_id = ? AND archived_at IS NULL
      LIMIT 1
    `).bind(itemId, context.communityId).first<{ id: string; ownerId: string; status: string }>();
    if (!item) throw libraryError('not-found', 'Book not found.');
    if (item.ownerId === context.actorId) throw libraryError('conflict', 'Owners cannot hold their own books.');
    if (item.status !== 'borrowed' && item.status !== 'held') {
      throw libraryError('conflict', 'Available books can be requested immediately.');
    }

    const holdId = id('hold');
    const now = this.now().getTime();
    const result = await this.db.prepare(`
      INSERT INTO holds (
        id, community_id, catalog_item_id, member_id, status, created_at, idempotency_key
      )
      SELECT ?, ?, ci.id, ?, 'queued', ?, ?
      FROM catalog_items ci
      WHERE ci.id = ? AND ci.community_id = ? AND ci.status IN ('borrowed', 'held')
        AND ci.owner_id <> ? AND ci.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM holds active
          WHERE active.catalog_item_id = ci.id AND active.member_id = ?
            AND active.status IN ('queued', 'offered')
        )
        AND NOT EXISTS (
          SELECT 1 FROM loans l
          WHERE l.catalog_item_id = ci.id AND l.borrower_id = ? AND l.status = 'active'
        )
    `).bind(
      holdId,
      context.communityId,
      context.actorId,
      now,
      operationKey,
      itemId,
      context.communityId,
      context.actorId,
      context.actorId,
      context.actorId,
    ).run();
    if (affected(result) !== 1) throw libraryError('conflict', 'You are already waiting for this book.');
    if (item.status === 'held') await offerNextHold(this.db, itemId, now, this.baseUrl);
    const hold = await this.hold(holdId, context.communityId, context.actorId);
    if (!hold) throw libraryError('not-found', 'The new hold could not be loaded.');
    return mapHold(hold);
  }

  async cancelHold(
    context: Pick<RequestContext, 'actorId' | 'communityId'>,
    holdId: string,
  ) {
    await this.assertActiveMember(context);
    const existing = await this.hold(holdId, context.communityId, context.actorId);
    if (!existing) throw libraryError('not-found', 'Hold not found.');
    if (existing.status === 'canceled' || existing.status === 'expired') return mapHold(existing);
    if (existing.status !== 'queued' && existing.status !== 'offered') {
      throw libraryError('conflict', 'This hold can no longer be canceled.');
    }
    const now = this.now().getTime();
    const expired = existing.status === 'offered' && existing.expiresAt != null && existing.expiresAt <= now;
    const nextStatus = expired ? 'expired' : 'canceled';
    const result = await this.db.prepare(`
      UPDATE holds SET status = ?
      WHERE id = ? AND community_id = ? AND member_id = ? AND status IN ('queued', 'offered')
    `).bind(nextStatus, holdId, context.communityId, context.actorId).run();
    if (affected(result) !== 1) throw libraryError('conflict', 'This hold has already changed.');
    if (existing.status === 'offered') {
      await offerNextHold(this.db, existing.catalogItemId, now, this.baseUrl);
    }
    const hold = await this.hold(holdId, context.communityId, context.actorId);
    if (!hold) throw libraryError('not-found', 'Hold not found.');
    return mapHold(hold);
  }

  async claimHold(context: RequestContext, holdId: string) {
    await this.assertActiveMember(context);
    const operationKey = requireIdempotency(context, 'hold-claim');
    const previous = await this.db.prepare(`
      SELECT id FROM loan_requests
      WHERE community_id = ? AND requester_id = ? AND idempotency_key = ?
      LIMIT 1
    `).bind(context.communityId, context.actorId, operationKey).first<{ id: string }>();
    if (previous) {
      const existing = await this.request(previous.id, context.communityId);
      if (existing) return mapRequest(existing);
    }

    const info = await this.db.prepare(`
      SELECT
        h.id AS holdId,
        h.catalog_item_id AS itemId,
        h.status AS holdStatus,
        h.expires_at AS holdExpiresAt,
        ci.owner_id AS ownerId,
        ci.status AS itemStatus,
        COALESCE(json_extract(ci.metadata_overrides_json, '$.title'), be.title) AS bookTitle,
        COALESCE(ci.cover_source_override_url, be.cover_source_url) AS coverSourceUrl,
        owner.display_name AS ownerDisplayName,
        owner.display_name_ko AS ownerDisplayNameKo,
        owner.locale AS ownerLocale,
        actor.display_name AS actorDisplayName,
        actor.display_name_ko AS actorDisplayNameKo
      FROM holds h
      INNER JOIN catalog_items ci ON ci.id = h.catalog_item_id
      INNER JOIN book_editions be ON be.id = ci.edition_id
      INNER JOIN profiles owner ON owner.id = ci.owner_id
      INNER JOIN profiles actor ON actor.id = h.member_id
      WHERE h.id = ? AND h.community_id = ? AND h.member_id = ?
      LIMIT 1
    `).bind(holdId, context.communityId, context.actorId).first<ItemRequestInfoRow & {
      holdId: string;
      holdStatus: string;
      holdExpiresAt: number | null;
    }>();
    if (!info) throw libraryError('not-found', 'Hold not found.');
    const requestedAt = this.now();
    if (info.holdStatus !== 'offered' || info.holdExpiresAt == null || info.holdExpiresAt <= requestedAt.getTime()) {
      if (info.holdStatus === 'offered') {
        await this.db.prepare("UPDATE holds SET status = 'expired' WHERE id = ? AND status = 'offered'").bind(holdId).run();
        await offerNextHold(this.db, info.itemId, requestedAt.getTime(), this.baseUrl);
      }
      throw libraryError('request-expired', 'This hold offer has expired.');
    }
    if (info.itemStatus !== 'held') throw libraryError('conflict', 'This book is no longer reserved for this hold.');

    const requestId = id('request');
    const expiresAt = borrowRequestExpiresAt(requestedAt);
    const payload: OutboxPayloadByType['borrow_requested'] = {
      bookTitle: info.bookTitle,
      recipientName: localizedName({ locale: info.ownerLocale, displayName: info.ownerDisplayName, displayNameKo: info.ownerDisplayNameKo }),
      actorName: info.ownerLocale === 'ko' ? info.actorDisplayNameKo : info.actorDisplayName,
      expiresAt: expiresAt.toISOString(),
      decisionUrl: `${this.baseUrl}/borrowing?request=${encodeURIComponent(requestId)}`,
      bookUrl: `${this.baseUrl}/?book=${encodeURIComponent(info.itemId)}`,
      ...(info.coverSourceUrl ? { coverUrl: info.coverSourceUrl } : {}),
    };
    const now = requestedAt.getTime();
    const results = await this.db.batch([
      this.db.prepare(`
        INSERT INTO loan_requests (
          id, community_id, catalog_item_id, requester_id, status, requested_at,
          expires_at, sms_actionable_at, idempotency_key
        )
        SELECT ?, h.community_id, h.catalog_item_id, h.member_id, 'pending', ?, ?, ?, ?
        FROM holds h
        WHERE h.id = ? AND h.community_id = ? AND h.member_id = ?
          AND h.status = 'offered' AND h.expires_at > ?
      `).bind(
        requestId,
        now,
        expiresAt.getTime(),
        now,
        operationKey,
        holdId,
        context.communityId,
        context.actorId,
        now,
      ),
      this.db.prepare(`
        UPDATE holds
        SET status = 'converted', borrow_request_id = ?
        WHERE id = ? AND community_id = ? AND member_id = ? AND status = 'offered' AND expires_at > ?
          AND EXISTS (SELECT 1 FROM loan_requests WHERE id = ? AND status = 'pending')
      `).bind(requestId, holdId, context.communityId, context.actorId, now, requestId),
      this.db.prepare(`
        INSERT INTO outbox_events (
          id, event_type, aggregate_type, aggregate_id, recipient_id, locale,
          payload_json, available_at, attempt_count
        )
        SELECT ?, 'borrow_requested', 'loan_request', lr.id, ?, ?, ?, ?, 0
        FROM loan_requests lr
        WHERE lr.id = ? AND lr.status = 'pending'
      `).bind(
        id('event'),
        info.ownerId,
        locale(info.ownerLocale),
        JSON.stringify(payload),
        now,
        requestId,
      ),
    ]);
    if (affected(results[0]) !== 1 || affected(results[1]) !== 1 || affected(results[2]) !== 1) {
      throw libraryError('conflict', 'The hold could not be claimed.');
    }
    const request = await this.request(requestId, context.communityId);
    if (!request) throw libraryError('not-found', 'The borrow request could not be loaded.');
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
    const convertedHold = await this.db.prepare(`
      SELECT catalog_item_id AS catalogItemId
      FROM holds
      WHERE borrow_request_id = ? AND status = 'converted'
      LIMIT 1
    `).bind(requestId).first<{ catalogItemId: string }>();
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
    if (convertedHold) {
      await offerNextHold(this.db, convertedHold.catalogItemId, now, this.baseUrl);
    }
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
        COALESCE(json_extract(ci.metadata_overrides_json, '$.title'), be.title) AS bookTitle,
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
      const convertedHold = await this.db.prepare(`
        SELECT catalog_item_id AS catalogItemId
        FROM holds
        WHERE borrow_request_id = ? AND status = 'converted'
        LIMIT 1
      `).bind(requestId).first<{ catalogItemId: string }>();
      if (convertedHold) {
        await offerNextHold(this.db, convertedHold.catalogItemId, now.getTime(), this.baseUrl);
      }
      const request = await this.request(requestId, context.communityId);
      if (!request) throw libraryError('not-found', 'Borrow request not found.');
      return { request: mapRequest(request) };
    }

    if (info.itemStatus !== 'available' && info.itemStatus !== 'held') throw libraryError('conflict', 'The book is no longer available.');
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
              AND ci.archived_at IS NULL
              AND (ci.status = 'available' OR (ci.status = 'held' AND EXISTS (
                SELECT 1 FROM holds h
                WHERE h.catalog_item_id = ci.id
                  AND h.borrow_request_id = loan_requests.id
                  AND h.member_id = loan_requests.requester_id
                  AND h.status = 'converted'
              )))
          )
      `).bind(now.getTime(), context.actorId, requestId, context.communityId, now.getTime(), context.actorId),
      this.db.prepare(`
        UPDATE catalog_items
        SET status = 'borrowed', version = version + 1, updated_at = ?
        WHERE id = ? AND community_id = ? AND owner_id = ?
          AND (status = 'available' OR (status = 'held' AND EXISTS (
            SELECT 1 FROM holds h
            WHERE h.catalog_item_id = catalog_items.id
              AND h.borrow_request_id = ? AND h.status = 'converted'
          )))
          AND EXISTS (
            SELECT 1 FROM loan_requests lr
            WHERE lr.id = ? AND lr.status = 'accepted' AND lr.responded_at = ?
          )
      `).bind(now.getTime(), info.catalogItemId, context.communityId, context.actorId, requestId, requestId, now.getTime()),
      this.db.prepare(`
        UPDATE loan_requests
        SET status = 'superseded', responded_at = ?, responded_by = ?
        WHERE catalog_item_id = ? AND id <> ? AND status = 'pending'
      `).bind(now.getTime(), context.actorId, info.catalogItemId, requestId),
      this.db.prepare(`
        UPDATE holds
        SET status = 'canceled'
        WHERE catalog_item_id = ? AND member_id = ? AND status IN ('queued', 'offered')
      `).bind(info.catalogItemId, info.requesterId),
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
    if (affected(results[0]) !== 1 || affected(results[1]) !== 1 || affected(results[4]) !== 1 || affected(results[5]) !== 1 || affected(results[6]) !== 1 || affected(results[7]) !== 1) {
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
        SET status = CASE WHEN EXISTS (
          SELECT 1 FROM holds h
          WHERE h.catalog_item_id = catalog_items.id AND h.status IN ('queued', 'offered')
        ) THEN 'held' ELSE 'available' END, version = version + 1, updated_at = ?
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
    await offerNextHold(this.db, existing.catalogItemId, now, this.baseUrl);
    return mapLoan(loan);
  }

  async respondToReturnCheck(context: RequestContext, checkId: string, returned: boolean) {
    await this.assertActiveMember(context);
    requireIdempotency(context, 'return-check-response');
    const check = await this.db.prepare(`
      SELECT
        rc.id,
        rc.loan_id AS loanId,
        rc.scheduled_for AS scheduledFor,
        rc.sent_at AS sentAt,
        rc.response,
        l.owner_id AS ownerId,
        l.borrower_id AS borrowerId,
        l.status AS loanStatus
      FROM return_checkins rc
      INNER JOIN loans l ON l.id = rc.loan_id
      WHERE rc.id = ? AND l.community_id = ?
      LIMIT 1
    `).bind(checkId, context.communityId).first<ReturnCheckRow & {
      response: string | null;
      ownerId: string;
      borrowerId: string;
      loanStatus: string;
    }>();
    if (!check || (check.ownerId !== context.actorId && check.borrowerId !== context.actorId)) {
      throw libraryError('not-found', 'Return check not found.');
    }
    if (check.response) return mapReturnCheck(check);
    if (check.loanStatus !== 'active') throw libraryError('conflict', 'This loan is no longer active.');
    if (returned) {
      await this.markReturned(context, check.loanId);
      return mapReturnCheck(check);
    }
    const now = this.now().getTime();
    const result = await this.db.prepare(`
      UPDATE return_checkins
      SET response = 'not_returned', responded_at = ?
      WHERE id = ? AND response IS NULL
        AND EXISTS (
          SELECT 1 FROM loans l
          WHERE l.id = return_checkins.loan_id AND l.status = 'active'
            AND (l.owner_id = ? OR l.borrower_id = ?)
        )
    `).bind(now, checkId, context.actorId, context.actorId).run();
    if (affected(result) !== 1) throw libraryError('conflict', 'This return check has already been answered.');
    return mapReturnCheck(check);
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
        0 AS phoneVerified,
        COALESCE((
          SELECT ai.email FROM auth_identities ai
          WHERE ai.profile_id = p.id ORDER BY ai.last_signed_in_at DESC LIMIT 1
        ), '') AS email,
        (
          SELECT ne.address_encrypted FROM notification_endpoints ne
          WHERE ne.user_id = p.id AND ne.kind = 'sms' AND ne.enabled = 1 LIMIT 1
        ) AS phoneEncrypted,
        COALESCE((
          SELECT CASE WHEN ne.verified_at IS NULL THEN 0 ELSE 1 END
          FROM notification_endpoints ne
          WHERE ne.user_id = p.id AND ne.kind = 'sms' AND ne.enabled = 1 LIMIT 1
        ), 0) AS phoneVerified
      FROM profiles p
      WHERE p.id = ?
      LIMIT 1
    `).bind(context.actorId).first<MemberRow>();
    if (!existing) throw libraryError('not-found', 'Profile not found.');

    const currentPhone = existing.phoneEncrypted && this.contactEncryptionKey
      ? await decryptContact(existing.phoneEncrypted, this.contactEncryptionKey)
      : '';
    const next = {
      displayName: changes.displayName?.trim() ?? existing.displayName,
      displayNameKo: changes.displayNameKo?.trim() ?? existing.displayNameKo,
      locale: changes.locale ?? locale(existing.locale),
      notificationChannel: changes.notificationChannel ?? notificationChannel(existing.notificationChannel),
      phone: changes.phone?.replace(/[\s().-]/g, '') ?? currentPhone,
      phoneVerified: changes.phone === undefined ? Boolean(existing.phoneVerified) : false,
    };
    const phoneChanged = changes.phone !== undefined && next.phone !== currentPhone;
    if (!phoneChanged) next.phoneVerified = Boolean(existing.phoneVerified);
    if (!next.displayName || !next.displayNameKo) throw libraryError('invalid-input', 'Both display names are required.');
    if (!boundedText(next.displayName, 100) || !boundedText(next.displayNameKo, 100)) {
      throw libraryError('invalid-input', 'Display names must be 100 characters or fewer.');
    }
    if (next.locale !== 'ko' && next.locale !== 'en') throw libraryError('invalid-input', 'Invalid locale.');
    if (!['email', 'sms', 'both', 'kakao'].includes(next.notificationChannel)) throw libraryError('invalid-input', 'Invalid notification channel.');
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
    if (phoneChanged) {
      if (!this.contactEncryptionKey || !this.contactHashKey) {
        throw libraryError('server-misconfigured', 'Contact encryption is not configured.');
      }
      const encrypted = next.phone ? await encryptContact(next.phone, this.contactEncryptionKey) : '';
      const hashed = next.phone ? await hashContact(next.phone, this.contactHashKey) : '';
      const results = await this.db.batch([
        profileStatement,
        next.phone
          ? this.db.prepare(`
              INSERT INTO notification_endpoints (
                id, user_id, kind, address_encrypted, address_hash, verified_at, enabled
              ) VALUES (?, ?, 'sms', ?, ?, NULL, 1)
              ON CONFLICT(user_id, kind) DO UPDATE SET
                address_encrypted = excluded.address_encrypted,
                address_hash = excluded.address_hash,
                verified_at = NULL,
                enabled = 1
            `).bind(id('endpoint'), context.actorId, encrypted, hashed)
          : this.db.prepare(`
              UPDATE notification_endpoints
              SET enabled = 0, verified_at = NULL
              WHERE user_id = ? AND kind = 'sms'
            `).bind(context.actorId),
      ]);
      if (affected(results[0]) !== 1 || (next.phone && affected(results[1]) !== 1)) throw libraryError('not-found', 'Profile not found.');
    } else {
      const result = await profileStatement.run();
      if (affected(result) !== 1) throw libraryError('not-found', 'Profile not found.');
    }
    return mapMember({ ...existing, ...next });
  }
}
