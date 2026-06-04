#!/usr/bin/env bash
# V3-B4: 2×2 discover eval — baseline (current CLI) before map→reduce.
# Usage: ./scripts/categorize/run-discover-eval-baseline.sh [RUN_ID] [MAX_ITEMS]
#
# Produces:
#   data/experiments/categorize/eval-<RUN_ID>/baseline-cold/
#   data/experiments/categorize/eval-<RUN_ID>/baseline-warm/
# Each: discover → classify on taxonomy-out.json

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

RUN_ID="${1:-$(date -u +%Y-%m-%dT%H-%M-%S)}"
MAX="${2:-124}"
BATCHES="${3:-}"
EVAL_ROOT="data/experiments/categorize/eval-${RUN_ID}"
SEED="${ROOT}/scripts/categorize/seed/categories.seed.json"

mkdir -p "$EVAL_ROOT"

run_one() {
  local label="$1"
  shift
  local -a discover_extra=("$@")
  local out="${EVAL_ROOT}/${label}"
  echo "=== ${label} → ${out} ==="
  local -a batch_flag=()
  if [[ -n "$BATCHES" ]]; then batch_flag=(--max-batches "$BATCHES"); fi
  npm run discover-incremental-legacy -- "${discover_extra[@]}" --run-llm --all-eligible \
    --max "$MAX" "${batch_flag[@]}" --out "${out}/discover"
  npm run classify-incremental -- --run-llm --max "$MAX" \
    --seed-taxonomy "${out}/discover/taxonomy-out.json" \
    --force-reclassify \
    --out "${out}/classify"
}

# Cold: zero taxonomy at start
run_one "baseline-cold" --no-seed

# Warm: seed parents/leaves at start
run_one "baseline-warm" --seed-in "$SEED"

cat > "${EVAL_ROOT}/README.md" <<EOF
# Discover eval run ${RUN_ID}

Baseline (pre map→reduce). Repeat with same flags after B4 lands → \`candidate-cold\`, \`candidate-warm\`.

| Run | Discover out | Classify out |
|-----|--------------|--------------|
| baseline-cold | baseline-cold/discover | baseline-cold/classify |
| baseline-warm | baseline-warm/discover | baseline-warm/classify |

Compare: \`run-stats.json\` (discover), classify SUMMARY (classifiedSpecific, pending_discover, general).

Max items: ${MAX} · MAP batches: ${BATCHES:-all (ceil pool/32)}
EOF

echo "Done. See ${EVAL_ROOT}/README.md"
