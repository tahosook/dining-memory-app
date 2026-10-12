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

CANONICAL_DEFAULT_DATASET="state/mediapipe-dataset/batch250_plus_agreed54"
if [ ! -d "$CANONICAL_DEFAULT_DATASET" ]; then
  CANONICAL_DEFAULT_DATASET="state/mediapipe_labeling_runs/zip2-batch250/exported_dataset"
fi
DEFAULT_GOLDEN_TEST_DIR="state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset/test"

# CLI / Environment variable priority resolution
CLI_DATASET=""
CLI_GOLDEN_TEST=""

AUGMENTED_DATASET="state/mediapipe-dataset/augmented"
OUTPUT_DIR="state/mediapipe_models/challenger_run"
ASSET_TASK="android/app/src/main/assets/mediapipe/meal-input-assist.task"
BENCHMARK_REPORT="state/mediapipe_models/challenger_evaluation.json"
CHAMPION_REPORT="state/mediapipe_models/champion_evaluation.json"
GOLDEN_EVAL_DIR="state/mediapipe-dataset/golden_eval"
GOLDEN_V2_DIR="state/mediapipe-dataset/golden_eval_v2"
CHAMPION_V2_REPORT="state/mediapipe_models/champion_golden_v2_evaluation.json"
BENCHMARK_V2_REPORT="state/mediapipe_models/challenger_golden_v2_evaluation.json"

TARGET_PER_CLASS="${TARGET_PER_CLASS:-45}"
MAX_MULTIPLIER="${MAX_MULTIPLIER:-3}"
EPOCHS="${EPOCHS:-20}"
BATCH_SIZE="${BATCH_SIZE:-8}"

# Canonical Promotion Gate Thresholds (from mediapipe-model-autonomous-improvement-plan.md)
# Evaluated strictly on integer correct counts over 7 Golden Test samples
export REQUIRED_TEST_SET_SIZE="7"
export GATE_MIN_TOP3_CORRECT="5"          # >= 5/7 (71.4%)
export GATE_MIN_TOP1_CORRECT="2"          # >= 2/7 (28.6%)
export GATE_MAX_MODEL_SIZE_BYTES=15728640 # <= 15 MiB (15,728,640 bytes)
export GATE_MIN_MODEL_SIZE_BYTES=1048576  # >= 1 MiB (1,048,576 bytes)
export GATE_MAX_LATENCY_MS="100.0"        # <= 100ms (eval host benchmark gate; does not guarantee on-device latency)

EVALUATE_MODEL_CMD="${EVALUATE_MODEL_CMD:-uv run --python .venv_mediapipe python scripts/evaluate-mediapipe-model.py}"

run_evaluate_model() {
  eval "$EVALUATE_MODEL_CMD \"\$@\""
}

validate_dataset() {
  local dataset_dir="$1"
  local golden_test_dir="$2"

  node -e "
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const datasetDir = path.resolve(process.argv[1]);
const goldenTestDir = path.resolve(process.argv[2]);

const CANONICAL_CLASSES = [
  'curry_rice', 'drink', 'fish_dish', 'fried_dish',
  'meat_dish', 'noodles', 'other_or_exclude', 'simmered_dish', 'stir_fry'
];
const REQUIRED_CLASSES = CANONICAL_CLASSES;

function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getImageFiles(dir) {
  const results = [];
  function walk(current) {
    if (!fs.existsSync(current)) return;
    for (const item of fs.readdirSync(current)) {
      if (item.startsWith('.')) continue;
      const full = path.join(current, item);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (/\\.(jpg|jpeg|png|webp)$/i.test(item)) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

// 1. Structure validation
if (!fs.existsSync(datasetDir)) {
  console.error('❌ Error: Dataset directory not found: ' + datasetDir);
  process.exit(1);
}
for (const split of ['train', 'val', 'test']) {
  const p = path.join(datasetDir, split);
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
    console.error('❌ Error: Missing split directory in dataset: ' + p);
    process.exit(1);
  }
}

// 2. Class validation
const trainDir = path.join(datasetDir, 'train');
const trainClasses = fs.readdirSync(trainDir).filter(f => {
  try { return fs.statSync(path.join(trainDir, f)).isDirectory(); } catch (e) { return false; }
}).sort();

const missing = REQUIRED_CLASSES.filter(c => !trainClasses.includes(c));
const unknown = trainClasses.filter(c => !REQUIRED_CLASSES.includes(c));

if (missing.length > 0) {
  console.error('❌ Error: Missing required class(es) in dataset: ' + missing.join(', '));
  process.exit(1);
}
if (unknown.length > 0) {
  console.error('❌ Error: Unknown unexpected class(es) in dataset: ' + unknown.join(', '));
  process.exit(1);
}

// Check labels.txt if present
const labelsFile = path.join(datasetDir, 'labels.txt');
if (fs.existsSync(labelsFile)) {
  const content = fs.readFileSync(labelsFile, 'utf8').trimEnd();
  const rawLines = content === '' ? [] : content.split(/\\r?\\n/).map(s => s.trim());
  const fileClasses = rawLines.filter(Boolean);

  if (rawLines.length !== CANONICAL_CLASSES.length) {
    console.error('❌ Error: labels.txt line count mismatch in dataset. Expected ' + CANONICAL_CLASSES.length + ' lines, found ' + rawLines.length);
    process.exit(1);
  }

  if (fileClasses.length !== CANONICAL_CLASSES.length) {
    console.error('❌ Error: labels.txt non-empty class count mismatch in dataset. Expected ' + CANONICAL_CLASSES.length + ' classes, found ' + fileClasses.length);
    process.exit(1);
  }

  const missingL = CANONICAL_CLASSES.filter(c => !fileClasses.includes(c));
  const unknownL = fileClasses.filter(c => !CANONICAL_CLASSES.includes(c));
  if (missingL.length > 0) {
    console.error('❌ Error: Missing required class(es) in labels.txt: ' + missingL.join(', '));
    process.exit(1);
  }
  if (unknownL.length > 0) {
    console.error('❌ Error: Unknown unexpected class(es) in labels.txt: ' + unknownL.join(', '));
    process.exit(1);
  }

  for (let i = 0; i < CANONICAL_CLASSES.length; i++) {
    if (fileClasses[i] !== CANONICAL_CLASSES[i]) {
      console.error(
        '❌ Error: labels.txt class order mismatch in dataset at index ' + i +
        '. Expected ' + JSON.stringify(CANONICAL_CLASSES[i]) + ', found ' + JSON.stringify(fileClasses[i]) + '.\n' +
        'Expected canonical order:\n  ' + CANONICAL_CLASSES.join('\n  ') + '\n' +
        'Actual labels.txt order:\n  ' + fileClasses.join('\n  ')
      );
      process.exit(1);
    }
  }
}

// 3. Golden Test Presence & Leakage Check
if (!fs.existsSync(goldenTestDir)) {
  console.error('❌ Error: Golden Test Set directory not found: ' + goldenTestDir);
  process.exit(1);
}

const goldenFiles = getImageFiles(goldenTestDir);
if (goldenFiles.length !== 7) {
  console.error('❌ Error: Golden Test Set file count mismatch! Expected 7, found ' + goldenFiles.length);
  process.exit(1);
}

const goldenHashes = new Map();
for (const gf of goldenFiles) {
  goldenHashes.set(sha256(gf), gf);
}

for (const split of ['train', 'val']) {
  const splitFiles = getImageFiles(path.join(datasetDir, split));
  for (const sf of splitFiles) {
    const h = sha256(sf);
    if (goldenHashes.has(h)) {
      console.error('❌ CRITICAL ERROR: Data leakage detected! Image ' + sf + ' matches Golden Test image ' + goldenHashes.get(h));
      process.exit(1);
    }
  }
}

console.log('✓ Dataset validation PASSED: 9 classes verified, 0 data leakage with Golden Test Set (' + goldenFiles.length + ' samples).');
" "$dataset_dir" "$golden_test_dir"
}

check_class_compatibility() {
  local challenger_json="$1"
  local champion_json="$2"

  node -e "
const fs = require('fs');
const challengerPath = process.argv[1];
const championPath = process.argv[2];

if (!fs.existsSync(challengerPath) || !fs.existsSync(championPath)) {
  console.error('❌ Error: Report file not found for class compatibility check');
  process.exit(1);
}

const chalData = JSON.parse(fs.readFileSync(challengerPath, 'utf8'));
const champData = JSON.parse(fs.readFileSync(championPath, 'utf8'));

const chalClasses = Array.isArray(chalData.labels) ? chalData.labels : [];
const champClasses = Array.isArray(champData.labels) ? champData.labels : [];

const EXPECTED_COUNT = 9;

if (chalClasses.length !== champClasses.length || chalClasses.length !== EXPECTED_COUNT) {
  console.error('❌ CRITICAL GATE FAILURE: Class compatibility mismatch! Challenger has ' + chalClasses.length + ' classes, Champion has ' + champClasses.length + ' classes (Expected: ' + EXPECTED_COUNT + '). Promotion prohibited.');
  process.exit(1);
}

console.log('✓ Class compatibility verified: Champion (' + champClasses.length + ' classes) === Challenger (' + chalClasses.length + ' classes) === ' + EXPECTED_COUNT);
" "$challenger_json" "$champion_json"
}

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
const minoritySamplesInTestSet = challengerDetails.filter(item =>
  minorityClasses.includes(item.ground_truth)
).length;

const challengerMinorityTop3Correct = challengerDetails.filter(item =>
  minorityClasses.includes(item.ground_truth) && item.is_top3
).length;

// If Champion already achieved perfect coverage on all minority samples in the Golden Test Set,
// Challenger must maintain perfect coverage (no regression) and strictly improve overall accuracy (Top-1 > Champion).
// Otherwise, Challenger must strictly improve minority coverage over Champion baseline (Challenger > Champion).
const championHasPerfectMinority = (championMinorityTop3Correct >= minoritySamplesInTestSet) && (minoritySamplesInTestSet > 0);

const minorityImproved = championHasPerfectMinority
  ? (challengerMinorityTop3Correct >= championMinorityTop3Correct && challengerTop1Correct > championTop1Correct)
  : (challengerMinorityTop3Correct > championMinorityTop3Correct);

console.error('--- Evaluation Metrics vs Gates (7-sample Regression Guard Check on N=' + challengerTotal + ') ---');
console.error('Note: 7-sample evaluation serves as a regression guard check, not a statistical benchmark of general accuracy.');
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

evaluate_golden_v2_gate() {
  local challenger_json="$1"
  local champion_json="${2:-}"

  node -e "
const fs = require('fs');

const challengerPath = process.argv[1];
const championPath = process.argv[2];

if (!challengerPath || !championPath) {
  console.error('❌ Error: Missing challenger or champion report path');
  process.stdout.write('V2_REPORT_NOT_FOUND');
  process.exit(0);
}

if (!fs.existsSync(challengerPath) || !fs.existsSync(championPath)) {
  console.error('❌ Error: Golden Set v2 report file(s) not found: ' +
    (!fs.existsSync(challengerPath) ? challengerPath + ' ' : '') +
    (!fs.existsSync(championPath) ? championPath : ''));
  process.stdout.write('V2_REPORT_NOT_FOUND');
  process.exit(0);
}

let chalData, champData;
try {
  chalData = JSON.parse(fs.readFileSync(challengerPath, 'utf8'));
} catch (err) {
  console.error('❌ Error: Failed to parse Challenger Golden v2 report JSON: ' + err.message);
  process.stdout.write('V2_INVALID_REPORT');
  process.exit(0);
}

try {
  champData = JSON.parse(fs.readFileSync(championPath, 'utf8'));
} catch (err) {
  console.error('❌ Error: Failed to parse Champion Golden v2 report JSON: ' + err.message);
  process.stdout.write('V2_INVALID_REPORT');
  process.exit(0);
}

const chalTest = (chalData && chalData.test && chalData.test.metrics) ? chalData.test.metrics : null;
const champTest = (champData && champData.test && champData.test.metrics) ? champData.test.metrics : null;

if (!chalTest || !champTest) {
  console.error('❌ Error: Missing test.metrics in Golden Set v2 evaluation report(s)');
  process.stdout.write('V2_INVALID_METRICS');
  process.exit(0);
}

const REQUIRED_V2_SIZE = 106;

function validateReport(data, name) {
  const errors = [];
  if (!data || !data.test) {
    errors.push(name + '.test is missing');
    return errors;
  }

  // 1. Validate test.metrics
  const metrics = data.test.metrics;
  if (!metrics || typeof metrics !== 'object') {
    errors.push(name + '.test.metrics must be an object');
  } else {
    if (typeof metrics.total !== 'number' || !Number.isInteger(metrics.total)) {
      errors.push(name + '.metrics.total must be an integer');
    } else if (metrics.total !== REQUIRED_V2_SIZE) {
      errors.push(name + '.metrics.total must be exactly ' + REQUIRED_V2_SIZE + ', got ' + metrics.total);
    }

    for (const field of ['top1_correct', 'top3_correct']) {
      const val = metrics[field];
      if (typeof val !== 'number' || !Number.isInteger(val)) {
        errors.push(name + '.metrics.' + field + ' must be an integer');
      } else if (val < 0 || (typeof metrics.total === 'number' && val > metrics.total)) {
        errors.push(name + '.metrics.' + field + ' out of range [0, total]: ' + val);
      }
    }

    for (const field of ['top1_accuracy', 'top3_accuracy']) {
      if (metrics[field] !== undefined) {
        const val = metrics[field];
        if (typeof val !== 'number' || isNaN(val) || val < 0.0 || val > 1.0) {
          errors.push(name + '.metrics.' + field + ' must be a float in [0.0, 1.0]');
        }
      }
    }
  }

  // 2. Validate mandatory test.details
  if (!('details' in data.test) || data.test.details === undefined || data.test.details === null) {
    errors.push(name + '.test.details is required');
  } else if (!Array.isArray(data.test.details)) {
    errors.push(name + '.test.details must be an array');
  } else if (data.test.details.length !== REQUIRED_V2_SIZE) {
    errors.push(name + '.test.details length must be exactly ' + REQUIRED_V2_SIZE + ', got ' + data.test.details.length);
  }

  return errors;
}

const chalErrors = validateReport(chalData, 'Challenger');
const champErrors = validateReport(champData, 'Champion');

if (chalErrors.length > 0 || champErrors.length > 0) {
  const allErrors = chalErrors.concat(champErrors);
  console.error('❌ Error: Golden Set v2 metric validation failed:\n  ' + allErrors.join('\n  '));
  const isCountMismatch = allErrors.some(e =>
    e.includes('must be exactly ' + REQUIRED_V2_SIZE) ||
    e.includes('length must be exactly ' + REQUIRED_V2_SIZE)
  );
  if (isCountMismatch) {
    process.stdout.write('V2_SAMPLE_COUNT_MISMATCH');
  } else {
    process.stdout.write('V2_INVALID_METRICS');
  }
  process.exit(0);
}

const chalTotal = chalTest.total;
const champTotal = champTest.total;

console.error('--- Tier 2: Golden Test Set v2 Comprehensive Benchmark Metrics (N=' + chalTotal + ') ---');
console.error('Champion V2:   Top-1 = ' + champTest.top1_correct + '/' + champTotal + ' (' + (champTest.top1_correct / champTotal * 100).toFixed(1) + '%), Top-3 = ' + champTest.top3_correct + '/' + champTotal + ' (' + (champTest.top3_correct / champTotal * 100).toFixed(1) + '%)');
console.error('Challenger V2: Top-1 = ' + chalTest.top1_correct + '/' + chalTotal + ' (' + (chalTest.top1_correct / chalTotal * 100).toFixed(1) + '%), Top-3 = ' + chalTest.top3_correct + '/' + chalTotal + ' (' + (chalTest.top3_correct / chalTotal * 100).toFixed(1) + '%)');

const v2Pass = (chalTest.top3_correct >= champTest.top3_correct) && (chalTest.top1_correct >= champTest.top1_correct);
if (v2Pass) {
  console.error('Tier 2 Benchmark Gate: PASS (Challenger preserves or exceeds Champion on Golden Set v2)');
  process.stdout.write('V2_PASS');
} else {
  console.error('❌ Tier 2 Benchmark Gate: REGRESSION DETECTED on Golden Set v2 (Challenger Top-1: ' + chalTest.top1_correct + ' vs Champion: ' + champTest.top1_correct + ', Challenger Top-3: ' + chalTest.top3_correct + ' vs Champion: ' + champTest.top3_correct + ')');
  process.stdout.write('V2_REGRESSION');
}
" "$challenger_json" "$champion_json"
}

execute_two_tier_promotion_gate() {
  local challenger_model="$1"
  local asset_task="$2"
  local challenger_report="$3"
  local champion_report="$4"
  local golden_v2_dir="${5:-}"
  local challenger_v2_report="${6:-}"
  local champion_v2_report="${7:-}"
  local output_dir="${8:-$(dirname "$challenger_report")}"

  # Step 3c: Tier 2 Benchmark Evaluation on Golden Test Set v2 (106 samples)
  local v2_gate_result="SKIPPED"
  if [ -n "$golden_v2_dir" ] && [ -e "$golden_v2_dir" ]; then
    if [ ! -d "$golden_v2_dir" ] || [ ! -d "$golden_v2_dir/test" ]; then
      echo "❌ Error: Golden Test Set v2 directory exists ($golden_v2_dir), but 'test' subdirectory is missing or not a directory." >&2
      v2_gate_result="V2_EVAL_FAILED"
    else
      v2_gate_result="V2_EVAL_FAILED"
      echo -e "\n📊 [Step 3c/4] Running Tier 2 Comprehensive Benchmark against Golden Test Set v2 (106 samples)..."

      # Freshness Guarantee: Always execute fresh evaluations in a dedicated run directory.
      # Never reuse past reports from previous runs.
      local run_v2_dir="${output_dir}/v2_eval_fresh_$$"
      mkdir -p "$run_v2_dir"
      local fresh_champ_report="${run_v2_dir}/champion_v2_fresh.json"
      local fresh_chal_report="${run_v2_dir}/challenger_v2_fresh.json"

      rm -f "$fresh_champ_report" "$fresh_chal_report"

      local eval_success=true
      echo "Evaluating Production Champion on Golden Test Set v2..."
      if ! run_evaluate_model \
        --model-path "$asset_task" \
        --dataset-dir "$golden_v2_dir" \
        --output-json "$fresh_champ_report" \
        --output-md "$output_dir/champion_v2_evaluation_summary.md" \
        --split test; then
        echo "❌ Error: Tier 2 evaluation command failed for Champion model" >&2
        eval_success=false
      fi

      if [ "$eval_success" = true ]; then
        echo "Evaluating Challenger on Golden Test Set v2..."
        if ! run_evaluate_model \
          --model-path "$challenger_model" \
          --dataset-dir "$golden_v2_dir" \
          --output-json "$fresh_chal_report" \
          --output-md "$output_dir/challenger_v2_evaluation_summary.md" \
          --split test; then
          echo "❌ Error: Tier 2 evaluation command failed for Challenger model" >&2
          eval_success=false
        fi
      fi

      if [ "$eval_success" = true ] && [ -f "$fresh_chal_report" ] && [ -f "$fresh_champ_report" ]; then
        v2_gate_result=$(evaluate_golden_v2_gate "$fresh_chal_report" "$fresh_champ_report")
        # On success, sync the fresh verified reports to destination paths if requested
        if [ -n "$champion_v2_report" ]; then
          cp -f "$fresh_champ_report" "$champion_v2_report"
        fi
        if [ -n "$challenger_v2_report" ]; then
          cp -f "$fresh_chal_report" "$challenger_v2_report"
        fi
      else
        if [ "$eval_success" = true ]; then
          echo "❌ Error: Tier 2 evaluation report(s) not generated" >&2
          v2_gate_result="V2_REPORT_NOT_FOUND"
        else
          v2_gate_result="V2_EVAL_FAILED"
        fi
      fi

      rm -rf "$run_v2_dir"
    fi
  fi

  # Step 4: Champion / Challenger Gate
  echo -e "\n⚖️  [Step 4/4] Evaluating Champion / Challenger Promotion Gate..."

  check_class_compatibility "$challenger_report" "$champion_report"

  local gate_result
  gate_result=$(evaluate_gate "$challenger_report" "$champion_report")

  if [ "$gate_result" = "PROMOTE" ]; then
    # Fail-Closed Gate: When Tier 2 was executed, ONLY "V2_PASS" allows promotion.
    if [ "$v2_gate_result" = "V2_PASS" ] || [ "$v2_gate_result" = "SKIPPED" ]; then
      echo "🎉 [GATE PASSED] Challenger model passed regression check and met all canonical promotion criteria!"
      echo "Promoting Challenger model to $asset_task atomically..."

      local asset_dir
      asset_dir="$(dirname "$asset_task")"
      mkdir -p "$asset_dir"
      local temp_asset="${asset_task}.tmp.$$"

      cp "$challenger_model" "$temp_asset"

      if [ ! -f "$temp_asset" ] || [ ! -s "$temp_asset" ]; then
        echo "❌ Error: Failed to stage model asset at $temp_asset" >&2
        rm -f "$temp_asset"
        return 1
      fi

      local src_size
      src_size=$(wc -c < "$challenger_model" | tr -d ' ')
      local tmp_size
      tmp_size=$(wc -c < "$temp_asset" | tr -d ' ')
      if [ "$src_size" != "$tmp_size" ]; then
        echo "❌ Error: Staged asset size mismatch ($src_size != $tmp_size). Aborting promotion." >&2
        rm -f "$temp_asset"
        return 1
      fi

      mv -f "$temp_asset" "$asset_task"
      echo "✅ Model successfully and atomically deployed to Android assets: $asset_task"
      echo "Done! You can now commit the new model asset and benchmark results."
      return 0
    else
      echo "❌ [GATE BLOCKED] Challenger passed Tier 1 regression check, but failed Tier 2 Golden Set v2 gate (Status: $v2_gate_result)." >&2
      echo "Fail-Closed Gate: Promotion prohibited. Production asset kept intact ($asset_task untouched)." >&2
      echo "Challenger results logged at $output_dir/." >&2
      return 1
    fi
  elif [ "$gate_result" = "MAINTAIN_OR_TIE" ]; then
    echo "ℹ️  [GATE TIE] Challenger maintained baseline without regression, but did not satisfy full promotion requirements."
    echo "Production asset kept intact ($asset_task untouched)."
    echo "Candidate model preserved at $output_dir/ for review."
    return 0
  else
    echo "⚠️  [GATE BLOCKED] Challenger model did not meet promotion criteria, regressed, or failed test set validation ($gate_result)."
    echo "Core Principle: 'No regression, no PR'. Production asset kept intact ($asset_task untouched)."
    echo "Challenger results logged at $output_dir/."
    return 1
  fi
}

# Standalone execution modes for automated tests / CLI invocation:
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

if [ "${1:-}" = "--evaluate-golden-v2" ]; then
  CHALLENGER_ARG="${2:-}"
  CHAMPION_ARG="${3:-}"
  if [ -z "$CHALLENGER_ARG" ] || [ -z "$CHAMPION_ARG" ]; then
    echo "Usage: $0 --evaluate-golden-v2 <challenger_v2_report.json> <champion_v2_report.json>" >&2
    exit 1
  fi
  RESULT=$(evaluate_golden_v2_gate "$CHALLENGER_ARG" "$CHAMPION_ARG")
  echo "$RESULT"
  if [ "$RESULT" = "V2_PASS" ]; then
    exit 0
  else
    exit 1
  fi
fi

if [ "${1:-}" = "--run-promotion-gate" ]; then
  CHALLENGER_MODEL_ARG="${2:-}"
  ASSET_TASK_ARG="${3:-}"
  CHALLENGER_REPORT_ARG="${4:-}"
  CHAMPION_REPORT_ARG="${5:-}"
  GOLDEN_V2_DIR_ARG="${6:-}"
  CHALLENGER_V2_REPORT_ARG="${7:-}"
  CHAMPION_V2_REPORT_ARG="${8:-}"
  OUTPUT_DIR_ARG="${9:-$(dirname "$CHALLENGER_REPORT_ARG")}"
  if [ -z "$CHALLENGER_MODEL_ARG" ] || [ -z "$ASSET_TASK_ARG" ] || [ -z "$CHALLENGER_REPORT_ARG" ] || [ -z "$CHAMPION_REPORT_ARG" ]; then
    echo "Usage: $0 --run-promotion-gate <challenger_model> <asset_task> <challenger_report> <champion_report> [golden_v2_dir] [challenger_v2_report] [champion_v2_report] [output_dir]" >&2
    exit 1
  fi
  execute_two_tier_promotion_gate "$CHALLENGER_MODEL_ARG" "$ASSET_TASK_ARG" "$CHALLENGER_REPORT_ARG" "$CHAMPION_REPORT_ARG" "$GOLDEN_V2_DIR_ARG" "$CHALLENGER_V2_REPORT_ARG" "$CHAMPION_V2_REPORT_ARG" "$OUTPUT_DIR_ARG"
  exit $?
fi

if [ "${1:-}" = "--validate-dataset" ]; then
  DATASET_ARG="${2:-}"
  GOLDEN_ARG="${3:-$DEFAULT_GOLDEN_TEST_DIR}"
  if [ -z "$DATASET_ARG" ]; then
    echo "Usage: $0 --validate-dataset <dataset_dir> [golden_test_dir]" >&2
    exit 1
  fi
  validate_dataset "$DATASET_ARG" "$GOLDEN_ARG"
  exit 0
fi

if [ "${1:-}" = "--check-class-compatibility" ]; then
  CHALLENGER_ARG="${2:-}"
  CHAMPION_ARG="${3:-}"
  if [ -z "$CHALLENGER_ARG" ] || [ -z "$CHAMPION_ARG" ]; then
    echo "Usage: $0 --check-class-compatibility <challenger_report.json> <champion_report.json>" >&2
    exit 1
  fi
  check_class_compatibility "$CHALLENGER_ARG" "$CHAMPION_ARG"
  exit 0
fi

# Parse options for autonomous loop execution
while [ $# -gt 0 ]; do
  case "$1" in
    --dataset-dir)
      CLI_DATASET="${2:-}"
      shift 2
      ;;
    --dataset-dir=*)
      CLI_DATASET="${1#*=}"
      shift 1
      ;;
    --golden-test-dir)
      CLI_GOLDEN_TEST="${2:-}"
      shift 2
      ;;
    --golden-test-dir=*)
      CLI_GOLDEN_TEST="${1#*=}"
      shift 1
      ;;
    --target-per-class)
      TARGET_PER_CLASS="${2:-}"
      shift 2
      ;;
    --target-per-class=*)
      TARGET_PER_CLASS="${1#*=}"
      shift 1
      ;;
    --max-multiplier)
      MAX_MULTIPLIER="${2:-}"
      shift 2
      ;;
    --max-multiplier=*)
      MAX_MULTIPLIER="${1#*=}"
      shift 1
      ;;
    --epochs)
      EPOCHS="${2:-}"
      shift 2
      ;;
    --epochs=*)
      EPOCHS="${1#*=}"
      shift 1
      ;;
    --batch-size)
      BATCH_SIZE="${2:-}"
      shift 2
      ;;
    --batch-size=*)
      BATCH_SIZE="${1#*=}"
      shift 1
      ;;
    *)
      if [ -z "$CLI_DATASET" ] && [ -d "$1" ]; then
        CLI_DATASET="$1"
      fi
      shift 1
      ;;
  esac
done

SOURCE_DATASET="${CLI_DATASET:-${SOURCE_DATASET:-$CANONICAL_DEFAULT_DATASET}}"
GOLDEN_TEST_DIR="${CLI_GOLDEN_TEST:-${GOLDEN_TEST_DIR:-$DEFAULT_GOLDEN_TEST_DIR}}"

echo "========================================================"
echo "🚀 Starting Autonomous MediaPipe Model Improvement Loop"
echo "========================================================"
echo "Source dataset:       $SOURCE_DATASET"
echo "Golden Test Set:      $GOLDEN_TEST_DIR"
echo "Augmented dataset:    $AUGMENTED_DATASET"
echo "Target per class:     $TARGET_PER_CLASS (max multiplier: $MAX_MULTIPLIER)"
echo "Epochs:               $EPOCHS (batch size: $BATCH_SIZE)"
echo "Promotion criteria:   Golden Test Samples == $REQUIRED_TEST_SET_SIZE"
echo "                      Top-3 >= $GATE_MIN_TOP3_CORRECT/$REQUIRED_TEST_SET_SIZE (71.4%) AND Top-1 >= $GATE_MIN_TOP1_CORRECT/$REQUIRED_TEST_SET_SIZE (28.6%)"
echo "                      + Minority class improvement (> Champion measured baseline, or maintain perfect minority + Top-1 improvement)"
echo "                      + Model size <= 15 MiB (15,728,640 bytes) AND Eval Latency <= 100ms"
echo "                      (Latency gate evaluates CI/host execution; does not prove device latency)"
echo "========================================================"

# Pre-check: Validate source dataset structure, 9 classes, and Golden Test isolation
echo "Verifying input dataset and Golden Test Set isolation..."
validate_dataset "$SOURCE_DATASET" "$GOLDEN_TEST_DIR"
INITIAL_TEST_FILE_COUNT=$(find "$GOLDEN_TEST_DIR" -type f | wc -l | tr -d ' ')
echo "Verified Golden Test Set: $INITIAL_TEST_FILE_COUNT files present."

# Step 1: Data Augmentation (train only, val and test strictly preserved)
echo -e "\n📦 [Step 1/4] Augmenting training samples for minority classes..."
uv run --python .venv_mediapipe python scripts/augment-mediapipe-dataset.py \
  --source-dataset-dir "$SOURCE_DATASET" \
  --output-dataset-dir "$AUGMENTED_DATASET" \
  --target-per-class "$TARGET_PER_CLASS" \
  --max-multiplier "$MAX_MULTIPLIER"

# Post-augmentation check: Ensure Golden Test Set was not altered
CURRENT_TEST_FILE_COUNT=$(find "$GOLDEN_TEST_DIR" -type f | wc -l | tr -d ' ')
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

# Model size validation check: <= 15 MiB (15,728,640 bytes) and >= 1 MiB (1,048,576 bytes)
MODEL_SIZE=$(wc -c < "$CHALLENGER_MODEL" | tr -d ' ')
if [ "$MODEL_SIZE" -lt "$GATE_MIN_MODEL_SIZE_BYTES" ] || [ "$MODEL_SIZE" -gt "$GATE_MAX_MODEL_SIZE_BYTES" ]; then
  echo "❌ Error: Model size ($MODEL_SIZE bytes) exceeds canonical gate bounds [1 MiB, 15 MiB (15,728,640 bytes)]. Rejecting model."
  exit 1
fi
echo "✓ Challenger model size verified: $(( MODEL_SIZE / 1024 / 1024 )) MiB ($MODEL_SIZE bytes <= 15 MiB (15,728,640 bytes))"

# Step 3: Autonomous Evaluation on Golden Test Set
echo -e "\n📊 [Step 3/4] Evaluating models against Golden Test Set..."

# Stage Golden Test Set with 9-class labels metadata for fair evaluation
rm -rf "$GOLDEN_EVAL_DIR"
mkdir -p "$GOLDEN_EVAL_DIR/test"
cp -r "$GOLDEN_TEST_DIR"/* "$GOLDEN_EVAL_DIR/test/"
if [ -f "$SOURCE_DATASET/labels.txt" ]; then
  cp "$SOURCE_DATASET/labels.txt" "$GOLDEN_EVAL_DIR/labels.txt"
fi

# Step 3a: Mandatory Production Champion evaluation
if [ ! -f "$ASSET_TASK" ]; then
  echo "❌ Error: Production Champion model asset not found at $ASSET_TASK. Promotion prohibited."
  exit 1
fi

echo "Evaluating Production Champion model ($ASSET_TASK)..."
uv run --python .venv_mediapipe python scripts/evaluate-mediapipe-model.py \
  --model-path "$ASSET_TASK" \
  --dataset-dir "$GOLDEN_EVAL_DIR" \
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
  --dataset-dir "$GOLDEN_EVAL_DIR" \
  --output-json "$BENCHMARK_REPORT" \
  --output-md "$OUTPUT_DIR/evaluation_summary.md" \
  --split test

# Step 3c & Step 4: Tier 2 Benchmark & Two-Tier Promotion Gate
execute_two_tier_promotion_gate \
  "$CHALLENGER_MODEL" \
  "$ASSET_TASK" \
  "$BENCHMARK_REPORT" \
  "$CHAMPION_REPORT" \
  "$GOLDEN_V2_DIR" \
  "$BENCHMARK_V2_REPORT" \
  "$CHAMPION_V2_REPORT" \
  "$OUTPUT_DIR"
