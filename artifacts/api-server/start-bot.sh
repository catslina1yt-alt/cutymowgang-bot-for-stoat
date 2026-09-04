#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${STOAT_BOT_TOKEN:-}" ]]; then
  echo "STOAT_BOT_TOKEN is required. Add it to the environment or Replit Secrets." >&2
  exit 1
fi

export PORT="${PORT:-8080}"
pnpm --filter @workspace/api-server run dev