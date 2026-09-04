import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const communities = sqliteTable('communities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  defaultLocale: text('default_locale').notNull().default('ko'),
  timezone: text('timezone').notNull().default('America/Los_Angeles'),
  registrationMode: text('registration_mode').notNull().default('open'),
  requestExpiryHours: integer('request_expiry_hours').notNull().default(48),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  displayNameKo: text('display_name_ko').notNull(),
  avatarUrl: text('avatar_url'),
  locale: text('locale').notNull().default('ko'),
  notificationChannel: text('notification_channel').notNull().default('email'),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const authIdentities = sqliteTable(
  'auth_identities',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id').notNull().references(() => profiles.id),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    email: text('email').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastSignedInAt: integer('last_signed_in_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('auth_identities_provider_subject_unique').on(table.provider, table.providerSubject)],
);

export const communityMembers = sqliteTable(
  'community_members',
  {
    communityId: text('community_id').notNull().references(() => communities.id),
    userId: text('user_id').notNull().references(() => profiles.id),
    role: text('role').notNull().default('member'),
    status: text('status').notNull().default('active'),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('community_members_unique').on(table.communityId, table.userId)],
);

export const bookEditions = sqliteTable(
  'book_editions',
  {
    id: text('id').primaryKey(),
    isbn10: text('isbn10'),
    isbn13: text('isbn13'),
    title: text('title').notNull(),
    titleEn: text('title_en'),
    subtitle: text('subtitle'),
    authorsJson: text('authors_json').notNull().default('[]'),
    authorsEnJson: text('authors_en_json').notNull().default('[]'),
    publisher: text('publisher'),
    publishedOn: text('published_on'),
    language: text('language'),
    pageCount: integer('page_count'),
    description: text('description'),
    coverSourceUrl: text('cover_source_url'),
    coverStoragePath: text('cover_storage_path'),
    coverTone: text('cover_tone').notNull().default('blue'),
    fieldProvenanceJson: text('field_provenance_json').notNull().default('{}'),
    resolverVersion: integer('resolver_version').notNull().default(1),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('book_editions_isbn13_unique').on(table.isbn13),
    index('book_editions_title_idx').on(table.title),
  ],
);

export const catalogItems = sqliteTable(
  'catalog_items',
  {
    id: text('id').primaryKey(),
    communityId: text('community_id').notNull().references(() => communities.id),
    editionId: text('edition_id').notNull().references(() => bookEditions.id),
    ownerId: text('owner_id').notNull().references(() => profiles.id),
    status: text('status').notNull().default('available'),
    condition: text('condition').notNull().default('good'),
    ownerNotes: text('owner_notes'),
    idempotencyKey: text('idempotency_key'),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('catalog_items_community_status_idx').on(table.communityId, table.status),
    index('catalog_items_owner_idx').on(table.ownerId),
    uniqueIndex('catalog_items_idempotency_unique').on(table.idempotencyKey),
  ],
);

export const uploadedAssets = sqliteTable(
  'uploaded_assets',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull().references(() => profiles.id),
    catalogItemId: text('catalog_item_id').references(() => catalogItems.id),
    storagePath: text('storage_path').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    kind: text('kind').notNull().default('cover'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('uploaded_assets_storage_path_unique').on(table.storagePath)],
);

export const loanRequests = sqliteTable(
  'loan_requests',
  {
    id: text('id').primaryKey(),
    communityId: text('community_id').notNull().references(() => communities.id),
    catalogItemId: text('catalog_item_id').notNull().references(() => catalogItems.id),
    requesterId: text('requester_id').notNull().references(() => profiles.id),
    status: text('status').notNull().default('pending'),
    requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    respondedAt: integer('responded_at', { mode: 'timestamp_ms' }),
    respondedBy: text('responded_by').references(() => profiles.id),
    smsActionableAt: integer('sms_actionable_at', { mode: 'timestamp_ms' }),
    idempotencyKey: text('idempotency_key').notNull(),
  },
  (table) => [
    uniqueIndex('loan_requests_idempotency_unique').on(table.idempotencyKey),
    uniqueIndex('loan_requests_one_pending_member_item_unique')
      .on(table.catalogItemId, table.requesterId)
      .where(sql`${table.status} = 'pending'`),
    index('loan_requests_item_status_idx').on(table.catalogItemId, table.status),
  ],
);

export const loans = sqliteTable(
  'loans',
  {
    id: text('id').primaryKey(),
    communityId: text('community_id').notNull().references(() => communities.id),
    catalogItemId: text('catalog_item_id').notNull().references(() => catalogItems.id),
    requestId: text('request_id').notNull().references(() => loanRequests.id),
    ownerId: text('owner_id').notNull().references(() => profiles.id),
    borrowerId: text('borrower_id').notNull().references(() => profiles.id),
    status: text('status').notNull().default('active'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    nextCheckAt: integer('next_check_at', { mode: 'timestamp_ms' }).notNull(),
    lastCheckAt: integer('last_check_at', { mode: 'timestamp_ms' }),
    returnedAt: integer('returned_at', { mode: 'timestamp_ms' }),
    returnedBy: text('returned_by').references(() => profiles.id),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    index('loans_item_status_idx').on(table.catalogItemId, table.status),
    uniqueIndex('loans_one_active_item_unique')
      .on(table.catalogItemId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const notificationEndpoints = sqliteTable(
  'notification_endpoints',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => profiles.id),
    kind: text('kind').notNull(),
    addressEncrypted: text('address_encrypted').notNull(),
    addressHash: text('address_hash').notNull(),
    verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [uniqueIndex('notification_endpoints_user_kind_unique').on(table.userId, table.kind)],
);

export const notificationDeliveries = sqliteTable(
  'notification_deliveries',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull(),
    recipientId: text('recipient_id').notNull().references(() => profiles.id),
    channel: text('channel').notNull(),
    providerMessageId: text('provider_message_id'),
    status: text('status').notNull().default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastErrorCode: text('last_error_code'),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('notification_deliveries_event_channel_unique').on(table.eventId, table.channel)],
);

export const inboundMessages = sqliteTable(
  'inbound_messages',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    providerMessageId: text('provider_message_id').notNull(),
    senderHash: text('sender_hash').notNull(),
    command: text('command'),
    matchedRequestId: text('matched_request_id').references(() => loanRequests.id),
    outcome: text('outcome').notNull(),
    receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('inbound_messages_provider_id_unique').on(table.provider, table.providerMessageId)],
);

export const returnCheckins = sqliteTable(
  'return_checkins',
  {
    id: text('id').primaryKey(),
    loanId: text('loan_id').notNull().references(() => loans.id),
    scheduledFor: integer('scheduled_for', { mode: 'timestamp_ms' }).notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    response: text('response'),
    respondedAt: integer('responded_at', { mode: 'timestamp_ms' }),
    nextScheduledFor: integer('next_scheduled_for', { mode: 'timestamp_ms' }),
  },
  (table) => [uniqueIndex('return_checkins_loan_schedule_unique').on(table.loanId, table.scheduledFor)],
);

export const outboxEvents = sqliteTable(
  'outbox_events',
  {
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    recipientId: text('recipient_id').notNull().references(() => profiles.id),
    locale: text('locale').notNull(),
    payloadJson: text('payload_json').notNull(),
    availableAt: integer('available_at', { mode: 'timestamp_ms' }).notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    processedAt: integer('processed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('outbox_ready_idx').on(table.processedAt, table.availableAt)],
);

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => profiles.id),
    action: text('action').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('audit_events_aggregate_idx').on(table.aggregateType, table.aggregateId, table.occurredAt)],
);

export const analyticsEvents = sqliteTable(
  'analytics_events',
  {
    id: text('id').primaryKey(),
    eventName: text('event_name').notNull(),
    anonymousSessionId: text('anonymous_session_id'),
    locale: text('locale'),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('analytics_events_name_time_idx').on(table.eventName, table.occurredAt)],
);
