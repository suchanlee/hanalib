import assert from 'node:assert/strict';
import test from 'node:test';
import { processReadyOutbox, renderOutboxMessage } from '../lib/notifications/outbox-worker.ts';
import { encryptContact } from '../lib/notifications/contact-crypto.ts';

const encryptionKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const pushConfig = {
  contactEncryptionKey: encryptionKey,
  contactHashKey: 'a-test-only-hash-key-with-at-least-32-characters',
  vapidPublicKey: Buffer.alloc(65, 7).toString('base64url'),
  vapidPrivateKey: Buffer.alloc(32, 7).toString('base64url'),
  vapidSubject: 'https://library.example',
};
const emailConfig = { resendApiKey: 'test-key', emailFrom: 'Books <notifications@library.example>' };

async function deliveryFixture(email: string | null = 'member@example.com', manualEmail?: string) {
  const person = {
    notificationChannel: 'email',
    email,
    emailEncrypted: manualEmail ? await encryptContact(manualEmail, encryptionKey) : null,
  };
  const deliveries = new Map<string, unknown[]>();
  const row = {
    id: 'event-delivery', eventType: 'borrow_declined', aggregateId: 'request-1', recipientId: 'member-1',
    locale: 'en', payloadJson: JSON.stringify({ bookTitle: 'Tomorrow', recipientName: 'Member' }),
    availableAt: 1000, attemptCount: 0,
  };
  let processed = false;
  const subscriptionEncrypted = await encryptContact(JSON.stringify({
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: Buffer.alloc(65, 7).toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url') },
  }), encryptionKey);
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) { values = bound; return statement; },
        async first() {
          if (sql.includes('FROM profiles p')) return person;
          if (sql.includes('FROM notification_endpoints')) return null;
          throw new Error(`Unexpected first: ${sql}`);
        },
        async all() {
          if (sql.includes('FROM outbox_events')) return { results: !processed && row.availableAt <= Number(values[0]) ? [{ ...row }] : [] };
          if (sql.includes('FROM notification_deliveries')) return { results: [...deliveries.keys()].map((channel) => ({ channel })) };
          if (sql.includes('FROM web_push_subscriptions')) return { results: [{ id: 'push-1', endpointHash: 'hash-1', subscriptionEncrypted }] };
          throw new Error(`Unexpected all: ${sql}`);
        },
        async run() {
          if (sql.includes('INSERT OR REPLACE INTO notification_deliveries')) deliveries.set(String(values[3]), values);
          else if (sql.includes('UPDATE outbox_events')) {
            if (sql.includes('SET processed_at')) processed = true;
            else if (sql.includes('attempt_count = attempt_count + 1')) {
              row.attemptCount += 1;
              row.availableAt = Number(values[0]);
            } else row.availableAt = Number(values[0]);
          } else if (!sql.includes('UPDATE web_push_subscriptions')) throw new Error(`Unexpected run: ${sql}`);
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, person, deliveries, isProcessed: () => processed };
}

void test('always sends email alongside a successful push, even for a Kakao preference', async () => {
  const fixture = await deliveryFixture();
  fixture.person.notificationChannel = 'kakao';
  let emails = 0;
  let pushes = 0;
  const result = await processReadyOutbox(fixture.db, { ...emailConfig, ...pushConfig }, {
    now: 1000,
    pushSender: async () => { pushes += 1; return true; },
    fetcher: async (url, init) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(new Headers(init?.headers).get('Idempotency-Key'), 'hana-event-delivery');
      assert.equal(typeof init?.body, 'string');
      assert.deepEqual(JSON.parse(init?.body as string).to, ['member@example.com']);
      emails += 1;
      return Response.json({ id: 'email-1' });
    },
  });
  assert.equal(result.sent, 1);
  assert.equal(emails, 1);
  assert.equal(pushes, 1);
  assert.deepEqual([...fixture.deliveries.keys()].sort(), ['email', 'push']);
});

void test('sends email when push is unconfigured, expired, or fails', async () => {
  for (const mode of ['unconfigured', 'expired', 'failed']) {
    const fixture = await deliveryFixture();
    let emails = 0;
    const result = await processReadyOutbox(fixture.db, { ...emailConfig, ...(mode === 'unconfigured' ? {} : pushConfig) }, {
      now: 1000,
      pushSender: async () => {
        if (mode === 'failed') throw new Error('push unavailable');
        return false;
      },
      fetcher: async () => { emails += 1; return Response.json({ id: 'email-1' }); },
    });
    assert.equal(result.sent, 1, mode);
    assert.equal(emails, 1, mode);
    assert.deepEqual([...fixture.deliveries.keys()], ['email']);
  }
});

void test('retries failed email without resending a successful push, even after a day', async () => {
  const fixture = await deliveryFixture();
  let emails = 0;
  let pushes = 0;
  const options = {
    pushSender: async () => { pushes += 1; return true; },
    fetcher: async () => {
      emails += 1;
      return emails === 1 ? Response.json({ name: 'unavailable' }, { status: 503 }) : Response.json({ id: 'email-1' });
    },
  };
  const config = { ...emailConfig, ...pushConfig };
  const first = await processReadyOutbox(fixture.db, config, { ...options, now: 1000 });
  assert.equal(first.failed, 1);
  assert.equal(fixture.isProcessed(), false);
  assert.deepEqual([...fixture.deliveries.keys()], ['push']);
  const retry = await processReadyOutbox(fixture.db, config, { ...options, now: 2 * 86_400_000 });
  assert.equal(retry.sent, 1);
  assert.equal(pushes, 1);
  assert.equal(emails, 2);
  assert.equal(fixture.isProcessed(), true);
});

void test('persists successful email despite a broken Kakao fallback and does not resend it on retry', async () => {
  const fixture = await deliveryFixture();
  fixture.person.notificationChannel = 'kakao';
  let emails = 0;
  const fetcher: typeof fetch = async () => { emails += 1; return Response.json({ id: 'email-1' }); };
  const first = await processReadyOutbox(fixture.db, emailConfig, { now: 1000, fetcher });
  assert.equal(first.failed, 1);
  assert.deepEqual([...fixture.deliveries.keys()], ['email']);
  fixture.person.notificationChannel = 'email';
  const retry = await processReadyOutbox(fixture.db, emailConfig, { now: 2 * 86_400_000, fetcher });
  assert.equal(retry.sent, 1);
  assert.equal(emails, 1);
});

void test('members without email can still receive push', async () => {
  const fixture = await deliveryFixture(null);
  const result = await processReadyOutbox(fixture.db, pushConfig, {
    now: 1000, pushSender: async () => true,
    fetcher: async () => { throw new Error('Email must not be attempted without an address'); },
  });
  assert.equal(result.sent, 1);
  assert.deepEqual([...fixture.deliveries.keys()], ['push']);
});

void test('sends notification email to a verified manually supplied address', async () => {
  const fixture = await deliveryFixture(null, 'manual@example.com');
  let recipient = '';
  const result = await processReadyOutbox(fixture.db, { ...emailConfig, ...pushConfig }, {
    now: 1000,
    pushSender: async () => false,
    fetcher: async (_url, init) => {
      const body = init?.body;
      assert.equal(typeof body, 'string');
      recipient = JSON.parse(body as string).to[0];
      return Response.json({ id: 'email-manual' });
    },
  });
  assert.equal(result.sent, 1);
  assert.equal(recipient, 'manual@example.com');
  assert.deepEqual([...fixture.deliveries.keys()], ['email']);
});

void test('missing email configuration leaves email pending while preserving a successful push', async () => {
  const fixture = await deliveryFixture();
  const result = await processReadyOutbox(fixture.db, pushConfig, { now: 1000, pushSender: async () => true });
  assert.equal(result.failed, 1);
  assert.equal(fixture.isProcessed(), false);
  assert.deepEqual([...fixture.deliveries.keys()], ['push']);
});

void test('renders Korean owner request and English borrower decision messages', () => {
  const request = renderOutboxMessage({
    eventType: 'borrow_requested',
    locale: 'ko',
    payloadJson: JSON.stringify({
      bookTitle: '아몬드',
      recipientName: '서연',
      actorName: '지우',
      expiresAt: '2026-09-06T17:00:00.000Z',
      decisionUrl: 'https://example.com/borrowing',
      bookUrl: 'https://example.com/?book=item-1',
      coverUrl: 'https://covers.example/almond.jpg',
    }),
  });
  assert.match(request.text, /앱에서 수락 또는 거절/);
  assert.equal(request.primaryUrl, 'https://example.com/?book=item-1');
  assert.equal(request.imageUrl, 'https://covers.example/almond.jpg');
  assert.deepEqual(request.actions, [
    { label: '요청 확인', url: 'https://example.com/borrowing' },
    { label: '도서 보기', url: 'https://example.com/?book=item-1' },
  ]);

  const reminder = renderOutboxMessage({
    eventType: 'borrow_request_reminder',
    locale: 'en',
    payloadJson: JSON.stringify({
      bookTitle: 'Tomorrow',
      recipientName: 'Owner',
      actorName: 'Alex',
      expiresAt: '2026-09-06T17:00:00.000Z',
      decisionUrl: 'https://example.com/borrowing?request=request-1',
      bookUrl: 'https://example.com/?book=item-2',
      coverUrl: 'https://covers.example/tomorrow.jpg',
    }),
  });
  assert.match(reminder.subject, /expires soon/);
  assert.match(reminder.text, /expires in 24 hours/);
  assert.equal(reminder.imageUrl, 'https://covers.example/tomorrow.jpg');
  assert.deepEqual(reminder.actions, [
    { label: 'View request', url: 'https://example.com/borrowing?request=request-1' },
    { label: 'View book', url: 'https://example.com/?book=item-2' },
  ]);

  const decision = renderOutboxMessage({
    eventType: 'borrow_accepted',
    locale: 'en',
    payloadJson: JSON.stringify({
      bookTitle: 'Tomorrow',
      recipientName: 'Alex',
      actorName: 'Jiwoo',
      returnUrl: 'https://example.com/borrowing',
    }),
  });
  assert.match(decision.text, /was accepted/);
  assert.deepEqual(decision.actions, [{ label: 'View loan', url: 'https://example.com/borrowing' }]);
});

void test('rejects malformed or unsupported outbox events', () => {
  assert.throws(() => renderOutboxMessage({ eventType: 'unknown', locale: 'en', payloadJson: '{}' }));
  assert.throws(() => renderOutboxMessage({ eventType: 'borrow_requested', locale: 'en', payloadJson: '{}' }));
});

void test('renders actionable hold offers and reminders with the book cover', () => {
  const offer = renderOutboxMessage({
    eventType: 'hold_available',
    locale: 'en',
    payloadJson: JSON.stringify({
      bookTitle: 'Small Things Like These',
      recipientName: 'Amy',
      expiresAt: '2026-09-07T17:00:00.000Z',
      offerUrl: 'https://example.com/borrowing?hold=hold-1',
      coverUrl: 'https://covers.example/small-things.jpg',
    }),
  });
  assert.match(offer.subject, /ready for you/);
  assert.equal(offer.primaryUrl, 'https://example.com/borrowing?hold=hold-1');
  assert.equal(offer.imageUrl, 'https://covers.example/small-things.jpg');
  assert.deepEqual(offer.actions, [{ label: 'View my offer', url: 'https://example.com/borrowing?hold=hold-1' }]);

  const reminder = renderOutboxMessage({
    eventType: 'hold_offer_reminder',
    locale: 'ko',
    payloadJson: JSON.stringify({
      bookTitle: '아몬드',
      recipientName: '지우',
      expiresAt: '2026-09-07T17:00:00.000Z',
      offerUrl: 'https://example.com/borrowing?hold=hold-2',
    }),
  });
  assert.match(reminder.subject, /알림/);
  assert.match(reminder.text, /다음 분에게 넘겨주세요/);
});

void test('renders cancellation, expiration, and borrower-return notifications for owners', () => {
  const bookUrl = 'https://example.com/?book=item-1';
  const canceled = renderOutboxMessage({
    eventType: 'borrow_canceled',
    locale: 'ko',
    payloadJson: JSON.stringify({
      bookTitle: '아몬드', recipientName: '소유자', actorName: '대여자', bookUrl,
    }),
  });
  assert.match(canceled.text, /대여 요청을 취소/);
  assert.equal(canceled.primaryUrl, bookUrl);

  const expired = renderOutboxMessage({
    eventType: 'borrow_expired',
    locale: 'en',
    payloadJson: JSON.stringify({
      bookTitle: 'Tomorrow', recipientName: 'Owner', actorName: 'Borrower', bookUrl,
    }),
  });
  assert.match(expired.text, /expired after 48 hours/);

  const returned = renderOutboxMessage({
    eventType: 'book_returned',
    locale: 'ko',
    payloadJson: JSON.stringify({
      bookTitle: '아몬드', recipientName: '소유자', actorName: '대여자', bookUrl,
    }),
  });
  assert.match(returned.text, /반납 완료로 표시/);
  assert.deepEqual(returned.actions, [{ label: '도서 보기', url: bookUrl }]);
});

void test('skips a queued return check after its loan is no longer active', async () => {
  const executed: string[] = [];
  const database = {
    prepare(sql: string) {
      const statement = {
        values: [] as unknown[],
        bind(...values: unknown[]) {
          statement.values = values;
          return statement;
        },
        async all() {
          return {
            success: true,
            meta: {},
            results: [{
              id: 'event-1', eventType: 'return_check_due', aggregateId: 'loan-1', recipientId: 'borrower',
              locale: 'en', payloadJson: JSON.stringify({
                bookTitle: 'Tomorrow', recipientName: 'Borrower', actorName: 'Owner',
                returnUrl: 'https://example.com/borrowing?loan=loan-1',
              }), availableAt: Date.parse('2026-09-04T17:00:00.000Z'), attemptCount: 0,
            }],
          };
        },
        async first() {
          return null;
        },
        async run() {
          executed.push(sql);
          return { success: true, results: [], meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };

  const result = await processReadyOutbox(database as unknown as D1Database, {}, {
    now: Date.parse('2026-09-04T17:00:00.000Z'),
  });
  assert.deepEqual(result, { claimed: 1, sent: 0, failed: 0, skipped: 1 });
  assert.ok(executed.some((sql) => sql.includes('SET processed_at = ?')));
});

void test('skips a borrow reminder after its request is no longer pending', async () => {
  const executed: string[] = [];
  const database = {
    prepare(sql: string) {
      const statement = {
        bind() { return statement; },
        async all() {
          return {
            results: [{
              id: 'event-reminder', eventType: 'borrow_request_reminder', aggregateId: 'request-1', recipientId: 'owner',
              locale: 'en', payloadJson: JSON.stringify({
                bookTitle: 'Tomorrow', recipientName: 'Owner', actorName: 'Borrower',
                expiresAt: '2026-09-06T17:00:00.000Z', decisionUrl: 'https://example.com/borrowing?request=request-1',
              }), availableAt: Date.parse('2026-09-05T17:00:00.000Z'), attemptCount: 0,
            }],
          };
        },
        async first() { return null; },
        async run() {
          executed.push(sql);
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };

  const result = await processReadyOutbox(database as unknown as D1Database, {}, {
    now: Date.parse('2026-09-05T17:00:00.000Z'),
  });
  assert.deepEqual(result, { claimed: 1, sent: 0, failed: 0, skipped: 1 });
  assert.ok(executed.some((sql) => sql.includes('SET processed_at = ?')));
});
