# Production activation runbook

The application runs on OpenAI Sites backed by Cloudflare Workers. Sites owns the production `DB` D1 database and `FILES` R2 bucket declared in `.openai/hosting.json`. The owner-private production deployment is the staging gate; change Sites access to public only after the provider checks below pass. A public Sites page does not require a ChatGPT account, while the application catalog still requires Kakao authentication.

## 1. Identity and membership

Create a Kakao Developers application and enable Kakao Login, OpenID Connect, the REST API key client secret, and the `profile_nickname` and `talk_message` consent items. Set `KAKAO_REST_API_KEY` and `KAKAO_CLIENT_SECRET`, then register this redirect URI on the REST API key:

`https://hana-community-library.lee-suchan.chatgpt.site/api/auth/kakao/callback`

Keep every credential server-only. Successful first sign-in creates an active member in the open `hana-launch` community; every catalog and mutation endpoint independently checks the session and active membership. Production accepts Kakao sessions only; Google and Apple sign-in routes and session providers are removed.

## 2. Database and cover storage

Sites applies the immutable `drizzle/*.sql` migrations to D1 and binds R2 as `FILES`. Cover uploads accept JPEG, PNG, or WebP up to 8 MB, verify file signatures against the declared MIME type, use random owner-partitioned object keys, and expose files only through authenticated application routes. Rehearse backup/restore and decide whether server-side image metadata removal is required before accepting real member photos.

## 3. ISBN resolver

Open Library is the credential-free baseline. Set `NLK_API_KEY` and `GOOGLE_BOOKS_API_KEY` for Korean and English enrichment; optionally set both `NAVER_CLIENT_ID` and `NAVER_CLIENT_SECRET` for Naver Books enrichment. The resolver queries configured providers plus Open Library in parallel, accepts partial provider failure, rejects non-exact ISBN editions, and stitches fields with per-field provenance. Production fixtures are disabled. Review each provider’s current attribution, caching, and cover-image terms before public launch; retain a provider URL only when permitted and use member-uploaded R2 covers otherwise.

## 4. Private KakaoTalk notifications

Members who grant `talk_message` receive circulation cards in their private KakaoTalk My Chatroom. The OAuth callback stores the access and refresh tokens as an AES-GCM-encrypted credential in `notification_endpoints`; the server refreshes short-lived access tokens with the Kakao REST API key and client secret. Never expose either token to the browser or logs.

Borrow requests include a same-origin **요청 확인 / View request** button. Decisions and weekly return checks include corresponding authenticated app buttons. A normal Kakao Channel chatbot cannot initiate these alerts; this implementation deliberately uses Kakao's **Send to me** API, which delivers to the authorized member's My Chatroom and does not expose a shared group conversation.

Borrow and decision mutations attempt delivery immediately. Every message also uses the transactional outbox so a provider failure can be retried without losing the domain change. Logs must never include message bodies, OAuth tokens, book titles, member names, or encrypted notification payloads. Legacy Twilio and email adapters remain isolated in source for rollback, but they are not exposed by the Kakao-only production UI and their credentials are not required.

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

- Validate real Kakao first-sign-in, repeat-sign-in, denial, state mismatch, and logout flows.
- Validate Korean and English ISBNs against live NLK and Google Books data.
- Grant `talk_message` consent, then verify the Settings connection state and repeat sign-in behavior.
- Trigger each circulation event and verify the private My Chatroom card and its in-app action button.
- Connect the scheduler and observe a retry plus a due return check in staging.
- Complete physical iOS Safari and Android Chrome camera tests; the automated browser cannot prove camera permission UX on real hardware.
- Review keyboard/screen-reader behavior, backup/restore, retention/deletion, abuse response, and monitoring.
- Confirm production demo auth and ISBN fixtures remain disabled, then change the Sites audience from owner-private to public.
