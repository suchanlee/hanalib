# Production TODO

- [x] Verify `library.hanaseed.org` in Resend and configure `RESEND_API_KEY` in Sites. Verified on 2026-09-05; the key has sending-only access restricted to this domain. `EMAIL_FROM` is `Hana Seed Library <notifications@library.hanaseed.org>`.
- [x] Deploy the independent email-delivery change with the saved Resend environment configuration. Sites version 46 (`a00fd13`) went live on 2026-09-05 using environment revision 18; homepage and health checks passed.
- [x] Validate real email delivery to an explicitly authorized test recipient. The released `sendResendEmail` adapter sent the deployment test on 2026-09-05; Resend reported Delivered (`00b5cc44-d74a-4420-8e56-8efb7b8c6e5d`) and the recipient confirmed receipt. This used a temporary domain-restricted key, not a production circulation event.

- [x] Deploy the checked-in [`workers/notification-scheduler`](../workers/notification-scheduler) Cloudflare Worker with its five-minute Cron Trigger, configure the matching `INTERNAL_JOB_SECRET`, and verify an authenticated production invocation.
- [ ] Add scheduler failure alerting when operational alerting is prioritized.
