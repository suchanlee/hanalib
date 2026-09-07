import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchGoogleBooksMetadata,
  fetchOpenLibraryMetadata,
  resolveBookMetadata,
  type FetchLike,
} from '../lib/isbn/server-lookup.ts';

const isbn = '9780062049643';
const full =
  'The book follows a family as they face difficult choices and discover what matters in their lives. '
    .repeat(5)
    .trim();
const base = {
  key: '/books/OL1M',
  title: 'A Story',
  isbn_13: [isbn],
  works: [{ key: '/works/OL1W' }],
  publishers: ['Original publisher'],
};
const work = {
  key: '/works/OL1W',
  title: 'A Story',
  description: full,
  authors: [{ author: { key: '/authors/OL1A' } }],
};
const alt = {
  ...base,
  key: '/books/OL2M',
  languages: [{ key: '/languages/eng' }],
  authors: [{ key: '/authors/OL1A' }],
  publishers: ['Different publisher'],
};
function ol(
  options: {
    edition?: object;
    work?: object;
    alternatives?: object[];
    search?: object;
  } = {},
): FetchLike {
  return async (input) => {
    const u = new URL(input instanceof Request ? input.url : String(input));
    if (u.pathname.startsWith('/isbn/'))
      return Response.json(options.edition ?? base);
    if (u.pathname.endsWith('/editions.json'))
      return Response.json({ entries: options.alternatives ?? [alt] });
    if (u.pathname.startsWith('/works/'))
      return Response.json(options.work ?? work);
    if (u.pathname.startsWith('/authors/'))
      return Response.json({ name: 'A Writer' });
    return Response.json(options.search ?? { docs: [] });
  };
}

void test('corroborates missing language from an exact-ISBN edition without changing publisher', async () => {
  const r = await fetchOpenLibraryMetadata(isbn, { fetchImpl: ol() });
  assert.equal(r?.description, full);
  assert.equal(r?.descriptionScope, 'work');
  assert.equal(r?.publisher, 'Original publisher');
  assert.equal(r?.language, 'en');
});

void test('rejects mismatched ISBN/work/author/language alternatives and conflicting language evidence', async () => {
  for (const alternatives of [
    [{ ...alt, isbn_13: ['9781451673265'] }],
    [{ ...alt, works: [{ key: '/works/OL2W' }] }],
    [{ ...alt, title: 'Another Story' }],
    [{ ...alt, languages: [{ key: '/languages/kor' }] }],
    [
      alt,
      { ...alt, key: '/books/OL3M', languages: [{ key: '/languages/kor' }] },
    ],
  ])
    assert.equal(
      (
        await fetchOpenLibraryMetadata(isbn, {
          fetchImpl: ol({ alternatives }),
        })
      )?.description,
      undefined,
    );
  assert.equal(
    (
      await fetchOpenLibraryMetadata(isbn, {
        fetchImpl: ol({
          edition: { ...base, authors: [{ key: '/authors/OL2A' }] },
        }),
      })
    )?.description,
    undefined,
  );
});

void test('allows a series prefix only with corroborated author and explicit work link', async () => {
  const edition = {
    ...base,
    title: 'The Series: A Story',
    languages: [{ key: '/languages/eng' }],
  };
  const search = {
    docs: [{ title: 'A Story', isbn: [isbn], author_name: ['A Writer'] }],
  };
  assert.equal(
    (
      await fetchOpenLibraryMetadata(isbn, {
        fetchImpl: ol({ edition, search, alternatives: [] }),
      })
    )?.description,
    full,
  );
  assert.equal(
    (
      await fetchOpenLibraryMetadata(isbn, {
        fetchImpl: ol({ edition, alternatives: [] }),
      })
    )?.description,
    undefined,
  );
  assert.equal(
    (
      await fetchOpenLibraryMetadata(isbn, {
        fetchImpl: ol({
          edition: { ...edition, authors: [{ key: '/authors/OL2A' }] },
          search,
          alternatives: [],
        }),
      })
    )?.description,
    undefined,
  );
});

void test('keeps translations, mixed-language text, and novel/adaptation mismatches out', async () => {
  const edition = { ...alt, key: base.key };
  for (const description of [
    '한국어 소개입니다. '.repeat(30),
    full +
      '\n\n' +
      'Esta novela relata las experiencias de una familia durante una época difícil. '.repeat(
        6,
      ),
  ])
    assert.equal(
      (
        await fetchOpenLibraryMetadata(isbn, {
          fetchImpl: ol({
            edition,
            work: { ...work, description },
            alternatives: [],
          }),
        })
      )?.description,
      undefined,
    );
  assert.equal(
    (
      await fetchOpenLibraryMetadata(isbn, {
        fetchImpl: ol({
          edition: { ...edition, subtitle: 'A graphic novel' },
          alternatives: [],
        }),
      })
    )?.description,
    undefined,
  );
});

void test('discovers an exact edition after ISBN lookup misses and rejects unrelated detail records', async () => {
  for (const matches of [true, false]) {
    const fetchImpl: FetchLike = async (input) => {
      const u = new URL(input instanceof Request ? input.url : String(input));
      if (u.pathname.startsWith('/isbn/'))
        return Response.json({}, { status: 404 });
      if (u.pathname === '/search.json')
        return Response.json(
          u.searchParams.get('fields')?.includes('editions')
            ? { docs: [{ editions: { docs: [{ key: '/books/OL2M' }] } }] }
            : { docs: [] },
        );
      if (u.pathname === '/books/OL2M.json')
        return Response.json({
          ...alt,
          description: full,
          isbn_13: [matches ? isbn : '9781451673265'],
        });
      return ol({ alternatives: [] })(input);
    };
    assert.equal(
      (await fetchOpenLibraryMetadata(isbn, { fetchImpl }))?.description,
      matches ? full : undefined,
    );
  }
});

void test('retries a transient work failure once and reports persistent failures honestly', async () => {
  for (const persistent of [false, true]) {
    let attempts = 0;
    const r = await resolveBookMetadata(
      isbn,
      'en',
      {},
      {
        fetchImpl: async (input) => {
          if (
            new URL(input instanceof Request ? input.url : String(input))
              .pathname === '/works/OL1W.json' &&
            (++attempts === 1 || persistent)
          )
            return Response.json({}, { status: 503 });
          return ol({ edition: { ...alt, key: base.key }, alternatives: [] })(
            input,
          );
        },
      },
    );
    assert.equal(attempts, 2);
    assert.equal(
      r.providerStatus['open-library'],
      persistent ? 'partial' : 'ok',
    );
    assert.equal(r.metadata?.description, persistent ? undefined : full);
    assert.ok(
      r.diagnostics.some(
        (e) =>
          e.stage === 'work:/works/OL1W' &&
          e.attempts === 2 &&
          e.outcome === (persistent ? 'failed' : 'ok'),
      ),
    );
  }
  const r = await resolveBookMetadata(
    isbn,
    'en',
    {},
    {
      fetchImpl: async (input) =>
        new URL(
          input instanceof Request ? input.url : String(input),
        ).pathname.startsWith('/isbn/')
          ? Response.json({}, { status: 503 })
          : Response.json({ docs: [] }),
    },
  );
  assert.equal(r.providerStatus['open-library'], 'failed');
});

void test('Google enriches title-only ISBN13 hits with ISBN10 and exact volume details', async () => {
  const queries: string[] = [];
  const info = {
    title: 'A Story',
    language: 'en',
    industryIdentifiers: [{ identifier: isbn }],
  };
  const r = await fetchGoogleBooksMetadata(isbn, 'test-secret', {
    fetchImpl: async (input) => {
      const u = new URL(input instanceof Request ? input.url : String(input));
      queries.push(u.pathname + '?' + (u.searchParams.get('q') ?? ''));
      if (u.pathname.endsWith('/volume-one'))
        return Response.json({
          id: 'volume-one',
          volumeInfo: { ...info, description: full },
        });
      return Response.json({ items: [{ id: 'volume-one', volumeInfo: info }] });
    },
  });
  assert.deepEqual(queries, [
    '/books/v1/volumes?isbn:9780062049643',
    '/books/v1/volumes?isbn:006204964X',
    '/books/v1/volumes/volume-one?',
  ]);
  assert.equal(r?.description, full);
  assert.equal(
    r?.descriptionSourceUrl,
    'https://books.google.com/books?id=volume-one',
  );
});

void test('Google ignores wrong-ISBN detail text and bounds detail requests', async () => {
  const paths: string[] = [];
  const r = await fetchGoogleBooksMetadata(isbn, 'test-secret', {
    fetchImpl: async (input) => {
      const u = new URL(input instanceof Request ? input.url : String(input));
      paths.push(u.pathname);
      if (u.pathname != '/books/v1/volumes')
        return Response.json({
          id: u.pathname.split('/').pop(),
          volumeInfo: {
            title: 'Other Book',
            description: full,
            industryIdentifiers: [{ identifier: '9781451673265' }],
          },
        });
      return Response.json({
        items: Array.from({ length: 10 }, (_, i) => ({
          id: `volume-${i}`,
          volumeInfo: {
            title: 'A Story',
            industryIdentifiers: [{ identifier: isbn }],
          },
        })),
      });
    },
  });
  assert.equal(r?.description, undefined);
  assert.equal(paths.filter((p) => p != '/books/v1/volumes').length, 3);
});

void test('quota exhaustion stops Google enrichment and does not leak credentials in diagnostics', async () => {
  let count = 0;
  const events: unknown[] = [];
  await assert.rejects(
    fetchGoogleBooksMetadata(isbn, 'private-key', {
      onDiagnostic: (e) => events.push(e),
      fetchImpl: async () => {
        count++;
        return Response.json({}, { status: 429 });
      },
    }),
  );
  assert.equal(count, 1);
  assert.ok(JSON.stringify(events).includes('http-429'));
  assert.ok(!JSON.stringify(events).includes('private-key'));
});

void test('recognizes plural graphic-novel subjects when corroborating an adaptation', async () => {
  const r = await fetchOpenLibraryMetadata(isbn, {
    fetchImpl: ol({
      alternatives: [{ ...alt, by_statement: 'A graphic novel by A Writer' }],
      work: { ...work, subjects: ['Graphic novels'] },
    }),
  });
  assert.equal(r?.description, full);
  assert.equal(r?.descriptionScope, 'work');
});

void test('slow search does not block edition enrichment and language corroboration starts with the work', async () => {
  const paths: string[] = [];
  let finishSearch: ((response: Response) => void) | undefined;
  const r = await fetchOpenLibraryMetadata(isbn, {
    timeoutMs: 100,
    fetchImpl: async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input))
        .pathname;
      paths.push(path);
      if (path === '/search.json')
        return new Promise<Response>((resolve, reject) => {
          finishSearch = resolve;
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('deadline')),
            { once: true },
          );
        });
      if (path.endsWith('/editions.json'))
        finishSearch?.(Response.json({ docs: [] }));
      return ol()(input, init);
    },
  });
  assert.equal(r?.description, full);
  assert.ok(
    paths.indexOf('/works/OL1W/editions.json') <
      paths.indexOf('/works/OL1W.json'),
  );
});
