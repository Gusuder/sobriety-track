# Rollback Runbook

## 1. Trigger conditions
- Sustained `5xx` errors after deploy
- Login/onboarding flow broken
- `/ready` stays non-healthy

## 2. Immediate actions
1. Stop traffic to the new release (or route traffic back to previous revision).
2. Redeploy previous known-good application image/commit.
3. Verify:
   - `GET /health` -> `{"status":"ok"}`
   - `GET /ready` -> `{"status":"ready"}`

## 3. Database backup before any recovery operation
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\db-backup.ps1
```

## 4. Restore database (only if data corruption is confirmed)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\db-restore.ps1 -BackupFile .\backups\db-sobriety_track-YYYYMMDD-HHMMSS.sql -ResetPublicSchema
```

## 5. Post-rollback validation
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\post-deploy-check.ps1
```

Expected result: `Post-deploy checks passed`.
