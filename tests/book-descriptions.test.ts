import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  bestDescription,
  cleanDescription,
  isFullerDescription,
  MAX_DESCRIPTION_LENGTH,
} from '../lib/books/descriptions.ts';
import { stitchMetadata } from '../lib/isbn/providers.ts';
import { normalizeGoogleBooksResponse } from '../lib/isbn/server-normalizers.ts';
import { resolveBookMetadata } from '../lib/isbn/server-lookup.ts';

const {
  rows: [repair],
} = JSON.parse(
  readFileSync(
    new URL(
      '../docs/audits/2026-09-06-description-repair.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

void test('full Korean descriptions beat Kakao snippets in either UI language and preserve source', () => {
  for (const locale of ['ko', 'en'] as const) {
    const metadata = stitchMetadata(repair.isbn13, locale, [
      {
        source: 'kakao-books',
        isbn13: repair.isbn13,
        title: '성을 알면 달라지는 것들',
        language: 'ko',
        description: repair.expected_description,
      },
      {
        source: 'google-books',
        isbn13: repair.isbn13,
        title: '성을 알면 달라지는 것들',
        language: 'ko',
        description: `<p>${repair.description}</p>`,
      },
      {
        source: 'aladin',
        isbn13: '9780571368709',
        description: 'An unrelated book. '.repeat(30),
      },
    ]);
    assert.equal(metadata.description, repair.description);
    assert.equal(metadata.provenance.description, 'google-books');
  }
});

void test('description selection preserves language, deduplicates Google records by quality, and includes Aladin', () => {
  const candidates = [
    { source: 'kakao-books', description: repair.expected_description },
    {
      source: 'google-books',
      description: 'Long English description. '.repeat(30),
    },
    { source: 'aladin', description: repair.description },
  ];
  assert.equal(
    bestDescription(candidates, 'ko', ['kakao-books', 'google-books', 'aladin'])
      ?.source,
    'aladin',
  );
  assert.equal(bestDescription(candidates, 'en', [])?.source, 'google-books');
  const result = normalizeGoogleBooksResponse(repair.isbn13, {
    items: [repair.expected_description, repair.description].map(
      (description) => ({
        volumeInfo: {
          title: '성을 알면 달라지는 것들',
          description,
          industryIdentifiers: [{ identifier: repair.isbn13 }],
        },
      }),
    ),
  });
  assert.equal(result?.description, repair.description);
});

void test('provider HTML becomes plain text with paragraphs and without executable markup', () => {
  assert.equal(
    cleanDescription(
      '<p>First &amp; second.</p><script>alert(1)</script><p>Next<br>line &#xD55C;.</p>',
    ),
    'First & second.\nNext\nline 한.',
  );
  assert.equal(cleanDescription('<style>p{}</style>   '), undefined);
  assert.equal(cleanDescription('&#99999999;'), undefined);
});

void test('refresh offers only a usable improvement and never combines texts or languages', () => {
  assert.ok(
    isFullerDescription(repair.expected_description, repair.description),
  );
  assert.ok(
    !isFullerDescription(repair.description, repair.expected_description),
  );
  assert.ok(
    !isFullerDescription('My personal introduction.', repair.description),
  );
  assert.ok(!isFullerDescription(repair.description, repair.description));
  assert.ok(
    !isFullerDescription(undefined, 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1)),
  );
  assert.ok(isFullerDescription(undefined, repair.description));
});

void test('real resolver preserves a full provider response beyond the former intake limit', async () => {
  const full =
    'Full paragraph with meaningful details.\n\n'.repeat(160) +
    'The final sentence survives.';
  assert.ok(full.length > 5_000);
  const result = await resolveBookMetadata(
    '9780571368709',
    'en',
    { googleBooksApiKey: 'test', kakaoRestApiKey: 'test' },
    {
      fetchImpl: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.hostname === 'www.googleapis.com')
          return Response.json({
            items: [
              {
                volumeInfo: {
                  title: 'Book',
                  language: 'en',
                  description: full,
                  industryIdentifiers: [{ identifier: '9780571368709' }],
                },
              },
            ],
          });
        if (url.hostname === 'dapi.kakao.com')
          return Response.json({
            documents: [
              {
                title: 'Book',
                isbn: '9780571368709',
                contents: full.slice(0, 250),
              },
            ],
          });
        return Response.json({}, { status: 404 });
      },
    },
  );
  assert.equal(result.metadata?.description, full);
  assert.equal(result.metadata?.provenance.description, 'google-books');
});

void test('unavailable or description-free providers retain the available snippet without inventing an ending', () => {
  const metadata = stitchMetadata(repair.isbn13, 'ko', [
    {
      source: 'kakao-books',
      isbn13: repair.isbn13,
      title: '성을 알면 달라지는 것들',
      description: repair.expected_description,
    },
    {
      source: 'google-books',
      isbn13: repair.isbn13,
      title: '성을 알면 달라지는 것들',
    },
  ]);
  assert.equal(metadata.description, repair.expected_description);
});

void test('publication notes yield to synopses and review credits do not make long descriptions look truncated', () => {
  const synopsis =
    'A reader follows the characters as they confront a difficult decision and discover how their choices affect the people around them. '.repeat(
      4,
    );
  for (const note of [
    'Originally published: New York: Ballantine Books, 1953.',
    '"Now with a Just Finish plan for new runners!"--Front cover.',
  ]) {
    assert.ok(isFullerDescription(note, synopsis));
    assert.equal(
      bestDescription(
        [
          { source: 'google-books', description: note },
          { source: 'open-library', description: synopsis },
        ],
        'en',
        ['google-books', 'open-library'],
      )?.source,
      'open-library',
    );
  }
  for (const tail of [
    '—The Guardian',
    '*#1 New York Times Bestseller - September 2021',
    'World of Reading: Super Hero Hiccups',
  ]) {
    const full = synopsis + tail;
    assert.equal(
      bestDescription(
        [
          { source: 'google-books', description: full },
          {
            source: 'kakao-books',
            description: 'A shorter complete description.',
          },
        ],
        'en',
        ['kakao-books', 'google-books'],
      )?.value,
      full,
    );
    assert.ok(!isFullerDescription(full, 'A shorter complete description.'));
  }
  assert.ok(
    !isFullerDescription(
      'A complete short description.',
      'A different complete description.',
    ),
  );
});

void test('stitching rejects every field from unrelated ISBNs and Korean author spelling does not change an English edition language', async () => {
  const { normalizeKakaoBooksResponse } =
    await import('../lib/isbn/server-normalizers.ts');
  const isbn = '9780241552292';
  const kakao = normalizeKakaoBooksResponse(isbn, {
    documents: [
      {
        title: 'Eichmann in Jerusalem',
        authors: ['한나 아렌트'],
        isbn,
        contents: 'A short English synopsis.',
      },
    ],
  })!;
  assert.equal(kakao.language, undefined);
  const selected = stitchMetadata(isbn, 'ko', [
    { ...kakao, source: 'kakao-books' },
    {
      source: 'open-library',
      isbn13: isbn,
      title: 'Eichmann in Jerusalem',
      language: 'en',
      description: 'An extended English introduction. '.repeat(15),
      descriptionScope: 'work',
      descriptionSourceUrl: 'https://openlibrary.org/works/OL1386647W',
    },
    {
      source: 'nlk',
      isbn13: '9788932817842',
      title: 'Wrong Korean title',
      language: 'ko',
      subjects: ['Science'],
    },
  ]);
  assert.equal(selected.title, 'Eichmann in Jerusalem');
  assert.equal(selected.language, 'en');
  assert.equal(selected.provenance.descriptionScope, 'work');
  assert.equal(
    selected.provenance.descriptionUrl,
    'https://openlibrary.org/works/OL1386647W',
  );
});
