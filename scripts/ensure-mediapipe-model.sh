#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${MEDIAPIPE_MODEL_DIR:-$ROOT_DIR/android/app/src/main/assets/mediapipe}"
MODEL_FILENAME="meal-input-assist.task"
TARGET_FILE="$TARGET_DIR/$MODEL_FILENAME"

MODEL_TAG="${MEDIAPIPE_MODEL_TAG:-mediapipe-model-v0.1.0}"
EXPECTED_SHA256="${MEDIAPIPE_MODEL_SHA256:-3b3916614aae9e8d6ea85358b4b26aba024c54902b9257ae28338c80eadaa601}"
DOWNLOAD_URL="${MEDIAPIPE_MODEL_URL:-https://github.com/tahosook/dining-memory-app/releases/download/${MODEL_TAG}/${MODEL_FILENAME}}"

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

# Sync additional issue-23 dual taxonomy models if available
sync_additional_model() {
  local filename="$1"
  local expected_sha="$2"
  local source_file="$ROOT_DIR/state/mediapipe_models/dual_taxonomy_issue23/${filename%.task}/$filename"
  local target_file="$TARGET_DIR/$filename"

  if [[ -f "$target_file" && -s "$target_file" ]]; then
    local current_sha
    current_sha="$(compute_sha256 "$target_file")"
    if [[ "$current_sha" == "$expected_sha" ]]; then
      echo "Additional MediaPipe model asset is up to date: $target_file ($expected_sha)"
      return 0
    fi
    echo "Existing additional model ($filename) checksum differs ($current_sha vs $expected_sha). Re-syncing..."
  fi

  if [[ -f "$source_file" && -s "$source_file" ]]; then
    local src_sha
    src_sha="$(compute_sha256 "$source_file")"
    if [[ "$src_sha" != "$expected_sha" ]]; then
      echo "error: source additional model $source_file checksum ($src_sha) mismatch expected ($expected_sha)" >&2
      return 1
    fi
    mkdir -p "$TARGET_DIR"
    cp "$source_file" "$target_file"
    echo "✓ Additional MediaPipe model synchronized: $target_file"
    return 0
  fi

  return 0
}

sync_additional_models() {
  sync_additional_model "universal_scene_7class.task" "6dae435d14bd3a7db9c1ea14dde61286f51bb36d52400ebdaf28f4a8bcad3fa1"
  sync_additional_model "personal_household_8class.task" "924a9782aa374278d8521e74a4a814398fd24cfefd0b6e0f2354235b428de15c"
}

# Check if valid model already exists
if [[ -f "$TARGET_FILE" && -s "$TARGET_FILE" ]]; then
  CURRENT_SHA256="$(compute_sha256 "$TARGET_FILE")"
  if [[ "$CURRENT_SHA256" == "$EXPECTED_SHA256" ]]; then
    echo "MediaPipe model asset is up to date: $TARGET_FILE ($EXPECTED_SHA256)"
    if [[ "$TARGET_DIR" == "$ROOT_DIR/android/app/src/main/assets/mediapipe" || "${MEDIAPIPE_SYNC_ADDITIONAL_MODELS:-false}" == "true" ]]; then
      sync_additional_models
    fi
    exit 0
  fi
  echo "Existing MediaPipe model checksum ($CURRENT_SHA256) differs from expected ($EXPECTED_SHA256). Re-downloading..."
fi

echo "Fetching MediaPipe model asset ($MODEL_TAG)..."
echo "URL: $DOWNLOAD_URL"
echo "Target: $TARGET_FILE"

mkdir -p "$TARGET_DIR"
TEMP_FILE="$TARGET_DIR/$MODEL_FILENAME.download-$(date +%s%N 2>/dev/null || date +%s)"

cleanup() {
  if [[ -f "$TEMP_FILE" ]]; then
    rm -f "$TEMP_FILE"
  fi
}
trap cleanup EXIT

if ! curl -fL --retry 3 --retry-delay 2 -o "$TEMP_FILE" "$DOWNLOAD_URL"; then
  echo "error: failed to download MediaPipe model from $DOWNLOAD_URL" >&2
  exit 1
fi

if [[ ! -s "$TEMP_FILE" ]]; then
  echo "error: downloaded model file is empty (0 bytes) from $DOWNLOAD_URL" >&2
  exit 1
fi

DOWNLOADED_SHA256="$(compute_sha256 "$TEMP_FILE")"
if [[ "$DOWNLOADED_SHA256" != "$EXPECTED_SHA256" ]]; then
  echo "error: SHA256 checksum mismatch for downloaded MediaPipe model!" >&2
  echo "  Expected: $EXPECTED_SHA256" >&2
  echo "  Actual:   $DOWNLOADED_SHA256" >&2
  exit 1
fi

mv "$TEMP_FILE" "$TARGET_FILE"
echo "✓ MediaPipe model successfully fetched and verified: $TARGET_FILE ($(wc -c < "$TARGET_FILE" | tr -d ' ') bytes)"
if [[ "$TARGET_DIR" == "$ROOT_DIR/android/app/src/main/assets/mediapipe" || "${MEDIAPIPE_SYNC_ADDITIONAL_MODELS:-false}" == "true" ]]; then
  sync_additional_models
fi
exit 0
