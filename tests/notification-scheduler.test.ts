import assert from 'node:assert/strict';
import test from 'node:test';
import { invokeNotificationJob } from '../workers/notification-scheduler/src/index.ts';

const environment = {
  NOTIFICATION_JOB_URL: 'https://library.example/api/jobs/notifications',
  INTERNAL_JOB_SECRET: 'a-secure-scheduler-secret-with-32-characters',
};

void test('scheduler invokes the protected notification job', async () => {
  let request: Request | undefined;
  await invokeNotificationJob(environment, async (input, init) => {
    request = new Request(input, init);
    return new Response(null, { status: 200 });
  });
  assert.equal(request?.method, 'POST');
  assert.equal(request?.url, environment.NOTIFICATION_JOB_URL);
  assert.equal(request?.headers.get('authorization'), `Bearer ${environment.INTERNAL_JOB_SECRET}`);
});

void test('scheduler rejects insecure endpoints and failed jobs', async () => {
  await assert.rejects(
    invokeNotificationJob({ ...environment, NOTIFICATION_JOB_URL: 'http://library.example/jobs' }),
    /must-use-https/,
  );
  await assert.rejects(
    invokeNotificationJob(environment, async () => new Response(null, { status: 503 })),
    /failed-503/,
  );
});
