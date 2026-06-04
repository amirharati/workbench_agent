#!/usr/bin/env bash
# V3-B4 session 1a — candidate (map→reduce) eval; same 2×2 as baseline.
# Usage: ./scripts/categorize/run-discover-eval-candidate.sh [RUN_ID] [MAX_ITEMS] [MAX_BATCHES]

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

RUN_ID="${1:-$(date -u +%Y-%m-%d)}"
MAX="${2:-124}"
BATCHES="${3:-}"
EVAL_ROOT="data/experiments/categorize/eval-${RUN_ID}"
SEED="${ROOT}/scripts/categorize/seed/categories.seed.json"

mkdir -p "$EVAL_ROOT"

run_one() {
  local label="$1"
  shift
  local out="${EVAL_ROOT}/${label}"
  echo "=== ${label} → ${out} ==="
  local -a batch_flag=()
  if [[ -n "$BATCHES" ]]; then batch_flag=(--max-batches "$BATCHES"); fi
  npm run discover-incremental -- "$@" --reduce-single --run-llm --all-eligible \
    --max "$MAX" "${batch_flag[@]}" --out "${out}/discover"
  npm run classify-incremental -- --run-llm --max "$MAX" \
    --seed-taxonomy "${out}/discover/taxonomy-out.json" \
    --force-reclassify \
    --out "${out}/classify"
}

run_one "candidate-cold" --no-seed
run_one "candidate-warm" --seed-in "$SEED"

echo "Done. Compare with baseline under ${EVAL_ROOT}/"
