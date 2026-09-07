# Fast lookup and description hydration

Intake requests `/api/isbn/lookup?mode=fast` (the default). The resolver uses a shared 1,500 ms budget, reduced by time already spent authenticating and rate limiting. Completed provider results are retained when another provider times out. Fetches are aborted at the deadline; a wall-clock race also bounds stalled response bodies. Fast lookup makes one request per configured provider, uses Open Library search for basic metadata, and skips retries, alternate editions, work descriptions, and Google volume detail hydration. Any description supplied with basic metadata is retained.

The optional stored-description read stops waiting at 1,700 ms from request entry. The browser aborts the entire lookup, including reading the response body, at 1,900 ms. If no useful metadata arrives, existing manual-entry/error handling applies. These limits bound waiting; they do not guarantee successful metadata retrieval or rendering under two seconds on every connection. Production scan-to-form p95 has not been measured. Explicit owner description refresh uses `mode=enrich` and keeps the deeper retrieval path.

Creation writes a `description_jobs` row in the same D1 transaction as the new catalog item when the description is missing, invalid, a catalog note, truncated, or a short summary. Member-supplied descriptions and substantive descriptions are excluded. Each copy has at most one job; idempotent create retries do not duplicate jobs.

After creation, Cloudflare `waitUntil` starts that item's job without blocking the response. The existing authenticated `/api/jobs/notifications` scheduler also dispatches up to three due jobs per invocation, independently of notification processing. Its existing five-minute cadence recovers requests lost after commit, interrupted workers, and provider failures; no browser needs to stay open. No additional scheduler or secret is needed.

Jobs use atomic claims, a 60-second lease, and a unique lease token. Transient/incomplete retrieval retries at exponential intervals (one, two, then four minutes), serviced at scheduler cadence, for at most four retrieval attempts. Terminal jobs retain their outcome for inspection. A final interrupted attempt is marked exhausted after its lease expires. The scheduler's batch size bounds outbound work; a large backlog can take multiple ticks.

Hydration uses the existing exact-ISBN resolver and improvement checks, and additionally requires a description matching the copy's known Korean/English language. It writes only the created copy's description and source provenance. Other copies and shared edition metadata remain unchanged. The conditional write checks the copy version, manual-edit flag, archive status, and lease token. Concurrent edits win; a later attempt rereads the latest copy. The hydrated description appears on the next catalog refresh; no live push is added.

## Validation

Automated tests cover the real migrated SQLite schema, atomic enqueue and rollback, create idempotency, successful hydration/provenance, manual and concurrent edits, other-copy isolation, wrong-language rejection, retry backoff/exhaustion, overlapping workers, expired-lease recovery, stale-worker fencing, response-before-hydration, stalled providers/bodies, and the default 1.5-second resolver budget. Owner-triggered refresh remains on the enrichment path.

Release requires the generated `0011_volatile_micromax.sql` migration and the updated application. Follow the production runbook only after explicit deployment approval. Production data and scheduler configuration have not been changed by this implementation.
