# Sobriety Track

MVP now includes:
- Backend API (Fastify + PostgreSQL)
- Minimal Web UI for manual testing

## Run
```bash
docker compose up --build
```

## Useful commands
- `make api-test` - run API tests
- `make smoke` - run API/web smoke checks
- `make web-e2e` - run Playwright web regression tests
- `make ci-local` - run all checks required before merge
- `powershell -ExecutionPolicy Bypass -File .\scripts\ci-local.ps1` - same local CI gate for Windows (without `make`)
- `powershell -ExecutionPolicy Bypass -File .\scripts\ci-local.ps1 -RequireGoogleOAuth` - same checks + strict Google OAuth readiness

## Как проверить MVP локально

1. Скопировать переменные окружения API:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
   Для production обязательно задайте сильный `JWT_SECRET`, `METRICS_TOKEN`, список `CORS_ORIGINS`, `REDIS_URL`, `GOOGLE_CLIENT_ID` (если включен Google OAuth), `RATE_LIMIT_STRICT=true`; `TRUST_PROXY=true` только если API действительно стоит за доверенным прокси.
2. Запустить проект:
   ```bash
   docker compose up --build
   ```
3. Дождаться готовности сервисов и проверить health/readiness endpoints:
   ```bash
   curl http://localhost:4000/health
   curl http://localhost:4000/ready
   ```
   Ожидаемые ответы: `{"status":"ok"}` и `{"status":"ready"}`.
4. Открыть UI для ручной проверки: `http://localhost:8080`.
5. Пройти базовый сценарий в UI:
   - Register
   - Login
   - Save/Get onboarding
   - Create/Load goals
   - Create entry и List entries
6. Остановить окружение после проверки:
   ```bash
   docker compose down -v
   ```

## URLs
- Web UI: http://localhost:8080
- API health: http://localhost:4000/health
- API readiness: http://localhost:4000/ready
- API metrics: http://localhost:4000/metrics
  - In `production`, pass header `x-metrics-token: <METRICS_TOKEN>`

## Google OAuth (optional)
- Backend requires `GOOGLE_CLIENT_ID` in API environment.
- Web UI reads Google client id from `apps/web/config.js` (`window.APP_CONFIG.googleClientId`) and falls back to API config endpoint.
- Local quick setup:
  - set `googleClientId` in [apps/web/config.js](apps/web/config.js)

## Production
- Use [apps/api/.env.production.example](apps/api/.env.production.example) as the production env template.
- Follow [docs/production-rollout.md](docs/production-rollout.md) for pre-deploy, rollout, and rollback checks.
- For staging validation use [docs/staging-dry-run.md](docs/staging-dry-run.md) and `scripts/post-deploy-check.ps1`.
- Monitoring baseline and alert thresholds: [docs/observability.md](docs/observability.md).
- DB backup/restore scripts:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\db-backup.ps1`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\db-restore.ps1 -BackupFile <path-to-sql> -ResetPublicSchema`

## Smoke E2E
Запуск после `docker compose up --build`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-e2e.ps1
```

## Web Regression E2E (Playwright)
1. Поднимите сервисы:
   ```bash
   docker compose up --build -d
   ```
2. Установите зависимости тестов:
   ```bash
   cd e2e
   npm install
   npx playwright install chromium
   ```
3. Запустите тесты:
   ```bash
   npm test
   ```

## API endpoints
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password` (does not return reset token; dev-only return can be enabled via `ALLOW_DEV_RESET_TOKEN=true`)
- `POST /api/auth/reset-password`
- `GET /api/entries/reasons`
- `POST /api/entries`
- `GET /api/entries?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/onboarding`
- `GET /api/onboarding`
- `POST /api/goals`
- `GET /api/goals`

## What to test in Web UI
1. Register
2. Login (session cookies are set by API)
3. Save/Get onboarding
4. Create goal and load progress
5. Create daily entry
6. List entries by period

## Auth session model
- API sets `access_token` (`HttpOnly`) + `csrf_token` cookies on login.
- Web sends cookies with `credentials: include` and `x-csrf-token` for mutating requests.

