import assert from 'node:assert/strict';
import test from 'node:test';
import { D1LibraryRepository } from '../lib/persistence/d1-repository.ts';
import { expireStaleBorrowRequests } from '../lib/persistence/borrow-request-expiry.ts';
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
  readonly batchRows: (sql: string, values: unknown[], index: number) => unknown[];
  readonly prepared: RecordedStatement[] = [];
  readonly batches: RecordedStatement[][] = [];

  constructor(
    first: (sql: string, values: unknown[]) => unknown,
    all: (sql: string, values: unknown[]) => unknown[] = () => [],
    batchRows: (sql: string, values: unknown[], index: number) => unknown[] = () => [],
  ) {
    this.first = first;
    this.all = all;
    this.batchRows = batchRows;
  }

  prepare(sql: string) {
    const statement = new RecordedStatement(sql, this);
    this.prepared.push(statement);
    return statement;
  }

  batch(statements: RecordedStatement[]) {
    this.batches.push(statements);
    return Promise.resolve(statements.map((statement, index) => ({
      success: true,
      results: this.batchRows(statement.sql, statement.values, index),
      meta: { changes: 1 },
    })));
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
  assert.equal(batch.length, 4);
  const outbox = batch.find((statement) => statement.sql.includes("'borrow_requested'"));
  const reminder = batch.find((statement) => statement.sql.includes("'borrow_request_reminder'"));
  assert.ok(outbox);
  assert.ok(reminder);
  assert.deepEqual(JSON.parse(String(outbox.values[3])), {
    bookTitle: '아몬드',
    recipientName: '소유자',
    actorName: '대여자',
    expiresAt: '2026-09-06T17:00:00.000Z',
    decisionUrl: `https://library.example/borrowing?request=${request.id}`,
    bookUrl: 'https://library.example/?book=item-1',
    coverUrl: 'https://covers.example/almond.jpg',
  });
  assert.deepEqual(JSON.parse(String(reminder.values[3])), JSON.parse(String(outbox.values[3])));
  assert.equal(reminder.values[4], new Date('2026-09-05T17:00:00.000Z').getTime());
});

void test('canceling a live request immediately queues an owner notification', async () => {
  let requestReads = 0;
  const database = new RecordedD1((sql) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('INNER JOIN catalog_items ci ON ci.id = lr.catalog_item_id')) {
      return {
        id: 'request-1', communityId: 'hana', catalogItemId: 'item-1', requesterId: 'borrower',
        status: 'pending', requestedAt: fixedNow.getTime(), expiresAt: fixedNow.getTime() + 3_600_000,
        ownerId: 'owner', itemStatus: 'available', bookTitle: '아몬드', requesterDisplayName: 'Borrower',
        requesterDisplayNameKo: '대여자', requesterLocale: 'ko', ownerDisplayName: 'Owner',
        ownerDisplayNameKo: '소유자', ownerLocale: 'ko',
      };
    }
    if (sql.includes('FROM loan_requests lr')) {
      requestReads += 1;
      return {
        id: 'request-1', catalogItemId: 'item-1', requesterId: 'borrower',
        status: requestReads === 1 ? 'pending' : 'canceled', requestedAt: fixedNow.getTime(),
        expiresAt: fixedNow.getTime() + 3_600_000,
      };
    }
    return null;
  });
  const repository = new D1LibraryRepository(database as unknown as D1Database, {
    now: () => fixedNow,
    baseUrl: 'https://library.example',
  });

  const request = await repository.cancelBorrowRequest(context, 'request-1');
  assert.equal(request.status, 'canceled');
  const batch = database.batches[0];
  const notification = batch.find((statement) => statement.sql.includes("'borrow_canceled'"));
  assert.ok(notification);
  assert.deepEqual(JSON.parse(String(notification.values[3])), {
    bookTitle: '아몬드', recipientName: '소유자', actorName: '대여자',
    bookUrl: 'https://library.example/?book=item-1',
  });
});

void test('expiring a request queues an owner notification', async () => {
  const database = new RecordedD1((sql) => {
    if (sql.includes("lr.expires_at <= ?")) {
      return {
        id: 'request-1', catalogItemId: 'item-1', ownerId: 'owner', ownerLocale: 'en',
        ownerDisplayName: 'Owner', ownerDisplayNameKo: '소유자', requesterDisplayName: 'Borrower',
        requesterDisplayNameKo: '대여자', bookTitle: 'Tomorrow', convertedCatalogItemId: null,
      };
    }
    return null;
  }, (sql) => sql.includes('FROM loan_requests') ? [{ id: 'request-1' }] : []);

  const expired = await expireStaleBorrowRequests(database as unknown as D1Database, fixedNow.getTime(), 'https://library.example');
  assert.equal(expired, 1);
  const notification = database.batches[0].find((statement) => statement.sql.includes("'borrow_expired'"));
  assert.ok(notification);
  assert.deepEqual(JSON.parse(String(notification.values[3])), {
    bookTitle: 'Tomorrow', recipientName: 'Owner', actorName: 'Borrower',
    bookUrl: 'https://library.example/?book=item-1',
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
  assert.equal(batch.length, 8);
  assert.ok(batch.some((statement) => statement.sql.includes("UPDATE holds") && statement.sql.includes("status = 'canceled'")));
  assert.ok(batch.some((statement) => statement.sql.includes('INSERT INTO return_checkins')));
  assert.ok(batch.some((statement) => statement.sql.includes("'borrow_accepted'")));
  const due = batch.find((statement) => statement.sql.includes("'return_check_due'"));
  assert.ok(due);
  assert.match(due.sql, /l\.next_check_at/);
  assert.deepEqual(Object.keys(JSON.parse(String(due.values[2]))).sort(), ['actorName', 'bookTitle', 'recipientName', 'returnUrl']);
  assert.match(batch[0].sql, /h\.borrow_request_id = loan_requests\.id/);
  assert.match(batch[1].sql, /h\.borrow_request_id = \?/);
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
  assert.ok(batch[3].sql.includes("'borrow_request_reminder'"));
  assert.equal(batch[3].values[4], new Date('2026-09-05T17:00:00.000Z').getTime());
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
  assert.equal(database.batches[0][0].values[9], null);
  assert.equal(JSON.parse(String(database.batches[0][1].values[5])).description, null);
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
  const itemUpdate = database.batches[0].find((statement) => statement.sql.includes('UPDATE catalog_items'));
  assert.ok(itemUpdate);
  assert.equal(JSON.parse(String(itemUpdate.values[2])).title, '아몬드 개정판');
  assert.equal(database.batches[0].some((statement) => statement.sql.includes('UPDATE book_editions')), false);
  assert.equal(database.batches[0].length, 1);
});

void test('an owner cannot attach another member’s uploaded cover', async () => {
  const database = new RecordedD1((sql) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('INNER JOIN book_editions')) {
      return {
        itemId: 'item-1', ownerId: 'borrower', itemStatus: 'available', itemCondition: 'good',
        ownerNotes: null, itemCreatedAt: fixedNow.getTime(), editionId: 'edition-1', isbn10: null,
        isbn13: '9788936434267', title: '아몬드', titleEn: null, authorsJson: '["손원평"]', authorsEnJson: '[]',
        publisher: '창비', publishedOn: '2017', language: 'ko', pageCount: 263, description: null,
        coverOverrideAssetId: null, coverSourceUrl: null, coverStoragePath: null,
        coverTone: 'amber', provenanceJson: '{}',
      };
    }
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
  assert.match(database.batches[0][0].sql, /cover_source_override_url/);
  assert.doesNotMatch(database.batches[0][0].sql, /book_editions/);
  assert.match(database.batches[0][1].sql, /SET catalog_item_id = NULL/);
});

void test('catalog intake never overwrites a shared ISBN edition', async () => {
  const database = new RecordedD1((sql, values) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('idempotency_key = ?')) return null;
    if (sql.includes('COUNT(*) AS count')) return { count: 0 };
    if (sql.includes('FROM catalog_items ci')) {
      return {
        itemId: String(values[0]), ownerId: 'borrower', itemStatus: 'available', itemCondition: 'good',
        ownerNotes: null, itemCreatedAt: fixedNow.getTime(), editionId: 'shared-edition', isbn10: null,
        isbn13: '9788936434267', title: 'My copy title', titleEn: null, authorsJson: '["손원평"]', authorsEnJson: '[]',
        publisher: '창비', publishedOn: '2017', language: 'ko', pageCount: 263, description: null,
        coverOverrideAssetId: null, coverSourceUrl: null, coverStoragePath: null,
        coverTone: 'amber', provenanceJson: '{}',
      };
    }
    return null;
  });
  const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });
  await repository.createCatalogItem(context, {
    isbn13: '9788936434267', title: 'My copy title', authors: ['손원평'], publisher: '창비',
    publishedYear: 2017, language: 'ko', condition: 'good', provenance: { title: 'manual' },
    description: '  감정을 느끼기 어려운 소년 윤재의 성장 이야기.  ',
  });

  assert.match(database.batches[0][0].sql, /ON CONFLICT\(isbn13\) DO NOTHING/);
  assert.doesNotMatch(database.batches[0][0].sql, /DO UPDATE/);
  assert.match(database.batches[0][1].sql, /metadata_overrides_json/);
  assert.equal(database.batches[0][0].values[9], '감정을 느끼기 어려운 소년 윤재의 성장 이야기.');
  assert.equal(JSON.parse(String(database.batches[0][1].values[5])).description, '감정을 느끼기 어려운 소년 윤재의 성장 이야기.');
});

void test('catalog intake rejects invalid descriptions before writing', async () => {
  for (const description of [42, null, 'a'.repeat(5_001)]) {
    const database = new RecordedD1((sql) => sql.includes('SELECT 1 AS active') ? { active: 1 } : null);
    const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });

    await assert.rejects(repository.createCatalogItem(context, {
      isbn13: '9788936434267', title: '아몬드', authors: ['손원평'], publisher: '창비',
      publishedYear: 2017, language: 'ko', condition: 'good', provenance: {},
      description: description as string,
    }), (error: unknown) => error instanceof LibraryError && error.code === 'invalid-input');
    assert.equal(database.batches.length, 0);
  }
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

void test('bootstrap exposes requests and loans only to their participants', async () => {
  const database = new RecordedD1((sql) => sql.includes('SELECT 1 AS active') ? { active: 1 } : null);
  const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });

  await assert.rejects(repository.getBootstrap(context),
    (error: unknown) => error instanceof LibraryError && error.code === 'forbidden');
  const requestQuery = database.prepared.find((statement) => statement.sql.includes('FROM loan_requests lr') && statement.sql.includes('ci.owner_id'));
  const loanQuery = database.prepared.find((statement) => statement.sql.includes('FROM loans') && statement.sql.includes('borrower_id = ?'));
  assert.ok(requestQuery);
  assert.match(requestQuery.sql, /lr\.requester_id = \? OR ci\.owner_id = \?/);
  assert.deepEqual(requestQuery.values, ['hana', 'borrower', 'borrower']);
  assert.ok(loanQuery);
  assert.match(loanQuery.sql, /owner_id = \? OR borrower_id = \?/);
  assert.deepEqual(loanQuery.values, ['hana', 'borrower', 'borrower']);
});

void test('book detail refresh returns current item state while keeping circulation data participant-scoped', async () => {
  const database = new RecordedD1(
    (sql) => sql.includes('SELECT 1 AS active') ? { active: 1 } : null,
    undefined,
    (_sql, _values, index) => [
      [{
        itemId: 'item-1', ownerId: 'owner', itemStatus: 'borrowed', itemCondition: 'good',
        ownerNotes: null, itemCreatedAt: fixedNow.getTime(), editionId: 'edition-1', isbn10: null,
        isbn13: '9788954682152', title: '작별하지 않는다', titleEn: null,
        authorsJson: '["한강"]', authorsEnJson: '[]', publisher: '문학동네',
        publishedOn: '2021-09-09', language: 'ko', pageCount: 332, description: null,
        coverOverrideAssetId: null, coverSourceUrl: null, coverStoragePath: null,
        coverTone: 'blue', provenanceJson: '{}',
      }],
      [{
        id: 'request-1', catalogItemId: 'item-1', requesterId: 'borrower', status: 'accepted',
        requestedAt: fixedNow.getTime(), expiresAt: fixedNow.getTime() + 172_800_000,
      }],
      [{
        id: 'loan-1', catalogItemId: 'item-1', requestId: 'request-1', ownerId: 'owner',
        borrowerId: 'borrower', status: 'active', startedAt: fixedNow.getTime(),
        nextCheckAt: fixedNow.getTime() + 604_800_000, returnedAt: null, returnedBy: null,
      }],
      [{
        id: 'hold-1', catalogItemId: 'item-1', memberId: 'borrower', status: 'queued',
        createdAt: fixedNow.getTime(), offeredAt: null, expiresAt: null,
        borrowRequestId: null, position: 2,
      }],
      [{ count: 3 }],
    ][index] ?? [],
  );
  const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });

  const detail = await repository.getItemDetail(context, 'item-1');

  assert.equal(detail.item.status, 'borrowed');
  assert.equal(detail.requests[0].status, 'accepted');
  assert.equal(detail.loans[0].status, 'active');
  assert.equal(detail.holds[0].position, 2);
  assert.equal(detail.holdCount, 3);
  const [itemQuery, requestQuery, loanQuery, holdQuery, holdCountQuery] = database.batches[0];
  assert.deepEqual(itemQuery.values, ['item-1', 'hana']);
  assert.match(requestQuery.sql, /lr\.requester_id = \? OR ci\.owner_id = \?/);
  assert.deepEqual(requestQuery.values, ['hana', 'item-1', 'borrower', 'borrower']);
  assert.match(loanQuery.sql, /owner_id = \? OR borrower_id = \?/);
  assert.deepEqual(loanQuery.values, ['hana', 'item-1', 'borrower', 'borrower']);
  assert.deepEqual(holdQuery.values, ['hana', 'item-1', 'borrower']);
  assert.deepEqual(holdCountQuery.values, ['hana', 'item-1']);
});

void test('returning a queued book keeps it held until the queue offer is created', async () => {
  let loanReads = 0;
  const database = new RecordedD1((sql) => {
    if (sql.includes('SELECT 1 AS active')) return { active: 1 };
    if (sql.includes('INNER JOIN profiles borrower')) {
      return {
        ownerId: 'owner', ownerLocale: 'ko', ownerDisplayName: 'Owner', ownerDisplayNameKo: '소유자',
        borrowerDisplayName: 'Borrower', borrowerDisplayNameKo: '대여자', bookTitle: '아몬드',
      };
    }
    if (sql.includes('FROM loans') && sql.includes('WHERE id = ?')) {
      loanReads += 1;
      return {
        id: 'loan-1', catalogItemId: 'item-1', requestId: 'request-1', ownerId: 'owner', borrowerId: 'borrower',
        status: loanReads === 1 ? 'active' : 'returned', startedAt: fixedNow.getTime(),
        nextCheckAt: fixedNow.getTime(), returnedAt: loanReads === 1 ? null : fixedNow.getTime(), returnedBy: 'borrower',
      };
    }
    return null;
  });
  const repository = new D1LibraryRepository(database as unknown as D1Database, { now: () => fixedNow });
  await repository.markReturned(context, 'loan-1');

  assert.match(database.batches[0][1].sql, /CASE WHEN EXISTS/);
  assert.match(database.batches[0][1].sql, /h\.status IN \('queued', 'offered'\)/);
  assert.match(database.batches[0][3].sql, /event_type = 'return_check_due'/);
  assert.ok(database.batches[0][4].sql.includes("'book_returned'"));
});
