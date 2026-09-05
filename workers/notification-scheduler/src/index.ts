interface SchedulerEnvironment {
  NOTIFICATION_JOB_URL: string;
  INTERNAL_JOB_SECRET: string;
}

interface SchedulerContext {
  waitUntil(promise: Promise<unknown>): void;
}

export async function invokeNotificationJob(
  environment: SchedulerEnvironment,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(environment.NOTIFICATION_JOB_URL);
  if (url.protocol !== 'https:') throw new Error('notification-job-url-must-use-https');
  if (environment.INTERNAL_JOB_SECRET.length < 32) throw new Error('notification-job-secret-is-invalid');
  const response = await fetcher(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${environment.INTERNAL_JOB_SECRET}` },
  });
  if (!response.ok) throw new Error(`notification-job-failed-${response.status}`);
}

const scheduler = {
  scheduled(_controller: unknown, environment: SchedulerEnvironment, context: SchedulerContext) {
    context.waitUntil(invokeNotificationJob(environment));
  },
};

export default scheduler;
