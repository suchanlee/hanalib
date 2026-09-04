const ISBN_CHARACTERS = /[^0-9Xx]/g;

export function normalizeIsbn(value: string) {
  return value.replace(ISBN_CHARACTERS, '').toUpperCase();
}

export function isValidIsbn10(value: string) {
  const isbn = normalizeIsbn(value);
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;

  const checksum = isbn.split('').reduce((total, character, index) => {
    const digit = character === 'X' ? 10 : Number(character);
    return total + digit * (10 - index);
  }, 0);

  return checksum % 11 === 0;
}

export function isValidIsbn13(value: string) {
  const isbn = normalizeIsbn(value);
  if (!/^\d{13}$/.test(isbn)) return false;

  const checksum = isbn.split('').reduce(
    (total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3),
    0,
  );

  return checksum % 10 === 0;
}

export function isbn10To13(value: string) {
  const isbn10 = normalizeIsbn(value);
  if (!isValidIsbn10(isbn10)) return undefined;

  const body = `978${isbn10.slice(0, 9)}`;
  const weighted = body.split('').reduce(
    (total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  const checkDigit = (10 - (weighted % 10)) % 10;
  return `${body}${checkDigit}`;
}

export function isbn13To10(value: string) {
  const isbn13 = normalizeIsbn(value);
  if (!isValidIsbn13(isbn13) || !isbn13.startsWith('978')) return undefined;

  const body = isbn13.slice(3, 12);
  const weighted = body.split('').reduce(
    (total, character, index) => total + Number(character) * (10 - index),
    0,
  );
  const checkValue = (11 - (weighted % 11)) % 11;
  return `${body}${checkValue === 10 ? 'X' : checkValue}`;
}

export interface ParsedIsbn {
  input: string;
  isbn13: string;
  isbn10?: string;
}

export function parseIsbn(value: string): ParsedIsbn | undefined {
  const normalized = normalizeIsbn(value);
  if (isValidIsbn13(normalized)) return { input: normalized, isbn13: normalized };
  if (isValidIsbn10(normalized)) {
    const isbn13 = isbn10To13(normalized);
    if (isbn13) return { input: normalized, isbn10: normalized, isbn13 };
  }
  return undefined;
}
