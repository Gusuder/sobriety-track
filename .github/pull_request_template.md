## Summary
- What changed:
- Why:

## Validation
- [ ] `apps/api`: `npm test`
- [ ] Smoke E2E: `powershell -ExecutionPolicy Bypass -File .\scripts\smoke-e2e.ps1`
- [ ] Web regression E2E: `cd e2e && npm test`
- [ ] CI checks are green (`api-tests`, `smoke-e2e`, `web-regression-e2e`)

## Release Safety
- [ ] `NODE_ENV=production` configured for production deploy
- [ ] Strong `JWT_SECRET` configured for production deploy
- [ ] `CORS_ORIGINS` explicitly configured for production deploy
- [ ] `/health` and `/ready` verified in target environment
- [ ] Rollback plan prepared (link or command)

## Notes
- Risks:
- Rollback:
