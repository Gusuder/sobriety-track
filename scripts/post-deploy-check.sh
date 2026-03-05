#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:4000}"
WEB_BASE="${WEB_BASE:-http://localhost:8080}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-}"
METRICS_TOKEN="${METRICS_TOKEN:-}"
REQUIRE_GOOGLE_OAUTH="${REQUIRE_GOOGLE_OAUTH:-false}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-base)
      API_BASE="$2"
      shift 2
      ;;
    --web-base)
      WEB_BASE="$2"
      shift 2
      ;;
    --public-domain)
      PUBLIC_DOMAIN="$2"
      shift 2
      ;;
    --metrics-token)
      METRICS_TOKEN="$2"
      shift 2
      ;;
    --require-google-oauth)
      REQUIRE_GOOGLE_OAUTH="true"
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

for cmd in curl grep sed mktemp; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command: $cmd" >&2
    exit 2
  }
done

step() {
  printf "\n== %s\n" "$1"
}

expect_200() {
  local url="$1"
  local header_name="${2:-}"
  local header_value="${3:-}"
  local code
  if [[ -n "$header_name" ]]; then
    code="$(curl -sS -o /dev/null -w "%{http_code}" -H "$header_name: $header_value" "$url")"
  else
    code="$(curl -sS -o /dev/null -w "%{http_code}" "$url")"
  fi
  if [[ "$code" != "200" ]]; then
    echo "Expected 200 for $url, got $code" >&2
    exit 1
  fi
}

extract_json_string() {
  local key="$1"
  sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n 1
}

extract_json_bool() {
  local key="$1"
  sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\\(true\\|false\\).*/\\1/p" | head -n 1
}

step "Health/readiness local"
health="$(curl -sS "$API_BASE/health")"
echo "$health" | grep -q '"status":"ok"' || {
  echo "Health check failed: $health" >&2
  exit 1
}

ready="$(curl -sS "$API_BASE/ready")"
echo "$ready" | grep -q '"status":"ready"' || {
  echo "Readiness check failed: $ready" >&2
  exit 1
}

step "Metrics local"
metrics_headers=()
if [[ -n "$METRICS_TOKEN" ]]; then
  metrics_headers=(-H "x-metrics-token: $METRICS_TOKEN")
fi
metrics_code="$(curl -sS -o /tmp/metrics.json -w "%{http_code}" "${metrics_headers[@]}" "$API_BASE/metrics")"
if [[ "$metrics_code" != "200" ]]; then
  echo "Metrics check failed: HTTP $metrics_code" >&2
  cat /tmp/metrics.json >&2 || true
  exit 1
fi
grep -q '"status":"ok"' /tmp/metrics.json || {
  echo "Metrics payload invalid" >&2
  cat /tmp/metrics.json >&2 || true
  exit 1
}

step "Google OAuth config"
google_cfg="$(curl -sS "$API_BASE/api/auth/google/config")"
google_enabled="$(printf '%s' "$google_cfg" | extract_json_bool enabled)"
if [[ "$REQUIRE_GOOGLE_OAUTH" == "true" && "$google_enabled" != "true" ]]; then
  echo "Google OAuth required but disabled: $google_cfg" >&2
  exit 1
fi

step "Auth + protected flow (cookie + CSRF)"
stamp="$(date +%s)"
login="deploy_${stamp}"
email="${login}@example.com"
password="StrongPass123!"
today="$(date +%F)"
from="$(date +%Y-%m-01)"
cookie_jar="$(mktemp)"
trap 'rm -f "$cookie_jar" /tmp/metrics.json >/dev/null 2>&1 || true' EXIT

register_payload="$(cat <<JSON
{"login":"$login","email":"$email","displayName":"Deploy Check User","password":"$password"}
JSON
)"
register_code="$(curl -sS -o /tmp/register.json -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "$register_payload" \
  "$API_BASE/api/auth/register")"
if [[ "$register_code" != "201" ]]; then
  echo "Register failed: HTTP $register_code" >&2
  cat /tmp/register.json >&2 || true
  exit 1
fi

login_payload="$(cat <<JSON
{"login":"$login","password":"$password"}
JSON
)"
login_resp="$(curl -sS -c "$cookie_jar" -b "$cookie_jar" \
  -H "Content-Type: application/json" \
  -d "$login_payload" \
  "$API_BASE/api/auth/login")"
csrf_token="$(printf '%s' "$login_resp" | extract_json_string csrfToken)"
if [[ -z "$csrf_token" ]]; then
  echo "Login response missing csrfToken: $login_resp" >&2
  exit 1
fi

onboarding_payload='{"startMode":"now","goalDays":30}'
onboarding_code="$(curl -sS -o /tmp/onboarding.json -w "%{http_code}" \
  -c "$cookie_jar" -b "$cookie_jar" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $csrf_token" \
  -d "$onboarding_payload" \
  "$API_BASE/api/onboarding")"
if [[ "$onboarding_code" != "200" ]]; then
  echo "Onboarding save failed: HTTP $onboarding_code" >&2
  cat /tmp/onboarding.json >&2 || true
  exit 1
fi

expect_200 "$API_BASE/api/onboarding"
expect_200 "$API_BASE/api/goals"

entry_payload="$(cat <<JSON
{"entryDate":"$today","drank":false,"mood":"good","stressLevel":3,"cravingLevel":4,"daySummary":"Post-deploy check entry","comment":"ok","reasonCodes":["stress","boredom"]}
JSON
)"
entry_code="$(curl -sS -o /tmp/entry.json -w "%{http_code}" \
  -c "$cookie_jar" -b "$cookie_jar" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $csrf_token" \
  -d "$entry_payload" \
  "$API_BASE/api/entries")"
if [[ "$entry_code" != "200" ]]; then
  echo "Create entry failed: HTTP $entry_code" >&2
  cat /tmp/entry.json >&2 || true
  exit 1
fi

entries_resp="$(curl -sS -c "$cookie_jar" -b "$cookie_jar" "$API_BASE/api/entries?from=$from&to=$today")"
echo "$entries_resp" | grep -q '"entries":' || {
  echo "Entries list invalid: $entries_resp" >&2
  exit 1
}

step "Web shell local"
web_html="$(curl -sS "$WEB_BASE")"
echo "$web_html" | grep -q 'id="authShell"' || {
  echo "Web auth shell not found" >&2
  exit 1
}
echo "$web_html" | grep -q 'id="onboardingShell"' || {
  echo "Web onboarding shell not found" >&2
  exit 1
}

if [[ -n "$PUBLIC_DOMAIN" ]]; then
  step "External checks (canonical HTTPS domain)"
  expect_200 "https://$PUBLIC_DOMAIN/health"
  expect_200 "https://$PUBLIC_DOMAIN/ready"
  if [[ -n "$METRICS_TOKEN" ]]; then
    expect_200 "https://$PUBLIC_DOMAIN/metrics" "x-metrics-token" "$METRICS_TOKEN"
  else
    expect_200 "https://$PUBLIC_DOMAIN/metrics"
  fi

  step "HTTP redirect policy (domain)"
  redirect_headers="$(curl -sS -I "http://$PUBLIC_DOMAIN/health")"
  echo "$redirect_headers" | grep -Eq '^HTTP/.* (301|302|307|308)' || {
    echo "Expected redirect on http://$PUBLIC_DOMAIN/health" >&2
    echo "$redirect_headers" >&2
    exit 1
  }
  echo "$redirect_headers" | grep -qi "location: https://$PUBLIC_DOMAIN/health" || {
    echo "Unexpected redirect target for http://$PUBLIC_DOMAIN/health" >&2
    echo "$redirect_headers" >&2
    exit 1
  }
fi

step "Done"
echo "Post-deploy checks passed"
