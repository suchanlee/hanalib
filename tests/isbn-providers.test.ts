import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGoogleBooksResponse, normalizeNlkResponse } from '../lib/isbn/server-normalizers.ts';

void test('normalizes an exact Google Books ISBN match', () => {
  const result = normalizeGoogleBooksResponse('9780593321201', {
    items: [{ volumeInfo: { title: 'Wrong', authors: ['Wrong'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780000000002' }] } }, {
      volumeInfo: {
        title: 'Tomorrow, and Tomorrow, and Tomorrow', authors: ['Gabrielle Zevin'], publisher: 'Knopf', publishedDate: '2022-07-05', language: 'en', pageCount: 416,
        imageLinks: { thumbnail: 'http://books.google.com/cover.jpg' }, industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780593321201' }],
      },
    }],
  });
  assert.equal(result?.title, 'Tomorrow, and Tomorrow, and Tomorrow');
  assert.equal(result?.publishedYear, 2022);
  assert.equal(result?.coverUrl, 'https://books.google.com/cover.jpg');
});

void test('normalizes the NLK ISBN bibliographic response', () => {
  const result = normalizeNlkResponse('9788936434267', {
    docs: [{ TITLE: '아몬드', AUTHOR: '손원평', EA_ISBN: '978-89-3643-426-7', PUBLISHER: '창비', PUBLISH_PREDATE: '20170331', PAGE: '263 p.', TITLE_URL: 'http://example.test/almond.jpg' }],
  });
  assert.deepEqual(result?.authors, ['손원평']);
  assert.equal(result?.publishedYear, 2017);
  assert.equal(result?.pageCount, 263);
  assert.equal(result?.coverUrl, 'https://example.test/almond.jpg');
});

void test('does not accept a mismatched NLK record for the requested ISBN', () => {
  const result = normalizeNlkResponse('9788936434267', {
    docs: [{ TITLE: 'Wrong book', EA_ISBN: '9780593321201' }],
  });
  assert.equal(result, null);
});
