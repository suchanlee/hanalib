import assert from 'node:assert/strict';
import test from 'node:test';

import { highResolutionCoverUrl } from '../lib/isbn/cover-url.ts';

void test('requests a wider Google Books image without changing zoom', () => {
  assert.equal(
    highResolutionCoverUrl('http://books.google.com/books/content?id=volume&img=1&zoom=1&edge=curl&source=gbs_api'),
    'https://books.google.com/books/content?id=volume&img=1&zoom=1&source=gbs_api&w=800',
  );
});

void test('preserves Google cover URLs that already identify a larger size', () => {
  assert.equal(
    highResolutionCoverUrl('https://books.google.com/books/content?id=volume&img=1&zoom=4&source=gbs_api'),
    'https://books.google.com/books/content?id=volume&img=1&zoom=4&source=gbs_api',
  );
});

void test('leaves non-Google cover providers unchanged except for HTTPS', () => {
  assert.equal(
    highResolutionCoverUrl('http://covers.openlibrary.org/b/id/123-L.jpg?default=false'),
    'https://covers.openlibrary.org/b/id/123-L.jpg?default=false',
  );
});

void test('leaves relative member-upload URLs unchanged', () => {
  assert.equal(highResolutionCoverUrl('/api/covers/asset-id'), '/api/covers/asset-id');
});
