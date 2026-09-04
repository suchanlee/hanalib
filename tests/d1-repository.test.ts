import assert from 'node:assert/strict';
import test from 'node:test';
import { D1LibraryRepository } from '../lib/persistence/d1-repository.ts';
import { LibraryError } from '../lib/persistence/errors.ts';

class RecordedStatement {
  readonly sql: string;
  private readonly database: RecordedD1;
  values: unknown[] = [];

  constructor(sql: string, database: RecordedD1) {
    this.sql = sql;
    this.database = database;
  }

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  first<T>() {
    return Promise.resolve(this.database.first(this.sql, this.values) as T | null);
  }

  all<T>() {
    return Promise.resolve({ success: true, results: this.database.all(this.sql, this.values) as T[], meta: {} });
  }

  run() {
    return Promise.resolve({ success: true, results: [], meta: { changes: 1 } });
  }
}

class RecordedD1 {
  readonly first: (sql: string, values: unknown[]) => unknown;
  readonly all: (sql: string, values: unknown[]) => unknown[];
  readonly prepared: RecordedStatement[] = [];
  readonly batches: RecordedStatement[][] = [];

  constructor(
    first: (sql: string, values: unknown[]) => unknown,
    all: (sql: string, values: unknown[]) => unknown[] = () => [],
  ) {
    this.first = first;
    this.all = all;
  }

  prepare(sql: string) {
    const statement = new RecordedStatement(sql, this);
    this.prepared.push(statement);
    return statement;
  }

  batch(statements: RecordedStatement[]) {
    this.batches.push(statements);
    return Promise.resolve(statements.map(() => ({ success: true, results: [], meta: { changes: 1 } })));
  }
}

const fixedNow = new Date('2026-09-04T17:00:00.000Z');
const context = { actorId: 'borrower', communityId: 'hana', idempotencyKey: 'client-operation-1' };

void test('borrow creation atomically queues only the rendering fields needed by notification delivery', async () => {
  const database = new RecordedD1((sql, values) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('idempotency_key = ?')) return null;
    if (sql.includes('INNER JOIN profiles actor')) {
      return {
        itemId: 'item-1',
        ownerId: 'owner',
        itemStatus: 'available',
        bookTitle: '아몬드',
        ownerDisplayName: 'Owner',
        ownerDisplayNameKo: '소유자',
        ownerLocale: 'ko',
        actorDisplayName: 'Borrower',
        actorDisplayNameKo: '대여자',
      };
    }
    if (sql.includes('FROM loan_requests lr')) {
      return {
        id: String(values[0]),
        catalogItemId: 'item-1',
        requesterId: 'borrower',
        status: 'pending',
        requestedAt: fixedNow.getTime(),
        expiresAt: new Date('2026-09-06T17:00:00.000Z').getTime(),
      };
    }
    return null;
  });
  const repository = new D1LibraryRepository(database as unknown as D1Database, {
    now: () => fixedNow,
    baseUrl: 'https://library.example',
  });

  const request = await repository.createBorrowRequest(context, 'item-1');
  assert.equal(request.expiresAt, '2026-09-06T17:00:00.000Z');
  assert.equal(database.batches.length, 1);
  const batch = database.batches[0];
  assert.equal(batch.length, 3);
  const outbox = batch.find((statement) => statement.sql.includes("'borrow_requested'"));
  assert.ok(outbox);
  assert.deepEqual(JSON.parse(String(outbox.values[3])), {
    bookTitle: '아몬드',
    recipientName: '소유자',
    actorName: '대여자',
    expiresAt: '2026-09-06T17:00:00.000Z',
    decisionUrl: `https://library.example/borrowing?request=${request.id}`,
  });
});

void test('accepting a request creates the loan, day-7 check, and both outbox events in one batch', async () => {
  const database = new RecordedD1((sql) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('INNER JOIN catalog_items ci ON ci.id = lr.catalog_item_id')) {
      return {
        id: 'request-1',
        communityId: 'hana',
        catalogItemId: 'item-1',
        requesterId: 'borrower',
        status: 'pending',
        requestedAt: new Date('2026-09-04T16:00:00.000Z').getTime(),
        expiresAt: new Date('2026-09-06T16:00:00.000Z').getTime(),
        ownerId: 'owner',
        itemStatus: 'available',
        bookTitle: '아몬드',
        requesterDisplayName: 'Borrower',
        requesterDisplayNameKo: '대여자',
        requesterLocale: 'ko',
        ownerDisplayName: 'Owner',
        ownerDisplayNameKo: '소유자',
        ownerLocale: 'ko',
      };
    }
    if (sql.includes('FROM loan_requests lr')) {
      return {
        id: 'request-1',
        catalogItemId: 'item-1',
        requesterId: 'borrower',
        status: 'accepted',
        requestedAt: new Date('2026-09-04T16:00:00.000Z').getTime(),
        expiresAt: new Date('2026-09-06T16:00:00.000Z').getTime(),
      };
    }
    if (sql.includes('FROM loans')) {
      return {
        id: 'loan-created',
        catalogItemId: 'item-1',
        requestId: 'request-1',
        ownerId: 'owner',
        borrowerId: 'borrower',
        status: 'active',
        startedAt: fixedNow.getTime(),
        nextCheckAt: new Date('2026-09-11T17:00:00.000Z').getTime(),
        returnedAt: null,
        returnedBy: null,
      };
    }
    return null;
  });
  const repository = new D1LibraryRepository(database as unknown as D1Database, {
    now: () => fixedNow,
    baseUrl: 'https://library.example',
  });

  const result = await repository.respondToBorrowRequest(
    { actorId: 'owner', communityId: 'hana', idempotencyKey: 'owner-answer-1' },
    'request-1',
    'accepted',
  );

  assert.equal(result.loan?.nextCheckAt, '2026-09-11T17:00:00.000Z');
  assert.equal(database.batches.length, 1);
  const batch = database.batches[0];
  assert.equal(batch.length, 7);
  assert.ok(batch.some((statement) => statement.sql.includes('INSERT INTO return_checkins')));
  assert.ok(batch.some((statement) => statement.sql.includes("'borrow_accepted'")));
  const due = batch.find((statement) => statement.sql.includes("'return_check_due'"));
  assert.ok(due);
  assert.match(due.sql, /l\.next_check_at/);
  assert.deepEqual(Object.keys(JSON.parse(String(due.values[2]))).sort(), ['actorName', 'bookTitle', 'recipientName', 'returnUrl']);
});

void test('catalog intake accepts editions without a named author or publisher', async () => {
  const database = new RecordedD1((sql, values) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('idempotency_key = ?')) return null;
    if (sql.includes('FROM catalog_items ci')) {
      return {
        itemId: String(values[0]), ownerId: 'borrower', itemStatus: 'available', itemCondition: 'good',
        ownerNotes: null, itemCreatedAt: fixedNow.getTime(), editionId: 'edition-created', isbn10: null,
        isbn13: '9791191071238', title: 'The Nickel Boys (Korean Edition)', titleEn: null,
        authorsJson: '[]', authorsEnJson: '[]', publisher: '', publishedOn: '2021', language: 'other',
        pageCount: null, description: null, coverSourceUrl: null, coverStoragePath: null,
        coverTone: 'blue', provenanceJson: '{"title":"open-library"}',
      };
    }
    return null;
  });
  const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });

  const item = await repository.createCatalogItem(context, {
    isbn13: '9791191071238', title: 'The Nickel Boys (Korean Edition)', authors: [], publisher: '',
    publishedYear: 2021, language: 'other', condition: 'good', provenance: { title: 'open-library' },
  });

  assert.deepEqual(item.edition.authors, []);
  assert.equal(item.edition.publisher, '');
  assert.equal(database.batches.length, 1);
});

void test('all repository operations reject inactive community actors before preparing mutations', async () => {
  const database = new RecordedD1(() => null);
  const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });

  await assert.rejects(
    repository.createBorrowRequest(context, 'item-1'),
    (error: unknown) => error instanceof LibraryError && error.code === 'forbidden',
  );
  assert.equal(database.batches.length, 0);
  assert.equal(database.prepared.length, 1);
});
