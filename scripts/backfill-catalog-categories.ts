import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validBookCategories, type BookCategories } from '../lib/books/categories.ts';
import { parseIsbn } from '../lib/isbn/isbn.ts';

/** Exact-ISBN, null-only repair. Existing edition and copy corrections take precedence. */
export function catalogCategoryBackfillSql(rows: Array<{ isbn13: string; categories: BookCategories }>) {
  const seen = new Set<string>();
  const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
  return rows.map((row) => {
    if (parseIsbn(row.isbn13)?.isbn13 !== row.isbn13 || seen.has(row.isbn13) || !validBookCategories(row.categories)) {
      throw new Error('Invalid or duplicate category audit row');
    }
    seen.add(row.isbn13);
    return `UPDATE book_editions SET categories_json = ${quote(JSON.stringify(row.categories))}
WHERE isbn13 = ${quote(row.isbn13)} AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');`;
  }).join('\n--> statement-breakpoint\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: backfill-catalog-categories.ts audit.json output.sql');
  const audit = JSON.parse(readFileSync(input, 'utf8'));
  writeFileSync(output, catalogCategoryBackfillSql(audit.rows));
}
