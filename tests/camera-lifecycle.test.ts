import assert from 'node:assert/strict';
import test from 'node:test';
import { settleCameraAction } from '../features/intake/camera-lifecycle.ts';

void test('camera lifecycle absorbs iOS shutdown failures', async () => {
  assert.equal(await settleCameraAction(() => undefined), true);
  assert.equal(await settleCameraAction(() => Promise.resolve()), true);
  assert.equal(
    await settleCameraAction(() => {
      throw new Error('camera already stopped');
    }),
    false,
  );
  assert.equal(
    await settleCameraAction(() => Promise.reject(new Error('torch unavailable'))),
    false,
  );
});
