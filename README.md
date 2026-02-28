# Sobriety Track

MVP now includes:
- Backend API (Fastify + PostgreSQL)
- Minimal Web UI for manual testing

## Run
```bash
docker compose up --build
```

## URLs
- Web UI: http://localhost:8080
- API health: http://localhost:4000/health

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

## What to test in Web UI
1. Register
2. Login (token saved in localStorage)
3. Create daily entry
4. List entries by period

