# Production TODO

- [x] Deploy the checked-in [`workers/notification-scheduler`](../workers/notification-scheduler) Cloudflare Worker with its five-minute Cron Trigger, configure the matching `INTERNAL_JOB_SECRET`, and verify an authenticated production invocation.
- [ ] Add scheduler failure alerting when operational alerting is prioritized.
