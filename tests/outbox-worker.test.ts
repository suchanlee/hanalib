import assert from 'node:assert/strict';
import test from 'node:test';
import { renderOutboxMessage } from '../lib/notifications/outbox-worker.ts';

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
