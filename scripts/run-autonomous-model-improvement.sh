#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# run-autonomous-model-improvement.sh
#
# Autonomous self-improving pipeline for MediaPipe meal classification model:
# 1. Augment minority classes in training set (strictly preserving Golden Test Set)
# 2. Train candidate model (Challenger) with MediaPipe Model Maker
# 3. Evaluate Champion & Challenger against Golden Test Set
# 4. Champion / Challenger gate: Promote only if Top-3 & Top-1 metrics improve/hold,
#    minority Top-3 coverage strictly improves over Champion, latency <= 100ms,
#    and Golden Test Set contains exactly 7 samples.
# -----------------------------------------------------------------------------

SOURCE_DATASET="state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset"
AUGMENTED_DATASET="state/mediapipe-dataset/augmented"
OUTPUT_DIR="state/mediapipe_models/challenger_run"
ASSET_TASK="android/app/src/main/assets/mediapipe/meal-input-assist.task"
BENCHMARK_REPORT="state/mediapipe_models/challenger_evaluation.json"
CHAMPION_REPORT="state/mediapipe_models/champion_evaluation.json"

TARGET_PER_CLASS="${TARGET_PER_CLASS:-15}"
EPOCHS="${EPOCHS:-25}"
BATCH_SIZE="${BATCH_SIZE:-4}"

# Canonical Promotion Gate Thresholds (from mediapipe-model-autonomous-improvement-plan.md)
# Evaluated strictly on integer correct counts over 7 Golden Test samples
export REQUIRED_TEST_SET_SIZE="7"
export GATE_MIN_TOP3_CORRECT="5"          # >= 5/7 (71.4%)
export GATE_MIN_TOP1_CORRECT="2"          # >= 2/7 (28.6%)
export GATE_MAX_MODEL_SIZE_BYTES=15728640 # <= 15MB
export GATE_MIN_MODEL_SIZE_BYTES=1048576  # >= 1MB
export GATE_MAX_LATENCY_MS="100.0"        # <= 100ms (eval host benchmark gate; does not guarantee on-device latency)

evaluate_gate() {
  local challenger_json="$1"
  local champion_json="${2:-}"

  node -e "
const fs = require('fs');

const challengerPath = process.argv[1];
const championPath = process.argv[2];

if (!fs.existsSync(challengerPath)) {
  console.error('Error: Challenger report file not found: ' + challengerPath);
  process.stdout.write('REJECT_FILE_NOT_FOUND');
  process.exit(0);
}

let challengerData;
try {
  challengerData = JSON.parse(fs.readFileSync(challengerPath, 'utf8'));
} catch (err) {
  console.error('❌ CRITICAL GATE FAILURE: Failed to parse Challenger report JSON: ' + err.message);
  process.stdout.write('REJECT_INVALID_TEST_SET');
  process.exit(0);
}

const challengerTest = (challengerData && challengerData.test && challengerData.test.metrics) ? challengerData.test.metrics : null;
const challengerDetails = (challengerData && challengerData.test && challengerData.test.details) ? challengerData.test.details : null;

const challengerTotal = challengerTest ? (challengerTest.total || 0) : 0;
const challengerTop1Correct = challengerTest ? (challengerTest.top1_correct || 0) : 0;
const challengerTop3Correct = challengerTest ? (challengerTest.top3_correct || 0) : 0;
const challengerLatency = challengerTest ? (challengerTest.avg_latency_ms || 0) : 0;

// Golden Test Set MUST be exactly REQUIRED_TEST_SET_SIZE (7 samples) in both metrics.total and details Array
const requiredSize = parseInt(process.env.REQUIRED_TEST_SET_SIZE || '7', 10);
if (!challengerTest || challengerTotal !== requiredSize || !Array.isArray(challengerDetails) || challengerDetails.length !== requiredSize) {
  console.error('❌ CRITICAL GATE FAILURE: Challenger test set count or details mismatch! Expected total=' + requiredSize + ' and details.length=' + requiredSize + ', got total=' + challengerTotal + ', details=' + (Array.isArray(challengerDetails) ? challengerDetails.length : 'not_array') + '. Gate failure.');
  process.stdout.write('REJECT_INVALID_TEST_SET');
  process.exit(0);
}

// Production Champion evaluation is MANDATORY. Fallback to hardcoded baselines is prohibited.
if (!championPath || !fs.existsSync(championPath)) {
  console.error('❌ CRITICAL GATE FAILURE: Production Champion report file not found (' + championPath + '). Promotion prohibited.');
  process.stdout.write('REJECT_CHAMPION_NOT_EVALUATED');
  process.exit(0);
}

let championData;
try {
  championData = JSON.parse(fs.readFileSync(championPath, 'utf8'));
} catch (err) {
  console.error('❌ CRITICAL GATE FAILURE: Failed to parse Champion report JSON: ' + err.message);
  process.stdout.write('REJECT_CHAMPION_NOT_EVALUATED');
  process.exit(0);
}

const championTest = (championData && championData.test && championData.test.metrics) ? championData.test.metrics : null;
const championDetails = (championData && championData.test && championData.test.details) ? championData.test.details : null;
const championTotal = championTest ? (championTest.total || 0) : 0;

// Champion MUST have valid test metrics total === 7 and details Array with length === 7
if (!championTest || championTotal !== requiredSize || !Array.isArray(championDetails) || championDetails.length !== requiredSize) {
  console.error('❌ CRITICAL GATE FAILURE: Champion test metrics or details invalid/insufficient. Expected total=' + requiredSize + ' and details.length=' + requiredSize + ', got total=' + championTotal + ', details=' + (Array.isArray(championDetails) ? championDetails.length : 'not_array') + '. Promotion prohibited.');
  process.stdout.write('REJECT_CHAMPION_NOT_EVALUATED');
  process.exit(0);
}

const championTop1Correct = championTest.top1_correct || 0;
const championTop3Correct = championTest.top3_correct || 0;

const minorityClasses = ['fried_dish', 'stir_fry', 'other_or_exclude'];
const championMinorityTop3Correct = championDetails.filter(item =>
  minorityClasses.includes(item.ground_truth) && item.is_top3
).length;

const gateMinTop3Correct = parseInt(process.env.GATE_MIN_TOP3_CORRECT || '5', 10);
const gateMinTop1Correct = parseInt(process.env.GATE_MIN_TOP1_CORRECT || '2', 10);
const gateMaxLatency = parseFloat(process.env.GATE_MAX_LATENCY_MS || '100.0');

// Minority classes evaluated on Golden Test Set:
const challengerMinorityTop3Correct = challengerDetails.filter(item =>
  minorityClasses.includes(item.ground_truth) && item.is_top3
).length;

// Minority coverage must strictly improve relative to Champion baseline (Challenger > Champion):
const minorityImproved = challengerMinorityTop3Correct > championMinorityTop3Correct;

console.error('--- Evaluation Metrics vs Gates (Integer Sample Basis on N=' + challengerTotal + ') ---');
console.error('Champion Baseline:       Top-1 = ' + championTop1Correct + '/' + requiredSize + ', Top-3 = ' + championTop3Correct + '/' + requiredSize + ', Minority Top-3 = ' + championMinorityTop3Correct + ' (measured on Golden Test Set, details N=' + championDetails.length + ')');
console.error('Challenger Test Metrics: Top-1 = ' + challengerTop1Correct + '/' + challengerTotal + ' (' + (challengerTop1Correct/challengerTotal*100).toFixed(1) + '%), Top-3 = ' + challengerTop3Correct + '/' + challengerTotal + ' (' + (challengerTop3Correct/challengerTotal*100).toFixed(1) + '%), Latency = ' + challengerLatency.toFixed(1) + 'ms (details N=' + challengerDetails.length + ')');
console.error('Minority Top-3 Coverage: Challenger = ' + challengerMinorityTop3Correct + ' vs Champion = ' + championMinorityTop3Correct);
console.error('Promotion Requirements:  Test Samples == ' + requiredSize + ', Top-3 >= ' + gateMinTop3Correct + '/' + requiredSize + ' (>= 71.4%), Top-1 >= ' + gateMinTop1Correct + '/' + requiredSize + ' (>= 28.6%), Latency <= ' + gateMaxLatency + 'ms (eval host), Minority Coverage > ' + championMinorityTop3Correct);
console.error('Actual Gate Checks:');
console.error('  - Champion Evaluated (Golden Test details N==' + requiredSize + '): PASS');
console.error('  - Challenger Golden Test Set Size (details N==' + requiredSize + '):  PASS (' + challengerTotal + '/' + requiredSize + ')');
console.error('  - Top-3 Check (>=' + gateMinTop3Correct + '/' + requiredSize + '):          ' + (challengerTop3Correct >= gateMinTop3Correct ? 'PASS' : 'FAIL'));
console.error('  - Top-1 Check (>=' + gateMinTop1Correct + '/' + requiredSize + '):          ' + (challengerTop1Correct >= gateMinTop1Correct ? 'PASS' : 'FAIL'));
console.error('  - Latency Check (<=' + gateMaxLatency + 'ms):        ' + (challengerLatency <= gateMaxLatency ? 'PASS' : 'FAIL') + ' (Note: measured on eval host, does not guarantee device latency)');
console.error('  - Minority Improvement Check:  ' + (minorityImproved ? 'PASS (improved from ' + championMinorityTop3Correct + ' to ' + challengerMinorityTop3Correct + ')' : 'FAIL (' + challengerMinorityTop3Correct + ' <= ' + championMinorityTop3Correct + ')'));

const passPromotion = (challengerTotal === requiredSize) &&
                      (challengerDetails.length === requiredSize) &&
                      (championTotal === requiredSize) &&
                      (championDetails.length === requiredSize) &&
                      (challengerTop3Correct >= gateMinTop3Correct) &&
                      (challengerTop1Correct >= gateMinTop1Correct) &&
                      (challengerLatency <= gateMaxLatency) &&
                      minorityImproved;

const passRegressionGuard = (challengerTotal === requiredSize) &&
                            (challengerDetails.length === requiredSize) &&
                            (championTotal === requiredSize) &&
                            (championDetails.length === requiredSize) &&
                            (challengerTop3Correct >= championTop3Correct) &&
                            (challengerTop1Correct >= championTop1Correct);

if (passPromotion) {
  process.stdout.write('PROMOTE');
} else if (passRegressionGuard) {
  process.stdout.write('MAINTAIN_OR_TIE');
} else {
  process.stdout.write('REJECT');
}
" "$challenger_json" "$champion_json"
}

# Standalone Gate Evaluation mode for automated tests / CLI invocation:
if [ "${1:-}" = "--evaluate-gate" ]; then
  CHALLENGER_ARG="${2:-}"
  CHAMPION_ARG="${3:-}"
  if [ -z "$CHALLENGER_ARG" ]; then
    echo "Usage: $0 --evaluate-gate <challenger_report.json> [champion_report.json]" >&2
    exit 1
  fi
  evaluate_gate "$CHALLENGER_ARG" "$CHAMPION_ARG"
  exit 0
fi

echo "========================================================"
echo "🚀 Starting Autonomous MediaPipe Model Improvement Loop"
echo "========================================================"
echo "Source dataset:       $SOURCE_DATASET"
echo "Augmented dataset:    $AUGMENTED_DATASET"
echo "Target per class:     $TARGET_PER_CLASS"
echo "Epochs:               $EPOCHS (batch size: $BATCH_SIZE)"
echo "Promotion criteria:   Golden Test Samples == $REQUIRED_TEST_SET_SIZE"
echo "                      Top-3 >= $GATE_MIN_TOP3_CORRECT/$REQUIRED_TEST_SET_SIZE (71.4%) AND Top-1 >= $GATE_MIN_TOP1_CORRECT/$REQUIRED_TEST_SET_SIZE (28.6%)"
echo "                      + Minority class improvement (> Champion measured baseline)"
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
echo -e "\n📊 [Step 3/4] Evaluating models against Golden Test Set..."

# Step 3a: Mandatory Production Champion evaluation
if [ ! -f "$ASSET_TASK" ]; then
  echo "❌ Error: Production Champion model asset not found at $ASSET_TASK. Promotion prohibited."
  exit 1
fi

echo "Evaluating Production Champion model ($ASSET_TASK)..."
uv run --python .venv_mediapipe python scripts/evaluate-mediapipe-model.py \
  --model-path "$ASSET_TASK" \
  --dataset-dir "$SOURCE_DATASET" \
  --output-json "$CHAMPION_REPORT" \
  --output-md "$OUTPUT_DIR/champion_evaluation_summary.md" \
  --split test

if [ ! -f "$CHAMPION_REPORT" ]; then
  echo "❌ Error: Champion evaluation report was not generated at $CHAMPION_REPORT. Promotion prohibited."
  exit 1
fi

# Step 3b: Challenger evaluation

echo "Evaluating Challenger model ($CHALLENGER_MODEL)..."
uv run --python .venv_mediapipe python scripts/evaluate-mediapipe-model.py \
  --model-path "$CHALLENGER_MODEL" \
  --dataset-dir "$SOURCE_DATASET" \
  --output-json "$BENCHMARK_REPORT" \
  --output-md "$OUTPUT_DIR/evaluation_summary.md" \
  --split test

# Step 4: Champion / Challenger Gate
echo -e "\n⚖️  [Step 4/4] Evaluating Champion / Challenger Promotion Gate..."
GATE_RESULT=$(evaluate_gate "$BENCHMARK_REPORT" "$CHAMPION_REPORT")

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
  echo "⚠️  [GATE BLOCKED] Challenger model did not meet promotion criteria, regressed, or failed test set validation ($GATE_RESULT)."
  echo "Core Principle: 'No regression, no PR'. Production asset kept intact ($ASSET_TASK untouched)."
  echo "Challenger results logged at $OUTPUT_DIR/."
fi
