# 하나의 씨앗 도서관 · Hana Seed Books

Mobile-first community-library application for sharing Korean and English books. The working preview includes Google and Kakao member authentication, a bilingual catalog, owner/status/language filters, book details, barcode-first intake, circulation, weekly return check-ins, profile settings, and deterministic demo identities for end-to-end testing.

The product and implementation blueprint lives in [`docs/community-library-plan.md`](docs/community-library-plan.md).

## Local development

Requirements: Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Copy `.dev.vars.example` to `.dev.vars` only when configuring real external services. Never commit that file. The local product preview intentionally uses fixture identities and metadata so every core journey is testable without credentials.

## Validation

```bash
npm test
npm run typecheck
npm run lint
npm run db:generate
npm run build
```

## Architecture

- `features/` contains the mobile product journeys: auth, catalog/detail, intake, circulation, and settings.
- `lib/domain/` holds shared state contracts and timing/authorization rules.
- `lib/isbn/` resolves and stitches NLK and Google Books metadata behind provider interfaces. Naver Book Search is deliberately excluded because the service retired on July 31, 2026.
- `lib/notifications/` sends Korean/English circulation alerts through Resend email for every recipient with a Google or member-supplied email, independently of encrypted per-device Web Push delivery. Kakao and SMS remain fallback adapters when no push succeeds; successful channels are recorded separately to avoid resending them on retries.
- `db/schema.ts` defines durable Cloudflare D1 data. Generated SQL migrations in `drizzle/` are immutable after application.
- Cover uploads use the `FILES` R2 binding; structured state uses the `DB` D1 binding declared in `.openai/hosting.json`.

The application is deployed through OpenAI Sites on Cloudflare Workers with managed D1 and R2 bindings. Core application secrets are managed by Sites, and local secrets remain ignored. Public launch still requires the third-party credentials and callback/webhook setup in [`docs/production-runbook.md`](docs/production-runbook.md); development fixtures and demo authentication are disabled in production.

## Notifications

Immediate events are queued transactionally and delivery is attempted in a background task after the triggering mutation commits. Scheduled events are stored in the same outbox but require the protected notification job to be invoked regularly.

| Kind | Event | Recipient | Timing and cadence |
| --- | --- | --- | --- |
| Immediate | Borrow request created | Book owner | Once, immediately after the request is submitted. The request expires after 48 hours. |
| Scheduled | Borrow request reminder | Book owner | Once, 24 hours after submission, while the request is still pending (24 hours before expiry). |
| Immediate | Borrow request accepted | Borrower | Once, immediately after the owner accepts. |
| Immediate | Borrow request declined | Borrower | Once, immediately after the owner declines. |
| Immediate | Borrow request canceled | Book owner | Once, immediately after the borrower cancels a pending request. |
| Scheduled | Borrow request expired | Book owner | Once when the 48-hour request window expires. |
| Immediate | Held book becomes available | First eligible member on the waitlist | Once when a return, pass, cancellation, or decline advances the queue. Advancing an expired offer requires the scheduled job. |
| Scheduled | Hold-offer reminder | Member whose turn it is | Once, 24 hours after the offer. The offer expires after 48 hours. |
| Immediate | Book marked returned by borrower | Book owner | Once, immediately after the borrower records the return. |
| Scheduled | Return check | Borrower | First at day 7 of an active loan, then on the original seven-day schedule until the book is returned. A late run skips missed intervals instead of shifting future checks. |
| Manual | Test notification | Signed-in member | On demand from Settings; Web Push only. |

Web Push is attempted first for subscribed devices. If none is delivered, the worker falls back to the member's configured Kakao, email, SMS, or combined email/SMS channel. Failed outbox deliveries use exponential backoff from one minute up to six hours.

The five-minute scheduler Worker in [`workers/notification-scheduler`](workers/notification-scheduler) is active in production. Scheduled processing expires stale requests and offers, sends reminders and weekly return checks, and retries failed deliveries. Before delivery, the worker suppresses events that are no longer actionable, including return checks for already-returned books. Joining a waitlist does not itself notify another member; the first notification is sent when that member reaches the front of the queue and the book becomes available.

## Operational invariants

- The catalog is visible only after authentication and active-community membership checks.
- Launch registration is open and joins the single launch community.
- Borrow requests expire after 48 hours.
- Accepting one request atomically supersedes other pending requests for that copy.
- A return can be recorded by the borrower or owner.
- The first return check is seven days after loan start and repeats weekly without a due date.
- Web Push alerts deep-link back to the authenticated app; accept, decline, and return actions remain authorization-checked server mutations.
- The pilot is US-scoped; strict data-residency placement is not required.
