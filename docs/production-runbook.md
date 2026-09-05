# Production activation runbook

The application runs publicly on OpenAI Sites backed by Cloudflare Workers. Sites owns the production `DB` D1 database and `FILES` R2 bucket declared in `.openai/hosting.json`. Opening the public page does not require a ChatGPT account, while the application catalog still requires Kakao authentication.

## 1. Identity and membership

Create a Kakao Developers application and enable Kakao Login, OpenID Connect, the REST API key client secret, and the `profile_nickname` consent item. Convert the application to a Kakao Biz app, complete its business-information review, request the personal-information consent permission, and then enable `account_email` as optional consent. The login request includes both scopes; verified Kakao email claims are stored for notification delivery. Set `KAKAO_REST_API_KEY` and `KAKAO_CLIENT_SECRET`, then register this redirect URI on the REST API key:

`https://library.hanaseed.org/api/auth/kakao/callback`

Keep every credential server-only. Successful first sign-in creates an active member in the open `hana-launch` community; every catalog and mutation endpoint independently checks the session and active membership. Production accepts Kakao sessions only; Google and Apple sign-in routes and session providers are removed.

## 2. Database and cover storage

Sites applies the immutable `drizzle/*.sql` migrations to D1 and binds R2 as `FILES`. Cover uploads accept JPEG, PNG, or WebP up to 8 MB, verify file signatures against the declared MIME type, use random owner-partitioned object keys, and expose files only through authenticated application routes. Rehearse backup/restore and decide whether server-side image metadata removal is required before accepting real member photos.

## 3. ISBN resolver

Open Library is the credential-free baseline. Set `NLK_API_KEY` and `GOOGLE_BOOKS_API_KEY` for Korean and English enrichment; optionally set both `NAVER_CLIENT_ID` and `NAVER_CLIENT_SECRET` for Naver Books enrichment. The resolver queries configured providers plus Open Library in parallel, accepts partial provider failure, rejects non-exact ISBN editions, and stitches fields with per-field provenance. Production fixtures are disabled. Review each provider’s current attribution, caching, and cover-image terms before public launch; retain a provider URL only when permitted and use member-uploaded R2 covers otherwise.

## 4. Email and Web Push notifications

Verify `library.hanaseed.org` as a sending domain in Resend, then set `RESEND_API_KEY` as a Sites secret. The sender is `EMAIL_FROM="Hana Seed Library <notifications@library.hanaseed.org>"`. Every circulation event sends email when the recipient has a verified email from sign-in, regardless of Web Push availability or their legacy notification-channel preference. Members without an email can still receive Web Push; this does not add an email collection or verification flow. Missing Resend configuration leaves email delivery pending for retry, even if push succeeds.

Generate one VAPID P-256 key pair and set `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and an HTTPS `WEB_PUSH_SUBJECT`. Keep the private key server-only. The browser registers `/sw.js`, requests notification permission only after a member presses the enable button, and stores each subscription as AES-GCM-encrypted JSON plus a keyed endpoint hash in `web_push_subscriptions`. The endpoint is a bearer capability and must never appear in logs.

On iOS/iPadOS, Safari exposes Push only after the member adds the site to the Home Screen and opens the installed app. Android Chrome and supported desktop browsers can subscribe directly; installation is still offered when the browser supports it. The Settings card includes a real test send so members and operators can validate the complete subscription, encryption, push-service, service-worker, and display path.

Borrow requests, decisions, and weekly return checks deep-link to the relevant authenticated screen. Mutations attempt delivery immediately through the transactional outbox, so a delivery failure cannot undo or lose the domain change. Invalid or expired browser subscriptions are disabled automatically. Email and push are attempted independently, and each successful channel is persisted before the event is completed. A failed email is retried without resending successful push delivery, and vice versa. Kakao and Twilio remain fallbacks when no push succeeds. The Settings test button continues to test Web Push only.

## 5. Return-check scheduler

Run an HTTPS scheduler at least every five minutes:

```text
POST https://library.hanaseed.org/api/jobs/notifications
Authorization: Bearer <INTERNAL_JOB_SECRET>
```

The secret is already generated in Sites and must be copied only into the scheduler’s secret store. The job expires 48-hour pending requests, retries due outbox deliveries, sends the first return check seven days after loan start, and schedules subsequent checks every seven days while the loan remains active.

## 6. Privacy-minimal telemetry

Allowlisted analytics contain only an event name, optional anonymous session ID, locale, and timestamp. Do not place ISBNs, titles, queries, names, emails, phone numbers, message bodies, or free-text notes in analytics. Operational audit events may retain actor and aggregate identifiers according to the documented retention window, but never notification content.

## 7. Logging and debugging

Server failures emit one-line JSON records to the Sites-managed Worker log stream using the `hana.operations.v1` schema. Records contain only operational fields such as the request ID, normalized route, method, operation, status, duration, safe error code, provider state, event type, attempt number, and aggregate delivery counts. They must never contain names, book metadata, ISBN queries, contact details, OAuth credentials, message content, request bodies, or arbitrary exception messages.

API responses include `x-request-id`; use that value, the route, and the approximate time to correlate a member report with recent Sites Worker logs. Start an investigation with error-only logs, then widen the same time window when successful surrounding requests are needed. Sites logs are a recent operational debugging surface, not permanent audit storage; durable domain history remains in the content-minimal audit tables.

## 8. Public-launch gates

- Validate real Kakao first-sign-in, repeat-sign-in, denial, state mismatch, and logout flows.
- Validate Korean and English ISBNs against live NLK and Google Books data.
- Install the app on a physical iPhone and Android phone, enable notifications, and verify the Settings test alert while the app is closed.
- Trigger each circulation event and verify its device notification and authenticated deep link.
- Connect the scheduler and observe a retry plus a due return check in staging.
- Complete physical iOS Safari and Android Chrome camera tests; the automated browser cannot prove camera permission UX on real hardware.
- Review keyboard/screen-reader behavior, backup/restore, retention/deletion, abuse response, and monitoring.
- Confirm production demo auth and ISBN fixtures remain disabled, then change the Sites audience from owner-private to public.
