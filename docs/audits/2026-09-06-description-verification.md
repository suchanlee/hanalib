# Description repair verification — 2026-09-06

## Source evidence

For **성을 알면 달라지는 것들**, ISBN **9788932817842**:

- The production edition contains a 250-character Kakao Books snippet ending mid-sentence.
- A signed-in, read-only request to production `/api/isbn/google-books?isbn=9788932817842` returned HTTP 200, the exact ISBN and `source: google-books`, but **no description**. This verifies the configured production source; an earlier unauthenticated quota error did not establish absence.
- Open Library's exact ISBN lookup returned 404.
- [YES24's exact edition](https://www.yes24.com/Product/Goods/94971414) contains the matching introduction with its complete ending: 290 characters. The reviewed repair is in `2026-09-06-description-repair.json`.
- Aladin's basic description is a summary. Its full-description fields require additional access; no Aladin key is currently configured. The different-ISBN IVP publisher page was not used as exact-edition evidence.

## Changes

- Select exact-ISBN descriptions using book language, likely completeness, length, then provider priority. Include Aladin and compare descriptions across matching Google volumes. Preserve source provenance and paragraph boundaries.
- Remove intake's silent 5,000-character truncation. Creation and editing accept up to 50,000 characters; oversized API input is rejected rather than silently shortened.
- Allow description editing during intake and offer fuller-description lookup in the owner editor. A result is previewed and requires the owner to apply it before saving. Concurrent owner edits invalidate the preview.
- On a successful provider lookup, preserve a fuller, sourced shared description for an active copy in the member's community. This avoids replacing a reviewed repair with the same short provider snippet on subsequent intake.
- Migration `0010_description_repair.sql` repairs the verified ISBN only when its existing shared description and Kakao provenance still match. Copy overrides change only when they contain the exact imported snippet. Owner corrections and explicit clears remain intact. The migration is repeat-safe.

Completeness selection is a heuristic, not a guarantee that an upstream description contains all publisher text. Unknown missing endings are never generated or combined from different languages. The migration repairs the specifically verified book; it does not claim a complete description exists for every catalog title.

## Verification

- Full automated suite: **202 tests passed**. Includes provider selection, exact ISBN and language matching, HTML normalization, long-description resolver/persistence round trips, invalid input, migration guards/idempotence, lookup provenance, and preview/concurrent-edit behavior.
- TypeScript check, lint, and production build passed.
- Real local browser + application API + SQLite: seeded the reported book with the original 250-character snippet, applied the actual migration, reloaded, expanded, and verified the complete 290-character ending.
- Through the owner editor, saved a **5,781-character** description, reloaded from the server, expanded it, and verified both the exact length and final sentence. Expanded element height equaled scroll height, confirming no remaining visual clipping.
- Restored the reviewed 290-character text through the editor and visually checked the expanded Korean mobile layout.
- Preview/apply and stale-response protection were verified in component tests with the provider boundary mocked; these are not claimed as a live-provider browser test.

## Release status

No production application deployment or production book mutation was performed. Migration 0010 is included for the next explicitly authorized Sites release. Follow `docs/production-runbook.md`, including its release validation and production verification steps. The source checks used the existing signed-in account; its Korean language preference was restored afterward.
