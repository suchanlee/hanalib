# 하나도서관 · Hana Library

Mobile-first community-library application for sharing Korean and English books. The working preview includes a bilingual catalog, owner/status/language filters, book details, barcode-first intake, circulation, weekly return check-ins, profile settings, and deterministic demo identities for end-to-end testing.

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
- `lib/isbn/` resolves and stitches NLK, Google Books, and Naver metadata behind provider interfaces.
- `lib/notifications/` parses inbound `1`/`2` decisions and builds Korean/English email and SMS messages.
- `db/schema.ts` defines durable Cloudflare D1 data. Generated SQL migrations in `drizzle/` are immutable after application.
- Cover uploads use the `FILES` R2 binding; structured state uses the `DB` D1 binding declared in `.openai/hosting.json`.

The current browser preview is a fully interactive deterministic product prototype. Production activation requires the credentials in `.dev.vars.example`, a platform-approved Google/Apple OAuth callback path, encrypted notification endpoints, verified Twilio/transactional-email webhooks, and scheduled outbox/check-in workers. The server contracts and database shape are included; the preview never pretends that an external message or OAuth exchange occurred.

## Operational invariants

- The catalog is visible only after authentication and active-community membership checks.
- Launch registration is open and joins the single launch community.
- Borrow requests expire after 48 hours.
- Accepting one request atomically supersedes other pending requests for that copy.
- A return can be recorded by the borrower or owner.
- The first return check is seven days after loan start and repeats weekly without a due date.
- SMS commands apply only when exactly one actionable request exists for the sender; `1` accepts and `2` declines.
- Production is scoped to the United States in a US West deployment region.
