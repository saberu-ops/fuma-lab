#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIRECTORY="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P
)"
readonly REPOSITORY_ROOT="$(cd -- "$SCRIPT_DIRECTORY/.." && pwd -P)"

target_environment="production"
check_only=0
switched=0
rollback_tag=""
candidate_tag=""
release_tag=""
temporary_directory=""
new_image_id=""

SERVICE=""
IMAGE=""
BASE_URL=""
HEALTH_TIMEOUT=""
PULL_BASE_IMAGE=""
SMOKE_MARKER=""

cd -- "$REPOSITORY_ROOT"

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [--env production|staging] [--check-only]

Build and validate the Fuma Lab image, preserve the running image, replace the
Compose service, verify health and application endpoints, and automatically
roll back if a post-switch check fails.

Options:
  --env NAME    Target environment: production (default) or staging.
  --check-only  Build and validate the image without replacing the container.
  -h, --help    Show this help.

Environment:
  DEPLOY_ENV_FILE      Override the environment file loaded for --env.
  DEPLOY_BASE_URL        Smoke-test origin (default: http://127.0.0.1:$DOCS_PORT)
  DEPLOY_HEALTH_TIMEOUT  Health-check timeout in seconds (default: 90)
  DEPLOY_IMAGE           Compose image tag (default: environment DOCS_IMAGE)
  DEPLOY_PULL            Set to 0 to skip pulling base images (default: 1)
  DEPLOY_SERVICE         Compose service name (default: docs)
  DEPLOY_SMOKE_MARKER    Text expected on /docs (default: 个人文档)
EOF
}

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  return 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 ||
    fail "Required command is unavailable: $1"
}

source_env_file() {
  local file="$1"
  local required="$2"

  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  elif [[ "$required" == "1" ]]; then
    fail "$file not found"
  fi
}

compose_profile_enabled() {
  local profile="$1"
  local raw_profiles="${COMPOSE_PROFILES:-}"
  local profiles=",${raw_profiles//[[:space:]]/},"

  [[ "$profiles" == *",$profile,"* ]]
}

load_environment() {
  local env_file

  case "$target_environment" in
    production)
      env_file="${DEPLOY_ENV_FILE:-envs/production.env}"
      source_env_file "$env_file" 0
      export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-fuma-lab}"
      export DOCS_PORT="${DOCS_PORT:-3000}"
      export DOCS_IMAGE="${DOCS_IMAGE:-fuma-lab:prod}"
      export SITE_URL="${SITE_URL:-http://localhost:${DOCS_PORT}}"
      export ROBOTS_NOINDEX="${ROBOTS_NOINDEX:-}"

      [[ "$COMPOSE_PROJECT_NAME" == "fuma-lab" ]] ||
        fail "Production COMPOSE_PROJECT_NAME must be fuma-lab"
      [[ "$ROBOTS_NOINDEX" != "1" ]] ||
        fail "Production must not set ROBOTS_NOINDEX=1"
      [[ "$SITE_URL" != *"your-production-domain.example"* ]] ||
        fail "Production SITE_URL is still the placeholder"
      ;;
    staging)
      env_file="${DEPLOY_ENV_FILE:-envs/staging.env}"
      source_env_file "$env_file" 1
      export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-fuma-lab-stg}"
      export DOCS_PORT="${DOCS_PORT:-3001}"
      export DOCS_IMAGE="${DOCS_IMAGE:-fuma-lab:stg}"
      export ROBOTS_NOINDEX="${ROBOTS_NOINDEX:-1}"

      [[ "$COMPOSE_PROJECT_NAME" == "fuma-lab-stg" ]] ||
        fail "Staging COMPOSE_PROJECT_NAME must be fuma-lab-stg"
      [[ "$ROBOTS_NOINDEX" == "1" ]] ||
        fail "Staging must set ROBOTS_NOINDEX=1"
      [[ -n "${SITE_URL:-}" && "$SITE_URL" != http://localhost* ]] ||
        fail "Staging SITE_URL must be a non-localhost URL"

      if [[ "$check_only" -eq 0 ]] && compose_profile_enabled "tunnel"; then
        [[ -n "${TUNNEL_TOKEN:-}" && "$TUNNEL_TOKEN" != "replace-with-staging-tunnel-token" ]] ||
          fail "Staging TUNNEL_TOKEN is unset or still the placeholder"
      fi
      ;;
    *)
      fail "Unsupported environment: $target_environment"
      ;;
  esac

  SERVICE="${DEPLOY_SERVICE:-docs}"
  IMAGE="${DEPLOY_IMAGE:-$DOCS_IMAGE}"
  BASE_URL="${DEPLOY_BASE_URL:-http://127.0.0.1:${DOCS_PORT}}"
  HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT:-90}"
  PULL_BASE_IMAGE="${DEPLOY_PULL:-1}"
  SMOKE_MARKER="${DEPLOY_SMOKE_MARKER:-个人文档}"
}

container_id() {
  docker compose ps -q "$SERVICE"
}

container_health() {
  local id="$1"
  docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$id"
}

preserve_container_image() {
  local id="$1"
  local image_id="$2"
  local target_tag="$3"

  if docker image inspect "$image_id" >/dev/null 2>&1; then
    docker tag "$image_id" "$target_tag"
  elif docker commit "$id" "$target_tag" >/dev/null 2>&1; then
    log "Running image metadata was unavailable; preserved a container snapshot"
  else
    fail "The running image cannot be preserved for rollback"
  fi
}

wait_for_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  local id
  local status

  while ((SECONDS < deadline)); do
    id="$(container_id)"
    if [[ -n "$id" ]]; then
      status="$(container_health "$id")"
      case "$status" in
        healthy | running)
          log "Container status: $status"
          return 0
          ;;
        unhealthy | exited | dead)
          fail "Container entered terminal state: $status"
          return 1
          ;;
      esac
      log "Waiting for container health: $status"
    else
      log "Waiting for Compose service container"
    fi
    sleep 2
  done

  fail "Container did not become healthy within ${HEALTH_TIMEOUT}s"
}

smoke_test() {
  local response_file="$temporary_directory/response"
  local header_file="$temporary_directory/headers"

  log "Checking documentation root"
  curl --fail --silent --show-error --retry 3 --retry-connrefused \
    --dump-header "$header_file" \
    "$BASE_URL/docs" --output "$response_file"
  grep -Fq "$SMOKE_MARKER" "$response_file" ||
    fail "Documentation root did not contain the expected navigation"

  if [[ "${ROBOTS_NOINDEX:-}" == "1" ]]; then
    grep -Eiq '^X-Robots-Tag:[[:space:]]*.*noindex' "$header_file" ||
      fail "Expected X-Robots-Tag noindex header is missing"
  else
    ! grep -Eiq '^X-Robots-Tag:[[:space:]]*.*noindex' "$header_file" ||
      fail "Unexpected noindex header on a production-indexable build"
  fi

  if [[ "$target_environment" == "staging" ]]; then
    grep -Fq "$SITE_URL" "$response_file" ||
      fail "Documentation root did not include the staging SITE_URL"
  fi

  if [[ -f "content/docs/(personal)/japanese-n2/index.mdx" ]]; then
    log "Checking Japanese N2 section and search"
    curl --fail --silent --show-error --retry 3 --retry-connrefused \
      "$BASE_URL/docs/japanese-n2" --output /dev/null
    curl --fail --silent --show-error --get \
      --data-urlencode 'query=日语 N2' \
      "$BASE_URL/api/search" --output "$response_file"
    grep -Fq '/docs/japanese-n2' "$response_file" ||
      fail "Search did not return the Japanese N2 section"
  fi

  if [[ -f "public/audio/jlpt-n2/2024-07/2024-01_1-1.mp3" ]]; then
    log "Checking audio byte-range delivery"
    curl --silent --show-error \
      --header 'Range: bytes=0-1023' \
      --dump-header "$header_file" \
      "$BASE_URL/audio/jlpt-n2/2024-07/2024-01_1-1.mp3" \
      --output "$response_file"
    grep -Eq '^HTTP/[0-9.]+ 206([[:space:]]|$)' "$header_file" ||
      fail "Audio endpoint did not return HTTP 206"
    grep -Eiq '^Content-Type:[[:space:]]*audio/mpeg' "$header_file" ||
      fail "Audio endpoint did not return audio/mpeg"
  fi
}

verify_runtime() {
  local id
  local running_image_id
  local cap_drop
  local security_options

  id="$(container_id)"
  [[ -n "$id" ]] || fail "Compose service has no running container"

  running_image_id="$(docker inspect --format '{{.Image}}' "$id")"
  [[ "$running_image_id" == "$new_image_id" ]] ||
    fail "Running container does not use the newly built image"

  [[ "$(docker inspect --format '{{.Config.User}}' "$id")" == "node" ]] ||
    fail "Runtime user is not node"
  [[ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$id")" == "true" ]] ||
    fail "Runtime root filesystem is not read-only"
  [[ "$(docker inspect --format '{{.HostConfig.PidsLimit}}' "$id")" == "256" ]] ||
    fail "Runtime PID limit is not 256"

  cap_drop="$(docker inspect --format '{{json .HostConfig.CapDrop}}' "$id")"
  grep -Fq '"ALL"' <<<"$cap_drop" ||
    fail "Runtime does not drop all Linux capabilities"

  security_options="$(
    docker inspect --format '{{json .HostConfig.SecurityOpt}}' "$id"
  )"
  grep -Fq '"no-new-privileges:true"' <<<"$security_options" ||
    fail "Runtime does not enforce no-new-privileges"
}

ensure_environment_services() {
  if [[ "$target_environment" == "staging" ]] && compose_profile_enabled "tunnel"; then
    log "Ensuring staging tunnel service is running"
    docker compose up -d --no-build cloudflared
  fi
}

restore_previous_image() {
  local original_exit_code="$1"

  trap - ERR INT TERM
  set +e

  if [[ "$switched" -eq 1 && -n "$rollback_tag" ]]; then
    printf '[deploy] Deployment failed; restoring %s\n' "$rollback_tag" >&2
    docker tag "$rollback_tag" "$IMAGE"
    local tag_status=$?
    docker compose up -d --no-build --force-recreate "$SERVICE"
    local up_status=$?

    if [[ "$tag_status" -eq 0 && "$up_status" -eq 0 ]] &&
      wait_for_healthy &&
      curl --fail --silent --show-error "$BASE_URL/docs" --output /dev/null; then
      printf '[deploy] Rollback completed and the previous service is healthy.\n' >&2
    else
      printf '[deploy] CRITICAL: automatic rollback could not be verified.\n' >&2
    fi
  fi

  [[ -z "$temporary_directory" ]] || rm -rf "$temporary_directory"
  exit "$original_exit_code"
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --env)
      shift
      [[ -n "${1:-}" ]] || fail "--env requires production or staging"
      target_environment="$1"
      ;;
    --env=*)
      target_environment="${1#--env=}"
      ;;
    --check-only)
      check_only=1
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf '[deploy] ERROR: Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

load_environment

[[ "$HEALTH_TIMEOUT" =~ ^[1-9][0-9]*$ ]] ||
  fail "DEPLOY_HEALTH_TIMEOUT must be a positive integer"
[[ "$PULL_BASE_IMAGE" == "0" || "$PULL_BASE_IMAGE" == "1" ]] ||
  fail "DEPLOY_PULL must be 0 or 1"
[[ "$SERVICE" =~ ^[a-zA-Z0-9_-]+$ ]] ||
  fail "DEPLOY_SERVICE contains unsupported characters"
[[ "$IMAGE" =~ ^[a-zA-Z0-9._/@:-]+$ ]] ||
  fail "DEPLOY_IMAGE contains unsupported characters"

require_command curl
require_command docker
require_command flock
require_command git
require_command grep
require_command mktemp

exec 9>"${TMPDIR:-/tmp}/fuma-lab-deploy.lock"
flock -n 9 ||
  fail "Another Fuma Lab deployment is already running"

temporary_directory="$(mktemp -d)"
trap 'restore_previous_image $?' ERR
trap 'restore_previous_image 130' INT
trap 'restore_previous_image 143' TERM

log "Validating Compose configuration"
docker compose config --quiet

if ! git diff HEAD --check; then
  fail "Git whitespace validation failed"
fi

image_repository="$IMAGE"
if [[ "${IMAGE##*/}" == *:* ]]; then
  image_repository="${IMAGE%:*}"
fi
rollback_repository="${DEPLOY_ROLLBACK_REPOSITORY:-$image_repository}"
release_timestamp="$(date +%Y%m%d-%H%M%S)"
git_revision="$(git rev-parse --short=12 HEAD)"
current_container="$(container_id)"

if [[ -n "$current_container" && "$check_only" -eq 0 ]]; then
  previous_image_id="$(docker inspect --format '{{.Image}}' "$current_container")"
  rollback_tag="${rollback_repository}:${target_environment}-rollback-${release_timestamp}"
  preserve_container_image \
    "$current_container" "$previous_image_id" "$rollback_tag"
  log "Preserved running image as $rollback_tag"
elif [[ "$check_only" -eq 0 ]]; then
  log "No running service found; this deployment has no automatic rollback target"
fi

build_arguments=()
if [[ "$PULL_BASE_IMAGE" == "1" ]]; then
  build_arguments+=(--pull)
fi

if [[ "$check_only" -eq 1 ]]; then
  candidate_tag="${rollback_repository}:${target_environment}-candidate-${release_timestamp}"
  compose_override="$temporary_directory/check.compose.yaml"
  printf 'services:\n  %s:\n    image: %s\n' \
    "$SERVICE" "$candidate_tag" >"$compose_override"
  log "Building and validating candidate image $candidate_tag"
  docker compose \
    -f compose.yaml \
    -f "$compose_override" \
    build "${build_arguments[@]}" "$SERVICE"
  new_image_id="$(docker image inspect --format '{{.Id}}' "$candidate_tag")"
else
  log "Building and validating image $IMAGE"
  docker compose build "${build_arguments[@]}" "$SERVICE"
  new_image_id="$(docker image inspect --format '{{.Id}}' "$IMAGE")"
  release_tag="${rollback_repository}:${target_environment}-${git_revision}-${release_timestamp}"
  docker tag "$new_image_id" "$release_tag"
fi
log "Validated image: $new_image_id"

if [[ "$check_only" -eq 1 ]]; then
  log "Check-only mode complete; the running container was not replaced"
  printf 'CANDIDATE_IMAGE=%s\n' "$new_image_id"
  printf 'CANDIDATE_TAG=%s\n' "$candidate_tag"
  rm -rf "$temporary_directory"
  trap - ERR INT TERM
  exit 0
fi

switched=1
log "Replacing Compose service $SERVICE"
docker compose up -d --no-build --force-recreate "$SERVICE"
wait_for_healthy
verify_runtime
ensure_environment_services
smoke_test
switched=0

working_tree="clean"
if [[ -n "$(git status --short)" ]]; then
  working_tree="dirty"
fi

rm -rf "$temporary_directory"
trap - ERR INT TERM

log "Deployment succeeded"
printf 'ENVIRONMENT=%s\n' "$target_environment"
printf 'DEPLOYED_IMAGE=%s\n' "$new_image_id"
printf 'RELEASE_TAG=%s\n' "${release_tag:-none}"
printf 'ROLLBACK_TAG=%s\n' "${rollback_tag:-none}"
printf 'SERVICE_HEALTH=healthy\n'
printf 'WORKING_TREE=%s\n' "$working_tree"
