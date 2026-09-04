# Production activation runbook

The application runs on OpenAI Sites backed by Cloudflare Workers. Sites owns the production `DB` D1 database and `FILES` R2 bucket declared in `.openai/hosting.json`. The owner-private production deployment is the staging gate; change Sites access to public only after the provider checks below pass. A public Sites page does not require a ChatGPT account, while the application catalog still requires Google or Apple authentication.

## 1. Identity and membership

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then register:

`https://hana-community-library.lee-suchan.chatgpt.site/api/auth/google/callback`

Set `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and the PKCS#8 `APPLE_PRIVATE_KEY`, then register:

`https://hana-community-library.lee-suchan.chatgpt.site/api/auth/apple/callback`

Keep every credential server-only. Rotate the Apple signing key before expiry without changing provider subject mappings. Successful first sign-in creates an active member in the open `hana-launch` community; every catalog and mutation endpoint independently checks the session and active membership.

## 2. Database and cover storage

Sites applies the immutable `drizzle/*.sql` migrations to D1 and binds R2 as `FILES`. Cover uploads accept JPEG, PNG, or WebP up to 8 MB, verify file signatures against the declared MIME type, use random owner-partitioned object keys, and expose files only through authenticated application routes. Rehearse backup/restore and decide whether server-side image metadata removal is required before accepting real member photos.

## 3. ISBN resolver

Open Library is the credential-free baseline. Set `NLK_API_KEY` and `GOOGLE_BOOKS_API_KEY` for Korean and English enrichment; optionally set both `NAVER_CLIENT_ID` and `NAVER_CLIENT_SECRET` for Naver Books enrichment. The resolver queries configured providers plus Open Library in parallel, accepts partial provider failure, rejects non-exact ISBN editions, and stitches fields with per-field provenance. Production fixtures are disabled. Review each provider’s current attribution, caching, and cover-image terms before public launch; retain a provider URL only when permitted and use member-uploaded R2 covers otherwise.

## 4. Notifications and inbound SMS

Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` for a US number. Configure Twilio’s incoming-message webhook as:

`https://hana-community-library.lee-suchan.chatgpt.site/api/webhooks/twilio/inbound`

Set `RESEND_API_KEY` and a verified `EMAIL_FROM`. Phone numbers stay encrypted at rest, SMS delivery activates only after six-digit ownership verification, and incoming Twilio requests require a valid provider signature. Only exact `1` or `2` replies from an owner with one actionable request can change state; provider message IDs are idempotent.

Borrow and decision mutations attempt delivery immediately. Every message also uses the transactional outbox so a provider failure can be retried without losing the domain change. Logs must never include message bodies, phone numbers, OAuth tokens, book titles, member names, or contact addresses.

## 5. Return-check scheduler

Run an HTTPS scheduler at least every five minutes:

```text
POST https://hana-community-library.lee-suchan.chatgpt.site/api/jobs/notifications
Authorization: Bearer <INTERNAL_JOB_SECRET>
```

The secret is already generated in Sites and must be copied only into the scheduler’s secret store. The job expires 48-hour pending requests, retries due outbox deliveries, sends the first return check seven days after loan start, and schedules subsequent checks every seven days while the loan remains active.

## 6. Privacy-minimal telemetry

Allowlisted analytics contain only an event name, optional anonymous session ID, locale, and timestamp. Do not place ISBNs, titles, queries, names, emails, phone numbers, message bodies, or free-text notes in analytics. Operational audit events may retain actor and aggregate identifiers according to the documented retention window, but never notification content.

## 7. Public-launch gates

- Validate real Google and Apple first-sign-in and repeat-sign-in flows.
- Validate Korean and English ISBNs against live NLK and Google Books data.
- Send and receive Twilio sandbox messages, including signed `1`, `2`, duplicate, expired, and ambiguous replies.
- Verify the Resend sender and inspect delivery/bounce behavior without logging content.
- Connect the scheduler and observe a retry plus a due return check in staging.
- Complete physical iOS Safari and Android Chrome camera tests; the automated browser cannot prove camera permission UX on real hardware.
- Review keyboard/screen-reader behavior, backup/restore, retention/deletion, abuse response, and monitoring.
- Confirm production demo auth and ISBN fixtures remain disabled, then change the Sites audience from owner-private to public.
