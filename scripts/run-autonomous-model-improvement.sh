#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# run-autonomous-model-improvement.sh
#
# Autonomous self-improving pipeline for MediaPipe meal classification model:
# 1. Augment minority classes in training set (strictly preserving Golden Test Set)
# 2. Train candidate model (Challenger) with MediaPipe Model Maker
# 3. Evaluate Challenger against Golden Test Set
# 4. Champion / Challenger gate: Promote only if Top-3 & Top-1 metrics improve/hold
# -----------------------------------------------------------------------------

SOURCE_DATASET="state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset"
AUGMENTED_DATASET="state/mediapipe-dataset/augmented"
OUTPUT_DIR="state/mediapipe_models/challenger_run"
ASSET_TASK="android/app/src/main/assets/mediapipe/meal-input-assist.task"
BENCHMARK_REPORT="state/mediapipe_models/challenger_evaluation.json"

TARGET_PER_CLASS="${TARGET_PER_CLASS:-15}"
EPOCHS="${EPOCHS:-25}"
BATCH_SIZE="${BATCH_SIZE:-4}"

# Baseline thresholds from Champion model (current deployed model on Golden Test Set: 7 samples)
# Test: Top-1 = 2/7 (28.6%), Top-3 = 4/7 (57.1%), Minority classes Top-3 correct = 0
export CHAMPION_TOP1_CORRECT="2"
export CHAMPION_TOP3_CORRECT="4"
export CHAMPION_MINORITY_TOP3_CORRECT="0"

# Canonical Promotion Gate Thresholds (from mediapipe-model-autonomous-improvement-plan.md)
# Evaluated strictly on integer correct counts over 7 Golden Test samples
export GATE_MIN_TOP3_CORRECT="5"          # >= 5/7 (71.4%)
export GATE_MIN_TOP1_CORRECT="2"          # >= 2/7 (28.6%)
export GATE_MAX_MODEL_SIZE_BYTES=15728640 # <= 15MB
export GATE_MIN_MODEL_SIZE_BYTES=1048576  # >= 1MB
export GATE_MAX_LATENCY_MS="100.0"        # <= 100ms (eval host benchmark gate; does not guarantee on-device latency)

echo "========================================================"
echo "🚀 Starting Autonomous MediaPipe Model Improvement Loop"
echo "========================================================"
echo "Source dataset:       $SOURCE_DATASET"
echo "Augmented dataset:    $AUGMENTED_DATASET"
echo "Target per class:     $TARGET_PER_CLASS"
echo "Epochs:               $EPOCHS (batch size: $BATCH_SIZE)"
echo "Champion baseline:    Top-1 = 2/7, Top-3 = 4/7, Minority Top-3 = 0"
echo "Promotion criteria:   Top-3 >= 5/7 (71.4%) AND Top-1 >= 2/7 (28.6%)"
echo "                      + Minority class improvement (> Champion baseline)"
echo "                      + Model size <= 15MB AND Eval Latency <= 100ms"
echo "                      (Latency gate evaluates CI/host execution; does not prove device latency)"
echo "========================================================"

# Pre-check: Verify Golden Test Set presence
if [ ! -d "$SOURCE_DATASET/test" ]; then
  echo "❌ Error: Golden Test Set not found at $SOURCE_DATASET/test"
  exit 1
fi
INITIAL_TEST_FILE_COUNT=$(find "$SOURCE_DATASET/test" -type f | wc -l | tr -d ' ')
echo "Verified Golden Test Set: $INITIAL_TEST_FILE_COUNT files present."

# Step 1: Data Augmentation (train only, val and test strictly preserved)
echo -e "\n📦 [Step 1/4] Augmenting training samples for minority classes..."
uv run --python .venv_mediapipe python scripts/augment-mediapipe-dataset.py \
  --source-dataset-dir "$SOURCE_DATASET" \
  --output-dataset-dir "$AUGMENTED_DATASET" \
  --target-per-class "$TARGET_PER_CLASS"

# Post-augmentation check: Ensure Golden Test Set was not altered
CURRENT_TEST_FILE_COUNT=$(find "$SOURCE_DATASET/test" -type f | wc -l | tr -d ' ')
if [ "$INITIAL_TEST_FILE_COUNT" != "$CURRENT_TEST_FILE_COUNT" ]; then
  echo "❌ CRITICAL: Golden Test Set file count changed during augmentation! Aborting."
  exit 1
fi

# Step 2: Retraining Candidate Model (Challenger)
# Note: --export-task-path is deliberately NOT provided here so production asset is never modified before gate evaluation
echo -e "\n🧠 [Step 2/4] Training candidate model (Challenger)..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

uv run --python .venv_mediapipe python scripts/train-mediapipe-model.py \
  --dataset-dir "$AUGMENTED_DATASET" \
  --output-dir "$OUTPUT_DIR" \
  --model-name "model.task" \
  --epochs "$EPOCHS" \
  --batch-size "$BATCH_SIZE"

CHALLENGER_MODEL="$OUTPUT_DIR/model.task"
if [ ! -f "$CHALLENGER_MODEL" ]; then
  echo "❌ Error: Challenger model not generated at $CHALLENGER_MODEL"
  exit 1
fi

# Model size validation check: <= 15MB and >= 1MB
MODEL_SIZE=$(wc -c < "$CHALLENGER_MODEL" | tr -d ' ')
if [ "$MODEL_SIZE" -lt "$GATE_MIN_MODEL_SIZE_BYTES" ] || [ "$MODEL_SIZE" -gt "$GATE_MAX_MODEL_SIZE_BYTES" ]; then
  echo "❌ Error: Model size ($MODEL_SIZE bytes) exceeds canonical gate bounds [1MB, 15MB]. Rejecting model."
  exit 1
fi
echo "✓ Challenger model size verified: $(( MODEL_SIZE / 1024 / 1024 )) MB ($MODEL_SIZE bytes <= 15MB)"

# Step 3: Autonomous Evaluation on Golden Test Set
echo -e "\n📊 [Step 3/4] Evaluating Challenger against Golden Test Set..."
uv run --python .venv_mediapipe python scripts/evaluate-mediapipe-model.py \
  --model-path "$CHALLENGER_MODEL" \
  --dataset-dir "$SOURCE_DATASET" \
  --output-json "$BENCHMARK_REPORT" \
  --output-md "$OUTPUT_DIR/evaluation_summary.md"

# Step 4: Champion / Challenger Gate
echo -e "\n⚖️  [Step 4/4] Evaluating Champion / Challenger Promotion Gate..."

GATE_RESULT=$(node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$BENCHMARK_REPORT', 'utf8'));
const testMetrics = data.test && data.test.metrics ? data.test.metrics : {};
const total = testMetrics.total || 0;
const top1Correct = testMetrics.top1_correct || 0;
const top3Correct = testMetrics.top3_correct || 0;
const latency = testMetrics.avg_latency_ms || 0;

const championTop1Correct = parseInt(process.env.CHAMPION_TOP1_CORRECT || '2', 10);
const championTop3Correct = parseInt(process.env.CHAMPION_TOP3_CORRECT || '4', 10);
const championMinorityTop3Correct = parseInt(process.env.CHAMPION_MINORITY_TOP3_CORRECT || '0', 10);

const gateMinTop3Correct = parseInt(process.env.GATE_MIN_TOP3_CORRECT || '5', 10);
const gateMinTop1Correct = parseInt(process.env.GATE_MIN_TOP1_CORRECT || '2', 10);
const gateMaxLatency = parseFloat(process.env.GATE_MAX_LATENCY_MS || '100.0');

// Minority classes evaluated on Golden Test Set:
const minorityClasses = ['fried_dish', 'stir_fry', 'other_or_exclude'];
const testDetails = (data.test && data.test.details) ? data.test.details : [];
const challengerMinorityTop3Correct = testDetails.filter(item =>
  minorityClasses.includes(item.ground_truth) && item.is_top3
).length;

// Minority coverage must strictly improve relative to Champion baseline:
const minorityImproved = challengerMinorityTop3Correct > championMinorityTop3Correct;

console.error('--- Evaluation Metrics vs Gates (Integer Sample Basis on N=' + total + ') ---');
console.error('Challenger Test Metrics: Top-1 = ' + top1Correct + '/' + total + ' (' + (top1Correct/total*100).toFixed(1) + '%), Top-3 = ' + top3Correct + '/' + total + ' (' + (top3Correct/total*100).toFixed(1) + '%), Latency = ' + latency.toFixed(1) + 'ms');
console.error('Minority Top-3 Coverage: Challenger = ' + challengerMinorityTop3Correct + ' vs Champion = ' + championMinorityTop3Correct);
console.error('Promotion Requirements:  Top-3 >= ' + gateMinTop3Correct + '/' + total + ' (>= 71.4%), Top-1 >= ' + gateMinTop1Correct + '/' + total + ' (>= 28.6%), Latency <= ' + gateMaxLatency + 'ms (eval host), Minority Coverage > ' + championMinorityTop3Correct);
console.error('Actual Gate Checks:');
console.error('  - Top-3 Check (>=' + gateMinTop3Correct + '/' + total + '):          ' + (top3Correct >= gateMinTop3Correct ? 'PASS' : 'FAIL'));
console.error('  - Top-1 Check (>=' + gateMinTop1Correct + '/' + total + '):          ' + (top1Correct >= gateMinTop1Correct ? 'PASS' : 'FAIL'));
console.error('  - Latency Check (<=' + gateMaxLatency + 'ms):        ' + (latency <= gateMaxLatency ? 'PASS' : 'FAIL') + ' (Note: measured on eval host, does not guarantee device latency)');
console.error('  - Minority Improvement Check:  ' + (minorityImproved ? 'PASS (improved from ' + championMinorityTop3Correct + ' to ' + challengerMinorityTop3Correct + ')' : 'FAIL (' + challengerMinorityTop3Correct + ' <= ' + championMinorityTop3Correct + ')'));

const passPromotion = (top3Correct >= gateMinTop3Correct) &&
                      (top1Correct >= gateMinTop1Correct) &&
                      (latency <= gateMaxLatency) &&
                      minorityImproved;

const passRegressionGuard = (top3Correct >= championTop3Correct) &&
                            (top1Correct >= championTop1Correct);

if (passPromotion) {
  process.stdout.write('PROMOTE');
} else if (passRegressionGuard) {
  process.stdout.write('MAINTAIN_OR_TIE');
} else {
  process.stdout.write('REJECT');
}
")

if [ "$GATE_RESULT" = "PROMOTE" ]; then
  echo "🎉 [GATE PASSED] Challenger model met all canonical promotion criteria!"
  echo "Promoting Challenger model to $ASSET_TASK atomically..."

  # Safe atomic promotion: copy to temp file, verify, then atomic move
  ASSET_DIR="$(dirname "$ASSET_TASK")"
  mkdir -p "$ASSET_DIR"
  TEMP_ASSET="${ASSET_TASK}.tmp.$$"

  cp "$CHALLENGER_MODEL" "$TEMP_ASSET"

  if [ ! -f "$TEMP_ASSET" ] || [ ! -s "$TEMP_ASSET" ]; then
    echo "❌ Error: Failed to stage model asset at $TEMP_ASSET"
    rm -f "$TEMP_ASSET"
    exit 1
  fi

  SRC_SIZE=$(wc -c < "$CHALLENGER_MODEL" | tr -d ' ')
  TMP_SIZE=$(wc -c < "$TEMP_ASSET" | tr -d ' ')
  if [ "$SRC_SIZE" != "$TMP_SIZE" ]; then
    echo "❌ Error: Staged asset size mismatch ($SRC_SIZE != $TMP_SIZE). Aborting promotion."
    rm -f "$TEMP_ASSET"
    exit 1
  fi

  mv -f "$TEMP_ASSET" "$ASSET_TASK"
  echo "✅ Model successfully and atomically deployed to Android assets: $ASSET_TASK"
  echo "Done! You can now commit the new model asset and benchmark results."
elif [ "$GATE_RESULT" = "MAINTAIN_OR_TIE" ]; then
  echo "ℹ️  [GATE TIE] Challenger maintained baseline without regression, but did not satisfy full promotion requirements."
  echo "Production asset kept intact ($ASSET_TASK untouched)."
  echo "Candidate model preserved at $OUTPUT_DIR/ for review."
else
  echo "⚠️  [GATE BLOCKED] Challenger model did not meet promotion criteria or regressed."
  echo "Core Principle: 'No regression, no PR'. Production asset kept intact ($ASSET_TASK untouched)."
  echo "Challenger results logged at $OUTPUT_DIR/."
fi
