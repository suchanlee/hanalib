# Production TODO

- [ ] Deploy a standalone Cloudflare Worker with a five-minute Cron Trigger that calls the protected notification job. Store the Sites access token and `INTERNAL_JOB_SECRET` as Worker secrets, verify one scheduled delivery in production, and add failure alerting before checking this off.
