# 하나의씨앗 도서관 · Hana Library

Mobile-first community-library application for sharing Korean and English books. The working preview includes Kakao-only member authentication, a bilingual catalog, owner/status/language filters, book details, barcode-first intake, circulation, weekly return check-ins, profile settings, and deterministic demo identities for end-to-end testing.

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
- `lib/notifications/` encrypts Kakao credentials, refreshes access tokens, and sends Korean/English circulation cards to each member's private KakaoTalk My Chatroom.
- `db/schema.ts` defines durable Cloudflare D1 data. Generated SQL migrations in `drizzle/` are immutable after application.
- Cover uploads use the `FILES` R2 binding; structured state uses the `DB` D1 binding declared in `.openai/hosting.json`.

The application is deployed through OpenAI Sites on Cloudflare Workers with managed D1 and R2 bindings. Core application secrets are managed by Sites, and local secrets remain ignored. Public launch still requires the third-party credentials and callback/webhook setup in [`docs/production-runbook.md`](docs/production-runbook.md); development fixtures and demo authentication are disabled in production.

## Operational invariants

- The catalog is visible only after authentication and active-community membership checks.
- Launch registration is open and joins the single launch community.
- Borrow requests expire after 48 hours.
- Accepting one request atomically supersedes other pending requests for that copy.
- A return can be recorded by the borrower or owner.
- The first return check is seven days after loan start and repeats weekly without a due date.
- KakaoTalk alerts contain same-origin buttons back to the authenticated app; accept, decline, and return actions remain authorization-checked server mutations.
- The pilot is US-scoped; strict data-residency placement is not required.
