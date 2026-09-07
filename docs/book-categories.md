# Bilingual book categories

The catalog uses a small browsing vocabulary mapped to Thema 1.6 codes. The code is independent of language; Korean and English are display labels maintained in `lib/books/categories.ts`. These are application labels, not official translations of every Thema heading. Fiction includes its specific genres; biography includes memoir, and religion includes Christian faith.

ISBN lookup retains category evidence from Aladin, Google Books, and exact Open Library editions (including their linked work). `lib/books/classify.ts` conservatively maps category paths and explicit literary forms. It does not classify titles, plot keywords, awards, reading levels, or UI language. The results are inferred suggestions, not publisher-assigned Thema. This is a broad browsing system, not complete Thema coverage or a guarantee that different translations have identical provider metadata.

Categories have one of three states:

- `suggested`: all supported categories are usable in filters, visibly marked as suggested on book details. Overlapping or conflicting source categories are retained together; no primary category is required.
- `review`: no usable browsing category can be mapped from the evidence; included in “Uncategorized / needs review.” Owners can choose categories.
- `confirmed`: explicitly selected by the listing owner. An empty selection intentionally clears the listing's classification.

Owners can edit categories during intake and from the book detail editor. Their choices override shared edition suggestions for their listing only. Other edits preserve both explicit choices and inheritance from the edition. Books appear under each assigned category, including Comics & graphic novels / 만화·그래픽노블. The catalog category filter combines with existing language, owner, and availability filters. Search recognizes Korean and English category labels.

## Metadata setup

Configure optional `ALADIN_TTB_KEY` through the existing runtime secret mechanism. Local examples list it in `.dev.vars.example` and `.env.example`. Never commit the key. The adapter uses Aladin ItemLookUp with ISBN13, JSON output, and API version 20131101; it consumes the standard main `categoryName` field. It does not require the supplemental category-list agreement. Existing Google Books and Open Library sources remain available when Aladin is unconfigured or fails. Provider requests use existing bounded timeouts and exact ISBN matching.

The Aladin adapter is covered with mocked API responses; a live key is needed to validate live enrichment. Public-page evidence in the audit does not imply API coverage. No runtime HTML scraping is used.

## Existing catalog rollout

Deployment requires an explicit user request and must follow [the production runbook](production-runbook.md#9-repeatable-sites-release). This implementation does not change production data.

1. Apply migration `drizzle/0009_gorgeous_rumiko_fujikawa.sql` through the normal Sites release process before the new code serves catalog queries. It adds nullable `book_editions.categories_json`; existing listings remain usable and uncategorized until enriched.
2. Review [the production feasibility audit](audits/2026-09-06-thema-feasibility.md). Run `npm run categories:backfill` for a dry-run summary. Generate SQL with `npm run --silent categories:backfill -- --sql > /private/tmp/hanalib-category-backfill.sql`.
3. After explicit rollout authorization, apply the reviewed SQL through the existing production D1 workflow. The script itself never connects to a database. Updates match exact ISBNs, only fill null edition categories, and require an active copy. Reruns preserve existing classifications and listing overrides. Under the discovery policy, all 26 audited editions yield suggestions, including the five originally flagged for primary-category review; catalog changes since the audit can reduce the affected count.
4. Verify both UI languages, combined filters, and an owner correction during the authorized rollout. Configure Aladin separately when a key is available. No key is needed for the audited backfill.

The backfill preserves its audit provenance. Some proposals use reviewed public metadata beyond the live mapper; for example, the audit could identify science fiction from a synopsis. It does not claim those proposals came from the automated mapper. The original audit remains a historical record of its primary-category review concerns. For discovery, the backfill retains all its proposed codes: biography/memoir; faith and memoir; art and essays; history and science; and essays and comics. These are suggestions, not newly confirmed classifications. The live mapper still avoids unsupported topics, awards, and audience guesses; overlap alone does not block discovery.

Validation includes exact ISBN and ISBN10-equivalence checks, provider failure fallback, bilingual mapping, uncertainty handling, all SQL migrations against SQLite, listing ownership and override persistence, and repeat-safe audit backfill.
