# Security Backlog (P0/P1/P2)

Ниже подготовлены готовые формулировки для GitHub Issues.
Рекомендуемые labels: `security`, `priority:P0|P1|P2`, `type:hardening`, `ops` (где применимо).

## P0-1: Make preflight a hard deploy gate
**Title:** `security(P0): enforce preflight-prod as mandatory deploy gate`

**Problem**
- Сейчас preflight можно обойти, из-за чего риск попасть в инцидент startup/config mismatch.

**Scope**
- Включить `scripts/preflight-prod.sh` как обязательный шаг до `docker compose up -d --build`.
- Возврат не-нулевого кода должен блокировать деплой.

**Acceptance Criteria**
- Деплой pipeline/ручной SOP останавливается при любой красной preflight проверке.
- В docs указано, что preflight обязательный.

**Verification**
- Негативный тест: убрать обязательный env (`CORS_ORIGINS`) -> preflight fail, деплой не стартует.
- Позитивный тест: при валидном env preflight проходит, деплой продолжается.

---

## P0-2: Canonical external health policy
**Title:** `security(P0): codify external GO rule by HTTPS domain only`

**Problem**
- Проверка по IP с follow-redirect дает ложный NO-GO из-за TLS mismatch.

**Scope**
- Зафиксировать правило: внешние GO-check только по `https://<domain>/health|ready|metrics`.
- HTTP endpoint оценивается только как redirect-policy (`301/302/307/308` -> HTTPS).

**Acceptance Criteria**
- В SOP и post-deploy скриптах одинаковое правило GO/NO-GO.
- Нет rollback из-за check по IP при зеленом HTTPS домене.

**Verification**
- `http://<domain>/health` -> redirect (не fail).
- `https://<domain>/health|ready|metrics` -> `200` обязателен для GO.

---

## P0-3: Security CI gate
**Title:** `security(P0): add CI security gate (audit + config checks)`

**Problem**
- Нет явного security quality gate в CI.

**Scope**
- Добавить отдельный job в CI:
  - `npm audit --audit-level=high` (или эквивалент policy).
  - Проверка базовых security invariants (cookie flags, headers, env policy).

**Acceptance Criteria**
- Merge блокируется при high/critical уязвимостях (по согласованной политике).
- Merge блокируется при поломке security invariants.

**Verification**
- Искусственно сломать invariant (например, убрать header) -> CI fail.
- Восстановить -> CI pass.

---

## P1-1: Anti-abuse slow-spam controls
**Title:** `security(P1): add slow-spam protection beyond burst limits`

**Problem**
- Текущий rate-limit хорошо режет burst, но не всегда ловит последовательный спам.

**Scope**
- Ввести лимиты по комбинациям:
  - `route + ip`,
  - `route + normalized login/email hash`,
  - опционально `route + userId` (для авторизованных).
- Добавить long-window counters (например, 1h/24h).

**Acceptance Criteria**
- Медленный спам (низкая частота, но долго) стабильно блокируется.
- Легитимный трафик не деградирует.

**Verification**
- Набор e2e/API тестов на slow-spam сценарии.

---

## P1-2: Progressive penalties
**Title:** `security(P1): implement progressive cooldown for repeated abuse`

**Problem**
- Одинаковый `retry-after` позволяет предсказуемо обходить защиту повторными попытками.

**Scope**
- Exponential backoff / step-up cooldown для повторных нарушений.
- Сброс penalty после безопасного окна.

**Acceptance Criteria**
- При повторных нарушениях `retry-after` растет.
- После safe window penalty сбрасывается.

**Verification**
- Тест с N последовательных нарушений: проверка роста `retry-after`.

---

## P1-3: Structured security audit logs
**Title:** `security(P1): add structured audit events for auth and abuse`

**Problem**
- Сложно расследовать инциденты без стандартизированных security-событий.

**Scope**
- Логировать события:
  - `auth.login_failed`,
  - `auth.rate_limit_hit`,
  - `auth.csrf_mismatch`,
  - `auth.reset_requested`,
  - `auth.reset_completed`.
- Добавить `request_id/correlation_id`, исключить секреты из логов.

**Acceptance Criteria**
- Все ключевые security-события пишутся в единообразном JSON формате.

**Verification**
- Smoke сценарий генерирует события, которые находятся в логах по ключам.

---

## P2-1: Secrets rotation policy
**Title:** `security(P2): enforce periodic rotation for JWT/METRICS/DB/Redis secrets`

**Problem**
- Без регламента ротации растет риск долгоживущей компрометации.

**Scope**
- Описать и внедрить ротацию:
  - `JWT_SECRET`,
  - `METRICS_TOKEN`,
  - DB/Redis credentials.
- Добавить runbook безопасной ротации без downtime.

**Acceptance Criteria**
- Есть документированный график ротации и ответственный.
- Есть проверенный playbook ротации.

**Verification**
- Тестовый прогон ротации в staging с восстановлением сервиса.

---

## P2-2: Backup encryption + restore drill
**Title:** `security(P2): encrypt backups and run scheduled restore drills`

**Problem**
- Backup без шифрования/регулярного restore-test повышает риск утечки и невосстановления.

**Scope**
- Шифрование backup на хранении.
- Плановый restore drill (например, ежемесячно).

**Acceptance Criteria**
- Все новые backup шифруются.
- Есть регулярный отчет о restore drill.

**Verification**
- Восстановление из последнего backup на тестовом окружении успешно.

---

## P2-3: Incident tabletop drills
**Title:** `security(P2): run monthly tabletop for auth/infra security incidents`

**Problem**
- Без тренировок команда медленнее реагирует на реальные инциденты.

**Scope**
- Ежемесячно 1 tabletop по одному сценарию:
  - утечка токена,
  - Redis down,
  - TLS/domain failure.

**Acceptance Criteria**
- После каждого tabletop есть action items и owner'ы.
- MTTR/decision time улучшаются по сравнению с предыдущим прогоном.

**Verification**
- Протокол tabletop + закрытие action items в трекере.
