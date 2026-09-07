import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseIsbn } from '../lib/isbn/isbn.ts';
import { isFullerDescription } from '../lib/books/descriptions.ts';

export interface DescriptionRepair {
  isbn13: string;
  expected_description: string;
  description: string;
  source_url: string;
}

/** Generates SQL for review only. Does not connect to any database. */
export function descriptionRepairSql(rows: DescriptionRepair[]) {
  const seen = new Set<string>();
  const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
  return (
    rows
      .map((row) => {
        if (
          parseIsbn(row.isbn13)?.isbn13 !== row.isbn13 ||
          seen.has(row.isbn13) ||
          typeof row.expected_description !== 'string' ||
          typeof row.description !== 'string' ||
          !isFullerDescription(row.expected_description, row.description) ||
          !row.source_url?.startsWith('https://')
        )
          throw new Error('Invalid or duplicate description repair.');
        seen.add(row.isbn13);
        const guard = `isbn13 = ${quote(row.isbn13)} AND description = ${quote(row.expected_description)}
AND json_extract(field_provenance_json, '$.description') = 'kakao-books'`;
        // Update only copies still holding the exact imported snippet. Explicit
        // clears, owner edits, archives, and concurrent changes are preserved.
        return `UPDATE catalog_items
SET metadata_overrides_json = json_set(metadata_overrides_json, '$.description', ${quote(row.description)}, '$.descriptionProvenance', json_object('description', 'yes24-reviewed', 'descriptionUrl', ${quote(row.source_url)})),
version = version + 1, updated_at = unixepoch() * 1000
WHERE archived_at IS NULL AND status <> 'archived'
AND COALESCE(json_extract(metadata_overrides_json, '$.descriptionEdited'), 0) = 0
AND json_extract(metadata_overrides_json, '$.description') = ${quote(row.expected_description)}
AND edition_id IN (SELECT id FROM book_editions WHERE ${guard});
--> statement-breakpoint
UPDATE book_editions
SET description = ${quote(row.description)},
field_provenance_json = json_set(field_provenance_json, '$.description', 'yes24-reviewed', '$.descriptionUrl', ${quote(row.source_url)})
WHERE ${guard}
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');`;
      })
      .join('\n--> statement-breakpoint\n') + '\n'
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../docs/audits/2026-09-06-description-repair.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { rows: DescriptionRepair[] };
  const sql = descriptionRepairSql(audit.rows);
  process.stdout.write(
    process.argv.includes('--sql')
      ? sql
      : `Dry run: ${audit.rows.length} verified ISBN repair(s). No database changes. Use --sql to emit guarded SQL.\n`,
  );
}
