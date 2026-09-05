# Hana Seed Books — product, UX, and technical implementation plan

> **Current implementation decision (September 2026):** Google and Kakao are the member-authentication providers. Google supplies a verified email; Kakao members without one are prompted to add and verify an address for notification delivery. Circulation delivery uses email plus standards-based Web Push so installed iPhone/Android web apps and supported desktop browsers can notify members even while the page is closed. Subscriptions are encrypted in D1, and notification clicks deep-link to the authorization-checked app. This supersedes the Apple authentication, Twilio reply-by-`1`/`2`, and Kakao **Send to me** sections retained below as historical planning context.

Status: planning only  
Primary locale: Korean (`ko`)  
Secondary locale: English (`en`)  
Primary device: mobile web / installable PWA  
Working product name: **Hana Seed Books / 씨앗책장**

## 1. Product definition

Hana Seed Books is a private, trust-based catalog for a real community. Members add physical books, discover who owns them, request to borrow a specific copy, and keep the catalog accurate through lightweight notifications.

The product succeeds when adding a book feels like this:

1. Tap the central **Scan / 스캔** action.
2. Point the rear camera at the ISBN barcode.
3. See a confident match with cover and metadata in roughly two seconds on a normal connection.
4. Correct anything that is wrong or missing.
5. Tap **Add to library / 도서관에 추가**.

Everything else should protect that loop: dependable metadata, an obvious manual fallback, ownership-aware permissions, and borrowing state that never becomes ambiguous.

### Launch scope

- Open Google/Apple self-registration into the launch community; the catalog remains private to authenticated active members.
- Catalog of physical book copies.
- Search by title, author, publisher, or ISBN.
- Filters for owner, availability, and language.
- Korean-first UI with full English UI parity.
- Google and Apple authentication.
- Barcode-first item intake with ISBN lookup and editable confirmation.
- Owner edit and removal controls.
- Borrow request, owner decision, borrower outcome notification.
- SMS reply `1` / `2` for the owner when SMS is enabled.
- Email decision links when email is enabled.
- Weekly return check-ins and in-app manual return.
- Profile, locale, notification preferences, and verified phone settings.

### Explicit non-goals for the first release

- Fees, fines, ratings, public reviews, waitlists, and due-date enforcement.
- Native iOS or Android applications.
- E-books or reading-content delivery.
- Inter-community discovery or public exposure of members.
- Chat between members.
- AI-generated book metadata.
- A full library classification system or staff/admin console beyond basic member management.

## 2. Confirmed product decisions

These decisions form the implementation baseline. Any later change should be treated as an explicit product-contract change.

1. **The catalog is private.** Only authenticated active members can browse it. Signed-out visitors can reach sign-in/registration but no catalog, owner, or borrowing data.
2. **A listing is a physical copy, not merely a title.** Metadata for an edition is shared; owner, condition, notes, and status belong to the physical `catalog_item`. Two people can own separate copies of the same ISBN.
3. **Open registration into one launch community.** Any person may register with Google or Apple and, after completing the required profile, becomes an active member of the default community. The schema remains multi-community-capable, while the first UI assumes one active community.
4. **No hard due dates in v1.** An active loan receives a return check-in every seven days. A later release can add due dates without changing the core loan model.
5. **A borrower or owner may mark a book returned.** Either action immediately makes the copy available and records who performed it. The other party is notified.
6. **Removal is blocked during an active loan.** An owner must first mark the item returned. Deletion is a soft archive so history remains internally consistent.
7. **SMS `1` / `2` is the convenience path, not the only decision path.** Owners can always decide in the app. Email uses clear one-tap links rather than unreliable free-form email replies.
8. **Personal contact details are private.** The catalog shows a display name, not phone number or private email.

## 3. Success measures and service targets

### Product measures

- At least 85% of successful scans reach a metadata confirmation without manual typing.
- Median scan-to-confirmation under 3 seconds; p95 under 8 seconds, excluding denied camera permission.
- At least 90% of confirmed lookup fields are accepted without edits.
- At least 70% of started intake sessions result in a created catalog item.
- At least 90% of borrow decisions occur within 24 hours.
- Fewer than 1% of catalog copies have a state disputed by owner and borrower.

### Technical targets

- Catalog read p95 under 500 ms from the application region.
- ISBN resolver p95 under 5 seconds with provider timeouts and partial fallback.
- Webhook processing is idempotent and acknowledges valid SMS within 2 seconds.
- 99.9% successful scheduled-check-in job completion, measured per daily run.
- WCAG 2.2 AA for all primary flows.
- No direct client access to private notification endpoints or provider secrets.

## 4. Information architecture

The authenticated mobile shell has four destinations:

1. **Catalog / 도서** — default route and search surface.
2. **Scan / 스캔** — prominent center action; opens intake, not a persistent tab page.
3. **Borrowing / 대여** — segmented into `Borrowed by me / 빌린 책`, `Lent by me / 빌려준 책`, and requests.
4. **Settings / 설정** — profile, language, notification channel, privacy, and sign-out.

Recommended route map:

```text
/{locale}                         catalog
/{locale}/books/{catalogItemId}   physical-copy detail
/{locale}/add                     camera scanner
/{locale}/add/confirm             lookup confirmation
/{locale}/borrowing               requests and active loans
/{locale}/settings                personal settings
/{locale}/auth/callback           OAuth callback
```

Locale is explicit in the URL (`/ko`, `/en`) so links are stable and server-rendered pages have the correct document language. First visit defaults to Korean unless a saved profile or browser preference says otherwise.

## 5. End-to-end UX flows

### 5.1 Authentication and onboarding

#### Happy path

1. User opens the app. Signed-out visitors see only the welcome and authentication screen.
2. Welcome page explains that registration joins the launch community and that its catalog is member-only.
3. User chooses **Continue with Google** or **Continue with Apple**.
4. OAuth returns to the app. The server creates or retrieves the account and starts profile completion for the default community; it never exposes catalog data before authenticated membership exists.
5. If the identity provider did not supply a usable name, the app asks for a display name. This is especially important for Apple, which does not keep supplying a full name after the first authorization.
6. User chooses notification preference: email, SMS, or both.
7. If SMS is selected, the US-only launch accepts a `+1` number and verifies it with a one-time code.
8. Completing the required profile atomically activates default-community membership, then the user lands in the catalog.

#### Required edge cases

- OAuth canceled or fails: return to the welcome page with a retryable, provider-specific error and no partial membership.
- Existing account signs in again: reuse the existing profile and membership rather than creating duplicates.
- Suspended account signs in: authenticate the identity but do not recreate or reactivate community membership.
- Same person signs in once with Google and later with Apple: require an authenticated identity-linking flow; never auto-merge solely by email.
- Apple private relay email: accept it, but tell the user where notification mail will be sent.
- No display name from provider: onboarding cannot be skipped until one is entered.

### 5.2 Catalog search and filtering

#### Default state

- Focus is not forced into search on page load; the user first sees recently added available books.
- A sticky search field sits under the compact header.
- The primary result unit is a two-column cover grid on normal phones and one-column rows at very narrow widths or large text settings.
- Each result shows cover, title, author, owner display name, and availability.
- A filter button shows an active-count indicator only when filters are applied.

#### Search behavior

- Debounce text input by 200–300 ms; pressing Enter searches immediately.
- Normalize Unicode to NFC, trim whitespace, and remove ISBN hyphens for exact lookup.
- Rank exact ISBN first, exact/prefix title next, author next, then trigram similarity.
- Korean and English can coexist in one query. Book metadata is shown in its original language and is not machine-translated.
- Preserve query and filters in URL parameters so back navigation restores the result set.
- Infinite scroll is acceptable, but use cursor pagination and preserve scroll position. A visible retry control is required on failure.

#### Filters

- Owner: searchable member list, including **My books / 내 책**.
- Status: all, available, borrowed; `request pending` is visible to involved users but not a public availability filter.
- Book language: Korean, English, other.
- Sort: relevance (when searching), recently added, title.

#### Empty states

- No catalog entries: lead directly to scanning the first book.
- No matches: show **Clear filters**, **Scan a book**, and a compact explanation of active constraints.
- Offline: show cached results as stale when available and disable mutating actions.

### 5.3 Barcode-first add flow

#### Camera happy path

1. User taps **Scan / 스캔**. Only then does the app request camera permission.
2. The app selects the rear-facing camera and shows a landscape barcode guide with short Korean-first guidance.
3. Scanner looks for EAN-13 and UPC-A. It vibrates once on a valid stable detection, freezes the frame, and stops the camera.
4. Client normalizes the detected value, validates the ISBN checksum, and sends only the normalized ISBN to the server resolver.
5. Loading state retains the frozen frame and shows progressive status: `ISBN 확인 중` then `도서 정보 찾는 중`.
6. Resolver returns a field-level merged candidate and confidence level.
7. Confirmation screen shows cover, title, author, publisher, publication date, language, ISBN, and optional owner notes/condition.
8. User can edit any field or replace/add a cover photo.
9. **Add to library / 도서관에 추가** creates the edition if needed and the user-owned physical copy in one idempotent command.
10. Success screen links to the new detail and offers **Scan another / 다른 책 스캔**.

#### Scan quality rules

- Require the same decoded value in two close frames, or one high-confidence native detection, to avoid accidental reads.
- Ignore non-book codes unless they normalize to a valid ISBN-10/ISBN-13 or a UPC convertible to ISBN-13.
- Detect only the main EAN/UPC; ignore five-digit retail price add-ons.
- Show a torch toggle only when the camera track reports torch capability.
- Never request microphone permission.
- Release camera tracks on success, cancel, backgrounding, and route change.

#### Fallback ladder

1. Browser-native `BarcodeDetector` when it reports support for the required format.
2. `@zxing/browser` for browsers without dependable native support.
3. **Take/upload a photo** and decode the still image.
4. **Enter ISBN manually**, with a numeric keyboard, paste support, formatting, and checksum validation.
5. **Add manually** if no metadata provider returns a candidate.

No branch is a dead end. Camera denial immediately reveals photo upload and manual ISBN entry.

#### Lookup ambiguity and failure

- Exact high-confidence match: show one confirmation candidate.
- Multiple exact-ISBN records with conflicting metadata: show at most three compact choices, highlighting edition/publisher/date differences.
- Metadata but no cover: allow creation with a generated typographic placeholder or user photo.
- Cover but sparse metadata: mark missing required fields inline.
- Provider timeout: return any verified partial result, label the missing fields, and allow retry.
- No result: keep the ISBN and open manual entry; do not force a rescan.
- Duplicate owned copy: explain that another physical copy may still be added and show the existing item.

#### Metadata resolution policy

The server owns provider calls, secrets, normalization, caching, and attribution.

1. Query all eligible exact-ISBN providers within a shared latency budget. The launch adapters are the National Library of Korea and Google Books; quota-aware caching may skip a provider only when a fresh result already satisfies the quality threshold. Naver Book Search was removed because the service retired on July 31, 2026.
2. Benchmark Korean and English samples before launch, then assign provider reliability weights per field and market. No provider is permanently treated as best for an entire record.
3. Reject provider results whose normalized ISBN does not exactly match the scanned ISBN.
4. Score and stitch fields separately—title, authors, publisher, date, description, and cover may come from different exact-match responses. Rank by benchmarked accuracy, completeness, image quality, and recency while retaining provenance.
5. Cache the normalized candidate by ISBN and resolver version. Positive cache: 30 days; not-found cache: 24 hours.
6. Store source IDs, source URLs, fetch time, and the provider chosen for each field.
7. Before production, review each provider's display, attribution, caching, and cover-image terms. If storing a cover is not allowed, store its permitted source URL or use a member-uploaded image.

The feasibility basis is current official documentation: the National Library of Korea exposes ISBN bibliographic data and Korean fields, while Google Books supports ISBN-qualified volume search with title, authors, identifiers, language, and image links. Naver Book Search is no longer eligible because it retired on July 31, 2026. The browser Barcode Detection API supports EAN-13 but remains limited/experimental, which is why the ZXing and manual fallbacks are requirements rather than enhancements.

### 5.4 Book detail and owner controls

#### Shared detail content

- Large cover, title, subtitle, author(s), publisher, publication date, language, page count, ISBN.
- Owner display name and copy-specific condition/notes.
- Status: available or borrowed. Borrower identity is visible only to the owner and that borrower.
- Primary action varies by role and state.

#### Borrower/non-owner states

- Available: **Request to borrow / 대여 요청**.
- Own pending request: **Request sent / 요청 보냄** and **Cancel request / 요청 취소**.
- Borrowed by current user: **Mark as returned / 반납 완료**.
- Borrowed by someone else: disabled **Currently borrowed / 대여 중**; no borrower name.
- Archived: not reachable from catalog; a historical deep link shows unavailable.

#### Owner states

- Available, no pending requests: **Edit / 수정**, overflow **Remove / 삭제**.
- Pending requests: clear request panel with accept/decline actions in chronological order.
- Active loan: borrower display name, loan start, next check-in, and **Mark returned / 반납 처리**.
- Remove requires a confirmation summarizing the consequence. It is blocked while loaned.

### 5.5 Borrow request and owner decision

#### Request creation

1. Non-owner taps **Request to borrow**.
2. A compact confirmation names the book and owner; no date promise is invented.
3. Server transaction verifies membership, item availability, non-ownership, and absence of a duplicate pending request.
4. It creates a pending `loan_request` plus an `outbox_event` atomically.
5. UI changes optimistically only after the command succeeds and shows how the owner will respond.

#### Owner notification

Korean SMS example:

```text
[씨앗책장] 민지님이 “아몬드” 대여를 요청했어요.
수락 1 · 거절 2
앱에서 보기: {short-link}
```

English SMS example:

```text
[Hana Seed Books] Minji requested “Almond.”
Reply 1 to accept or 2 to decline.
View: {short-link}
```

For email, use two signed, one-time decision links plus an in-app link. The final confirmation page requires authentication if the current session does not match the owner.

#### Safe `1` / `2` reply design

Plain SMS has no reliable per-message thread identifier, so a reply can become ambiguous if several requests arrive together. Preserve the simple reply in the normal case with these rules:

- Only one unresolved request is designated `sms_actionable` for a phone number at a time.
- Additional requests remain pending and visible in the app; their actionable SMS is queued until the current one resolves or expires.
- A bare `1` or `2` applies only when exactly one actionable request exists.
- If state is ambiguous, make no change and reply with a safe link to the request list.
- Validate the Twilio signature, normalize and match the verified sender phone, and deduplicate by provider message ID.
- Respect `STOP`/opt-out handling and fall back to verified email/in-app notifications.

#### Acceptance transaction

The accept command takes a row lock on the physical item and checks that it is still available. In one transaction it:

1. marks the selected request accepted;
2. creates an active loan;
3. marks the catalog item borrowed;
4. declines other pending requests for that item as `superseded`;
5. schedules the first return check-in for seven days later;
6. inserts outcome notifications into the outbox.

If another action already changed the copy, the command does nothing and sends an accurate status message. All commands use idempotency keys.

#### Decline and expiry

- Decline marks only that request declined and notifies the borrower.
- Borrower may cancel while pending.
- Pending requests expire after 48 hours; expiry remains configurable per community for a later release.
- Expiry keeps the item available and advances the owner's next queued actionable SMS.

### 5.6 Return loop

#### Scheduled check-in

1. A daily job selects active loans whose `next_check_at <= now()` and have no unprocessed check-in event.
2. Borrower receives the preferred-channel message.
3. SMS: `반납하셨나요? 반납 1 · 아직 대여 중 2` / `Returned it? Reply 1 for returned, 2 for still borrowing.`
4. Reply `1`, a signed email link, or the in-app action calls the same idempotent `mark_returned` domain command.
5. Reply `2` leaves the loan active and moves `next_check_at` forward seven days.
6. No reply causes one gentle reminder after 48 hours, then waits until the next weekly cycle. Do not message daily.

#### Manual return

- Borrower or owner can mark returned from book detail or Borrowing.
- Confirmation names the book and other party.
- Successful return sets `returned_at`, changes item status to available, closes outstanding check-ins, records the actor, and notifies the other party.
- If both act, the second command is an idempotent success showing the existing return time.

### 5.7 Settings

- Display name: required, 2–40 characters.
- Profile image: optional; use identity-provider image initially.
- UI language: Korean / English; applies immediately and persists.
- Notification channel: verified email, verified SMS, or both.
- Phone verification and replacement.
- Community memberships and leave action. Leaving is blocked while the user owns or borrows an active loan.
- Privacy explanation: what other members can see.
- Sign out and account deletion request.

## 6. Mobile interaction and accessibility requirements

- Design at 320 px first, then 390 px and 430 px; desktop expands the grid but does not change core navigation.
- Minimum 44 × 44 CSS-pixel touch targets with 8 px separation around destructive neighbors.
- Editable fields use at least 16 px text to avoid mobile zoom.
- Respect safe-area insets around bottom navigation and camera controls.
- Keep one primary action visible per state; avoid floating actions that cover content.
- Use semantic headings, buttons, forms, dialogs, and live regions.
- Announce scan success once; do not stream camera detection chatter to screen readers.
- Never communicate availability or errors by color alone.
- Support 200% text zoom, reduced motion, portrait/landscape camera use, and keyboard-only navigation.
- Localized copy must be designed, not merely translated: Korean labels should be the default width constraint; English may be longer.
- Ask for camera access in context and explain how to recover from denial on iOS and Android.
- The initial app shell should remain usable on slow 3G; lazy-load the scanner bundle only when entering intake.

## 7. Recommended technical architecture

### Application

- **Next.js App Router + TypeScript** for server-rendered catalog/detail views, route handlers, and an installable PWA shell.
- **React Server Components** by default; client components only for scanner, search interaction, dialogs, and local optimistic state.
- **`next-intl` or equivalent dictionary layer** under `app/[locale]`, with typed message keys and `ko` as the default.
- **OpenAI Sites on Cloudflare Workers** for the application runtime and deployment.
- **Application-owned Google and Apple OAuth** using PKCE, provider ID-token verification, and signed secure HTTP-only session cookies.
- **Cloudflare D1** for durable relational state, normalized bilingual catalog search, authorization checks, idempotency records, and the transactional outbox.
- **Cloudflare R2** for authenticated member-uploaded cover images.
- **Twilio Messaging** for outbound/inbound SMS.
- **Resend** (or one selected transactional email provider) for email; abstract it behind a `NotificationProvider` interface.
- **Sentry + structured application logs** for errors and traces; product events sent to a privacy-conscious analytics tool only after consent review.
- Deploy through Sites with the closest available US infrastructure. US-only or US-West data residency is not a launch requirement. The launch accepts US (`+1`) SMS endpoints only.

### Deployment shape

```text
Mobile browser / PWA
        |
        v
Vinext / Cloudflare Worker application
  |     |          |
  |     |          +--> ISBN resolver adapters --> NLK / Google Books
  |     +--------------> Google / Apple OAuth
  +--------------------> D1 + R2
                              |
                              +--> transactional outbox
                              +--> HTTPS scheduler -> notification worker
                                                         |--> Twilio SMS
                                                         +--> Resend email
Twilio inbound webhook ---------------------------------> signed Worker route -> domain commands
```

Keep state transitions in one versioned repository/domain layer. The web app, notification worker, and signed SMS route call the same commands, preventing SMS and in-app actions from implementing subtly different rules.

### Why this shape

- One managed Worker, D1, and R2 deployment keeps a small community app operationally simple.
- Server-side membership and ownership checks protect every read and mutation boundary.
- A transactional outbox prevents committed borrow state from losing its notification.
- Server-only metadata adapters hide provider keys and allow providers to change without scanner UI changes.
- The scanner remains a replaceable feature module because browser capability is not uniform.

## 8. Domain and data model

Use UUIDv7 or another time-sortable UUID where supported. Every mutable table includes `created_at`, `updated_at`, and appropriate foreign-key indexes.

### Core tables

#### `communities`

`id`, `name`, `default_locale`, `timezone`, `registration_mode(open|invite_only|closed)`, `request_expiry_hours default 48`, `created_at`

#### `community_members`

`community_id`, `user_id`, `role(member|admin)`, `status(active|suspended|left)`, `joined_at`

Unique: `(community_id, user_id)`.

#### `profiles`

`user_id`, `display_name`, `avatar_url`, `locale`, `created_at`, `updated_at`

Public-to-community fields only. Do not store phone numbers here.

#### `notification_endpoints`

`id`, `user_id`, `kind(email|sms)`, `address_encrypted`, `address_hash`, `verified_at`, `enabled`, `provider_metadata`

Only the user and trusted server functions can access these rows. The deterministic hash supports inbound sender matching without exposing plaintext to ordinary reads.

#### `book_editions`

`id`, `isbn10`, `isbn13`, `title`, `subtitle`, `authors text[]`, `publisher`, `published_on`, `language`, `page_count`, `description`, `cover_source_url`, `cover_storage_path`, `metadata jsonb`, `field_provenance jsonb`, `resolver_version`, `resolved_at`

Unique partial indexes on normalized ISBN-10 and ISBN-13.

#### `catalog_items`

`id`, `community_id`, `edition_id`, `owner_id`, `status(available|borrowed|archived)`, `condition`, `owner_notes`, `created_at`, `archived_at`, `version`

`version` supports optimistic concurrency for edit forms.

#### `loan_requests`

`id`, `community_id`, `catalog_item_id`, `requester_id`, `status(pending|accepted|declined|canceled|expired|superseded)`, `requested_at`, `expires_at`, `responded_at`, `responded_by`, `sms_actionable_at`, `idempotency_key`

Unique partial index: one pending request per `(catalog_item_id, requester_id)`.

#### `loans`

`id`, `community_id`, `catalog_item_id`, `request_id`, `owner_id`, `borrower_id`, `status(active|returned)`, `started_at`, `next_check_at`, `last_check_at`, `returned_at`, `returned_by`, `version`

Unique partial index: one active loan per catalog item.

#### `return_checkins`

`id`, `loan_id`, `cycle_at`, `status(pending|still_borrowing|returned|expired)`, `sent_at`, `responded_at`, `reminder_sent_at`

Unique: `(loan_id, cycle_at)` for scheduler idempotency.

#### `outbox_events`

`id`, `event_type`, `aggregate_type`, `aggregate_id`, `recipient_id`, `locale`, `payload jsonb`, `available_at`, `attempt_count`, `claimed_at`, `processed_at`, `last_error`

#### `notification_deliveries`

`id`, `outbox_event_id`, `channel`, `provider_message_id`, `status`, `attempted_at`, `delivered_at`, `failed_at`, `error_code`

#### `inbound_messages`

`id`, `provider`, `provider_message_id`, `sender_hash`, `body_normalized`, `received_at`, `matched_action_type`, `matched_action_id`, `processing_status`

Unique: `(provider, provider_message_id)`.

#### `audit_events`

Append-only: `id`, `community_id`, `actor_type(user|system|provider)`, `actor_id`, `event_type`, `entity_type`, `entity_id`, `before jsonb`, `after jsonb`, `created_at`.

Avoid storing unnecessary provider payloads or full SMS bodies. Retain minimum audit fields and define a deletion schedule.

### State invariants

- `catalog_items.status = borrowed` if and only if an active loan exists.
- Only one active loan can exist per physical item.
- An accepted request has exactly one loan.
- An archived item has no active loan and accepts no new requests.
- Owner and requester/borrower cannot be the same user.
- All participants must be active members of the same community at command time.
- A return transition is monotonic: returned loans cannot become active again.

### Server authorization summary

- Community members can read non-archived items and edition metadata in their communities.
- Members can read other members' community-visible profile fields only.
- Owners can insert/update/archive their own catalog items, subject to domain-function invariants.
- Requester and item owner can read a request; only server commands transition it.
- Loan owner and borrower can read their loan; other members see only item availability.
- Users can read/update only their own notification endpoints through verification commands.
- No client role can read the outbox, inbound provider data, private endpoints, or raw audit payloads.
- Provider service keys exist only in Sites-managed Worker secrets.

## 9. Application contracts

These command and query contracts should be frozen before feature agents begin parallel implementation.

### Queries

```text
GET /api/catalog?q=&owner=&status=&language=&sort=&cursor=
GET /api/catalog-items/{id}
GET /api/borrowing?view=requests|borrowed|lent&cursor=
GET /api/members?q=&cursor=
POST /api/isbn/resolve           { isbn, locale }
```

Catalog responses return a stable cursor and a viewer projection:

```ts
type CatalogItemSummary = {
  id: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  language: string | null;
  owner: { id: string; displayName: string };
  status: "available" | "borrowed";
  viewerRelationship: "owner" | "borrower" | "requester" | "member";
};
```

### Commands

```text
POST   /api/catalog-items                 create confirmed physical copy
PATCH  /api/catalog-items/{id}            owner edit with expected version
DELETE /api/catalog-items/{id}            owner soft archive
POST   /api/catalog-items/{id}/requests   request borrowing
POST   /api/loan-requests/{id}/cancel
POST   /api/loan-requests/{id}/decision   accept or decline
POST   /api/loans/{id}/return
POST   /api/loans/{id}/check-in           returned or still_borrowing
POST   /api/webhooks/twilio/inbound
POST   /api/webhooks/twilio/status
```

Mutating requests require an `Idempotency-Key`. Responses return the authoritative resource, never only `success: true`.

### Error contract

Use stable machine codes with localized presentation in the client:

```ts
type DomainErrorCode =
  | "NOT_A_MEMBER"
  | "ITEM_NOT_AVAILABLE"
  | "DUPLICATE_PENDING_REQUEST"
  | "ACTIVE_LOAN_EXISTS"
  | "NOT_ITEM_OWNER"
  | "STALE_VERSION"
  | "INVALID_ISBN"
  | "METADATA_NOT_FOUND"
  | "PROVIDER_UNAVAILABLE"
  | "AMBIGUOUS_MESSAGE_REPLY";
```

## 10. Search implementation

Build and index a normalized `search_text` from title, subtitle, authors, publisher, and both ISBN forms.

- NFC-normalize Korean text and lowercase Latin text.
- Use exact btree indexes for ISBN and owner/status filters.
- Use normalized D1 columns and indexed exact filters for ISBN, owner, status, and language; perform bounded community-scale substring matching for Hangul and Latin text.
- Apply a deterministic ranking function: exact ISBN > exact title > title prefix > title similarity > author similarity > publisher.
- Keyset paginate by `(rank, created_at, id)` rather than offset.
- On the first community-sized dataset, D1 is sufficient. Revisit FTS or a Korean morphological engine only if measured search quality or scale requires it.

Search integration tests must include decomposed/composed Hangul, spaces in Korean names, romanized titles, hyphenated ISBNs, mixed scripts, and common typo cases.

## 11. Notification and background processing

### Transactional outbox

Domain transactions insert an outbox event alongside their state change. A worker claims each due D1 event with a conditional update lease, sends it, and records delivery outcome. Retries use bounded exponential backoff; exhausted events belong in an operational review queue.

### Templates

- Version every template by event, channel, and locale.
- Render only escaped data.
- Keep SMS concise and put the action before the link.
- Deep links restore the exact decision/check-in context after authentication.
- Store the locale snapshot on the event so a preference change does not alter an already queued message unexpectedly.

### Jobs

- Every 5 minutes: dispatch ready outbox events.
- Hourly: expire stale borrow requests and advance queued SMS actions.
- Daily in community timezone: create due return check-ins and reminders.
- Daily: retry transient failures and alert on a growing dead-letter count.

An external HTTPS scheduler invokes the authenticated Worker job endpoint. Scheduler credentials live only in its secret store and Sites runtime secrets.

## 12. Security, privacy, and abuse controls

- Require HTTPS; camera APIs and secure auth depend on it.
- Verify OAuth redirect allowlists per environment.
- Rotate the Apple OAuth client secret before its six-month expiry; assign an explicit owner and alert.
- Expose no D1 binding to browsers; test every server route as anonymous, member, owner, borrower, and system roles.
- Validate Twilio signatures with the official SDK and use the exact externally visible webhook URL.
- Encrypt notification destinations at rest; redact them from logs and analytics.
- Use signed, single-use, short-lived action tokens for email links. Bind the decision to the authenticated owner.
- Rate-limit ISBN resolution, borrow requests, registration/profile completion, and message webhooks.
- Prevent enumeration by returning community-scoped 404s for inaccessible items.
- Sanitize member-entered notes and strip metadata-provider HTML.
- Proxy or constrain remote cover images; validate MIME type, dimensions, and size for uploads.
- Provide account deletion/export rules that preserve anonymized loan integrity while removing private endpoints.
- Define retention for inbound message records, delivery logs, and audit payloads before launch.

## 13. Observability and analytics

### Product events

```text
scan_opened
camera_permission_result
barcode_detected
isbn_validation_failed
isbn_lookup_completed {provider_set, latency_bucket, confidence, cover_found}
intake_confirmation_edited {field_names}
catalog_item_created {method: scan|photo|isbn|manual}
borrow_request_created
borrow_request_decided {channel, decision, latency_bucket}
return_checkin_sent
loan_returned {channel, age_bucket}
```

Never send title, ISBN, member name, contact detail, or message body to analytics.

### Operational signals

- Provider success/timeout/not-found rate and latency.
- Scan decode rate by browser family and OS version.
- Outbox queue age, attempts, and dead letters.
- SMS webhook signature failures and ambiguous replies.
- State-invariant audit job results.
- Auth callback errors, especially Apple secret-expiry symptoms.

## 14. Test strategy

### Unit

- ISBN-10 and ISBN-13 normalization/checksum.
- Provider response mapping and field scoring.
- State transitions and error codes.
- Locale negotiation and complete message dictionaries.
- SMS reply parsing, including Unicode whitespace and duplicate delivery.

### Database

- Migration-up and clean-reset tests.
- Unique/partial constraints and concurrency races.
- Server-authorization matrix using distinct users and communities.
- Transactional acceptance: two owners/actions cannot create two active loans.
- Outbox insertion in the same transaction as every notifiable state change.

### Integration

- Provider adapters use recorded contract fixtures plus a minimal scheduled live check.
- Twilio signed webhook fixtures for inbound SMS, delivery callbacks, opt-out, and retries.
- Email link token expiry, replay, wrong-user, and already-decided behavior.
- Cron generation is idempotent across repeated and overlapping runs.

### End-to-end mobile matrix

- Current iOS Safari and one previous major version.
- Current Android Chrome and Samsung Internet.
- Small phone at 320 px, common 390 px, 430 px, tablet, and desktop.
- Camera allowed, denied, unavailable, no rear camera, poor light, blurred barcode.
- Korean and English for every critical screen, email, and SMS.
- Slow 3G, provider timeout, offline-after-load, and duplicate taps.
- Screen reader smoke tests: VoiceOver/Safari and TalkBack/Chrome.

### Critical acceptance scenarios

1. A Korean ISBN scans and creates the correct physical item with editable Korean metadata.
2. An English ISBN follows the same flow and preserves English metadata.
3. Camera denial reaches manual ISBN entry in one tap.
4. Two users requesting the same item cannot both receive acceptance.
5. Owner SMS `1` accepts exactly one unambiguous request and sends borrower confirmation.
6. Duplicate inbound provider webhook changes nothing twice.
7. Weekly reply `2` keeps the loan active; reply `1` returns it.
8. Borrower manual return immediately makes the item available and cancels pending reminders.
9. Non-owner cannot edit/archive an item through UI, direct API, or database client.
10. Locale switch preserves the current route and app state.

## 15. Delivery phases and gates

### Phase 0 — decisions and prototypes (2–3 days)

- Confirm product assumptions in section 2.
- Test 20 Korean and 20 English ISBNs against candidate providers; measure exact match, cover, and field accuracy.
- Test camera decoding on representative iOS and Android devices.
- Confirm provider terms and notification geography/cost.
- Approve Korean and English copy for the scan, decision, and return flows.

**Gate:** at least 85% metadata-confirmation rate on the sample, or revise provider strategy before building.

### Phase 1 — secure vertical slice (3–5 days)

- Project skeleton, CI, environment validation.
- Google/Apple auth, open default-community registration, profile completion.
- Initial D1 schema, migrations, authorization harness, typed domain contracts.
- One seeded catalog page and detail read model in both locales.

**Gate:** one member can sign in and see only their community; policy tests pass.

### Phase 2 — catalog ownership (3–5 days)

- Search, owner/status/language filters, cursor pagination.
- Detail role states, owner edit, safe archive.
- Responsive/a11y baseline and empty/error/offline states.

**Gate:** catalog and ownership acceptance scenarios pass on mobile.

### Phase 3 — barcode intake (4–7 days)

- Scanner capability adapter and fallbacks.
- ISBN resolver, normalization, merge confidence, caching, provenance.
- Confirmation edit, cover fallback/upload, idempotent item creation.
- Device and provider contract tests.

**Gate:** scan metrics meet Phase 0 target on real devices and the 40-book sample.

### Phase 4 — circulation and notifications (5–8 days)

- Request/cancel/accept/decline state machine.
- Outbox, SMS/email dispatch, signed inbound webhook, delivery status.
- Weekly return scheduler and manual return.
- Borrowing view and all role states.

**Gate:** concurrency, webhook replay, ambiguity, and end-to-end notification tests pass.

### Phase 5 — hardening and pilot (3–5 days plus 1–2 week observation)

- Security review, dependency audit, performance budgets.
- Accessibility and localization QA.
- Alerts, runbooks, backup/restore drill, privacy/retention configuration.
- Open pilot registration to a small real community, observe metrics, and fix scan/notification friction.

**Launch gate:** no open severity-1/2 issues; state invariants clean; pilot members complete add/borrow/return without facilitator help.

## 16. Distributed agent work plan

Parallel work starts only after Agent A lands and tags the shared contract baseline. Each agent owns a narrow directory set and must not silently change shared contracts.

### Agent A — foundation, schema, and security contracts

**Owns:** `drizzle/**`, `db/**`, `lib/auth/**`, `lib/domain/**`, environment schema, shared database types.

**Delivers:** project skeleton, auth/session integration, schema, server authorization, repository command signatures, error enum, seeded fixtures, contract documentation.

**Done when:** migrations reset cleanly; authorization and concurrency tests pass; publishes a shared contract commit for other agents.

### Agent B — application shell, catalog, detail, and i18n

**Owns:** `src/app/[locale]/**` except API routes assigned below, `src/features/catalog/**`, `src/features/settings/**`, locale dictionaries.

**Depends on:** Agent A query types and auth helpers.

**Delivers:** mobile shell, catalog/search/filter UI, detail role states, owner edit/archive, settings, Korean/English parity, component accessibility tests.

### Agent C — scanner and metadata intake

**Owns:** `src/features/intake/**`, `src/server/isbn/**`, `src/app/api/isbn/**`, `src/app/api/catalog-items/**`, provider fixtures.

**Depends on:** Agent A edition/item types and create-item RPC.

**Delivers:** camera adapter, native/ZXing/photo/manual fallbacks, provider adapters, resolver and cache, confirmation form, intake telemetry, device test notes.

### Agent D — borrowing, notifications, and schedules

**Owns:** `features/circulation/**`, circulation API routes, `lib/notifications/**`, notification templates, webhook fixtures.

**Depends on:** Agent A circulation RPCs/outbox tables and Agent B shell integration point.

**Delivers:** request/decision/return UI, outbox worker, Twilio/email adapters, inbound reply safety, scheduled check-ins, operational metrics.

### Agent E — integration, quality, and release

This role begins near the end of Phase 2 and does not own feature behavior.

**Owns:** `tests/e2e/**`, CI workflows, performance/a11y checks, runbooks, release checklist.

**Delivers:** cross-feature test harness, mobile/browser matrix, localization coverage, security regression tests, pilot instrumentation, deployment/rollback documentation.

### Coordination rules

- One integration branch; each agent works in an isolated worktree/branch from the same `contract-v1` base.
- Shared types and migrations require an explicit contract change proposal reviewed by Agent A and affected feature owners.
- Additive migrations only after the baseline; never edit another agent's landed migration.
- Each feature ships with its Korean and English copy, tests, loading/empty/error states, and analytics events.
- Mock external providers in pull-request tests; scheduled live contract checks run separately.
- Merge order: A → B shell, then B/C/D in parallel behind feature flags → E integration → hardening.

### Integration checkpoints

1. **Contract review:** schema, RPCs, errors, routes, event names, locale keys.
2. **Vertical-slice review:** sign in → catalog → detail using seeded data.
3. **Intake review:** scan → resolve → confirm → new detail on real devices.
4. **Circulation review:** request → SMS/email decision → borrowed → weekly/manual return.
5. **Release review:** security, accessibility, observability, and rollback.

## 17. Repository shape

```text
app/
  api/
components/
features/
  catalog/
  intake/
  circulation/
  settings/
lib/
  auth/
  domain/
  i18n/
  isbn/
  notifications/
  persistence/
db/
drizzle/
tests/
docs/
```

Enforce dependency direction: UI → application commands/queries → domain contracts → infrastructure adapters. Feature modules may share domain types but should not import one another's internal components.

## 18. Confirmed decisions and remaining validation

| Decision | Confirmed direction | Implementation consequence |
|---|---|---|
| Catalog visibility | Authenticated active members only | Signed-out users can access auth but no catalog/member data |
| Initial community model | Open self-registration, one active community in UI | Profile completion activates default-community membership |
| Notification geography | United States only | Accept verified `+1` SMS numbers and complete US sender compliance |
| Decision expiry | 48 hours | Expiry job advances queued actionable SMS after two days |
| Return policy | No due date; first check at day 7, weekly thereafter | Trust-based recurring check-in |
| Return authority | Borrower or owner | Both call the same idempotent return command |
| Covers | Provider URL when permitted; member upload otherwise | Provider terms remain a launch gate |
| Book metadata | Benchmark-driven field-level stitching across eligible providers | Provider weights are per field/market, not one global source order |
| Hosting region | Sites/Cloudflare; no strict residency requirement | Use the managed deployment location closest to the US pilot |
| Analytics | Minimal, content-free event metadata | Never emit titles, ISBNs, names, contacts, or message bodies |

## 19. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Korean metadata or covers are incomplete | Field-level provider merge, 40-book benchmark, editable confirmation, member cover upload |
| iOS/browser scanning differs from Android | Capability adapter, ZXing fallback, still-photo and manual paths, real-device gate |
| Bare SMS replies are ambiguous | One actionable SMS per number, exact sender match, no-op on ambiguity, in-app fallback |
| Two accept actions race | Database lock, unique active-loan constraint, idempotent RPC |
| Notifications fail after state commits | Transactional outbox, retries, delivery status, dead-letter alert |
| Private contact data leaks through catalog reads | Separate private endpoint table, server-only D1 access, explicit projections, redacted logs |
| Apple sign-in breaks after secret expiry | Six-month rotation owner, 30/14/7-day alerts, runbook |
| Provider terms block cover caching | Legal/terms review gate, permitted hotlinking or user-upload fallback |
| Large shared changes cause agent conflicts | Contract-first baseline, directory ownership, additive migrations, scheduled checkpoints |

## 20. Definition of done for v1

The release is complete when a newly registered Korean-first user can authenticate with Google or Apple, finish a minimal profile and join the launch community, scan either a Korean or English book, correct and create the listing, find it through search and owner filters, request it as another member, let the owner accept via a safe SMS `1` reply or in-app/email action, see both sides update to borrowed, receive a weekly check-in, mark it returned, and see the physical copy become available again—on supported mobile browsers, with tested error recovery, Korean/English parity, complete auditability, and no route that bypasses ownership or active-membership rules.

## 21. Reference feasibility notes

- [National Library of Korea ISBN bibliographic API](https://www.nl.go.kr/NL/contents/N31101030500.do)
- [Naver notice: Book Search API retired July 31, 2026](https://developers.naver.com/notice/article/32564)
- [Google Books API](https://developers.google.com/books/docs/v1/using)
- [MDN Barcode Detection API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Sign in with Apple REST API](https://developer.apple.com/documentation/signinwithapplerestapi)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Twilio incoming messaging webhooks](https://www.twilio.com/docs/messaging/guides/webhook-request)
- [Next.js internationalization guidance](https://nextjs.org/docs/app/guides/internationalization)
