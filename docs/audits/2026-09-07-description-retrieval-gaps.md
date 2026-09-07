# Description retrieval gaps

Investigated the revised resolver against all 115 books in the saved September 7, 2026 UTC production snapshot. Replayed the captured Open Library responses through the actual resolver, traced work-description rejection reasons, and made 30 additional read-only work-editions requests for remaining short, missing, snippet, and note records with known work links. Each request was capped at 100 editions; none reached that cap or returned a next-page link. One fresh unauthenticated Google Books request returned HTTP 429; further Google requests were stopped. No runtime code, catalog data, or deployment changed.

## Three additional recovery candidates already present in fetched work data

| Catalog book | ISBN | Stored characters | Usable work text characters | Why the resolver misses it |
|---|---|---:|---:|---|
| Love Wins | 9780062049643 | 250 | 1,194 | The selected edition lacks language; work text is discarded before corroboration. |
| Mary Anne saves the day | 9780545886215 | 188 | 630 | The selected edition lacks language; another exact-ISBN edition supplies it. |
| The Baby-Sitter's Club: The Truth About Stacey | 9780545813891 | 161 | 446 | Edition title has a series prefix; the linked work title does not. |

Lengths are normalized plain text. These are additional to the prior nine proposed improvements. Mary Anne and Stacey were previously classified as short summaries, so inspecting only the 52 manual-review flags would have missed them. They are expansion candidates, not new claims that their current summaries are broken.

For each book, an isolated diagnostic replay changed just the blocking field in a copied response: language for Love Wins/Mary Anne, title for Stacey. The unchanged resolver then returned the work description (0 → 1,194, 0 → 630, and 0 → 446 provider-description characters). No fixture substitution was applied to real data. This establishes the rejection point, not a recommendation to fabricate language or rewrite titles.

## 1. One ISBN endpoint result is treated as the only edition

The resolver queries `/isbn/{isbn}.json` once. Its search request omits work/edition identifiers, so search cannot guide it to richer matching records. It never enumerates alternative editions for the same ISBN.

Fresh exact-ISBN checks confirmed:

- **Love Wins:** selected `/books/OL24614589M` has no description/language. `/books/OL24609716M` lists the same ISBN, English, and a 1,387-character edition synopsis. Both link to `/works/OL15678650W`, which also has the 1,194-character description. [Alternative edition](https://openlibrary.org/books/OL24609716M), [edition enumeration](https://openlibrary.org/works/OL15678650W/editions.json?limit=100).
- **Mary Anne saves the day:** selected `/books/OL27913164M` lacks language. `/books/OL26885615M` lists the same ISBN, English, Raina Telgemeier, and explicitly identifies the graphic novel. Both link to `/works/OL8117954W`. This provides edition evidence for the existing work fallback. [Alternative edition](https://openlibrary.org/books/OL26885615M), [edition enumeration](https://openlibrary.org/works/OL8117954W/editions.json?limit=100).

Next change: retain matching edition IDs, fetch a bounded number when descriptions or necessary corroborating fields are missing, and verify the ISBN on each detail record. Prefer a verified edition description; corroborate a work description using matching edition evidence. Do not substitute aggregate work-language lists for edition language: the [Open Library search documentation](https://openlibrary.org/dev/docs/api/search) explicitly distinguishes works from matching editions.

## 2. Work matching happens too early and title normalization is asymmetric

[Language/title gate](../../lib/isbn/server-lookup.ts) currently requires language from the first edition before search or other-provider information can be considered. The later metadata merge cannot recover a work description already discarded.

For Stacey, the stored exact-ISBN edition title is `The Baby-Sitter's Club: The Truth About Stacey`, while its explicitly linked work is `The Truth About Stacey`. The work description explicitly identifies the graphic novel series, and the work author is Raina Telgemeier. The code strips a colon suffix only from the work title, not a corroborated series prefix from the edition. [Linked work](https://openlibrary.org/works/OL8756332W).

Next change: preserve raw candidate evidence through identity/language corroboration. Support structurally justified series/subtitle differences only alongside explicit work linkage and author/adaptation evidence. Avoid unrestricted substring matching.

## 3. Google stops after finding any title and never fetches volume details

`fetchGoogleBooksMetadata` returns immediately when ISBN-13 search produces a normalized title, even if there is no description. ISBN-10 is attempted only when the entire first candidate is absent. The response type also drops volume IDs; no `/volumes/{id}` request exists.

A synthetic exact-ISBN, title-only response reproduced one search request and a null description: no ISBN-10 query and no detail request. This is a confirmed code-path limitation. It does **not** establish how many production books those extra requests would improve. Google documents a [volume-detail endpoint](https://developers.google.com/books/docs/v1/reference/volumes/get); list and detail responses can overlap, so details are not assumed to be richer in every case.

The previous manual review found a fuller public Google Books description for the exact ISBN of [Learning to See Creatively](https://books.google.com/books/about/Learning_to_See_Creatively.html?hl=en&id=gpvZgl13d5MC&output=html_text). The fresh API probe for that ISBN returned HTTP 429 quota exhaustion. The discovered volume-detail request was not sent after that failure. Production-authenticated Google and Kakao coverage remains unmeasured.

Next change: preserve Google volume IDs and exact identifiers; when description quality is inadequate, compare bounded ISBN-10 search and matching volume-detail candidates. Record quota failures separately from absent descriptions. Do not assume another query or a public page guarantees a useful API response.

## 4. Partial failures look like absence or success

Two synthetic failures reproduced misleading status values in the real resolver:

| Simulated condition | Current result |
|---|---|
| Edition request throws; search returns no records | `open-library: not-found`, although edition lookup failed |
| Edition metadata succeeds; linked work request throws | `open-library: ok`, although description retrieval failed |

Work errors are swallowed, while edition errors are propagated only when search also throws. The outer retry checks missing authors/publisher/page count/cover rather than description quality. It also cannot retry failures already hidden by the adapter.

Next change: keep per-stage outcomes (edition, work, search, detail), whether text was present, and rejection reasons. Preserve usable metadata but expose incomplete retrieval. Retry transient description-stage failures within a bounded budget; do not retry quota exhaustion blindly.

## Boundaries: rejected data is not always a retrieval gap

The cached ISBN path returned editions for 62 books and 404 for 53. All 62 editions had a linked work; 34 linked works had no description, while 28 had some text. The rejection-reason totals in the accompanying JSON overlap and are **not** counts of recoverable books.

- **이처럼 사소한 것들:** linked work text is English, while the edition is Korean. Keeping it out is appropriate.
- **Norwegian Wood:** work text combines English and Spanish. Removing the missing-language guard blindly could admit mixed-language content.
- **The Food Lab:** the fetched edition/work “description” is a physical-size note, not a synopsis. Alternative same-ISBN records checked did not supply a fuller synopsis.
- **Learning to See Creatively, Engineering in Plain Sight, and Age of Entanglement:** fetched work records lack descriptions. Their problem cannot be fixed by loosening the current work gate alone.

The 30 work-editions probes establish two useful same-ISBN alternatives above. They are not an exhaustive search across every duplicate work, every ISBN alias, or other providers. No missing descriptions were newly filled during this investigation.

## Recommended implementation order

1. Add stage-level diagnostics and retain raw candidate identity/provenance.
2. Recover verified same-ISBN alternative editions and corroborate missing language.
3. Handle evidenced series-title differences, with adaptation and translation controls.
4. Add bounded Google ISBN-10/detail enrichment and run authenticated provider evaluation.

Keep the three concrete candidates and the negative controls above in the catalog evaluation. Passing the existing unit suite does not establish provider coverage.
