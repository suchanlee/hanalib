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
        coverSourceUrl: 'https://covers.example/almond.jpg',
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
    bookUrl: 'https://library.example/?book=item-1',
    coverUrl: 'https://covers.example/almond.jpg',
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

void test('claiming an offered hold inserts the request before attaching its foreign key', async () => {
  const database = new RecordedD1((sql, values) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('FROM loan_requests') && sql.includes('idempotency_key = ?')) return null;
    if (sql.includes('FROM holds h') && sql.includes('INNER JOIN profiles owner')) {
      return {
        holdId: 'hold-1',
        itemId: 'item-1',
        holdStatus: 'offered',
        holdExpiresAt: new Date('2026-09-06T17:00:00.000Z').getTime(),
        ownerId: 'owner',
        itemStatus: 'held',
        bookTitle: '아몬드',
        coverSourceUrl: 'https://covers.example/almond.jpg',
        ownerDisplayName: 'Owner',
        ownerDisplayNameKo: '소유자',
        ownerLocale: 'ko',
        actorDisplayName: 'Holder',
        actorDisplayNameKo: '대기자',
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

  await repository.claimHold(context, 'hold-1');
  const batch = database.batches[0];
  assert.match(batch[0].sql, /INSERT INTO loan_requests/);
  assert.match(batch[1].sql, /UPDATE holds/);
  assert.ok(batch[2].sql.includes("'borrow_requested'"));
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

void test('an owner can attach a private cover override without changing the shared edition', async () => {
  const coverAssetId = '123e4567-e89b-42d3-a456-426614174000';
  const database = new RecordedD1((sql) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('FROM catalog_items') && !sql.includes('INNER JOIN book_editions')) return { id: 'item-1' };
    if (sql.includes('INNER JOIN book_editions')) {
      return {
        itemId: 'item-1', ownerId: 'borrower', itemStatus: 'available', itemCondition: 'good',
        ownerNotes: 'Front porch pickup', itemCreatedAt: fixedNow.getTime(), editionId: 'edition-1', isbn10: null,
        isbn13: '9788936434267', title: '아몬드', titleEn: null, authorsJson: '["손원평"]', authorsEnJson: '[]',
        publisher: '창비', publishedOn: '2017', language: 'ko', pageCount: 263, description: null,
        coverOverrideAssetId: coverAssetId, coverSourceUrl: 'https://provider.test/cover.jpg', coverStoragePath: null,
        coverTone: 'amber', provenanceJson: '{"coverUrl":"google-books"}',
      };
    }
    if (sql.includes('FROM uploaded_assets')) return { id: coverAssetId };
    return null;
  });
  const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });

  const item = await repository.updateCatalogItem(context, 'item-1', {
    condition: 'good', ownerNotes: 'Front porch pickup', coverAssetId,
  });

  assert.equal(item.edition.coverUrl, `/api/covers/${coverAssetId}`);
  assert.equal(database.batches.length, 1);
  assert.equal(database.batches[0].length, 3);
  assert.ok(database.batches[0].some((statement) => statement.sql.includes('SET catalog_item_id = NULL')));
  assert.ok(database.batches[0].some((statement) => statement.sql.includes('SET catalog_item_id = ?')));
});

void test('an owner can edit book metadata without changing its ISBN', async () => {
  const database = new RecordedD1((sql) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('SELECT be.id AS editionId')) return { editionId: 'edition-1' };
    if (sql.includes('FROM catalog_items') && !sql.includes('INNER JOIN book_editions')) return { id: 'item-1' };
    if (sql.includes('INNER JOIN book_editions')) {
      return {
        itemId: 'item-1', ownerId: 'borrower', itemStatus: 'available', itemCondition: 'like-new',
        ownerNotes: 'Handle with care', itemCreatedAt: fixedNow.getTime(), editionId: 'edition-1', isbn10: null,
        isbn13: '9788936434267', title: '아몬드 개정판', titleEn: 'Almond Revised',
        authorsJson: '["손원평"]', authorsEnJson: '["Won-pyung Sohn"]', publisher: '창비',
        publishedOn: '2026', language: 'ko', pageCount: 280, description: 'Updated description',
        coverOverrideAssetId: null, coverSourceUrl: null, coverStoragePath: null,
        coverTone: 'rose', provenanceJson: '{}',
      };
    }
    return null;
  });
  const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });

  const item = await repository.updateCatalogItem(context, 'item-1', {
    title: '아몬드 개정판',
    titleEn: 'Almond Revised',
    authors: ['손원평'],
    authorsEn: ['Won-pyung Sohn'],
    publisher: '창비',
    publishedYear: 2026,
    language: 'ko',
    pageCount: 280,
    description: 'Updated description',
    condition: 'like-new',
    ownerNotes: 'Handle with care',
  });

  assert.equal(item.edition.title, '아몬드 개정판');
  assert.equal(item.edition.isbn13, '9788936434267');
  const editionUpdate = database.batches[0].find((statement) => statement.sql.includes('UPDATE book_editions'));
  assert.ok(editionUpdate);
  assert.doesNotMatch(editionUpdate.sql, /isbn1[03]/u);
  assert.equal(database.batches[0].length, 2);
});

void test('an owner cannot attach another member’s uploaded cover', async () => {
  const database = new RecordedD1((sql) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('FROM catalog_items')) return { id: 'item-1' };
    if (sql.includes('FROM uploaded_assets')) return null;
    return null;
  });
  const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });

  await assert.rejects(
    repository.updateCatalogItem(context, 'item-1', {
      condition: 'good', coverAssetId: '123e4567-e89b-42d3-a456-426614174000',
    }),
    (error: unknown) => error instanceof LibraryError && error.code === 'invalid-input',
  );
  assert.equal(database.batches.length, 0);
});

void test('an owner can refresh a provider cover and clear their uploaded override', async () => {
  const database = new RecordedD1((sql) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('INNER JOIN book_editions')) {
      return {
        itemId: 'item-1', ownerId: 'borrower', itemStatus: 'available', itemCondition: 'good',
        ownerNotes: null, itemCreatedAt: fixedNow.getTime(), editionId: 'edition-1', isbn10: null,
        isbn13: '9788936434267', title: '아몬드', titleEn: null, authorsJson: '["손원평"]', authorsEnJson: '[]',
        publisher: '창비', publishedOn: '2017', language: 'ko', pageCount: 263, description: null,
        coverOverrideAssetId: null, coverSourceUrl: 'https://t1.daumcdn.net/lbook/image/1467038', coverStoragePath: null,
        coverTone: 'amber', provenanceJson: '{"coverUrl":"kakao-books"}',
      };
    }
    return null;
  });
  const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });

  const item = await repository.refreshCatalogItemCover(
    context,
    'item-1',
    'https://t1.daumcdn.net/lbook/image/1467038',
    'kakao-books',
  );

  assert.equal(item.edition.coverUrl, 'https://t1.daumcdn.net/lbook/image/1467038');
  assert.equal(database.batches.length, 1);
  assert.match(database.batches[0][0].sql, /owner_id = \?/);
  assert.match(database.batches[0][0].sql, /json_set/);
  assert.match(database.batches[0][1].sql, /SET catalog_item_id = NULL/);
});

void test('provider cover refresh rejects non-HTTPS URLs before writing', async () => {
  const database = new RecordedD1((sql) => sql.includes('SELECT 1 AS active') ? { active: 1 } : null);
  const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });

  await assert.rejects(
    repository.refreshCatalogItemCover(context, 'item-1', 'http://example.test/cover.jpg', 'test'),
    (error: unknown) => error instanceof LibraryError && error.code === 'invalid-input',
  );
  assert.equal(database.batches.length, 0);
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
