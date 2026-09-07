import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseIsbn } from '../lib/isbn/isbn.ts';
import {
  validCategoryCodes,
  groupsForCodes,
  type BookCategories,
} from '../lib/books/categories.ts';

interface AuditRow {
  isbn13: string;
  proposed_codes: unknown;
  review_needed: boolean;
  aladin_category_paths: string[];
}

/** Produces reviewable SQL only. This script never connects to a database. */
export function categoryBackfillSql(rows: AuditRow[]) {
  const seen = new Set<string>();
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  return (
    rows
      .map((row) => {
        const isbn = parseIsbn(row.isbn13);
        if (
          !isbn ||
          isbn.isbn13 !== row.isbn13 ||
          seen.has(row.isbn13) ||
          !validCategoryCodes(row.proposed_codes) ||
          typeof row.review_needed !== 'boolean' ||
          !Array.isArray(row.aladin_category_paths) ||
          row.aladin_category_paths.some((s) => typeof s !== 'string')
        ) {
          throw new Error('Invalid or duplicate audit row.');
        }
        seen.add(row.isbn13);
        const categories: BookCategories = {
          version: 1,
          // The original audit reviewed primary placement. Discovery supports
          // every proposed category, so overlapping placements need no review.
          status: groupsForCodes(row.proposed_codes).length
            ? 'suggested'
            : 'review',
          codes: row.proposed_codes,
          evidence: [
            {
              source: 'audit',
              subjects: [
                '2026-09-06: assisted audit; not publisher-assigned Thema',
                ...row.aladin_category_paths,
              ]
                .slice(0, 30)
                .map((s) => s.slice(0, 500)),
            },
          ],
        };
        return `UPDATE book_editions SET categories_json = ${quote(JSON.stringify(categories))}
WHERE isbn13 = ${quote(row.isbn13)} AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL);`;
      })
      .join('\n\n') + '\n'
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../docs/audits/2026-09-06-thema-feasibility.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { rows: AuditRow[] };
  const sql = categoryBackfillSql(audit.rows);
  if (process.argv.includes('--sql')) process.stdout.write(sql);
  else
    process.stdout.write(
      `Dry run: ${audit.rows.length} ISBNs; ${audit.rows.filter((r) => !validCategoryCodes(r.proposed_codes) || !groupsForCodes(r.proposed_codes).length).length} need review under discovery policy. No database changes. Use --sql to emit the guarded backfill.\n`,
    );
}
