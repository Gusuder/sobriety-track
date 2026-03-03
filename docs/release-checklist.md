# Release Checklist

## 1. Build and Tests
- `apps/api`: `npm ci`, `npm run typecheck`, `npm test`
- Full smoke: `powershell -ExecutionPolicy Bypass -File .\scripts\smoke-e2e.ps1`
- Web regression: `cd e2e && npm install && npx playwright install chromium && npm test`
- Docker health: `docker compose ps` (all services `Up`, `postgres` and `api` healthy)

## 2. Security Baseline
- `JWT_SECRET` is strong and unique for environment
- `NODE_ENV=production` in production deployments
- `CORS_ORIGINS` explicitly configured for production
- Auth rate limits verified (`/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`)

## 3. Runtime Readiness
- `GET /health` returns `{"status":"ok"}`
- `GET /ready` returns `{"status":"ready"}`
- No sustained `5xx` errors in API logs

## 4. Data and Rollback
- Database backup confirmed before deploy
- Rollback command/script prepared and tested
- Migration changes reviewed for backward compatibility

## 5. Post-Deploy Validation
- Register -> Login -> Onboarding -> Goals -> Entry flow works from Web UI
- Profile page loads and metrics are visible
- Auth failures return expected errors (`401` or `429`)
