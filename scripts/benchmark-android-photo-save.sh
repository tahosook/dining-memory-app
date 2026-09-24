#!/usr/bin/env bash
set -euo pipefail

PACKAGE="com.tahosook.diningmemory"
PID=$(adb shell pidof "$PACKAGE" || true)

if [[ -z "$PID" ]]; then
  echo "App is not running. Starting app..."
  adb shell am start -n "$PACKAGE/.MainActivity"
  sleep 2
  PID=$(adb shell pidof "$PACKAGE")
fi

echo "=================================================="
echo "Dining Memory - Photo Save Benchmark Runner"
echo "Target PID: $PID"
echo "Device: $(adb shell getprop ro.product.model) (Android $(adb shell getprop ro.build.version.release))"
echo "=================================================="
echo "1. Clearing gfxinfo and logcat..."
adb shell dumpsys gfxinfo "$PACKAGE" reset >/dev/null
adb logcat -c

echo "2. Baseline memory usage:"
adb shell dumpsys meminfo "$PACKAGE" | grep -E "TOTAL PSS:|Java Heap:|Native Heap:" || true

TEMP_MEM_LOG=$(mktemp)
SAMPLER_RUNNING=1

# Start background memory sampler
(
  while [[ $SAMPLER_RUNNING -eq 1 ]]; do
    pss=$(adb shell dumpsys meminfo "$PACKAGE" 2>/dev/null | grep "TOTAL PSS:" | awk '{print $3}' || echo "0")
    if [[ -n "$pss" && "$pss" -gt 0 ]]; then
      echo "$pss" >> "$TEMP_MEM_LOG"
    fi
    sleep 0.2
  done
) &
SAMPLER_PID=$!

echo ""
echo ">>> 実機で写真を撮影し、レビュー画面で「保存」をタップしてください <<<"
echo ">>> 保存完了後、Enter キーを押してください <<<"
read -r -p "Press ENTER after saving photo..."

# Stop sampler
kill "$SAMPLER_PID" 2>/dev/null || true
wait "$SAMPLER_PID" 2>/dev/null || true

MAX_PSS=0
if [[ -f "$TEMP_MEM_LOG" && -s "$TEMP_MEM_LOG" ]]; then
  MAX_PSS=$(sort -n "$TEMP_MEM_LOG" | tail -n 1)
  rm -f "$TEMP_MEM_LOG"
fi

echo ""
echo "3. Collecting Performance Logs from Logcat..."
echo "--------------------------------------------------"
echo "Note: Step 1 (Camera capture) is prior to save workflow."
echo "      Total is the synchronous duration of saveCaptureReviewWorkflow."
echo "      Step 6 (Thumbnail generation) runs asynchronously in background."
echo "--------------------------------------------------"
adb logcat -d -s ReactNativeJS | grep -E "\[PERF_STEP\]" || echo "No [PERF_STEP] logs found."
echo "--------------------------------------------------"

echo ""
echo "4. Memory Usage Summary:"
echo "Peak PSS during save: ${MAX_PSS} kB"
echo "Post-save snapshot:"
adb shell dumpsys meminfo "$PACKAGE" | grep -E "TOTAL PSS:|Java Heap:|Native Heap:" || true

echo ""
echo "5. GC Activity during operation:"
echo "--------------------------------------------------"
adb logcat -d | grep -iE "(art: Explicit|concurrent mark compact GC|Alloc concurrent mark compact GC)" | tail -n 10 || echo "No explicit GC logged."
echo "--------------------------------------------------"

echo ""
echo "6. Frame Rendering Stats (UI Jank / Frame drops):"
echo "--------------------------------------------------"
adb shell dumpsys gfxinfo "$PACKAGE" | grep -E "Total frames rendered|Janky frames|Number Missed Vsync" || true
echo "--------------------------------------------------"
echo "Benchmark completed."
