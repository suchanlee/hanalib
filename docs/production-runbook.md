# Production activation runbook

The application runs publicly on OpenAI Sites backed by Cloudflare Workers. Sites owns the production `DB` D1 database and `FILES` R2 bucket declared in `.openai/hosting.json`. Opening the public page does not require a ChatGPT account, while the application catalog still requires Google or Kakao authentication.

## 1. Identity and membership

In Kakao Developers, enable Kakao Login, OpenID Connect, the REST API key client secret, and the `profile_nickname` and `talk_message` consent items. The application deliberately does not request `account_email`, so a Korean mobile-number identity check is not required merely to provide an email. Set `KAKAO_REST_API_KEY` and `KAKAO_CLIENT_SECRET`, then register this redirect URI on the REST API key:

`https://library.hanaseed.org/api/auth/kakao/callback`

Create a Google Cloud OAuth web client, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, configure the OAuth consent screen, and register this redirect URI:

`https://library.hanaseed.org/api/auth/google/callback`

Keep every credential server-only. Successful first sign-in creates an active member in the open `hana-launch` community; every catalog and mutation endpoint independently checks the session and active membership. Production accepts both Google and Kakao sessions. Identities are never merged solely by matching email addresses.

## 2. Database and cover storage

Sites applies the immutable `drizzle/*.sql` migrations to D1 and binds R2 as `FILES`. Cover uploads accept JPEG, PNG, or WebP up to 8 MB, verify file signatures against the declared MIME type, use random owner-partitioned object keys, and expose files only through authenticated application routes. Rehearse backup/restore and decide whether server-side image metadata removal is required before accepting real member photos.

## 3. ISBN resolver

Open Library is the credential-free baseline. Set `NLK_API_KEY` and `GOOGLE_BOOKS_API_KEY` for Korean and English enrichment; optionally set both `NAVER_CLIENT_ID` and `NAVER_CLIENT_SECRET` for Naver Books enrichment. The resolver queries configured providers plus Open Library in parallel, accepts partial provider failure, rejects non-exact ISBN editions, and stitches fields with per-field provenance. Production fixtures are disabled. Review each provider’s current attribution, caching, and cover-image terms before public launch; retain a provider URL only when permitted and use member-uploaded R2 covers otherwise.

## 4. Email and Web Push notifications

Verify `library.hanaseed.org` as a sending domain in Resend, then set `RESEND_API_KEY` as a Sites secret. The sender is `EMAIL_FROM="Hana Seed Library <notifications@library.hanaseed.org>"`. Every circulation event sends email when the recipient has a verified Google email or a manually supplied address verified through the one-hour signed link. Members without a verified address are prompted on each fresh app visit and can postpone for that visit. Missing Resend configuration prevents both verification and notification mail; queued circulation email remains pending for retry even if push succeeds.

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

The visible error panel also assigns a `client-<uuid>` trace to browser errors, including unhandled promises, event-handler exceptions, and render failures. Its copied details retain the error class and up to eight same-origin code locations (asset filename, line, column), plus any API request ID or server-render digest. Raw exception text and stacks are not collected: URLs lose their hostnames and query values, and filesystem/extension locations are excluded. Asset hashes identify the compiled code version; locations in minified bundles require the matching build to investigate.

The panel posts these allowlisted details to the same-origin `/api/diagnostics` endpoint. Search recent Worker logs for `schema: hana.client-error.v1`, `event: client-error-reported`, and the exact `traceId` copied by the user. `requestId`, when present, links the original API failure; `reportRequestId` identifies the separate reporting request. Browser console records carry the same trace. Client reports describe browser-supplied observations, not authenticated audit evidence.

The copied `Report` field distinguishes a server acknowledgment from a report that could not be sent. Offline, blocked, timed-out, or rate-limited reports still have local IDs and copyable source locations, but may have no server log record. Reporting has a five-second deadline, no retries, a ten-report/minute browser cap, a 120-request/minute cap per Worker isolate, and a 4 KiB body limit. The endpoint requires a same-origin JSON POST and does not depend on authentication or D1, so sign-in/bootstrap failures can still be diagnosed. Reports copied before this tracing change cannot be reconstructed from their timestamp alone.

## 8. Public-launch gates

- Validate real Google and Kakao first-sign-in, repeat-sign-in, denial, state mismatch, and logout flows.
- For a Kakao member without email, submit an address, open the verification link, reload the app, and confirm both that the prompt disappears and a test circulation email arrives.
- Validate Korean and English ISBNs against live NLK and Google Books data.
- Install the app on a physical iPhone and Android phone, enable notifications, and verify the Settings test alert while the app is closed.
- Trigger each circulation event and verify its device notification and authenticated deep link.
- Connect the scheduler and observe a retry plus a due return check in staging.
- Complete physical iOS Safari and Android Chrome camera tests; the automated browser cannot prove camera permission UX on real hardware.
- Review keyboard/screen-reader behavior, backup/restore, retention/deletion, abuse response, and monitoring.
- Confirm production demo auth and ISBN fixtures remain disabled, then change the Sites audience from owner-private to public.

## 9. Repeatable Sites release

Use this sequence only after the user explicitly asks to deploy. It publishes the application Worker and assets to the existing public Sites project. It does not recreate the Site, change its audience, replace environment variables, or redeploy the separate notification-scheduler Worker.

### 9.1 Validate and commit once

Run these checks from the repository root before touching production:

```bash
git status --short
git diff --check
npm test
npm run typecheck
npm run lint
npm run build
```

If there are intended uncommitted changes, stage only their exact paths and commit them. Do not include unrelated work. Then require a clean worktree and capture the full commit SHA:

```bash
git status --short
git rev-parse --verify HEAD
```

The build may be reused only when it completed successfully for that exact unchanged source. Otherwise build once here; do not rebuild between packaging and version creation. If `db/schema.ts` changed, generate and inspect a new immutable migration before validation.

### 9.2 Publish the exact commit through Sites

The Sites project ID is the opaque `project_id` in `.openai/hosting.json`. Perform these actions in order because every later action consumes an ID produced by an earlier one:

1. Call Sites `get_site` once. Confirm that the project is active, the current user may publish, and the existing access mode is still `public`. Do not change access as part of a release.
2. Call `create_source_repository_write_credential` for the same project. The result is short-lived; never save its token in a file, remote URL, Git configuration, log, or user-facing output.
3. Push `HEAD` to the credential's returned branch and remote using its per-command HTTP authorization header. The existing `sites` Git remote contains only the credential-free URL. A representative command shape is:

   ```bash
   git -c http.extraHeader='Authorization: Bearer <short-lived-token>' push sites HEAD:main
   ```

4. After the push succeeds, run `git rev-parse --verify HEAD` again. Its full output is the `commit_sha`; never use an abbreviated SHA or infer it from push output.
5. Create a temporary directory with `mktemp -d /tmp/hanalib-sites.XXXXXX`. Use the currently installed Sites plugin's root-level `scripts/package-site.sh` to package the repository into `<temporary-directory>/site.tar.gz`. The helper validates and stages `dist/server/index.js`, client assets, `.openai/hosting.json`, and migrations.
6. Call `save_site_version` with the project ID, exact `commit_sha`, and absolute archive path. Copy the returned version ID unchanged.
7. Because the existing audience is public and deployment was explicitly requested, call `deploy_site_version` with that saved version ID.
8. Poll `get_deployment_status` with the returned deployment ID until it reports `succeeded` or `failed`. Do not announce success while it is pending, building, or publishing.

The dependency chain is therefore:

```text
validated commit -> source push -> package -> saved version -> deployment -> terminal status
```

### 9.3 Verify and finish

After Sites reports success, verify both the custom domain and health endpoint:

```bash
curl -I https://library.hanaseed.org/
curl -fsS https://library.hanaseed.org/api/health
```

Require an HTTP success response. Remove only the exact temporary directory created for this release, confirm the Git worktree is still clean, and report the custom-domain URL plus the deployed commit. Browser E2E testing is a separate step: run it when the user asks or when the release changes a critical interactive journey.

### 9.4 Fast-path and failure rules

- Do not run `npm install` when the existing lockfile dependencies are already installed.
- Do not recreate the Site, rotate secrets, edit `.openai/hosting.json`, change the public audience, or touch the scheduler when those inputs did not change.
- Treat `Could not resolve host` from a sandboxed Git or `curl` command as a local network-permission failure. Retry that exact command once with the standard network approval; do not rebuild or create another Sites version.
- If source push fails, obtain a fresh short-lived credential and retry the same push. Do not embed the token in the remote.
- If packaging or version saving fails, fix that stage and reuse the already validated commit. Never deploy an unsaved version.
- If deployment fails, read its failure message and fix the cause before creating a new version. Do not redeploy the identical failed archive blindly.
- To roll back application code, list saved Site versions, select the last known-good version ID, deploy it to the unchanged public audience, and poll to success. D1 migrations are forward-only and are not undone by a code rollback.

For a normal source-only release with dependencies installed and no migration or environment change, the only unavoidable serial publishing calls are: inspect Site, obtain credential, save version, deploy version, and poll status.
