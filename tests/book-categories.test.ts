import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySubjects } from '../lib/books/classify.ts';
import {
  bookCategoryGroups,
  categoryLabels,
  confirmCategories,
  matchesCategory,
  validBookCategories,
  validCategoryCodes,
} from '../lib/books/categories.ts';
import {
  normalizeAladinResponse,
  normalizeGoogleBooksResponse,
} from '../lib/isbn/server-normalizers.ts';
import { stitchMetadata } from '../lib/isbn/providers.ts';
import {
  fetchAladinMetadata,
  resolveBookMetadata,
} from '../lib/isbn/server-lookup.ts';

void test('Korean and English fiction categories have the same browsing identity', () => {
  const ko = classifySubjects([
    {
      source: 'aladin',
      subjects: ['국내도서>소설/시/희곡>한국소설>2000년대 이후 한국소설'],
    },
  ]);
  const en = classifySubjects([
    { source: 'google-books', subjects: ['Fiction / Literary'] },
  ]);
  assert.deepEqual(bookCategoryGroups(ko), ['fiction']);
  assert.deepEqual(bookCategoryGroups(en), ['fiction']);
  assert.deepEqual(categoryLabels(ko, 'en'), ['Fiction & literature']);
  assert.deepEqual(categoryLabels(en, 'ko'), ['소설·문학']);
  for (const locale of ['ko', 'en'] as const) {
    const result = stitchMetadata('9780571368709', locale, [
      {
        source: 'google-books',
        isbn13: '9780571368709',
        title: 'Book',
        subjects: ['Fiction / Mystery & Detective / General'],
      },
    ]);
    assert.deepEqual(result.categories?.codes, ['FF']);
    assert.ok(matchesCategory(result.categories, 'mystery'));
    assert.ok(matchesCategory(result.categories, 'fiction'));
  }
});

void test('department names, awards, plot topics and reader age do not become adult genres', () => {
  for (const [source, subjects] of [
    ['aladin', ['국내도서>소설/시/희곡>세계의 문학>아일랜드문학']],
    ['aladin', ['국내도서>추천도서>국내 문학상>창비청소년문학상']],
    ['open-library', ['Homicide', 'Murder', 'Missing persons', 'The Future']],
  ] as const) {
    const categories = classifySubjects([{ source, subjects: [...subjects] }]);
    assert.equal(categories?.status, 'review');
    assert.deepEqual(bookCategoryGroups(categories), []);
    assert.ok(matchesCategory(categories, 'uncategorized'));
    assert.ok(!matchesCategory(categories, 'mystery'));
  }
});

void test('maps essays, poetry and religion without relying on misleading titles', () => {
  const cases = [
    ['국내도서>에세이>음식에세이', 'DNL'],
    ['국내도서>소설/시/희곡>시>한국시', 'DCF'],
    [
      '국내도서>종교/역학>기독교(개신교)>기독교(개신교) 신앙생활>사랑/결혼',
      'QRMP',
    ],
    ['국내도서>소설/시/희곡>소설>SF', 'FL'],
  ];
  for (const [subject, code] of cases)
    assert.deepEqual(
      classifySubjects([{ source: 'aladin', subjects: [subject] }])?.codes,
      [code],
    );
});

void test('overlapping categories appear in every matching filter and owners can narrow them', () => {
  const proposal = classifySubjects([
    {
      source: 'aladin',
      subjects: [
        '외국도서>과학/수학/생태>과학>생명과학>진화',
        '외국도서>역사>문명',
      ],
    },
  ]);
  assert.equal(proposal?.status, 'suggested');
  assert.ok(matchesCategory(proposal, 'science'));
  assert.ok(matchesCategory(proposal, 'history'));
  assert.ok(!matchesCategory(proposal, 'uncategorized'));
  const confirmed = confirmCategories(['NHTB'], proposal);
  assert.ok(matchesCategory(confirmed, 'history'));
  assert.ok(!matchesCategory(confirmed, 'science'));
  assert.deepEqual(confirmed.evidence, proposal?.evidence);
  assert.ok(matchesCategory(confirmCategories([], confirmed), 'uncategorized'));
});

void test('multiple providers and mixed genre paths retain supported categories without duplicating browsing groups', () => {
  const categories = classifySubjects([
    {
      source: 'google-books',
      subjects: [
        'Fiction / Mystery & Detective / Thrillers',
        'Fiction / Classics',
        'Fiction / Contemporary',
        'Art / General',
      ],
    },
    {
      source: 'aladin',
      subjects: [
        '국내도서>에세이>사진/그림 에세이',
        '국내도서>만화/라이트노벨>그래픽노블',
      ],
    },
    {
      source: 'open-library',
      subjects: ['Essays', 'Homicide', 'Missing persons'],
    },
  ]);
  assert.equal(categories?.status, 'suggested');
  assert.deepEqual(bookCategoryGroups(categories), [
    'fiction',
    'mystery',
    'thriller',
    'essays',
    'comics',
    'art',
  ]);
  assert.deepEqual(categoryLabels(categories, 'ko'), [
    '소설·문학',
    '추리·미스터리',
    '스릴러',
    '에세이',
    '만화·그래픽노블',
    '예술',
  ]);
  assert.equal(categories?.evidence.length, 3);
  assert.ok(!matchesCategory(categories, 'romance'));
});

void test('strict category input validation rejects unknown codes and oversized evidence', () => {
  assert.equal(validCategoryCodes(['UNKNOWN']), false);
  assert.equal(validCategoryCodes(['FB', 'FB']), false);
  assert.equal(
    validBookCategories({
      version: 1,
      status: 'confirmed',
      codes: ['FB'],
      evidence: [{ source: 'audit', subjects: ['x'.repeat(501)] }],
    }),
    false,
  );
  assert.equal(
    validBookCategories({
      version: 1,
      status: 'confirmed',
      codes: ['FB'],
      evidence: [null],
    }),
    false,
  );
  assert.equal(validBookCategories(confirmCategories(['FB'])), true);
});

void test('provider categories are accepted only from exact ISBN records, including ISBN-10 equivalents', () => {
  const isbn = '9780679720201';
  assert.equal(
    normalizeAladinResponse(isbn, {
      item: [
        {
          isbn13: '9780571368709',
          title: 'Wrong',
          categoryName: 'Fiction / Mystery',
        },
      ],
    }),
    null,
  );
  assert.deepEqual(
    normalizeAladinResponse(isbn, {
      item: [
        {
          isbn: '0679720200',
          title: 'The Stranger',
          categoryName: 'Fiction / Classics',
        },
      ],
    })?.subjects,
    ['Fiction / Classics'],
  );
  const google = normalizeGoogleBooksResponse(isbn, {
    items: [
      {
        volumeInfo: {
          title: 'Wrong',
          industryIdentifiers: [{ identifier: '9780571368709' }],
          categories: ['Fiction / Mystery'],
        },
      },
      {
        volumeInfo: {
          title: 'The Stranger',
          industryIdentifiers: [{ identifier: isbn }],
          categories: ['Fiction / Classics'],
        },
      },
    ],
  });
  assert.deepEqual(google?.subjects, ['Fiction / Classics']);
});

void test('Aladin uses the documented ISBN13 endpoint and reports failures without leaking credentials', async () => {
  const result = await fetchAladinMetadata('9780679720201', 'test-secret', {
    fetchImpl: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      assert.equal(url.origin, 'https://www.aladin.co.kr');
      assert.equal(url.pathname, '/ttb/api/ItemLookUp.aspx');
      assert.equal(url.searchParams.get('itemIdType'), 'ISBN13');
      assert.equal(url.searchParams.get('ItemId'), '9780679720201');
      return Response.json({
        item: [
          {
            isbn13: '9780679720201',
            title: 'The Stranger',
            categoryName: 'Fiction / Classics',
          },
        ],
      });
    },
  });
  assert.equal(result?.source, 'aladin');
  await assert.rejects(
    fetchAladinMetadata('9780679720201', 'test-secret', {
      fetchImpl: async () =>
        Response.json({ errorCode: 1, errorMessage: 'test-secret' }),
    }),
    (e: Error) => !e.message.includes('test-secret'),
  );
});

void test('Aladin outage preserves Google categories and no Aladin key remains optional', async () => {
  const result = await resolveBookMetadata(
    '9780679720201',
    'ko',
    { aladinTtbKey: 'key', googleBooksApiKey: 'key' },
    {
      fetchImpl: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.hostname === 'www.googleapis.com')
          return Response.json({
            items: [
              {
                volumeInfo: {
                  title: 'The Stranger',
                  publisher: 'Vintage',
                  authors: ['Albert Camus'],
                  categories: ['Fiction / Classics'],
                  industryIdentifiers: [{ identifier: '9780679720201' }],
                },
              },
            ],
          });
        return Response.json(
          {},
          { status: url.hostname === 'www.aladin.co.kr' ? 503 : 404 },
        );
      },
    },
  );
  assert.equal(result.providerStatus.aladin, 'failed');
  assert.deepEqual(result.metadata?.categories?.codes, ['FBC']);
});

void test('youth genres remain discoverable independently from audience', () => {
  for (const subject of ['Juvenile Fiction', 'Young Adult Fiction', '국내도서/어린이/동화']) {
    assert.deepEqual(bookCategoryGroups(classifySubjects([{source: 'google-books', subjects: [subject]}])), ['fiction']);
  }
  assert.deepEqual(bookCategoryGroups(classifySubjects([{source: 'google-books', subjects: ['Juvenile Fiction / Comics & Graphic Novels']} ])), ['fiction', 'comics']);
  assert.deepEqual(bookCategoryGroups(classifySubjects([{source: 'google-books', subjects: ['Young Adult Fiction / Fantasy']} ])), ['fiction', 'fantasy']);
  assert.deepEqual(bookCategoryGroups(classifySubjects([{source: 'google-books', subjects: ['Juvenile Nonfiction']} ])), []);
});

void test('practical categories represented in the catalog are mapped', () => {
  for (const [subject, group] of [['Cooking', 'cooking'], ['Photography', 'art'], ['Crafts & Hobbies', 'crafts'], ['Marathon running', 'sports'], ['Technology & Engineering', 'technology'], ['Computers', 'computing']]) {
    assert.deepEqual(bookCategoryGroups(classifySubjects([{source: 'google-books', subjects: [subject]}])), [group]);
  }
});
