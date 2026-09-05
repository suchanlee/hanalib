# Production TODO

- [ ] Deploy the checked-in [`workers/notification-scheduler`](../workers/notification-scheduler) Cloudflare Worker with its five-minute Cron Trigger. Configure its `NOTIFICATION_JOB_URL` and a matching `INTERNAL_JOB_SECRET` in both the Worker and Sites, verify one authenticated scheduled invocation in production, and add failure alerting before checking this off.
