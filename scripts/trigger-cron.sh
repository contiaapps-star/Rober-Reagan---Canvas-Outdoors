#!/usr/bin/env bash
# Triggered by Railway cron services. Calls the web service's /jobs/poll/<channel>
# endpoint and exits. Exit non-zero on HTTP >= 400 so Railway records a failed
# deployment in the cron history.

set -euo pipefail

CHANNEL="${1:-}"
if [[ -z "$CHANNEL" ]]; then
  echo "usage: $0 <channel>   (e.g. daily, weekly, website, meta, ...)"
  exit 2
fi

: "${WEB_SERVICE_URL:?WEB_SERVICE_URL is required (set in Railway service Variables, e.g. https://web-production.up.railway.app)}"
: "${CRON_SECRET:?CRON_SECRET is required (must match the web service's CRON_SECRET)}"

URL="${WEB_SERVICE_URL%/}/jobs/poll/${CHANNEL}"
echo "→ POST ${URL}"

http_code=$(curl -sS -o /tmp/cron-out -w "%{http_code}" \
  -X POST "$URL" \
  -H "X-Cron-Secret: ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 1800)

cat /tmp/cron-out
echo

if [[ "$http_code" -ge 400 ]]; then
  echo "✗ ${CHANNEL} poll failed with HTTP ${http_code}"
  exit 1
fi

echo "✓ ${CHANNEL} poll OK (HTTP ${http_code})"
