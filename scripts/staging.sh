#!/usr/bin/env bash
#
# Staging lifecycle helpers for Fuma Lab on stg.t3s7.com.
# Deployment itself is delegated to scripts/deploy.sh --env staging so staging
# and production share build, switch, health-check, smoke-test, and rollback
# behavior. The default network edge is a host-managed cloudflared service
# routing stg.t3s7.com to 127.0.0.1:${DOCS_PORT:-3001}; the compose
# cloudflared profile is only an optional fallback.
#
# Usage:
#   scripts/staging.sh deploy    Build + deploy staging through the shared flow
#   scripts/staging.sh check     Build + validate staging without replacing it
#   scripts/staging.sh down      Stop and remove the staging stack
#   scripts/staging.sh smoke     Run local endpoint checks against DOCS_PORT
#   scripts/staging.sh logs [svc] Tail logs (default: all services)
#   scripts/staging.sh ps        Show staging containers

set -Eeuo pipefail

readonly SCRIPT_DIRECTORY="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P
)"
readonly REPOSITORY_ROOT="$(cd -- "$SCRIPT_DIRECTORY/.." && pwd -P)"
readonly ENV_FILE="envs/staging.env"
readonly EXPECTED_PROJECT="fuma-lab-stg"

cd -- "$REPOSITORY_ROOT"

log() { printf '[staging] %s\n' "$*"; }
fail() {
  printf '[staging] ERROR: %s\n' "$*" >&2
  exit 1
}

[[ -f "$ENV_FILE" ]] ||
  fail "$ENV_FILE not found. Copy envs/staging.env.example and fill it in."

# Load the env file so we can validate it before touching Docker.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Guard: this tool must only ever operate on the staging project. If the env
# file were misconfigured to the production project, refuse rather than risk
# recreating the production container.
[[ "${COMPOSE_PROJECT_NAME:-}" == "$EXPECTED_PROJECT" ]] ||
  fail "COMPOSE_PROJECT_NAME is '${COMPOSE_PROJECT_NAME:-unset}', expected '$EXPECTED_PROJECT'. Refusing to run."

compose() { docker compose --env-file "$ENV_FILE" "$@"; }

require_tunnel_token_if_enabled() {
  if [[ ",${COMPOSE_PROFILES:-}," != *,tunnel,* ]]; then
    return 0
  fi

  [[ -n "${TUNNEL_TOKEN:-}" && "${TUNNEL_TOKEN}" != "replace-with-staging-tunnel-token" ]] ||
    fail "COMPOSE_PROFILES includes tunnel, but TUNNEL_TOKEN is unset or still the placeholder in $ENV_FILE."
}

smoke() {
  local base="http://127.0.0.1:${DOCS_PORT:-3001}"
  local headers
  log "Smoke testing $base"
  curl --fail --silent --show-error --retry 5 --retry-connrefused \
    "$base/docs" --output /dev/null ||
    fail "App did not serve /docs on $base"
  # Capture headers first, then grep — piping curl into `grep -q` can make grep
  # close the pipe on match, SIGPIPE curl, and (under pipefail) report a false
  # failure even when the header is present.
  headers="$(curl --fail --silent --show-error --dump-header - --output /dev/null "$base/docs")" ||
    fail "Could not read headers from $base/docs"
  grep -qi '^X-Robots-Tag:.*noindex' <<<"$headers" ||
    fail "Expected X-Robots-Tag: noindex header is missing"
  log "Smoke OK (app up, noindex header present)"
}

case "${1:-}" in
  deploy | up | rebuild)
    require_tunnel_token_if_enabled
    scripts/deploy.sh --env staging
    ;;
  check)
    scripts/deploy.sh --env staging --check-only
    ;;
  down)
    log "Stopping staging stack"
    compose down
    ;;
  smoke)
    smoke
    ;;
  logs)
    shift || true
    compose logs -f "$@"
    ;;
  ps)
    compose ps
    ;;
  *)
    grep -E '^#( |$)' "$0" | sed -E 's/^# ?//'
    exit 2
    ;;
esac
