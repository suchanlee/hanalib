# Description system validation

Implemented and tested against a fresh read-only snapshot of production: **119 edition records, 124 copies, 115 active ISBNs**, September 7, 2026 UTC. No production deployment or catalog backfill was performed.

## System changes

The resolver now evaluates description quality as missing, invalid, catalog note/placeholder, likely snippet, short summary, or substantial description. This is a heuristic assessment, not proof of completeness. Terminal punctuation alone no longer causes a long description ending in credits or a list to lose to a short snippet. Publication notes can yield to synopses; substantially expanded summaries can be offered for review. The same decision functions are used by intake selection, owner refresh, and the audit runner.

Open Library work descriptions are now considered through a single explicit link from an exact-ISBN edition. Compatible title, non-conflicting author identifiers, and a known compatible language are required. Ambiguous links, unrelated titles, author conflicts, mismatched work keys, and unsupported languages are rejected. Edition-specific bibliographic fields remain separate. Markdown in work descriptions is normalized to plain text. Optional work-fetch failures preserve usable edition metadata.

Descriptions retain the selected provider, source URL, and whether the text came from an edition or a work. Owner refresh previews the replacement and its source before application and saving. Source changes are saved per copy. Manual corrections are marked as member text, stale provider URLs are removed, and owner changes are explicitly marked so the prepared repair migration cannot overwrite them—even when text is changed back to the original imported snippet. Existing records without edit history still require conservative exact-value guards.

All metadata candidates are filtered to the requested ISBN before stitching. Korean author transliterations no longer cause an English title to be labeled Korean by the Kakao/Naver normalizers.

## Catalog results

The revised resolver made **341 read-only Open Library requests**, covering edition, work, author, and search records. It found metadata for 62 ISBNs; 53 had no exact match through the existing lookup paths. Existing Google/Kakao descriptions were taken from the actual displayed copy data. Two values shortened by the database viewer were resolved using the complete production browser display.

A final offline replay against the captured responses produced the same **nine improvements**, without new network requests or per-ISBN rules:

| Book | Existing characters | Proposed characters | Source level |
|---|---:|---:|---|
| Fahrenheit 451 | 55 | 1,608 | Edition |
| The Baby-Sitters Club: Claudia and Mean Janine | 188 | 454 | Edition |
| Ray Bradbury's Fahrenheit 451 (graphic adaptation) | 244 | 311 | Edition |
| Understanding Exposure | 203 | 531 | Work |
| Eichmann in Jerusalem | 248 | 284 | Work |
| The Meaning of Marriage | 199 | 1,283 | Work |
| Kristy's Big Day | 91 | 465 | Edition |
| Small Things Like These | 249 | 347 | Work |
| Art of Simple Food | 250 | 1,044 | Work |

These include five replacements for weak descriptions and four expansions of short summaries. The graphic adaptation uses its own edition description, not the novel's synopsis.

The three previously identified long-description false positives—Spidey, Joshua Weissman, and The Year of Magical Thinking—are now treated as substantial descriptions and preserved.

| Quality assessment | Before lookup | After proposed replacements |
|---|---:|---:|
| Missing | 10 | 10 |
| Catalog note | 2 | 1 |
| Likely snippet | 55 | 51 |
| Short summary | 20 | 18 |
| Substantial | 28 | 35 |
| Total | 115 | 115 |

**62 descriptions remain unresolved**: 10 missing, one catalog note, and 51 likely snippets. None were filled with generated text or declared complete merely to improve coverage numbers. The pending one-ISBN manual repair was not used in this run.

## Validation

- **209 tests passed**, including exact ISBN matching, work relationship/language guards, provider failure, catalog-note replacement, long-description preservation, source persistence, owner-edit protection, explicit clears, repeat-safe repair SQL, and stale preview behavior.
- Typecheck, lint, and production build passed.
- Real local browser/API/SQLite: Fahrenheit 451's publication note was replaced using a live 1,608-character edition synopsis after preview and explicit application.
- Real local browser/API/SQLite: Small Things Like These received its live 347-character linked-work synopsis; the original 249-character text stayed untouched until application. After save and reload, expansion displayed the complete ending with no clipping. SQLite verification confirmed `open-library`, the work URL, work scope, and the owner-edit marker on that copy.
- Earlier long-description persistence tests remain in the suite; the 50,000-character boundary still rejects oversized input instead of silently shortening it.

## Coverage boundary and reproduction

Production Google Books and Kakao secret keys were not available in the local environment. Their **stored descriptions** were replayed; their live APIs were **not** exhaustively re-queried. This report does not imply they lack better current data for the unresolved books. Fresh checks of those configured providers remain necessary before claiming complete provider coverage. No credentials were extracted from browser sessions.

The reusable runner uses the application resolver and accepts the normal provider environment variables when available:

```bash
node --experimental-strip-types scripts/audit-book-descriptions.ts \
  --snapshot /path/to/book-only-snapshot.json \
  --out /tmp/description-audit.json \
  --cache /tmp/provider-responses.json
```

Add `--offline` to replay captured responses without network access. The snapshot has `books` and `copies` arrays; descriptions must be complete, and copy overrides take precedence. The runner never connects to or mutates the production database. Full text and provider responses stay in local audit artifacts; the committed JSON report contains book-level metrics, provenance, statuses, and source hashes.

See `2026-09-07-description-system-validation.json` for all 115 results. The next release remains subject to the repository's explicit deployment approval rule.
