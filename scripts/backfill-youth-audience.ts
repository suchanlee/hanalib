import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { reviewedYouthEditions } from '../lib/books/audience.ts';
import { parseIsbn } from '../lib/isbn/isbn.ts';

/** Generate reviewable SQL only. Never connects to or modifies production. */
export function youthBackfillSql(
  rows: Array<{ isbn13: string; isYouthBook: boolean }>,
) {
  const isbns = [
    ...new Set([
      ...rows.filter((r) => r.isYouthBook).map((r) => r.isbn13),
      ...Object.keys(reviewedYouthEditions),
    ]),
  ];
  if (isbns.some((isbn) => parseIsbn(isbn)?.isbn13 !== isbn))
    throw new Error('Invalid ISBN in audience review');
  return (
    isbns
      .map(
        (isbn) => `UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '${isbn}' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '${isbn}')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;`,
      )
      .join('\n') + '\n'
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error('Usage: backfill-youth-audience.ts audit.json output.sql');
  const audit = JSON.parse(readFileSync(input, 'utf8')) as {
    rows: Array<{ isbn13: string; isYouthBook: boolean }>;
  };
  writeFileSync(output, youthBackfillSql(audit.rows));
}
