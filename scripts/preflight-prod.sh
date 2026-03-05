#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/apps/api/.env}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --public-domain)
      PUBLIC_DOMAIN="$2"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

for cmd in docker git curl grep sed; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command: $cmd" >&2
    exit 2
  }
done

step() {
  printf "\n== %s\n" "$1"
}

read_env() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    printf ''
    return
  fi
  printf '%s' "${line#*=}"
}

require_non_empty() {
  local key="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "Missing required env in $ENV_FILE: $key" >&2
    exit 1
  fi
}

step "Env file"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi
echo "Using env: $ENV_FILE"

node_env="$(read_env NODE_ENV)"
jwt_secret="$(read_env JWT_SECRET)"
database_url="$(read_env DATABASE_URL)"
cors_origins="$(read_env CORS_ORIGINS)"
redis_url="$(read_env REDIS_URL)"
rate_limit_strict="$(read_env RATE_LIMIT_STRICT)"
trust_proxy="$(read_env TRUST_PROXY)"

require_non_empty NODE_ENV "$node_env"
require_non_empty JWT_SECRET "$jwt_secret"
require_non_empty DATABASE_URL "$database_url"
require_non_empty CORS_ORIGINS "$cors_origins"

if [[ "$node_env" != "production" ]]; then
  echo "NODE_ENV must be production, got: $node_env" >&2
  exit 1
fi
if [[ ${#jwt_secret} -lt 32 ]]; then
  echo "JWT_SECRET must be at least 32 characters (got ${#jwt_secret})" >&2
  exit 1
fi
if [[ "$rate_limit_strict" == "true" || "$rate_limit_strict" == "1" ]]; then
  require_non_empty REDIS_URL "$redis_url"
fi
if [[ "$trust_proxy" != "true" && "$trust_proxy" != "1" ]]; then
  echo "WARN: TRUST_PROXY is not enabled. Keep this only if API is not behind reverse proxy."
fi

step "Docker compose status"
docker compose -f "$REPO_ROOT/docker-compose.yml" ps >/dev/null
echo "docker compose accessible"

if [[ -n "$PUBLIC_DOMAIN" ]]; then
  step "Current external HTTPS baseline"
  for path in health ready metrics; do
    code="$(curl -sS -o /dev/null -w "%{http_code}" "https://$PUBLIC_DOMAIN/$path")"
    if [[ "$code" != "200" ]]; then
      echo "External baseline failed: https://$PUBLIC_DOMAIN/$path -> $code" >&2
      exit 1
    fi
    echo "https://$PUBLIC_DOMAIN/$path -> 200"
  done
fi

step "Done"
echo "Preflight checks passed"
