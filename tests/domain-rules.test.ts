import assert from 'node:assert/strict';
import test from 'node:test';
import { borrowRequestExpiresAt, canArchiveItem, canMarkLoanReturned, firstReturnCheckAt, followingReturnCheckAt, holdOfferExpiresAt, isBorrowRequestExpired, normalizeCatalogSearch } from '../lib/domain/rules.ts';
import type { CatalogItem, Loan } from '../lib/domain/types.ts';

void test('borrow requests expire exactly 48 hours after creation', () => {
  assert.equal(borrowRequestExpiresAt('2026-09-04T12:00:00.000Z').toISOString(), '2026-09-06T12:00:00.000Z');
  assert.equal(isBorrowRequestExpired('2026-09-06T12:00:00.000Z', '2026-09-06T11:59:59.999Z'), false);
  assert.equal(isBorrowRequestExpired('2026-09-06T12:00:00.000Z', '2026-09-06T12:00:00.000Z'), true);
});

void test('hold offers reserve a returned copy for exactly 48 hours', () => {
  assert.equal(holdOfferExpiresAt('2026-09-04T12:00:00.000Z').toISOString(), '2026-09-06T12:00:00.000Z');
});

void test('return checks begin after day seven and repeat weekly', () => {
  const first = firstReturnCheckAt('2026-09-04T12:00:00.000Z');
  assert.equal(first.toISOString(), '2026-09-11T12:00:00.000Z');
  assert.equal(followingReturnCheckAt(first).toISOString(), '2026-09-18T12:00:00.000Z');
});

void test('only an owner can archive and a borrowed copy cannot be archived', () => {
  const item = { ownerId: 'member-1', status: 'available' } as CatalogItem;
  assert.equal(canArchiveItem(item, 'member-1'), true);
  assert.equal(canArchiveItem({ ...item, status: 'borrowed' }, 'member-1'), false);
  assert.equal(canArchiveItem(item, 'member-2'), false);
});

void test('borrower or owner can record a return while a loan is active', () => {
  const loan = { status: 'active', ownerId: 'owner', borrowerId: 'borrower' } as Loan;
  assert.equal(canMarkLoanReturned(loan, 'owner'), true);
  assert.equal(canMarkLoanReturned(loan, 'borrower'), true);
  assert.equal(canMarkLoanReturned(loan, 'someone-else'), false);
  assert.equal(canMarkLoanReturned({ ...loan, status: 'returned' }, 'owner'), false);
});

void test('catalog search normalizes Korean and Latin input consistently', () => {
  assert.equal(normalizeCatalogSearch('  불편한 편의점  '), '불편한 편의점');
  assert.equal(normalizeCatalogSearch('  THE Midnight LIBRARY '), 'the midnight library');
});
