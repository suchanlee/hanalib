import assert from 'node:assert/strict';
import test from 'node:test';
import { ResolvedBookProvider } from '../lib/isbn/providers.ts';
import {
  normalizeGoogleBooksResponse,
  normalizeKakaoBooksResponse,
  normalizeNaverBooksResponse,
  normalizeNlkResponse,
  normalizeOpenLibraryEditionResponse,
  normalizeOpenLibrarySearchResponse,
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

void test('upgrades Google thumbnail-only covers without risking a placeholder zoom', () => {
  const result = normalizeGoogleBooksResponse('9780571368709', {
    items: [{ volumeInfo: {
      title: 'Small Things Like These',
      imageLinks: { thumbnail: 'http://books.google.com/books/content?id=volume&img=1&zoom=1&edge=curl&source=gbs_api' },
      industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780571368709' }],
    } }],
  });
  assert.equal(
    result?.coverUrl,
    'https://books.google.com/books/content?id=volume&img=1&zoom=1&source=gbs_api&w=800',
  );
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

void test('normalizes an exact Kakao book and unwraps its higher-resolution cover asset', () => {
  const result = normalizeKakaoBooksResponse('9788996991342', {
    documents: [{
      title: '미움받을 용기',
      authors: ['기시미 이치로', '고가 후미타케'],
      publisher: '인플루엔셜',
      datetime: '2014-11-17T00:00:00.000+09:00',
      isbn: '8996991341 9788996991342',
      contents: '아들러 심리학을 대화체로 정리한 책.',
      thumbnail: 'https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=http%3A%2F%2Ft1.daumcdn.net%2Flbook%2Fimage%2F1467038',
    }],
  });
  assert.equal(result?.title, '미움받을 용기');
  assert.deepEqual(result?.authors, ['기시미 이치로', '고가 후미타케']);
  assert.equal(result?.publishedYear, 2014);
  assert.equal(result?.language, 'ko');
  assert.equal(result?.coverUrl, 'https://t1.daumcdn.net/lbook/image/1467038');
});

void test('rejects a mismatched Kakao book edition', () => {
  const result = normalizeKakaoBooksResponse('9788996991342', {
    documents: [{ title: 'Wrong edition', isbn: '9788996991343' }],
  });
  assert.equal(result, null);
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

void test('marks bilingual Open Library editions as other rather than guessing one language', () => {
  const result = normalizeOpenLibraryEditionResponse('9791186701140', {
    title: 'Talk to Me in Korean Workbook', subtitle: 'Level 5', isbn_13: ['9791186701140'],
    languages: [{ key: '/languages/eng' }, { key: '/languages/kor' }],
  });
  assert.equal(result?.title, 'Talk to Me in Korean Workbook: Level 5');
  assert.equal(result?.language, 'other');
});

void test('rejects an Open Library response for a different edition', () => {
  const result = normalizeOpenLibraryEditionResponse('9780140328721', {
    title: 'Wrong edition', isbn_13: ['9780140328738'],
  }, ['Roald Dahl']);
  assert.equal(result, null);
});

void test('normalizes an exact Open Library ISBN search fallback', () => {
  const result = normalizeOpenLibrarySearchResponse('9780140328721', {
    docs: [{
      title: 'Fantastic Mr. Fox', author_name: ['Roald Dahl'], publisher: ['Puffin'],
      first_publish_year: 1970, language: ['eng'], isbn: ['0140328726', '9780140328721'], cover_i: 8739161,
    }],
  });
  assert.equal(result?.title, 'Fantastic Mr. Fox');
  assert.deepEqual(result?.authors, ['Roald Dahl']);
  assert.equal(result?.publisher, 'Puffin');
  assert.equal(result?.language, 'en');
  assert.equal(result?.coverUrl, 'https://covers.openlibrary.org/b/id/8739161-L.jpg?default=false');
});

void test('rejects mismatched search results and ambiguous aggregate publishers', () => {
  assert.equal(normalizeOpenLibrarySearchResponse('9780140328721', {
    docs: [{ title: 'Wrong edition', isbn: ['9780140328738'] }],
  }), null);
  const aggregate = normalizeOpenLibrarySearchResponse('9780140328721', {
    docs: [{ title: 'Fantastic Mr. Fox', isbn: ['9780140328721'], publisher: ['Puffin', 'Knopf'] }],
  });
  assert.equal(aggregate?.publisher, undefined);
});

void test('does not reuse cached lookup failures when a member retries', async () => {
  const originalFetch = globalThis.fetch;
  let cacheMode: RequestCache | undefined;
  globalThis.fetch = async (_input, init) => {
    cacheMode = init?.cache;
    return Response.json({
      isbn13: '9780140328721', title: 'Fantastic Mr. Fox', authors: ['Roald Dahl'],
      publisher: 'Puffin', publishedYear: 1988, language: 'en', provenance: { title: 'open-library' },
    });
  };
  try {
    const result = await new ResolvedBookProvider().lookup('9780140328721', 'en');
    assert.equal(result?.title, 'Fantastic Mr. Fox');
    assert.equal(cacheMode, 'no-store');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
