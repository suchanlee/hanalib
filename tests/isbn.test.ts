import assert from 'node:assert/strict';
import test from 'node:test';
import { isbn10To13, isValidIsbn10, isValidIsbn13, normalizeIsbn, parseIsbn } from '../lib/isbn/isbn.ts';

void test('normalizes and validates Korean and English ISBN-13 fixtures', () => {
  assert.equal(normalizeIsbn('978-89-3643-426-7'), '9788936434267');
  assert.equal(isValidIsbn13('9788936434267'), true);
  assert.equal(isValidIsbn13('9780593321201'), true);
  assert.equal(isValidIsbn13('9780593321200'), false);
});

void test('validates ISBN-10 and converts it to ISBN-13', () => {
  assert.equal(isValidIsbn10('0-306-40615-2'), true);
  assert.equal(isbn10To13('0-306-40615-2'), '9780306406157');
  assert.deepEqual(parseIsbn('0-306-40615-2'), {
    input: '0306406152',
    isbn10: '0306406152',
    isbn13: '9780306406157',
  });
});

void test('rejects malformed barcode input', () => {
  assert.equal(parseIsbn('1234'), undefined);
  assert.equal(parseIsbn('9788936434268'), undefined);
});
