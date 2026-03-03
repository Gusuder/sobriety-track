# Production Rollout

## 1. Prepare production environment variables
1. Copy [apps/api/.env.production.example](../apps/api/.env.production.example) to your secret store (or deployment env panel).
2. Set a strong `JWT_SECRET` (minimum 32 chars).
3. Set `NODE_ENV=production`.
4. Set explicit `CORS_ORIGINS` list (comma-separated origins).
5. Set production `DATABASE_URL`.

## 2. Pre-deploy validation (local)
1. `cd apps/api && npm test`
2. `powershell -ExecutionPolicy Bypass -File .\scripts\smoke-e2e.ps1`
3. `cd e2e && npm test`

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

## 5. Rollback
Follow [docs/rollback-runbook.md](rollback-runbook.md).
