import { youthBackfillSql } from '../scripts/backfill-youth-audience.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { D1LibraryRepository } from '../lib/persistence/d1-repository.ts';
import {
  confirmCategories,
  matchesCategory,
  parseBookCategories,
  type CategoryId,
  type BookCategories,
} from '../lib/books/categories.ts';
import { categoryBackfillSql } from '../scripts/backfill-book-categories.ts';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  sqlite.exec(`
    INSERT INTO communities (id,name,created_at) VALUES ('hana','Library',1);
    INSERT INTO profiles (id,display_name,display_name_ko,created_at,updated_at)
      VALUES ('owner','Owner','소유자',1,1), ('other','Other','다른 회원',1,1);
    INSERT INTO community_members (community_id,user_id,joined_at)
      VALUES ('hana','owner',1), ('hana','other',1);
  `);
  class Statement {
    sql: string;
    values: SQLInputValue[] = [];
    constructor(sql: string) {
      this.sql = sql;
    }
    bind(...values: SQLInputValue[]) {
      this.values = values;
      return this;
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.values) ?? null;
    }
    async all() {
      return { results: sqlite.prepare(this.sql).all(...this.values) };
    }
    async run() {
      return {
        meta: {
          changes: Number(sqlite.prepare(this.sql).run(...this.values).changes),
        },
      };
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sqlite, repository: new D1LibraryRepository(db) };
}

const context = {
  actorId: 'owner',
  communityId: 'hana',
  idempotencyKey: 'create-1',
};
const input = {
  isbn13: '9780676970050',
  title: 'The First Man',
  authors: ['Albert Camus'],
  publisher: 'Vintage',
  publishedYear: 1996,
  language: 'en' as const,
  condition: 'good' as const,
  provenance: {},
};

void test('migrated database preserves per-listing corrections, clears, and inherited categories', async () => {
  const { sqlite, repository } = fixture();
  try {
    const first = await repository.createCatalogItem(context, input);
    const other = await repository.createCatalogItem(
      { ...context, actorId: 'other', idempotencyKey: 'create-2' },
      input,
    );
    const shared: BookCategories = {
      version: 1,
      status: 'suggested',
      codes: ['FBC'],
      evidence: [],
    };
    const setShared = (value: BookCategories) =>
      sqlite
        .prepare('UPDATE book_editions SET categories_json = ?')
        .run(JSON.stringify(value));
    setShared(shared);
    await repository.updateCatalogItem(context, first.id, {
      condition: 'good',
      ownerNotes: 'A note',
    });
    setShared({ ...shared, codes: ['FBA'] });
    let catalog = await repository.listCatalog(context);
    assert.deepEqual(
      catalog.find((i) => i.id === first.id)?.edition.categories?.codes,
      ['FBA'],
      'unrelated edits must not freeze inherited metadata',
    );
    await repository.updateCatalogItem(context, first.id, {
      condition: 'good',
      categoryCodes: ['FF'],
    });
    await repository.updateCatalogItem(context, first.id, {
      condition: 'good',
      title: 'Edited title',
    });
    catalog = await repository.listCatalog(context);
    assert.deepEqual(
      catalog.find((i) => i.id === first.id)?.edition.categories,
      confirmCategories(['FF'], shared),
    );
    assert.deepEqual(
      catalog.find((i) => i.id === other.id)?.edition.categories?.codes,
      ['FBA'],
    );
    await assert.rejects(
      repository.updateCatalogItem(context, other.id, {
        condition: 'good',
        categoryCodes: ['FF'],
      }),
      /Only the owner/,
    );
    await repository.updateCatalogItem(context, first.id, {
      condition: 'good',
      categoryCodes: [],
    });
    setShared(shared);
    catalog = await repository.listCatalog(context);
    assert.deepEqual(
      catalog.find((i) => i.id === first.id)?.edition.categories?.codes,
      [],
      'an explicit clear overrides shared suggestions',
    );
  } finally {
    sqlite.close();
  }
});

void test('confirmed intake choices do not become shared edition classifications', async () => {
  const { sqlite, repository } = fixture();
  try {
    const item = await repository.createCatalogItem(context, {
      ...input,
      categories: confirmCategories(['FF']),
    });
    assert.equal(item.edition.categories?.status, 'confirmed');
    assert.equal(
      sqlite.prepare('SELECT categories_json FROM book_editions').get()
        ?.categories_json,
      null,
    );
  } finally {
    sqlite.close();
  }
});

void test('production audit backfill is repeat-safe and preserves existing classifications and archives', () => {
  const { sqlite } = fixture();
  try {
    const audit = JSON.parse(
      readFileSync(
        new URL(
          '../docs/audits/2026-09-06-thema-feasibility.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    for (const [index, row] of audit.rows.entries()) {
      sqlite
        .prepare('INSERT INTO book_editions (id,isbn13,title) VALUES (?,?,?)')
        .run(`edition-${index}`, row.isbn13, 'Test book');
      sqlite
        .prepare(
          'INSERT INTO catalog_items (id,community_id,edition_id,owner_id,created_at,updated_at) VALUES (?,?,?,?,1,1)',
        )
        .run(`copy-${index}`, 'hana', `edition-${index}`, 'owner');
    }
    const sql = categoryBackfillSql(audit.rows);
    sqlite.exec(sql);
    const counts = sqlite
      .prepare(
        "SELECT json_extract(categories_json,'$.status') AS status, count(*) AS n FROM book_editions GROUP BY status",
      )
      .all();
    assert.deepEqual(
      counts.map((r) => [r.status, r.n]),
      [['suggested', 26]],
    );
    const formerlyReviewed: [string, CategoryId[]][] = [
      ['9781583225752', ['biography']],
      ['9788932816135', ['religion', 'biography']],
      ['9791193238455', ['art', 'essays']],
      ['9780062464316', ['history', 'science']],
      ['9788997381678', ['essays', 'comics']],
    ];
    for (const [isbn, filters] of formerlyReviewed) {
      const row = sqlite
        .prepare('SELECT categories_json FROM book_editions WHERE isbn13 = ?')
        .get(isbn);
      const categories = parseBookCategories(row?.categories_json as string);
      assert.equal(categories?.status, 'suggested');
      for (const filter of filters)
        assert.ok(
          matchesCategory(categories, filter),
          `${isbn} must appear in ${filter}`,
        );
      assert.ok(!matchesCategory(categories, 'uncategorized'));
    }
    const corrected = JSON.stringify(confirmCategories(['FF']));
    sqlite
      .prepare('UPDATE book_editions SET categories_json = ? WHERE id = ?')
      .run(corrected, 'edition-0');
    sqlite.exec(
      "UPDATE book_editions SET categories_json = NULL WHERE id = 'edition-1'; UPDATE catalog_items SET archived_at = 1 WHERE edition_id = 'edition-1'",
    );
    sqlite.exec(sql);
    assert.equal(
      sqlite
        .prepare(
          "SELECT categories_json FROM book_editions WHERE id = 'edition-0'",
        )
        .get()?.categories_json,
      corrected,
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT categories_json FROM book_editions WHERE id = 'edition-1'",
        )
        .get()?.categories_json,
      null,
    );
    assert.throws(
      () => categoryBackfillSql([audit.rows[0], audit.rows[0]]),
      /duplicate/,
    );
  } finally {
    sqlite.close();
  }
});

void test('descriptions longer than the old 5000-character cap survive creation and owner updates', async () => {
  const { sqlite, repository } = fixture();
  try {
    const description =
      'A complete paragraph. '.repeat(300) + 'Creation ending.';
    const item = await repository.createCatalogItem(context, {
      ...input,
      description,
    });
    assert.equal(item.edition.description, description);
    const updated = description + '\n\nUpdated final sentence.';
    await repository.updateCatalogItem(context, item.id, {
      condition: 'good',
      description: updated,
    });
    assert.equal(
      (await repository.listCatalog(context))[0].edition.description,
      updated,
    );
    await assert.rejects(
      repository.updateCatalogItem(context, item.id, {
        condition: 'good',
        description: 'x'.repeat(50_001),
      }),
    );
    assert.equal(
      (await repository.listCatalog(context))[0].edition.description,
      updated,
    );
  } finally {
    sqlite.close();
  }
});

void test('verified description migration repairs imported snippets and preserves owner edits, clears, and repeat runs', async () => {
  const { sqlite, repository } = fixture();
  try {
    const {
      rows: [repair],
    } = JSON.parse(
      readFileSync(
        new URL(
          '../docs/audits/2026-09-06-description-repair.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const original = {
      ...input,
      isbn13: repair.isbn13,
      title: repair.title,
      language: 'ko' as const,
      description: repair.expected_description,
      provenance: { description: 'kakao-books' },
    };
    const imported = await repository.createCatalogItem(context, original);
    const edited = await repository.createCatalogItem(
      { ...context, idempotencyKey: 'edited' },
      original,
    );
    const cleared = await repository.createCatalogItem(
      { ...context, idempotencyKey: 'cleared' },
      original,
    );
    await repository.updateCatalogItem(context, edited.id, {
      condition: 'good',
      description: 'My own description.',
    });
    await repository.updateCatalogItem(context, cleared.id, {
      condition: 'good',
      description: '',
    });
    const reverted = await repository.createCatalogItem(
      { ...context, idempotencyKey: 'reverted' },
      original,
    );
    await repository.updateCatalogItem(context, reverted.id, {
      condition: 'good',
      description: 'An owner edit.',
    });
    await repository.updateCatalogItem(context, reverted.id, {
      condition: 'good',
      description: repair.expected_description,
    });
    const sql = readFileSync(
      new URL('../drizzle/0010_description_repair.sql', import.meta.url),
      'utf8',
    );
    sqlite.exec(sql);
    const first = await repository.listCatalog(context);
    assert.equal(
      first.find((i) => i.id === imported.id)?.edition.description,
      repair.description,
    );
    assert.equal(
      first.find((i) => i.id === edited.id)?.edition.description,
      'My own description.',
    );
    assert.ok(!first.find((i) => i.id === cleared.id)?.edition.description);
    assert.equal(
      first.find((i) => i.id === reverted.id)?.edition.description,
      repair.expected_description,
      'Owner edits stay protected even after the text returns to the original snippet',
    );
    const versions = sqlite
      .prepare('SELECT id,version FROM catalog_items ORDER BY id')
      .all();
    sqlite.exec(sql);
    assert.deepEqual(
      sqlite.prepare('SELECT id,version FROM catalog_items ORDER BY id').all(),
      versions,
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT json_extract(field_provenance_json, '$.description') AS source FROM book_editions",
        )
        .get()?.source,
      'yes24-reviewed',
    );
  } finally {
    sqlite.close();
  }
});

void test('description source and owner-edit protection follow each copy and survive unrelated edits', async () => {
  const { sqlite, repository } = fixture();
  try {
    const original = {
      ...input,
      description: 'Originally published: New York, 1953.',
      provenance: { description: 'google-books' },
    };
    const item = await repository.createCatalogItem(context, original);
    const other = await repository.createCatalogItem(
      { ...context, actorId: 'other', idempotencyKey: 'other-source' },
      original,
    );
    await repository.updateCatalogItem(context, item.id, {
      condition: 'good',
      description: 'A fuller synopsis from the linked work.',
      descriptionProvenance: {
        description: 'open-library',
        descriptionUrl: 'https://openlibrary.org/works/OL1W',
        descriptionScope: 'work',
      },
    });
    await repository.updateCatalogItem(context, item.id, {
      condition: 'good',
      ownerNotes: 'Unrelated edit',
    });
    let catalog = await repository.listCatalog(context);
    assert.deepEqual(
      catalog.find((c) => c.id === item.id)?.edition.provenance,
      {
        description: 'open-library',
        descriptionUrl: 'https://openlibrary.org/works/OL1W',
        descriptionScope: 'work',
      },
    );
    assert.equal(
      catalog.find((c) => c.id === other.id)?.edition.provenance.description,
      'google-books',
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT json_extract(metadata_overrides_json, '$.descriptionEdited') AS edited FROM catalog_items WHERE id=?",
        )
        .get(item.id)?.edited,
      1,
    );
    await repository.updateCatalogItem(context, item.id, {
      condition: 'good',
      description: 'My own introduction.',
    });
    catalog = await repository.listCatalog(context);
    assert.deepEqual(
      catalog.find((c) => c.id === item.id)?.edition.provenance,
      { description: 'member' },
    );
    await assert.rejects(
      repository.updateCatalogItem(context, item.id, {
        condition: 'good',
        description: 'Replacement.',
        descriptionProvenance: {
          description: 'open-library',
          descriptionUrl: 'javascript:alert(1)',
        },
      }),
    );
    assert.equal(
      (await repository.listCatalog(context)).find((c) => c.id === item.id)
        ?.edition.description,
      'My own introduction.',
    );
  } finally {
    sqlite.close();
  }
});

void test('youth flag persists true and explicit false, rejects non-booleans, and isolates copy edits', async () => {
  const { sqlite, repository } = fixture();
  try {
    const first = await repository.createCatalogItem(context, { ...input, isYouthBook: true, provenance: { isYouthBook: 'google-books' } });
    const second = await repository.createCatalogItem({ ...context, actorId: 'other' }, { ...input, isYouthBook: true });
    assert.equal(first.edition.isYouthBook, true);
    const changed = await repository.updateCatalogItem(context, first.id, { condition: 'good', isYouthBook: false });
    assert.equal(changed.edition.isYouthBook, false);
    assert.equal(changed.edition.provenance.isYouthBook, 'member');
    const unrelated = await repository.updateCatalogItem({ ...context, idempotencyKey: 'other-edit' }, first.id, { condition: 'good', ownerNotes: 'A note' });
    assert.equal(unrelated.edition.isYouthBook, false);
    const other = await repository.updateCatalogItem({ ...context, actorId: 'other', idempotencyKey: 'other-copy' }, second.id, { condition: 'good' });
    assert.equal(other.edition.isYouthBook, true);
    await assert.rejects(repository.updateCatalogItem(context, first.id, { condition: 'good', isYouthBook: 'false' as unknown as boolean }));
    await assert.rejects(repository.createCatalogItem({ ...context, idempotencyKey: 'bad-youth' }, { ...input, isYouthBook: 1 as unknown as boolean }));
  } finally { sqlite.close(); }
});

void test('audience backfill fixes automatic false values but preserves member false and is repeatable', async () => {
  const { sqlite, repository } = fixture();
  try {
    const automatic = await repository.createCatalogItem(context, { ...input, isYouthBook: false });
    const manual = await repository.createCatalogItem({ ...context, actorId: 'other' }, { ...input, isYouthBook: false, provenance: { isYouthBook: 'member' } });
    const sql = youthBackfillSql([{ isbn13: input.isbn13, isYouthBook: true }]);
    sqlite.exec(sql);
    const read = (id: string) => sqlite.prepare("SELECT json_extract(metadata_overrides_json, '$.isYouthBook') AS flag, version FROM catalog_items WHERE id = ?").get(id)!;
    assert.equal(read(automatic.id).flag, 1);
    assert.equal(read(manual.id).flag, 0);
    const version = read(automatic.id).version;
    sqlite.exec(sql);
    assert.equal(read(automatic.id).version, version);
  } finally { sqlite.close(); }
});
