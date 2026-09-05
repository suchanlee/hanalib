import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { processReadyOutbox } from '../lib/notifications/outbox-worker.ts';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE loans (id TEXT PRIMARY KEY, status TEXT, next_check_at INTEGER, last_check_at INTEGER);
    CREATE TABLE return_checkins (id TEXT PRIMARY KEY, loan_id TEXT, scheduled_for INTEGER, sent_at INTEGER, next_scheduled_for INTEGER, UNIQUE(loan_id, scheduled_for));
    CREATE TABLE profiles (id TEXT PRIMARY KEY, notification_channel TEXT);
    CREATE TABLE auth_identities (profile_id TEXT, email TEXT, last_signed_in_at INTEGER);
    CREATE TABLE notification_endpoints (user_id TEXT, kind TEXT, address_encrypted TEXT, verified_at INTEGER, enabled INTEGER);
    CREATE TABLE outbox_events (id TEXT PRIMARY KEY, event_type TEXT, aggregate_type TEXT, aggregate_id TEXT, recipient_id TEXT, locale TEXT, payload_json TEXT, available_at INTEGER, attempt_count INTEGER DEFAULT 0, processed_at INTEGER);
    CREATE TABLE notification_deliveries (id TEXT PRIMARY KEY, event_id TEXT, recipient_id TEXT, channel TEXT, provider_message_id TEXT, status TEXT, attempt_count INTEGER, sent_at INTEGER, created_at INTEGER);
    INSERT INTO profiles VALUES ('member', 'email');
    INSERT INTO auth_identities VALUES ('member', 'member@example.com', 1);
    INSERT INTO notification_deliveries (id,event_id,channel,status) VALUES ('push','event','push','sent');
  `);
  const scheduledFor = Date.now() - 3_600_000;
  sqlite
    .prepare('INSERT INTO loans VALUES (?, ?, ?, NULL)')
    .run('loan', 'active', scheduledFor);
  sqlite
    .prepare(
      'INSERT INTO return_checkins (id,loan_id,scheduled_for) VALUES (?, ?, ?)',
    )
    .run('check', 'loan', scheduledFor);
  sqlite
    .prepare(
      'INSERT INTO outbox_events (id,event_type,aggregate_type,aggregate_id,recipient_id,locale,payload_json,available_at) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(
      'event',
      'return_check_due',
      'loan',
      'loan',
      'member',
      'en',
      JSON.stringify({
        bookTitle: 'Book',
        recipientName: 'Member',
        returnUrl: 'https://library.example/borrowing',
      }),
      scheduledFor,
    );
  let failSchedule = false;
  let returnBeforeBatch = false;
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
      if (failSchedule && this.sql.includes('INSERT INTO outbox_events'))
        throw new Error('Injected scheduling failure');
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
      if (returnBeforeBatch)
        sqlite.exec("UPDATE loans SET status = 'returned'");
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
  return {
    db,
    sqlite,
    scheduledFor,
    fail: (value: boolean) => {
      failSchedule = value;
    },
    returnBeforeBatch: () => {
      returnBeforeBatch = true;
    },
  };
}

void test('scheduling failure rolls back completion; retry schedules exactly once without resending email', async () => {
  const f = fixture();
  try {
    let emails = 0;
    const fetcher: typeof fetch = async () => {
      emails++;
      return Response.json({ id: 'email-1' });
    };
    const config = { resendApiKey: 'test', emailFrom: 'test@example.com' };
    f.fail(true);
    const first = await processReadyOutbox(f.db, config, { fetcher });
    assert.equal(first.failed, 1);
    assert.equal(
      f.sqlite
        .prepare("SELECT processed_at FROM outbox_events WHERE id = 'event'")
        .get()?.processed_at,
      null,
    );
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM return_checkins').get()?.n,
      1,
    );
    assert.equal(
      f.sqlite.prepare('SELECT next_check_at FROM loans').get()?.next_check_at,
      f.scheduledFor,
    );
    f.fail(false);
    const retryAt = Number(
      f.sqlite
        .prepare("SELECT available_at FROM outbox_events WHERE id = 'event'")
        .get()?.available_at,
    );
    const second = await processReadyOutbox(f.db, config, {
      fetcher,
      now: retryAt,
    });
    assert.equal(second.sent, 1);
    assert.equal(emails, 1);
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM return_checkins').get()?.n,
      2,
    );
    assert.equal(
      f.sqlite
        .prepare(
          'SELECT count(*) AS n FROM outbox_events WHERE processed_at IS NULL',
        )
        .get()?.n,
      1,
    );
    const next = Number(
      f.sqlite.prepare('SELECT next_check_at FROM loans').get()?.next_check_at,
    );
    assert.equal(
      next,
      f.scheduledFor + 7 * 86_400_000,
      'retry delays must not shift the weekly cadence',
    );
    await processReadyOutbox(f.db, config, { fetcher, now: retryAt + 1 });
    assert.equal(emails, 1);
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM outbox_events').get()?.n,
      2,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('a return racing with reminder completion does not create a new reminder', async () => {
  const f = fixture();
  try {
    f.returnBeforeBatch();
    const result = await processReadyOutbox(
      f.db,
      { resendApiKey: 'test', emailFrom: 'test@example.com' },
      {
        fetcher: async () => Response.json({ id: 'email-1' }),
      },
    );
    assert.equal(result.sent, 1);
    assert.equal(
      f.sqlite
        .prepare(
          'SELECT count(*) AS n FROM outbox_events WHERE processed_at IS NULL',
        )
        .get()?.n,
      0,
    );
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM return_checkins').get()?.n,
      1,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('each event receives a fresh lease even after an earlier delivery was slow', async (t) => {
  const f = fixture();
  let clock = Date.now();
  const startedAt = clock;
  t.mock.method(Date, 'now', () => clock);
  try {
    f.sqlite.exec("UPDATE outbox_events SET event_type = 'borrow_declined'");
    f.sqlite
      .exec(`INSERT INTO outbox_events (id,event_type,aggregate_type,aggregate_id,recipient_id,locale,payload_json,available_at)
      SELECT 'second', event_type, aggregate_type, aggregate_id, recipient_id, locale, payload_json, available_at + 1 FROM outbox_events;
      INSERT INTO notification_deliveries (id,event_id,channel,status) VALUES ('push-second','second','push','sent');`);
    const result = await processReadyOutbox(
      f.db,
      { resendApiKey: 'test', emailFrom: 'test@example.com' },
      {
        fetcher: async () => {
          clock += 10 * 60_000;
          return Response.json({ id: 'email' });
        },
      },
    );
    assert.equal(result.sent, 2);
    assert.equal(
      f.sqlite
        .prepare("SELECT available_at FROM outbox_events WHERE id = 'second'")
        .get()?.available_at,
      startedAt + 15 * 60_000,
    );
  } finally {
    f.sqlite.close();
  }
});
