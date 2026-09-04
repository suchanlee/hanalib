# Production activation runbook

This runbook separates the testable local product from actions that need real provider accounts and hosting configuration.

## 1. Identity and membership

Confirm the hosting platform’s current external OAuth path before enabling Google or Apple. Register exact same-origin callback URLs, store provider subjects in `auth_identities`, and create one active `community_members` row for every successful launch registration. Catalog and mutation endpoints must independently require an authenticated profile and active membership; client navigation is not an authorization boundary.

Apple private keys and all OAuth client secrets remain server-only. Rotate secrets without changing provider subject mappings. Treat an email address as contact data, not a durable identity key.

## 2. Database and cover storage

Provision D1 as `DB` and R2 as `FILES` in US West-compatible infrastructure. Apply each generated migration exactly once and never rewrite an applied `drizzle/*.sql` file. Restrict cover uploads to JPEG, PNG, or WebP, verify the decoded MIME type, enforce a size limit, strip metadata, generate a random storage path, and persist only file metadata in D1.

## 3. ISBN resolver

Configure NLK and Google Books credentials. Resolve providers in parallel, retain per-field provenance, normalize ISBN before querying, and rank exact ISBN matches above fuzzy results. Cache the stitched result. Provider cover URLs may be retained only when their terms permit it; otherwise require a member upload or show the generated placeholder. Do not call Naver Book Search: that API retired on July 31, 2026.

## 4. Notifications and inbound SMS

Configure a US Twilio number and a transactional-email sender. Verify webhook signatures before parsing inbound text. Store phone addresses encrypted and a keyed hash for matching. Accept only trimmed `1` or `2`, and apply it only when that sender owns exactly one unexpired actionable request. Duplicate provider message IDs must be idempotent. Ambiguous or expired replies receive a safe explanatory response and make no state change.

Use the transactional outbox: commit the domain transition and outbox event together, then let a retrying worker create `notification_deliveries`. Keep delivery failures observable without logging message bodies, phone numbers, OAuth tokens, book titles, or member names.

## 5. Return-check scheduler

When a loan begins, schedule its first `return_checkins` row for day 7. A weekly worker sends due check-ins. “Returned” records the return; “not yet” advances by seven days. Both owner and borrower can record a return from the app, and all paths must be idempotent.

## 6. Privacy-minimal telemetry

Allowlisted analytics contain only an event name, optional anonymous session ID, locale, and timestamp. Do not place ISBNs, titles, queries, names, emails, phone numbers, message bodies, or free-text notes in analytics. Operational audit events may retain actor and aggregate identifiers according to the documented retention window, but never notification content.

## 7. Launch gates

Before production, complete provider sandbox tests, D1 migration rehearsal, R2 upload security tests, webhook replay/idempotency tests, keyboard and screen-reader checks, mobile Safari/Chrome camera checks, Korean/English content QA, alerting, restore rehearsal, and a data-retention/deletion policy review.
