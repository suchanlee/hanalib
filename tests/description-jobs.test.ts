import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { D1LibraryRepository } from '../lib/persistence/d1-repository.ts';
import { processDescriptionJobs } from '../lib/books/description-jobs.ts';
import { resolveBookMetadata } from '../lib/isbn/server-lookup.ts';

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
  return { sqlite, db, repository: new D1LibraryRepository(db) };
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
  provenance: { description: 'google-books' },
  description: 'The story…',
};
const full = 'The story of a family and their search for belonging. '.repeat(
  12,
);
function resolver(
  description = full,
  failed = false,
): typeof resolveBookMetadata {
  return async () => ({
    metadata: {
      ...input,
      description,
      provenance: {
        description: 'google-books',
        descriptionUrl: 'https://books.google.com/books?id=verified',
        descriptionScope: 'edition',
      },
    },
    providerStatus: {
      aladin: 'not-configured',
      nlk: 'not-configured',
      naver: 'not-configured',
      'kakao-books': 'not-configured',
      'google-books': failed ? 'partial' : 'ok',
      'open-library': 'not-found',
    },
    diagnostics: [],
    usedFixture: false,
  });
}

void test('creation atomically queues one job; hydration persists provenance and leaves other copies alone', async () => {
  const { sqlite, db, repository } = fixture();
  try {
    const item = await repository.createCatalogItem(context, input);
    assert.equal(
      (await repository.createCatalogItem(context, input)).id,
      item.id,
    );
    assert.equal(
      sqlite.prepare('SELECT count(*) AS n FROM description_jobs').get()?.n,
      1,
    );
    const other = await repository.createCatalogItem(
      { ...context, actorId: 'other' },
      {
        ...input,
        description: 'My own words',
        provenance: { description: 'member' },
      },
    );
    assert.equal(
      sqlite.prepare('SELECT count(*) AS n FROM description_jobs').get()?.n,
      1,
    );
    const result = await processDescriptionJobs(
      db,
      {},
      { itemId: item.id, resolve: resolver() },
    );
    assert.equal(result.complete, 1);
    const row = sqlite
      .prepare(
        'SELECT metadata_overrides_json AS json FROM catalog_items WHERE id = ?',
      )
      .get(item.id)!;
    const data = JSON.parse(String(row.json));
    assert.equal(data.description, full);
    assert.equal(data.descriptionEdited, false);
    assert.equal(data.descriptionProvenance.descriptionScope, 'edition');
    assert.equal(
      JSON.parse(
        String(
          sqlite
            .prepare(
              'SELECT metadata_overrides_json AS json FROM catalog_items WHERE id = ?',
            )
            .get(other.id)!.json,
        ),
      ).description,
      'My own words',
    );
    assert.equal(
      (await processDescriptionJobs(db, {}, { resolve: resolver() })).claimed,
      0,
    );
  } finally {
    sqlite.close();
  }
});

void test('concurrent manual edit wins and a retry skips it', async () => {
  const { sqlite, db, repository } = fixture();
  try {
    const item = await repository.createCatalogItem(context, input);
    let time = Date.now();
    await processDescriptionJobs(
      db,
      {},
      {
        now: () => time,
        resolve: async (...args) => {
          sqlite
            .prepare(
              `UPDATE catalog_items SET version = version + 1, metadata_overrides_json = json_set(metadata_overrides_json, '$.description', 'Owner edit', '$.descriptionEdited', 1) WHERE id = ?`,
            )
            .run(item.id);
          return resolver()(...args);
        },
      },
    );
    assert.equal(
      sqlite.prepare('SELECT status FROM description_jobs').get()?.status,
      'pending',
    );
    time += 61_000;
    await processDescriptionJobs(
      db,
      {},
      {
        now: () => time,
        resolve: async () => {
          throw new Error('must not retrieve');
        },
      },
    );
    assert.equal(
      sqlite.prepare('SELECT outcome FROM description_jobs').get()?.outcome,
      'not-needed',
    );
    assert.match(
      String(
        sqlite
          .prepare('SELECT metadata_overrides_json AS json FROM catalog_items')
          .get()?.json,
      ),
      /Owner edit/,
    );
  } finally {
    sqlite.close();
  }
});

void test('failed retrieval retries with backoff, expired leases recover, and exhausted jobs stop', async () => {
  const { sqlite, db, repository } = fixture();
  try {
    await repository.createCatalogItem(context, input);
    let time = Date.now();
    const run = () =>
      processDescriptionJobs(
        db,
        {},
        {
          now: () => time,
          resolve: async () => {
            throw new Error('provider down');
          },
        },
      );
    await run();
    assert.equal((await run()).claimed, 0);
    time += 60_000;
    await run();
    sqlite
      .prepare(
        "UPDATE description_jobs SET status = 'running', lease_token = 'dead-worker'",
      )
      .run();
    time += 120_000;
    await run();
    time += 240_000;
    assert.equal((await run()).failed, 1);
    time += 999_999;
    assert.equal((await run()).claimed, 0);
  } finally {
    sqlite.close();
  }
});

void test('overlapping workers claim only once and reject wrong-language improvement', async () => {
  const { sqlite, db, repository } = fixture();
  try {
    await repository.createCatalogItem(context, input);
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = processDescriptionJobs(
      db,
      {},
      {
        resolve: async (...args) => {
          started();
          await waiting;
          return resolver('한국어 책 소개입니다. '.repeat(50))(...args);
        },
      },
    );
    await entered;
    assert.equal(
      (await processDescriptionJobs(db, {}, { resolve: resolver() })).claimed,
      0,
    );
    release();
    await first;
    assert.equal(
      sqlite.prepare('SELECT outcome FROM description_jobs').get()?.outcome,
      'no-improvement',
    );
  } finally {
    sqlite.close();
  }
});

void test('complete descriptions do not queue; failed job insertion rolls back book creation', async () => {
  const { sqlite, repository } = fixture();
  try {
    await repository.createCatalogItem(context, {
      ...input,
      description: full,
    });
    assert.equal(
      sqlite.prepare('SELECT count(*) AS n FROM description_jobs').get()?.n,
      0,
    );
    sqlite.exec(
      `CREATE TRIGGER reject_job BEFORE INSERT ON description_jobs BEGIN SELECT RAISE(ABORT, 'fail'); END;`,
    );
    await assert.rejects(
      repository.createCatalogItem(
        { ...context, idempotencyKey: 'second' },
        input,
      ),
    );
    assert.equal(
      sqlite.prepare('SELECT count(*) AS n FROM catalog_items').get()?.n,
      1,
    );
  } finally {
    sqlite.close();
  }
});

void test('a late worker cannot overwrite the result of a recovered lease', async () => {
  const { sqlite, db, repository } = fixture();
  try {
    await repository.createCatalogItem(context, input);
    let time = Date.now();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = processDescriptionJobs(
      db,
      {},
      {
        now: () => time,
        resolve: async (...args) => {
          started();
          await waiting;
          return resolver(full + ' Late version.')(...args);
        },
      },
    );
    await entered;
    time += 61_000;
    await processDescriptionJobs(
      db,
      {},
      { now: () => time, resolve: resolver() },
    );
    release();
    await first;
    const data = JSON.parse(
      String(
        sqlite
          .prepare('SELECT metadata_overrides_json AS json FROM catalog_items')
          .get()?.json,
      ),
    );
    assert.equal(data.description, full);
    assert.equal(
      sqlite.prepare('SELECT outcome FROM description_jobs').get()?.outcome,
      'improved',
    );
  } finally {
    sqlite.close();
  }
});
