# Kids & teens audience

The binary database field is `book_editions.is_youth_book` (SQLite 0/1, default false). The TypeScript/API field is `isYouthBook`. UI labels are **Kids & teens** / **어린이·청소년**, including preschool, children, middle-grade, and young-adult/teen books. This describes intended audience, not an age-specific content rating. False means not marked as youth, including books with missing audience evidence; the toggle shows marked youth books when on and excludes them when off. Unclassified books remain visible when off.

Genre and audience are independent. Intake suggests the flag from explicit existing provider category/subject metadata such as Juvenile Fiction, Young Adult Fiction, 어린이, 유아, or 청소년. Titles, plots, parenting topics, school popularity, and the reader's UI language do not determine it. No additional provider calls are added to lookup. Three reviewed exact ISBN exceptions fill known metadata gaps; their source records are recorded in `lib/books/audience.ts`.

Owners can change the flag during intake or editing. Corrections are per copy in `metadata_overrides_json.isYouthBook`, with `youthSource: member`, and take precedence over the shared edition field. Unrelated edits preserve false as well as true. Provider suggestions retain their source in field provenance. Description hydration does not alter audience corrections.

## Current catalog review

The live Google Books check covered 116 catalog ISBNs and found 17 explicit positive audience classifications. Some requests returned no record or failed within the 1.5-second audit budget; absence of evidence is not an adult classification. The adjacent audience audit records raw categories and retrieval outcomes.

Reviewed additional positives:

- **The Truth About Stacey**, 9780545813891: children's Baby-Sitters Club graphic novel; source category was only Babysitters. Exact edition: https://openlibrary.org/isbn/9780545813891
- **Who Was? and What Is? America Collection Boxed Set**, 9780593089781: children's history/biography series collection. Exact edition: https://openlibrary.org/books/OL60370716M
- **Nickelodeon PAW Patrol**, 9781606852545: LeapReader early-reading book, The Great Robot Rescue. Exact edition: https://openlibrary.org/books/OL46904158M

These give 20 reviewed positive flags. This is an initial evidence-based pass, not proof that all other 96 books are adult-only. Owners can correct omissions, including crossover books.

## Release and backfill

Migration `0012_amusing_la_nuit.sql` adds the field and applies the 20 reviewed positive flags during deployment. The included catalog update is generated with:

```sh
node --experimental-strip-types scripts/backfill-youth-audience.ts docs/audits/2026-09-07-youth-audience.json /tmp/hanalib-youth-backfill.sql
```

The generator never connects to production. It only marks reviewed positives, preserves member overrides, and avoids bumping copy versions on repeated application. The migration includes this update so existing catalog books are classified on release. Local sample copies are not included.

The catalog toggle is remembered in browser local storage (`youth` or `general`; the legacy `all` value restores as `general`). Youth mode uses a sky-blue theme and decorative shapes; other active filters appear as individually removable tags.
