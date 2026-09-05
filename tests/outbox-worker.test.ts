import assert from 'node:assert/strict';
import test from 'node:test';
import { processReadyOutbox, renderOutboxMessage } from '../lib/notifications/outbox-worker.ts';

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
