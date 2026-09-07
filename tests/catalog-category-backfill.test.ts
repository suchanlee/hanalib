import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { catalogCategoryBackfillSql } from '../scripts/backfill-catalog-categories.ts';
import { validBookCategories, type BookCategories } from '../lib/books/categories.ts';

void test('catalog repair matches the audit and preserves corrections on repeat application', () => {
  const audit = JSON.parse(readFileSync(new URL('../docs/audits/2026-09-07-catalog-categories.json', import.meta.url), 'utf8')) as { rows: Array<{ isbn13: string; categories: BookCategories }> };
  const sql = readFileSync(new URL('../drizzle/0013_catalog_categories_backfill.sql', import.meta.url), 'utf8');
  assert.equal(sql, catalogCategoryBackfillSql(audit.rows));
  assert.equal(audit.rows.length, 116);
  assert.equal(audit.rows.filter((r) => r.categories.codes.length > 0).length, 115);
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE book_editions (id TEXT, isbn13 TEXT, categories_json TEXT); CREATE TABLE catalog_items (edition_id TEXT, archived_at INTEGER, status TEXT, metadata_overrides_json TEXT);');
  for (const row of audit.rows) {
    assert.ok(validBookCategories(row.categories));
    db.prepare('INSERT INTO book_editions VALUES (?, ?, NULL)').run(row.isbn13, row.isbn13);
    db.prepare("INSERT INTO catalog_items VALUES (?, NULL, 'available', '{}')").run(row.isbn13);
  }
  const preserved = JSON.stringify({ version: 1, status: 'confirmed', codes: ['FF'], evidence: [] });
  const first = audit.rows[0].isbn13;
  db.prepare('UPDATE book_editions SET categories_json = ? WHERE isbn13 = ?').run(preserved, first);
  db.prepare('UPDATE catalog_items SET metadata_overrides_json = ? WHERE edition_id = ?').run(JSON.stringify({categories: JSON.parse(preserved)}), audit.rows[1].isbn13);
  db.prepare("UPDATE catalog_items SET status = 'archived' WHERE edition_id = ?").run(audit.rows[2].isbn13);
  const copiesBefore = db.prepare('SELECT * FROM catalog_items').all();
  db.exec(sql);
  assert.equal(db.prepare('SELECT categories_json FROM book_editions WHERE isbn13 = ?').get(first)?.categories_json, preserved);
  assert.equal(db.prepare('SELECT categories_json FROM book_editions WHERE isbn13 = ?').get(audit.rows[2].isbn13)?.categories_json, null);
  assert.deepEqual(db.prepare('SELECT * FROM catalog_items').all(), copiesBefore);
  const after = db.prepare('SELECT * FROM book_editions').all();
  db.exec(sql);
  assert.deepEqual(db.prepare('SELECT * FROM book_editions').all(), after);
  db.close();
});
