# Retrieval fixes: catalog validation

Implemented the confirmed retrieval fixes and evaluated them against the same saved production snapshot of **115 active ISBNs**. No production deployment, migration, or catalog backfill was performed.

## Outcome

- **12 proposed improvements**, up from nine.
- All **nine previous proposed descriptions remain text-identical**.
- Three additional descriptions recovered and individually reviewed below.
- No replacement proposed for the other **103** records. This includes unresolved descriptions; it does not mean all 103 are complete.
- The final offline replay completed with **zero cache misses** and zero network requests. The preceding enrichment run reused existing responses and made **75 additional public Open Library requests**. The earlier 30 edition-list probes were reused from cache.

| Book | Current → proposed characters | Selected source | Manual assessment |
|---|---:|---|---|
| Love Wins, 9780062049643 | 250 → 1,387 | [Exact-ISBN alternative edition](https://openlibrary.org/books/OL24609716M) | A full publisher-attributed synopsis replaces an unfinished question. The alternative edition explicitly supplies English and the same ISBN. The richer edition description is retained rather than replaced by the shorter work synopsis. |
| The Baby-Sitter's Club: The Truth About Stacey, 9780545813891 | 161 → 446 | [Explicitly linked work](https://openlibrary.org/works/OL8756332W) | The text describes the same diabetes, new-town, and rival-club storyline and explicitly identifies the graphic novel series. Raina Telgemeier's author evidence corroborates the series-prefix title variant. The existing short summary is readable; this is an expansion. |
| Mary Anne saves the day, 9780545886215 | 188 → 630 | [Explicitly linked work](https://openlibrary.org/works/OL8117954W) | The replacement concerns Mary Anne's friendship conflict and babysitting predicament. The existing catalog text instead describes Claudia considering leaving the club for art. An alternative exact-ISBN edition corroborates English, Raina Telgemeier, and the graphic-novel format. This also corrects an apparent wrong-story description missed by the earlier length-based audit. |

These are review results, not silently applied repairs. Full provider prose remains in local audit artifacts; the JSON report contains metrics, source links, diagnostics, and implementation hashes.

## Implemented behavior

**Open Library:** retain edition/work evidence until comparison; discover at most three edition details when the ISBN endpoint yields no valid edition; for a weak description, inspect at most one 100-record page of the explicit work's editions and evaluate up to three same-ISBN alternatives. Alternatives must repeat the work link and matching title, with no known author or language conflict. Conflicting language evidence is rejected. Matching alternative records can corroborate language and supply descriptions without replacing the primary edition's publisher or year.

**Title matching:** colon-separated title variants require corroborated authors in addition to an explicit work link. This handles the observed series prefix without unrestricted substring matching. Known adaptation mismatches, author conflicts, different languages, and mixed-language paragraphs remain rejected. Plural “Graphic novels” subjects are recognized.

**Google Books:** preserve volume IDs and description provenance. When the first result lacks a substantial description, query the equivalent ISBN-10 and, if still needed, up to three exact-matching volume details. Revalidate both the volume ID and ISBN on each detail. Keep candidate ordering deterministic despite parallel requests. Strong initial descriptions avoid the extra queries.

**Failures and latency:** edition, work, search, detail, selection, and budget outcomes are retained. At most one transient retry per request; HTTP 429 stops further enrichment for that provider. Requests share the configured provider deadline (8 seconds in the application route, capped at 15 seconds). Missing-language corroboration starts concurrently with work retrieval, and slow search does not prevent edition enrichment from starting. Useful metadata survives partial failure, with provider status `partial` rather than misleading `ok` or `not-found`.

The authenticated lookup exposes a bounded diagnostic summary in `x-hana-retrieval-diagnostics`; complete stage events are retained by the audit runner. Diagnostics omit credentials and request URLs. Offline cache misses are explicit and make the audit incomplete rather than masquerading as provider absence.

## Validation

- **220 tests passed**; type checking, lint, and production build passed.
- Added tests for same-ISBN corroboration, conflicting identifiers/work/authors/languages, series prefixes, adaptations and mixed-language text, discovery after ISBN misses, transient recovery and persistent partial failures, Google fallback/detail limits and identity checks, quota handling, and nonblocking search/enrichment ordering.
- The 115-record final replay preserved all prior suggestions and selected exactly the three additional candidates above. Korean *이처럼 사소한 것들*, mixed-language *Norwegian Wood*, and the previously identified valid long descriptions received no new replacement.
- **Real local browser and live provider requests:** Love Wins's 250-character draft stayed unchanged until explicit application of the 1,387-character edition preview; its source link matched the selected edition. Save, reload, and expansion retained the full text.
- **Real local browser and live provider requests:** Mary Anne's 188-character draft stayed unchanged until explicit application of the 630-character work preview; its source link matched the work. Save, reload, and expansion retained the full text.
- SQLite verification confirmed both descriptions exactly matched the reviewed proposals, their edition/work provenance persisted per copy, and `descriptionEdited` remained true. The two newly created local test copies and editions were removed after verification.
- Live testing exposed an initial deadline failure, prompting the request-ordering fix and its regression test. A later live response still demonstrated a partial upstream failure while successfully returning the alternative edition synopsis. Public-source latency remains variable; bounded retrieval is not a guarantee that every live call returns every candidate.

## Remaining coverage boundary

No Google Books, Kakao, Aladin, NLK, or Naver provider credentials are configured in the local environment. The catalog evaluation used fresh/cached Open Library data and stored Google/Kakao descriptions. The prior fresh unauthenticated Google probe received HTTP 429; no attempt was made to evade its quota. Google enrichment is implemented and tested with controlled responses, but **fresh authenticated Google/Kakao catalog coverage is still unverified**. No new missing description was filled by this run.

The quality heuristic itself has not been replaced by the manual judgments. Its raw unresolved count is still 61 after proposed replacements and must not be presented as 61 confirmed defects. See the separate manual review for the acceptable synopsis, readable excerpts, and confirmed cuts.

Reproduction uses `scripts/audit-book-descriptions.ts` with the complete book/copy snapshot and response cache; `--offline` validates captured responses without external requests. The adjacent JSON records every catalog decision and source hash.
