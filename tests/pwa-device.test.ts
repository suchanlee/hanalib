import assert from 'node:assert/strict';
import test from 'node:test';
import { detectPwaDevice } from '../features/app/pwa-device.ts';

const base = {
  platform: 'Linux x86_64',
  maxTouchPoints: 0,
  coarseMobile: false,
  displayModeStandalone: false,
  navigatorStandalone: false,
};

void test('detects Android and iPhone browsers as mobile but not installed', () => {
  assert.deepEqual(
    detectPwaDevice({
      ...base,
      userAgent:
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile',
    }),
    { ios: false, mobile: true, standalone: false },
  );
  assert.deepEqual(
    detectPwaDevice({
      ...base,
      platform: 'iPhone',
      maxTouchPoints: 5,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',
    }),
    { ios: true, mobile: true, standalone: false },
  );
});

void test('recognizes iPad desktop mode and installed display modes', () => {
  assert.deepEqual(
    detectPwaDevice({
      ...base,
      platform: 'MacIntel',
      maxTouchPoints: 5,
      navigatorStandalone: true,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
    }),
    { ios: true, mobile: true, standalone: true },
  );
  assert.equal(
    detectPwaDevice({
      ...base,
      displayModeStandalone: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 15) Mobile',
    }).standalone,
    true,
  );
});

void test('does not prompt ordinary desktop browsers', () => {
  assert.deepEqual(
    detectPwaDevice({
      ...base,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    }),
    { ios: false, mobile: false, standalone: false },
  );
});
