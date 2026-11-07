#!/bin/sh
set -e
# Browser-reachable API URL (not Docker-internal api:3000).
API_URL="${API_PUBLIC_URL:-${VITE_API_URL:-http://localhost:3002}}"
# shellcheck disable=SC2016
printf '%s\n' "window.__2PESCROW_API_URL__=\"${API_URL}\";" > /app/dist/config.js
exec serve -s dist -l 3001
