# Changelog

## 2026-03-01

### Added
- Goals and progress API (`POST /api/goals`, `GET /api/goals`).
- Streak and goal progress utilities with unit tests.
- Route-level integration tests for `onboarding`, `goals`, and `entries`.
- Smoke E2E script (`scripts/smoke-e2e.ps1`).
- GitHub Actions CI workflow (`api-tests` + `smoke-e2e`).

### Changed
- Onboarding now creates an active goal when missing.
- Web UI redesigned with a warm Russian interface and clearer layout.
- UI now invalidates stale tokens automatically on auth-related server failures.
- API maps stale-user foreign key DB errors to `401 Unauthorized`.
- `setup.ps1` synchronized with current project structure, tests, CI, and UI.

### Notes
- On Windows, Git may show CRLF warnings in the working tree; functionality is unaffected.
