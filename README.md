# Sobriety Track

MVP now includes:
- Backend API (Fastify + PostgreSQL)
- Minimal Web UI for manual testing

## Run
```bash
docker compose up --build
```

## Как проверить MVP локально

1. Скопировать переменные окружения API:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
2. Запустить проект:
   ```bash
   docker compose up --build
   ```
3. Дождаться готовности сервисов и проверить health endpoint:
   ```bash
   curl http://localhost:4000/health
   ```
   Ожидаемый ответ: `{"status":"ok"}`.
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

## Smoke E2E
Запуск после `docker compose up --build`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-e2e.ps1
```

## API endpoints
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password` (returns reset token in MVP dev mode)
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
2. Login (token saved in localStorage)
3. Save/Get onboarding
4. Create goal and load progress
5. Create daily entry
6. List entries by period

