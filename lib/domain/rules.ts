import type { CatalogItem, Loan } from './types';

export const REQUEST_EXPIRY_HOURS = 48;
export const FIRST_RETURN_CHECK_DAYS = 7;
export const RETURN_CHECK_INTERVAL_DAYS = 7;

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

function asDate(value: Date | string) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return date;
}

export function borrowRequestExpiresAt(requestedAt: Date | string) {
  return new Date(asDate(requestedAt).getTime() + REQUEST_EXPIRY_HOURS * HOUR_MS);
}

export function firstReturnCheckAt(startedAt: Date | string) {
  return new Date(asDate(startedAt).getTime() + FIRST_RETURN_CHECK_DAYS * DAY_MS);
}

export function followingReturnCheckAt(previousCheckAt: Date | string) {
  return new Date(asDate(previousCheckAt).getTime() + RETURN_CHECK_INTERVAL_DAYS * DAY_MS);
}

export function isBorrowRequestExpired(expiresAt: Date | string, now: Date | string = new Date()) {
  return asDate(expiresAt).getTime() <= asDate(now).getTime();
}

export function canArchiveItem(item: CatalogItem, viewerId: string) {
  return item.ownerId === viewerId && item.status !== 'borrowed';
}

export function canMarkLoanReturned(loan: Loan, viewerId: string) {
  return loan.status === 'active' && (loan.ownerId === viewerId || loan.borrowerId === viewerId);
}

export function normalizeCatalogSearch(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}
