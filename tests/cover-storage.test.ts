import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CoverValidationError,
  createCoverObjectKey,
  MAX_COVER_BYTES,
  readBytesWithLimit,
  safeOriginalFilename,
  sniffCoverContentType,
  validateCoverUpload,
} from '../lib/storage/covers.ts';
import { validCoverFile } from '../lib/storage/client-cover.ts';

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x01, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

void test('sniffs and validates the supported cover formats', () => {
  assert.equal(sniffCoverContentType(jpeg), 'image/jpeg');
  assert.equal(sniffCoverContentType(png), 'image/png');
  assert.equal(sniffCoverContentType(webp), 'image/webp');
  assert.deepEqual(validateCoverUpload('image/png', png), { contentType: 'image/png', extension: 'png', byteSize: 8 });
});

void test('rejects spoofed, executable, and oversized cover payloads', () => {
  assert.throws(() => validateCoverUpload('image/jpeg', png), (error: unknown) => error instanceof CoverValidationError && error.code === 'content-mismatch');
  assert.throws(() => validateCoverUpload('image/svg+xml', new TextEncoder().encode('<svg onload="alert(1)"/>')), (error: unknown) => error instanceof CoverValidationError && error.code === 'unsupported-type');
  assert.throws(() => validateCoverUpload('image/jpeg', new Uint8Array(MAX_COVER_BYTES + 1)), (error: unknown) => error instanceof CoverValidationError && error.code === 'file-too-large');
});

void test('accepts only browser cover files supported by the server upload contract', () => {
  assert.equal(validCoverFile(new File([jpeg], 'cover.jpg', { type: 'image/jpeg' })), true);
  assert.equal(validCoverFile(new File([jpeg], 'cover.gif', { type: 'image/gif' })), false);
  assert.equal(validCoverFile(new File([new Uint8Array(MAX_COVER_BYTES + 1)], 'huge.jpg', { type: 'image/jpeg' })), false);
});

void test('uses randomized, partitioned object keys and sanitizes supplied filenames', () => {
  assert.equal(
    createCoverObjectKey('../member', 'webp', { now: new Date('2026-09-04T12:00:00Z'), randomId: 'random-id' }),
    'covers/___member/2026/09/random-id.webp',
  );
  assert.equal(safeOriginalFilename('../../secret/book.png\u0000'), 'book.png');
});

void test('stops reading request bodies as soon as the upload limit is crossed', async () => {
  const accepted = await readBytesWithLimit(new Blob([jpeg]).stream(), 8);
  assert.deepEqual(accepted, jpeg);
  await assert.rejects(
    readBytesWithLimit(new Blob([jpeg, jpeg]).stream(), 8),
    (error: unknown) => error instanceof CoverValidationError && error.code === 'file-too-large',
  );
});
