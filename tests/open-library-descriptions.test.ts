import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchOpenLibraryMetadata } from '../lib/isbn/server-lookup.ts';

const isbn = '9780571368709';
const synopsis =
  'A story about a family facing hard choices in their town. '.repeat(8);
const edition = {
  title: 'Small Things Like These',
  isbn_13: [isbn],
  authors: [{ key: '/authors/OL1A' }],
  languages: [{ key: '/languages/eng' }],
  works: [{ key: '/works/OL1W' }],
  publishers: ['Edition publisher'],
  publish_date: '2021',
};
const work = {
  key: '/works/OL1W',
  title: 'Small Things Like These',
  authors: [{ author: { key: '/authors/OL1A' } }],
  description: { value: synopsis },
  subjects: ['Fiction'],
};

async function lookup(ed = edition, wk: unknown = work, workStatus = 200) {
  const calls: string[] = [];
  const metadata = await fetchOpenLibraryMetadata(isbn, {
    fetchImpl: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      calls.push(url.pathname);
      if (url.pathname.startsWith('/isbn/')) return Response.json(ed);
      if (url.pathname.startsWith('/works/'))
        return Response.json(wk, { status: workStatus });
      if (url.pathname.startsWith('/authors/'))
        return Response.json({ name: 'Edition author' });
      return Response.json({ docs: [] });
    },
  });
  return { metadata, calls };
}

void test('uses a linked work synopsis with its provenance without replacing edition metadata', async () => {
  const { metadata, calls } = await lookup();
  assert.equal(metadata?.description, synopsis.trim());
  assert.equal(metadata?.descriptionScope, 'work');
  assert.equal(
    metadata?.descriptionSourceUrl,
    'https://openlibrary.org/works/OL1W',
  );
  assert.equal(metadata?.publisher, 'Edition publisher');
  assert.equal(metadata?.publishedYear, 2021);
  assert.deepEqual(metadata?.authors, ['Edition author']);
  assert.equal(calls.filter((p) => p.startsWith('/works/')).length, 1);
});

void test('rejects wrong works, conflicting authors, translations, ambiguous links, and unknown language', async () => {
  for (const wk of [
    { ...work, key: '/works/OL2W' },
    { ...work, title: 'A Different Novel' },
    { ...work, authors: [{ author: { key: '/authors/OL2A' } }] },
    {
      ...work,
      description: '이것은 한국어로 작성된 다른 소개입니다. '.repeat(10),
    },
  ])
    assert.equal((await lookup(edition, wk)).metadata?.description, undefined);
  assert.equal(
    (
      await lookup({
        ...edition,
        works: [...edition.works, { key: '/works/OL2W' }],
      })
    ).metadata?.description,
    undefined,
  );
  assert.equal(
    (await lookup({ ...edition, languages: [] })).metadata?.description,
    undefined,
  );
  assert.equal(
    (await lookup({ ...edition, isbn_13: ['9781451673265'] })).metadata,
    null,
  );
});

void test('work failure preserves exact edition description and useful metadata', async () => {
  const ed = { ...edition, description: 'The original edition synopsis.' };
  const { metadata } = await lookup(ed, { error: 'unavailable' }, 503);
  assert.equal(metadata?.description, ed.description);
  assert.equal(metadata?.descriptionScope, 'edition');
  assert.equal(
    metadata?.descriptionSourceUrl,
    `https://openlibrary.org/isbn/${isbn}`,
  );
  assert.equal(metadata?.title, edition.title);
});

void test('work Markdown is normalized and non-English text is not borrowed for an English edition', async () => {
  const result = await lookup(edition, {
    ...work,
    description: `**A story** about a family and their choices. Read [the introduction](https://example.org/book). ${synopsis}`,
  });
  assert.ok(result.metadata?.description?.startsWith('A story about a family'));
  assert.ok(!result.metadata?.description?.includes('https://example.org'));
  for (const description of [
    'Это история семьи и её трудного выбора. '.repeat(10),
    'Esta novela relata las experiencias de una familia durante una época difícil. '.repeat(
      10,
    ),
  ]) {
    assert.equal(
      (await lookup(edition, { ...work, description })).metadata?.description,
      undefined,
    );
  }
});
