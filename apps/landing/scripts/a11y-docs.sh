#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT=4321
HOST="127.0.0.1"
BASE_URL="http://${HOST}:${PORT}"

cleanup() {
  if [[ -n "${PREVIEW_PID:-}" ]] && kill -0 "$PREVIEW_PID" 2>/dev/null; then
    kill "$PREVIEW_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

bun run build >/dev/null
bun run preview --host "$HOST" --port "$PORT" >/tmp/stepiq-landing-preview.log 2>&1 &
PREVIEW_PID=$!

for _ in {1..40}; do
  if curl -sf "$BASE_URL/docs" >/dev/null; then
    break
  fi
  sleep 0.5
done

ROUTES=(
  "/docs"
  "/docs/getting-started"
  "/docs/pipeline-format"
  "/docs/api-reference"
  "/docs/models-pricing"
  "/docs/architecture"
)

for route in "${ROUTES[@]}"; do
  echo "Running axe on ${route}"
  bunx --bun axe "$BASE_URL$route" --tags wcag2a,wcag2aa --exit
  echo
 done
