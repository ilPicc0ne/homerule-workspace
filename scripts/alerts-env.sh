#!/usr/bin/env bash
# Sets the alert env vars everywhere at once, without ever printing a secret.
#   scripts/alerts-env.sh            reuse DEMO_TOKEN from web/.env.local if present, else generate one
#   scripts/alerts-env.sh --rotate   always generate a new DEMO_TOKEN
# Writes: web/.env.local (local dev + the dispatch script), Vercel production + preview.
# RESEND_API_KEY is not touched (set once by hand from the Resend dashboard).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_FILE="web/.env.local"
VERCEL="npx --yes vercel@62.2.0"
SITE_URL_PROD="https://yourhomerule.com"
SITE_URL_LOCAL="http://localhost:3000"

git check-ignore -q "$ENV_FILE" || { echo "abort: $ENV_FILE is not git-ignored"; exit 1; }
[ -f .vercel/project.json ] || { echo "abort: repo root is not linked to Vercel (run: $VERCEL link)"; exit 1; }
touch "$ENV_FILE"; chmod 600 "$ENV_FILE"

# set_local KEY VALUE: replace or append KEY=VALUE in .env.local, value never echoed
set_local() {
  local tmp; tmp="$(mktemp)"
  grep -v "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  mv "$tmp" "$ENV_FILE"; chmod 600 "$ENV_FILE"
}

# set_vercel KEY VALUE ENV [--sensitive]: remove old value, add new one from stdin
set_vercel() {
  $VERCEL env rm "$1" "$3" --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | $VERCEL env add "$1" "$3" ${4:-} >/dev/null
  echo "  vercel $3: $1 set"
}

token="$(grep -E '^DEMO_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
if [ "${1:-}" = "--rotate" ] || [ -z "$token" ]; then
  token="$(openssl rand -hex 32)"
  echo "DEMO_TOKEN: generated a new one"
else
  echo "DEMO_TOKEN: reusing the one in $ENV_FILE"
fi

set_local DEMO_TOKEN "$token"
set_local ALERTS_SITE_URL "$SITE_URL_LOCAL"
echo "  local: $ENV_FILE updated (DEMO_TOKEN, ALERTS_SITE_URL)"

for env in production preview; do
  set_vercel DEMO_TOKEN "$token" "$env" --sensitive
done
set_vercel ALERTS_SITE_URL "$SITE_URL_PROD" production

unset token
echo
echo "Now in Vercel (names only):"
$VERCEL env ls 2>/dev/null | grep -E 'DEMO_TOKEN|ALERTS_SITE_URL|RESEND_API_KEY' | awk '{print "  " $1 " (" $4 ")"}'
echo
echo "Takes effect with the next deploy (push to production / new preview)."
