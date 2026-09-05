# Error handling fixes and re-audit

Date: 2026-09-05. Scope: the eight findings from the error-handling audit, the shared client error experience, and adjacent failure/recovery paths touched by these changes. Changes are local and have not been deployed.

All eight original findings are addressed. The final review found no remaining actionable error-handling regressions in the reviewed paths. This is a scoped review and test result, not a guarantee that every possible production failure has been reproduced.

| Original finding | Fix | Verification |
| --- | --- | --- |
| Weekly return reminders stop after scheduling fails | Event completion and next-reminder writes commit in one D1 batch. Failed scheduling leaves the event retryable. | Real SQLite transactions with an injected write failure; rollback, successful retry, and no duplicate email. |
| Returns/cancellations display success before completion | Actions return promises; book details and WebMCP await them. Pending/failed operations do not announce success. | React interaction tests for pending and rejected actions, actual cancellation button feedback, and successful cancellation. |
| Logout looks successful after HTTP/network failure | Local authentication clears only after a validated logout response. Failed logout preserves the visible session and provides recovery guidance. Old refresh responses cannot restore a signed-out session. | HTTP failure, network failure, success, and concurrent refresh tests; actual local-browser logout and sign-in recovery. |
| A committed mutation returns 500 if notification dispatch fails | Delivery runs under Worker `waitUntil` with its own error logging; the transactional outbox remains the durable retry source. | Mutation response succeeds when dispatch rejects or remains pending; rejected domain mutations do not dispatch. |
| Failed refresh is overwritten by a success message | Refresh failures propagate; committed mutations surface a distinct saved-but-stale result. Recovery refreshes data without resending the mutation. | Every circulation action tested with successful mutation followed by failed refresh; retry request count verified. |
| Errors are visually hidden, including failed bootstrap | Persistent visible error panel, separate bootstrap loading/error states, retry controls, and safe copyable diagnostics. Render exceptions and unexpected event/promise errors have recovery UI. | React DOM tests, real local-browser profile validation failure, request ID inspection, copy-button feedback, and a 390 × 844 viewport check without horizontal overflow. |
| Database outages masquerade as authentication failures | Membership lookup propagates infrastructure errors; cover/ISBN endpoints return logged 503 responses with request IDs. | Membership helper and all affected cover/ISBN route entrypoints tested with injected database outages. |
| OAuth failures return to unexplained sign-in screen | Callback/start errors redirect to the sign-in UI with a safe error code and request reference. Consumed diagnostic query parameters are removed. Provider-loading failures have a separate retry flow. | Redirect contract and React UI tests; actual local callback failure and recovery in the browser. |

The re-audit also identified and fixed related recovery issues:

- Reminder retries used the mutable delivery/lease timestamp as their schedule origin. The original cadence now comes from the loan, with regression coverage.
- Later outbox rows could inherit an old batch-start lease after earlier deliveries were slow. Each claim now obtains a fresh lease; a clock-controlled regression verifies it.
- Retrying a failed notification-disable action could enable notifications again. Retry now rechecks the current status; a React test verifies it never calls subscribe.
- Cover-upload preflight/body-read failures and push routes had incomplete response tracing. They now produce handled responses and request references.
- Provider/hook hot updates could temporarily create mismatched React contexts. Context identity now lives in a separate module; both an automated mixed-version test and an actual browser hot update pass without new runtime errors.
- Client requests and email/SMS sends lacked explicit deadlines. Client deadlines cover headers and response bodies, retain available request IDs, and never automatically repeat mutations.

User-facing failures provide Korean/English guidance and a details block containing operation, error code, HTTP status, timestamp, and the server request ID when available. The copy control has a selectable-text/screenshot fallback. Diagnostics exclude arbitrary exception messages, response bodies, tokens, and user-entered values. Book lookup, uploads, push settings, and authentication use the shared reporting flow; existing input/camera validation still gives local corrective instructions.

Validation completed:

- `npm test`: **147 passed, 0 failed**, including **27 new regression tests**. Some tests exercise multiple error/status/action combinations.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Local-browser checks: profile rejection and diagnostics, logout, OAuth error redirect, sign-in recovery, mobile error-panel layout, a clean final load, and a provider hot update with no new runtime errors. The original local preview identity was restored.

Provider failure tests use controlled responses; no production email, SMS, Web Push delivery, or successful live Kakao OAuth exchange was attempted. D1 transaction failure tests execute SQL against in-memory SQLite through a D1-compatible adapter. Existing production data was not inspected or repaired. The package audit reported only the existing Drizzle/esbuild development-tool advisory chain; no advisories were reported for the added DOM-test dependencies.

Regression suites: [React interaction and recovery](../tests/app-errors.test.ts), [client error contracts](../tests/client-errors.test.ts), [server error contracts](../tests/server-errors.test.ts), [outbox transaction recovery](../tests/outbox-recovery.test.ts).

## Follow-up: browser error tracing

A user report exposed a gap in the original diagnostic coverage: `unexpected-action` exceptions had neither server references nor useful exception locations. Browser reports now have a stable per-exception client trace, error class, code locations, and explicit report-delivery state. Render boundaries preserve the original exception's locations and server digest; promise and event errors have separate operation labels. The panel sends a bounded, sanitized report to first-party Worker logs, and failed reporting never interrupts recovery or recursively reports itself. Original HTTP request IDs remain separate from browser IDs and diagnostic-upload request IDs.

The [diagnostics regression suite](../tests/client-diagnostics.test.ts) covers trace uniqueness/stability, source redaction, browser-to-server correlation, deduplication, offline/HTTP/timeout failures, body/origin validation, and reporting limits. React tests verify render/promise/event coverage, clipboard contents, and receipt races. See the [logging runbook](production-runbook.md#7-logging-and-debugging) for lookup instructions and offline/retention limitations.

Follow-up validation: all **163 tests pass**, including eight added tracing/UI tests; typecheck, lint, and production build pass. Stack fixtures cover Chrome and Firefox/Safari formats. No production log delivery was exercised and these changes have not been deployed.
