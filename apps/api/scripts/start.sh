#!/bin/sh
# Start the API. If Prisma recorded the public-ledger migration as failed,
# mark that attempt rolled back and apply the current file. Postgres rolled
# the failed attempt back, and the file is safe to run again.
set -eu
cd "$(dirname "$0")/.."
npx prisma generate
migration=20261120120000_public_ledger_and_privacy
if ! output=$(npx prisma migrate deploy 2>&1); then
  printf '%s\n' "$output" >&2
  case "$output" in
    *P3009*20261120120000_public_ledger_and_privacy*)
      npx prisma migrate resolve --rolled-back "$migration"
      npx prisma migrate deploy
      ;;
    *)
      exit 1
      ;;
  esac
else
  printf '%s\n' "$output"
fi
exec node dist/index.js
