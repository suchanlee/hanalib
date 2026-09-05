import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

void test('push displays the notification and tells open apps to reload library data', async () => {
  const handlers = new Map<string, (event: unknown) => void>();
  const messages: unknown[] = [];
  const notifications: Array<{
    title: string;
    options: { data: { url: string } };
  }> = [];
  runInNewContext(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
    {
      URL,
      self: {
        location: { origin: 'https://library.example' },
        addEventListener: (type: string, handler: (event: unknown) => void) =>
          handlers.set(type, handler),
        registration: {
          showNotification: async (
            title: string,
            options: { data: { url: string } },
          ) => {
            notifications.push({ title, options });
          },
        },
        clients: {
          matchAll: async (options: {
            type: string;
            includeUncontrolled: boolean;
          }) => {
            assert.equal(options.type, 'window');
            assert.equal(options.includeUncontrolled, true);
            return [1, 2].map(() => ({
              postMessage: (message: unknown) => messages.push(message),
            }));
          },
        },
      },
    },
  );
  let work!: Promise<unknown>;
  handlers.get('push')!({
    data: { json: () => ({ title: 'Request declined', url: '/borrowing' }) },
    waitUntil: (promise: Promise<unknown>) => {
      work = promise;
    },
  });
  await work;
  assert.equal(notifications[0].title, 'Request declined');
  assert.equal(
    notifications[0].options.data.url,
    'https://library.example/borrowing',
  );
  assert.equal(
    JSON.stringify(messages),
    JSON.stringify([{ type: 'library-updated' }, { type: 'library-updated' }]),
  );
});
