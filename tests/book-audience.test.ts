import assert from 'node:assert/strict';
import test from 'node:test';
import {
  youthAudienceEvidence,
  matchesAudience,
} from '../lib/books/audience.ts';
import { stitchMetadata } from '../lib/isbn/providers.ts';

void test('audience recognizes Korean children and teens and English juvenile/YA categories', () => {
  for (const s of [
    '어린이 > 동화',
    '유아/그림책',
    '청소년/소설',
    'Juvenile Fiction / Comics & Graphic Novels',
    'Young Adult Fiction / Fantasy',
    "Children's literature",
    'Children -- Juvenile fiction',
    'Picture books',
  ]) {
    assert.deepEqual(youthAudienceEvidence([s]), [s]);
  }
  for (const s of [
    'Child psychology',
    'Parenting / Teenagers',
    'Children',
    'Family & Relationships / Parenting',
    'Education / Teaching children',
    'Young adults -- Social conditions',
    'Fiction / Coming of age',
    'Picture books in education',
  ]) {
    assert.deepEqual(youthAudienceEvidence([s]), []);
  }
});
void test('audience suggestions use exact-ISBN metadata, not a title or description keyword', () => {
  const isbn = '9780140328721';
  const result = stitchMetadata(isbn, 'en', [
    {
      isbn13: isbn,
      source: 'google-books',
      title: 'Matilda',
      subjects: ['Juvenile Fiction / Humorous Stories'],
    },
  ]);
  assert.equal(result.isYouthBook, true);
  assert.equal(result.provenance.isYouthBook, 'google-books');
  assert.equal(
    stitchMetadata(isbn, 'en', [
      {
        isbn13: '9780553293357',
        source: 'google-books',
        subjects: ['Juvenile Fiction'],
      },
      {
        isbn13: isbn,
        source: 'kakao-books',
        title: 'Children',
        description: 'A story about children.',
      },
    ]).isYouthBook,
    false,
  );
  assert.equal(matchesAudience(true, 'youth'), true);
  assert.equal(matchesAudience(false, 'youth'), false);
  assert.equal(matchesAudience(undefined, 'youth'), false);
  assert.equal(matchesAudience(false, 'general'), true);
});

void test('audience toggle off excludes youth books and includes unclassified books', () => {
  for (const filter of [undefined, 'general'] as const) {
    assert.equal(matchesAudience(true, filter), false);
    assert.equal(matchesAudience(false, filter), true);
    assert.equal(matchesAudience(undefined, filter), true);
  }
});
