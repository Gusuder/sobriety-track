# Staging Dry-Run

## Goal
Validate that the latest `main` behaves correctly in a production-like environment before/after deployment.

## Before deploy
1. Confirm all CI checks are green on latest `main`.
2. Ensure staging has production-like env:
   - `NODE_ENV=production`
   - strong `JWT_SECRET` (32+ chars)
   - explicit `CORS_ORIGINS`
3. Confirm database backup/restore plan exists.

## Deploy to staging
Run your normal deployment process for the staging environment.

## Automated post-deploy validation
Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\post-deploy-check.ps1 -ApiBase "https://staging-api.example.com" -WebBase "https://staging.example.com"
```

Expected result: `Post-deploy checks passed`.

## Manual sanity checks
1. Register and login from browser.
2. Complete onboarding and save goal.
3. Add one entry and verify list/progress update.
4. Open profile modal and verify basic metrics render.

## Exit criteria
- `/health` and `/ready` are green
- automated post-deploy check passed
- manual sanity checks passed
- no sustained `5xx` errors in logs
