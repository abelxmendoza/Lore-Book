#!/usr/bin/env bash
# Capture ingestion.cost telemetry into logs/ingestion-sample.log and summarize it.
#
# Preferred (direct pipeline — no OpenAI chat stream required):
#   npm run capture:ingestion-sample
#
# Manual server capture (needs dev auth user in Supabase):
#   LOG_PRETTY=false npm run dev 2>&1 | tee logs/ingestion-sample.log
#   # send authenticated chat messages in another terminal
#   npm run cost:ingestion -- logs/ingestion-sample.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p logs
LOG_FILE="${LOG_FILE:-logs/ingestion-sample.log}"

export NODE_ENV=development
export LOG_PRETTY=false

: > "$LOG_FILE"

echo "Running ingestion pipeline sample (LOG_PRETTY=false) → $LOG_FILE"
npx tsx scripts/emit-ingestion-sample-logs.ts >>"$LOG_FILE" 2>&1

echo ""
echo "=== cost:ingestion ==="
npm run cost:ingestion -- "$LOG_FILE"
