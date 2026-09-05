import assert from 'node:assert/strict';
import test from 'node:test';
import { appHref, appRouteFromLocation, sameAppRoute } from '../features/app/app-history.ts';

void test('creates stable URLs for every app screen', () => {
  assert.equal(appHref('catalog'), '/');
  assert.equal(appHref('intake'), '/?view=scan');
  assert.equal(appHref('borrowing'), '/?view=borrowing');
  assert.equal(appHref('settings'), '/?view=settings');
  assert.equal(appHref('detail', 'item/a b'), '/?book=item%2Fa%20b');
});

void test('restores screens and book details from browser locations', () => {
  assert.deepEqual(appRouteFromLocation('/', ''), { screen: 'catalog' });
  assert.deepEqual(appRouteFromLocation('/', '?view=scan'), { screen: 'intake' });
  assert.deepEqual(appRouteFromLocation('/', '?view=borrowing'), { screen: 'borrowing' });
  assert.deepEqual(appRouteFromLocation('/', '?view=settings'), { screen: 'settings' });
  assert.deepEqual(appRouteFromLocation('/', '?book=item%2Fa%20b'), { screen: 'detail', selectedItemId: 'item/a b' });
});

void test('keeps existing deep links compatible', () => {
  assert.deepEqual(appRouteFromLocation('/settings/'), { screen: 'settings' });
  assert.deepEqual(appRouteFromLocation('/borrowing'), { screen: 'borrowing' });
  assert.deepEqual(appRouteFromLocation('/scan'), { screen: 'intake' });
  assert.deepEqual(appRouteFromLocation('/books/item%2Fone'), { screen: 'detail', selectedItemId: 'item/one' });
  assert.equal(appRouteFromLocation('/privacy'), undefined);
});

void test('compares the selected book as part of route identity', () => {
  assert.equal(sameAppRoute({ screen: 'detail', selectedItemId: 'one' }, { screen: 'detail', selectedItemId: 'one' }), true);
  assert.equal(sameAppRoute({ screen: 'detail', selectedItemId: 'one' }, { screen: 'detail', selectedItemId: 'two' }), false);
});
