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

# Baseline thresholds from Champion model (current deployed model)
# Test: Top-1 = 28.6% (2/7), Top-3 = 57.1% (4/7)
CHAMPION_TOP1="0.2857"
CHAMPION_TOP3="0.5714"

echo "========================================================"
echo "🚀 Starting Autonomous MediaPipe Model Improvement Loop"
echo "========================================================"
echo "Source dataset:       $SOURCE_DATASET"
echo "Augmented dataset:    $AUGMENTED_DATASET"
echo "Target per class:     $TARGET_PER_CLASS"
echo "Epochs:               $EPOCHS (batch size: $BATCH_SIZE)"
echo "Champion baseline:    Top-1 >= 28.6%, Top-3 > 57.1%"
echo "========================================================"

# Step 1: Data Augmentation
echo -e "\n📦 [Step 1/4] Augmenting training samples for minority classes..."
uv run --python .venv_mediapipe python scripts/augment-mediapipe-dataset.py \
  --source-dataset-dir "$SOURCE_DATASET" \
  --output-dataset-dir "$AUGMENTED_DATASET" \
  --target-per-class "$TARGET_PER_CLASS"

# Step 2: Retraining Candidate Model
echo -e "\n🧠 [Step 2/4] Training candidate model (Challenger)..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

uv run --python .venv_mediapipe python scripts/train-mediapipe-model.py \
  --dataset-dir "$AUGMENTED_DATASET" \
  --output-dir "$OUTPUT_DIR" \
  --epochs "$EPOCHS" \
  --batch-size "$BATCH_SIZE"

CHALLENGER_MODEL="$OUTPUT_DIR/model.tflite"
if [ ! -f "$CHALLENGER_MODEL" ]; then
  echo "❌ Error: Challenger model not generated at $CHALLENGER_MODEL"
  exit 1
fi

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
const top1 = testMetrics.top1_accuracy || 0;
const top3 = testMetrics.top3_accuracy || 0;

console.error('Challenger Test Metrics: Top-1 = ' + (top1*100).toFixed(1) + '%, Top-3 = ' + (top3*100).toFixed(1) + '%');
console.error('Champion Baseline:       Top-1 >= 28.6%, Top-3 >= 57.1%');

// Promotion criterion: Top-3 must be >= 57.1% (ideally > 57.1%), Top-1 must be >= 28.6%
const passTop1 = top1 >= 0.285;
const passTop3 = top3 > 0.571;

if (passTop1 && passTop3) {
  process.stdout.write('PROMOTE');
} else if (top3 >= 0.571 && top1 >= 0.285) {
  process.stdout.write('MAINTAIN_OR_TIE');
} else {
  process.stdout.write('REJECT');
}
")

if [ "$GATE_RESULT" = "PROMOTE" ]; then
  echo "🎉 [GATE PASSED] Challenger model outperformed Champion!"
  echo "Promoting Challenger model to $ASSET_TASK..."
  cp "$CHALLENGER_MODEL" "$ASSET_TASK"
  echo "✅ Model successfully updated in Android assets."
  echo "Done! You can now commit the new model asset and benchmark results."
elif [ "$GATE_RESULT" = "MAINTAIN_OR_TIE" ]; then
  echo "ℹ️  [GATE TIE] Challenger matched Champion performance without regression."
  echo "Candidate model preserved at $OUTPUT_DIR/ for review."
else
  echo "⚠️  [GATE BLOCKED] Challenger model did not meet promotion criteria."
  echo "Core Principle: 'No regression, no PR'. Deployed asset kept intact."
  echo "Challenger results logged at $OUTPUT_DIR/."
fi
