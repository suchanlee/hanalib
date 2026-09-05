# Repository Instructions

## Deployment

- Do not deploy or publish the application unless the user explicitly requests deployment.
- After explicit approval, follow [`docs/production-runbook.md`](docs/production-runbook.md#9-repeatable-sites-release) exactly. Use the existing Sites project and its `sites` Git remote; do not rediscover or substitute a Wrangler-based application deployment.
- Validate and build once for the exact commit, then reuse that output through source push, packaging, version creation, deployment, and verification.
