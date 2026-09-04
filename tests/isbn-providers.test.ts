import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeGoogleBooksResponse,
  normalizeNaverBooksResponse,
  normalizeNlkResponse,
  normalizeOpenLibraryEditionResponse,
} from '../lib/isbn/server-normalizers.ts';

void test('normalizes an exact Google Books ISBN match', () => {
  const result = normalizeGoogleBooksResponse('9780593321201', {
    items: [{ volumeInfo: { title: 'Wrong', authors: ['Wrong'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780000000002' }] } }, {
      volumeInfo: {
        title: 'Tomorrow, and Tomorrow, and Tomorrow', authors: ['Gabrielle Zevin'], publisher: 'Knopf', publishedDate: '2022-07-05', language: 'en', pageCount: 416,
        imageLinks: { large: 'http://books.google.com/large.jpg', thumbnail: 'http://books.google.com/cover.jpg' }, industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780593321201' }],
      },
    }],
  });
  assert.equal(result?.title, 'Tomorrow, and Tomorrow, and Tomorrow');
  assert.equal(result?.publishedYear, 2022);
  assert.equal(result?.coverUrl, 'https://books.google.com/large.jpg');
});

void test('accepts an ISBN-10 identifier for the exact Google Books edition', () => {
  const result = normalizeGoogleBooksResponse('9780140328721', {
    items: [{ volumeInfo: { title: 'Fantastic Mr. Fox', authors: ['Roald Dahl'], industryIdentifiers: [{ type: 'ISBN_10', identifier: '0140328726' }] } }],
  });
  assert.equal(result?.title, 'Fantastic Mr. Fox');
});

void test('stitches complementary exact-edition Google records', () => {
  const result = normalizeGoogleBooksResponse('9788936434267', {
    items: [
      { volumeInfo: { title: '아몬드', authors: ['손원평'], industryIdentifiers: [{ identifier: '9788936434267' }] } },
      { volumeInfo: { title: '아몬드', publisher: '창비', publishedDate: '2017', pageCount: 263, industryIdentifiers: [{ identifier: '8936434268' }] } },
    ],
  });
  assert.equal(result?.publisher, '창비');
  assert.equal(result?.pageCount, 263);
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

void test('does not trust an NLK record with no edition identifier', () => {
  const result = normalizeNlkResponse('9788936434267', { docs: [{ TITLE: '아몬드' }] });
  assert.equal(result, null);
});

void test('normalizes an exact Korean Naver Books result and strips search markup', () => {
  const result = normalizeNaverBooksResponse('9788954682152', {
    items: [{
      title: '<b>작별하지 않는다</b>',
      author: '한강|Han Kang',
      publisher: '문학동네',
      pubdate: '20210909',
      isbn: '8954682154 9788954682152',
      image: 'http://bookthumb.phinf.naver.net/cover.jpg',
      description: '제주 4·3의 기억과 <b>사랑</b>.',
    }],
  });
  assert.equal(result?.title, '작별하지 않는다');
  assert.deepEqual(result?.authors, ['한강', 'Han Kang']);
  assert.equal(result?.publishedYear, 2021);
  assert.equal(result?.coverUrl, 'https://bookthumb.phinf.naver.net/cover.jpg');
  assert.equal(result?.description, '제주 4·3의 기억과 사랑.');
});

void test('rejects a near-match Naver edition', () => {
  const result = normalizeNaverBooksResponse('9788954682152', {
    items: [{ title: 'Wrong edition', isbn: '9788954682145' }],
  });
  assert.equal(result, null);
});

void test('normalizes exact Open Library editions in Korean and English', () => {
  const korean = normalizeOpenLibraryEditionResponse('9788954682152', {
    title: '작별하지 않는다', subtitle: '한강 장편소설', publishers: ['문학동네'], publish_date: '2021년 9월 9일',
    number_of_pages: 329, languages: [{ key: '/languages/kor' }], covers: [-1, 12345], isbn_10: ['8954682154'],
  }, ['한강']);
  assert.equal(korean?.title, '작별하지 않는다: 한강 장편소설');
  assert.deepEqual(korean?.authors, ['한강']);
  assert.equal(korean?.language, 'ko');
  assert.equal(korean?.publishedYear, 2021);
  assert.equal(korean?.coverUrl, 'https://covers.openlibrary.org/b/id/12345-L.jpg?default=false');

  const english = normalizeOpenLibraryEditionResponse('9780140328721', {
    title: 'Fantastic Mr. Fox', publishers: ['Puffin'], publish_date: 'October 1, 1988',
    languages: [{ key: '/languages/eng' }], isbn_13: ['9780140328721'], by_statement: 'by Roald Dahl',
  });
  assert.deepEqual(english?.authors, ['Roald Dahl']);
  assert.equal(english?.language, 'en');
  assert.equal(english?.publishedYear, 1988);
});

void test('rejects an Open Library response for a different edition', () => {
  const result = normalizeOpenLibraryEditionResponse('9780140328721', {
    title: 'Wrong edition', isbn_13: ['9780140328738'],
  }, ['Roald Dahl']);
  assert.equal(result, null);
});
