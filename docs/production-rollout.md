# Production Rollout

## 1. Prepare production environment variables
1. Copy [apps/api/.env.production.example](../apps/api/.env.production.example) to your secret store (or deployment env panel).
2. Set a strong `JWT_SECRET` (minimum 32 chars).
3. Set `NODE_ENV=production`.
4. Set explicit `CORS_ORIGINS` list (comma-separated origins).
5. Set production `DATABASE_URL`.
6. Set shared `REDIS_URL` for distributed auth rate limits.
7. Set `TRUST_PROXY=true` if API is behind reverse proxy / load balancer.
8. If using Google sign-in, set `GOOGLE_CLIENT_ID`.

## 2. Pre-deploy validation (local)
1. `cd apps/api && npm test`
2. `powershell -ExecutionPolicy Bypass -File .\scripts\smoke-e2e.ps1`
3. `cd e2e && npm test`
4. Linux-native preflight (recommended before deploy):
   - `bash ./scripts/preflight-prod.sh --env-file ./apps/api/.env --public-domain <your-domain>`

## 3. Deploy
Run your normal deployment pipeline for `main`.

## 4. Post-deploy checks
1. `GET /health` returns `{"status":"ok"}`
2. `GET /ready` returns `{"status":"ready"}`
3. End-to-end user flow works:
   - register
   - login
   - onboarding save
   - goals load/update
   - entry save/list
4. Run post-deploy script:
   - default: `powershell -ExecutionPolicy Bypass -File .\scripts\post-deploy-check.ps1`
   - require Google OAuth: `powershell -ExecutionPolicy Bypass -File .\scripts\post-deploy-check.ps1 -RequireGoogleOAuth`
5. Linux-native post-deploy checks (recommended for production hosts):
   - default local checks: `bash ./scripts/post-deploy-check.sh`
   - strict external domain checks: `bash ./scripts/post-deploy-check.sh --public-domain <your-domain>`
   - with metrics token: `bash ./scripts/post-deploy-check.sh --public-domain <your-domain> --metrics-token <METRICS_TOKEN>`

GO/NO-GO rule for external checks:
- Canonical criterion is HTTPS by domain (`https://<domain>/health|ready|metrics` all `200`).
- HTTP endpoint may return redirect (`301/302/307/308`) to HTTPS and this is expected.

## 5. Rollback
Follow [docs/rollback-runbook.md](rollback-runbook.md).
