# Production TODO

- [x] Verify `library.hanaseed.org` in Resend and configure `RESEND_API_KEY` in Sites. Verified on 2026-09-05; the key has sending-only access restricted to this domain. `EMAIL_FROM` is `Hana Seed Library <notifications@library.hanaseed.org>`.
- [ ] Deploy the independent email-delivery change with the saved Resend environment configuration, and validate real delivery to an authorized test recipient.

- [x] Deploy the checked-in [`workers/notification-scheduler`](../workers/notification-scheduler) Cloudflare Worker with its five-minute Cron Trigger, configure the matching `INTERNAL_JOB_SECRET`, and verify an authenticated production invocation.
- [ ] Add scheduler failure alerting when operational alerting is prioritized.
