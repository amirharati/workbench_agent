#!/usr/bin/env bash
# Full discover eval: baseline + candidate + v2 + v3 (cold & warm) → COMPARE.md
# Usage: ./scripts/categorize/run-discover-eval-all.sh [RUN_ID] [MAX_ITEMS]
#
# Optional third arg MAX_BATCHES caps MAP batches (cost); omit for full pool coverage.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

RUN_ID="${1:-$(date -u +%Y-%m-%dT%H-%M-%S)}"
MAX="${2:-124}"
BATCH_ARG=()
if [[ -n "${3:-}" ]]; then
  BATCH_ARG=( "$3" )
fi

chmod +x scripts/categorize/run-discover-eval-*.sh

echo "=== Discover eval RUN_ID=${RUN_ID} MAX=${MAX} ==="
./scripts/categorize/run-discover-eval-baseline.sh "$RUN_ID" "$MAX" "${BATCH_ARG[@]}"
./scripts/categorize/run-discover-eval-candidate.sh "$RUN_ID" "$MAX" "${BATCH_ARG[@]}"
./scripts/categorize/run-discover-eval-v2.sh "$RUN_ID" "$MAX" "${BATCH_ARG[@]}"
./scripts/categorize/run-discover-eval-v3.sh "$RUN_ID" "$MAX" "${BATCH_ARG[@]}"

EVAL_ROOT="data/experiments/categorize/eval-${RUN_ID}"
node scripts/categorize/write-discover-compare.mjs "$EVAL_ROOT"
echo "=== COMPARE: ${EVAL_ROOT}/COMPARE.md ==="
