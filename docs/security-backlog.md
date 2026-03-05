# Security Backlog (P0/P1/P2)

Issue-ready backlog items with clear scope, acceptance criteria, and verification.
Recommended labels: `security`, `priority:P0|P1|P2`, `type:hardening`, `ops`.

## P0-1: Make preflight a hard deploy gate
**Title:** `security(P0): enforce preflight-prod as mandatory deploy gate`

**Problem**
- Preflight can be bypassed, allowing startup/config mismatches into deploy.

**Scope**
- Make `scripts/preflight-prod.sh` mandatory before `docker compose up -d --build`.
- Non-zero preflight exit code must block deploy.

**Acceptance Criteria**
- Deploy process stops on any preflight failure.
- SOP/docs explicitly state preflight is mandatory.

**Verification**
- Negative test: remove required env (`CORS_ORIGINS`) -> preflight fails, deploy does not start.
- Positive test: valid env -> preflight passes and deploy continues.

---

## P0-2: Canonical external health policy
**Title:** `security(P0): codify external GO rule by HTTPS domain only`

**Problem**
- IP-based follow-redirect checks can produce false NO-GO due to TLS mismatch.

**Scope**
- Define external GO rule using only `https://<domain>/health|ready|metrics`.
- Evaluate `http://` only as redirect policy (`301/302/307/308` to HTTPS).

**Acceptance Criteria**
- SOP and post-deploy scripts use the same GO/NO-GO rule.
- No rollback caused by IP TLS mismatch when HTTPS domain is green.

**Verification**
- `http://<domain>/health` -> redirect.
- `https://<domain>/health|ready|metrics` -> `200` required for GO.

---

## P0-3: Security CI gate
**Title:** `security(P0): add CI security gate (audit + config checks)`

**Problem**
- No explicit security quality gate in CI.

**Scope**
- Add dedicated CI security job:
  - `npm audit` policy (high/critical threshold).
  - Checks for core security invariants (headers/cookie flags/env policy).

**Acceptance Criteria**
- Merge is blocked when policy violations are detected.
- Merge is blocked when security invariants are broken.

**Verification**
- Intentionally break an invariant -> CI fails.
- Restore it -> CI passes.

---

## P1-1: Anti-abuse slow-spam controls
**Title:** `security(P1): add slow-spam protection beyond burst limits`

**Problem**
- Current rate limits handle bursts better than low-rate sequential abuse.

**Scope**
- Add limits by:
  - `route + ip`,
  - `route + normalized login/email hash`,
  - optional `route + userId` (authenticated paths).
- Add long-window counters (for example 1h/24h).

**Acceptance Criteria**
- Slow-spam scenarios are blocked.
- Legitimate traffic impact remains acceptable.

**Verification**
- API tests for slow-spam scenarios pass.

---

## P1-2: Progressive penalties
**Title:** `security(P1): implement progressive cooldown for repeated abuse`

**Problem**
- Flat `retry-after` allows predictable repeated attempts.

**Scope**
- Add progressive cooldown (step-up/exponential) for repeated violations.
- Reset penalty after safe window.

**Acceptance Criteria**
- `retry-after` grows for repeated violations.
- Penalty resets after safe interval.

**Verification**
- Test sequence confirms growth and reset behavior.

---

## P1-3: Structured security audit logs
**Title:** `security(P1): add structured audit events for auth and abuse`

**Problem**
- Incident investigation is harder without normalized security event logs.

**Scope**
- Log structured events:
  - `auth.login_failed`,
  - `auth.rate_limit_hit`,
  - `auth.csrf_mismatch`,
  - `auth.reset_requested`,
  - `auth.reset_completed`.
- Include `request_id/correlation_id`, never log secrets.

**Acceptance Criteria**
- Security events are consistently present in logs.

**Verification**
- Smoke scenarios generate searchable events for each key action.

---

## P2-1: Secrets rotation policy
**Title:** `security(P2): enforce periodic rotation for JWT/METRICS/DB/Redis secrets`

**Problem**
- Missing rotation policy increases long-lived compromise risk.

**Scope**
- Define and implement rotation for:
  - `JWT_SECRET`,
  - `METRICS_TOKEN`,
  - DB/Redis credentials.
- Add no-downtime rotation runbook.

**Acceptance Criteria**
- Rotation schedule and ownership are documented.
- Rotation playbook tested in staging.

**Verification**
- Staging rotation drill succeeds without service degradation.

---

## P2-2: Backup encryption + restore drill
**Title:** `security(P2): encrypt backups and run scheduled restore drills`

**Problem**
- Unencrypted backups and untested restore procedures increase risk.

**Scope**
- Encrypt backups at rest.
- Run scheduled restore drills (for example monthly).

**Acceptance Criteria**
- New backups are encrypted.
- Restore drill reports are produced on schedule.

**Verification**
- Latest backup restores successfully in test environment.

---

## P2-3: Incident tabletop drills
**Title:** `security(P2): run monthly tabletop for auth/infra security incidents`

**Problem**
- Response quality degrades without regular drills.

**Scope**
- Run monthly tabletop for scenarios:
  - token leak,
  - Redis down,
  - TLS/domain failure.

**Acceptance Criteria**
- Each tabletop yields action items with owners.
- MTTR/decision time trends improve over time.

**Verification**
- Keep tabletop notes and track closure of follow-up actions.
