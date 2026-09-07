# Expanded production description audit

Checked September 6, 2026 Pacific / September 7 UTC. Read-only audit; no deployment or production data changes.

**Verdict: the current patch fixes storage truncation, but its description quality and recovery logic is not sufficient for the larger catalog.**

## Scope and counts

Read every page of `book_editions` and `catalog_items`: 119 edition records, 124 copies, 115 active copies representing 115 ISBNs. Used the descriptions displayed from copy overrides, not just shared edition records. This matters: two editions have no shared description but their active copies do contain snippets.

- **10 / 115 (8.7%)** displayed descriptions are missing.
- **58 / 115 (50.4%)** are flagged by `looksTruncated`. These are suspicions, not 58 independently verified truncations.
- 55 flagged descriptions are below 300 characters, mostly the roughly 250-character provider snippets.
- The other three flags are 676, 1,336, and 1,812 characters. They end with a book recommendation, review attribution, or bestseller date rather than unfinished prose. These demonstrate false positives.
- At least two unflagged descriptions are catalog/cover notes rather than useful synopses.

The Sites database viewer shortened one edition value and two copy-override JSON values. These were not treated as real book truncation: the full displayed descriptions for The Enlightenment (2,438 characters) and Joshua Weissman (1,812 characters) were verified through the production browser.

## Confirmed gaps

| Case | Production behavior and live evidence | Gap |
|---|---|---|
| Fahrenheit 451, 9781451673265 | Stored description is a publication-history note. Existing Open Library adapter returns a 1,608-character normalized synopsis for the exact edition. `isFullerDescription` rejects it. | Ending with punctuation is incorrectly treated as sufficient quality; the owner cannot preview the better result. New intake selection would improve it, but existing-copy refresh would not. |
| Small Things Like These, 9780571368709 | Copy has a 249-character promotional snippet. Exact Open Library edition links to a work containing a 347-character plot synopsis, yet our adapter returns no description. | The work is already fetched for subjects, but its description is discarded. |
| Eichmann in Jerusalem, 9780241552292 | Copy has a 248-character snippet. Exact edition links to a work with a 290-character description; adapter returns none. | Same missing work-description fallback. Stored book language is also Korean despite the English edition, which makes language ranking less reliable. |
| Hansons Marathon Method, 9781937715489 | Description is only a front-cover note; the heuristic labels it complete. The sampled Open Library edition and work lack descriptions. | Recognizing poor content and having replacement content are separate problems. |
| Spidey and His Amazing Friends: Electro's Gotta Glow; Joshua Weissman; The Year of Magical Thinking | Substantial descriptions end with recommended titles, a bestseller date, and a review attribution respectively. All are flagged. | Missing terminal punctuation is too strong a quality penalty; a shorter punctuated snippet could outrank these. |

Live sources: [Fahrenheit 451 exact edition](https://openlibrary.org/isbn/9781451673265.json), [Small Things Like These work](https://openlibrary.org/works/OL23020966W.json), [Eichmann in Jerusalem work](https://openlibrary.org/works/OL1386647W.json).

## Provider coverage limits

Queried exact Open Library editions and linked works for **12 deliberately selected cases**, including missing descriptions, short notes, English snippets, Korean snippets, and one long flagged description. This is a diagnostic sample, not a random sample or a provider-coverage estimate for all 115 books.

Ten editions returned 200, two returned 404. Three ISBNs had usable-looking English descriptions in edition/work records; the current adapter returns description text for only one of those three. Work-level fallback needs title/author relationship checks and language compatibility because a work can cover multiple editions and translations; it must not replace edition-specific bibliographic fields.

Seven existing editions had no description at either checked level. Google and Kakao were not re-queried across this expanded catalog, so this audit does **not** conclude their current data is absent. The earlier exact-ISBN production Google check remains evidence only for 성을 알면 달라지는 것들.

## Recommended next change

1. Use linked Open Library work descriptions when the exact edition lacks a useful description, with relationship/language checks and separate provenance.
2. Rank usable synopses above publication notes and cover slogans. Treat terminal punctuation as a weak clue; account for review credits, lists, and source snippet limits.
3. Let owners preview substantive improvements to weak descriptions even if the current text ends with a period. Preserve explicit application and save steps, and owner edits.
4. Audit and backfill existing copy overrides with exact-value guards. The current single-ISBN migration repairs only the previously verified book; changing lookup selection alone does not update the rest of production.
5. Re-run all 115 ISBNs through the revised resolver with configured production sources before estimating final recovery coverage. Keep unresolved cases explicit rather than inventing text.

Detailed book-level metrics and live adapter reproduction results are in `2026-09-06-description-expanded-catalog.json`. No application code was changed during this assessment.
