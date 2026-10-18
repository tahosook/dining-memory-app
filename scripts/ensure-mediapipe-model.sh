#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TARGET_DIR="${MEDIAPIPE_MODEL_DIR:-$ROOT_DIR/android/app/src/main/assets/mediapipe}"
MODEL_TAG="${MEDIAPIPE_MODEL_TAG:-mediapipe-model-v0.1.0}"

CURRENT_TEMP_FILE=""
cleanup_temp() {
  if [[ -n "${CURRENT_TEMP_FILE:-}" && -f "$CURRENT_TEMP_FILE" ]]; then
    rm -f "$CURRENT_TEMP_FILE"
  fi
}
trap cleanup_temp EXIT

compute_sha256() {
  local file="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  else
    echo "error: neither shasum nor sha256sum found on system" >&2
    exit 1
  fi
}

ensure_single_model() {
  local filename="$1"
  local expected_sha="$2"
  local custom_url="${3:-}"
  local local_source_path="${4:-}"

  local target_file="$TARGET_DIR/$filename"
  local download_url="${custom_url:-https://github.com/tahosook/dining-memory-app/releases/download/${MODEL_TAG}/${filename}}"

  # 1. Check if valid model already exists in target directory
  if [[ -f "$target_file" && -s "$target_file" ]]; then
    local current_sha
    current_sha="$(compute_sha256 "$target_file")"
    if [[ "$current_sha" == "$expected_sha" ]]; then
      echo "MediaPipe model asset is up to date: $target_file ($expected_sha)"
      return 0
    fi
    echo "Existing MediaPipe model ($filename) checksum ($current_sha) differs from expected ($expected_sha). Re-acquiring..."
  fi

  # 2. Check if valid model exists in local training state directory
  if [[ -n "$local_source_path" && -f "$local_source_path" && -s "$local_source_path" ]]; then
    local src_sha
    src_sha="$(compute_sha256 "$local_source_path")"
    if [[ "$src_sha" == "$expected_sha" ]]; then
      mkdir -p "$TARGET_DIR"
      cp "$local_source_path" "$target_file"
      echo "✓ Synchronized MediaPipe model from local source: $target_file ($(wc -c < "$target_file" | tr -d ' ') bytes)"
      return 0
    else
      echo "warning: local source $local_source_path checksum ($src_sha) mismatch expected ($expected_sha). Falling back to remote..." >&2
    fi
  fi

  # 3. Fetch from remote (GitHub Releases)
  echo "Fetching MediaPipe model asset ($filename from $MODEL_TAG)..."
  echo "URL: $download_url"
  echo "Target: $target_file"

  mkdir -p "$TARGET_DIR"
  CURRENT_TEMP_FILE="$TARGET_DIR/$filename.download-$(date +%s%N 2>/dev/null || date +%s)"

  if ! curl -fL --retry 3 --retry-delay 2 -o "$CURRENT_TEMP_FILE" "$download_url"; then
    echo "error: failed to download MediaPipe model from $download_url" >&2
    rm -f "$CURRENT_TEMP_FILE"
    CURRENT_TEMP_FILE=""
    exit 1
  fi

  if [[ ! -s "$CURRENT_TEMP_FILE" ]]; then
    echo "error: downloaded model file is empty (0 bytes) from $download_url" >&2
    rm -f "$CURRENT_TEMP_FILE"
    CURRENT_TEMP_FILE=""
    exit 1
  fi

  local downloaded_sha
  downloaded_sha="$(compute_sha256 "$CURRENT_TEMP_FILE")"
  if [[ "$downloaded_sha" != "$expected_sha" ]]; then
    echo "error: SHA256 checksum mismatch for downloaded MediaPipe model ($filename)!" >&2
    echo "  Expected: $expected_sha" >&2
    echo "  Actual:   $downloaded_sha" >&2
    rm -f "$CURRENT_TEMP_FILE"
    CURRENT_TEMP_FILE=""
    exit 1
  fi

  mv "$CURRENT_TEMP_FILE" "$target_file"
  CURRENT_TEMP_FILE=""
  echo "✓ MediaPipe model successfully fetched and verified: $target_file ($(wc -c < "$target_file" | tr -d ' ') bytes)"
  return 0
}

# Model 1: Cooking Method 9-class (standard baseline)
MODEL_1_FILE="meal-input-assist.task"
MODEL_1_SHA="${MEDIAPIPE_MODEL_SHA256:-3b3916614aae9e8d6ea85358b4b26aba024c54902b9257ae28338c80eadaa601}"
MODEL_1_URL="${MEDIAPIPE_MODEL_URL:-}"

ensure_single_model "$MODEL_1_FILE" "$MODEL_1_SHA" "$MODEL_1_URL" ""

# If MEDIAPIPE_MODEL_URL is specifically overridden (e.g. in single-model unit tests) and MEDIAPIPE_ENSURE_ALL_MODELS is not requested, skip additional models
if [[ -n "$MODEL_1_URL" && "${MEDIAPIPE_ENSURE_ALL_MODELS:-false}" != "true" ]]; then
  exit 0
fi

# Model 2: Universal Scene 7-class
MODEL_2_FILE="universal_scene_7class.task"
MODEL_2_SHA="${MEDIAPIPE_UNIVERSAL_MODEL_SHA256:-6dae435d14bd3a7db9c1ea14dde61286f51bb36d52400ebdaf28f4a8bcad3fa1}"
MODEL_2_URL="${MEDIAPIPE_UNIVERSAL_MODEL_URL:-}"
MODEL_2_LOCAL="$ROOT_DIR/state/mediapipe_models/dual_taxonomy_issue23/universal_scene_7class/universal_scene_7class.task"

ensure_single_model "$MODEL_2_FILE" "$MODEL_2_SHA" "$MODEL_2_URL" "$MODEL_2_LOCAL"

# Model 3: Personal Household 8-class
MODEL_3_FILE="personal_household_8class.task"
MODEL_3_SHA="${MEDIAPIPE_PERSONAL_MODEL_SHA256:-924a9782aa374278d8521e74a4a814398fd24cfefd0b6e0f2354235b428de15c}"
MODEL_3_URL="${MEDIAPIPE_PERSONAL_MODEL_URL:-}"
MODEL_3_LOCAL="$ROOT_DIR/state/mediapipe_models/dual_taxonomy_issue23/personal_household_8class/personal_household_8class.task"

ensure_single_model "$MODEL_3_FILE" "$MODEL_3_SHA" "$MODEL_3_URL" "$MODEL_3_LOCAL"

exit 0
