#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ANDROID_DIR="${ANDROID_DIR:-$ROOT_DIR/android}"
ENSURE_MEDIAPIPE_MODEL_SCRIPT="${ENSURE_MEDIAPIPE_MODEL_SCRIPT:-$ROOT_DIR/scripts/ensure-mediapipe-model.sh}"
BUILD_TASK="${BUILD_ANDROID_TASK:-assembleRelease}"
BUILD_OUTPUT_TYPE="${BUILD_ANDROID_OUTPUT_TYPE:-release}"
BUILD_VARIANT_LABEL="${BUILD_ANDROID_VARIANT_LABEL:-release}"
BUILD_ARCHITECTURES="${BUILD_ANDROID_ARCHITECTURES:-arm64-v8a}"
GRADLE_ARGS=()

case "$BUILD_OUTPUT_TYPE" in
  debug)
    APK_NAME="app-debug.apk"
    OUTPUT_METADATA_NAME="output-metadata.json"
    ;;
  release)
    APK_NAME="app-release.apk"
    OUTPUT_METADATA_NAME="output-metadata.json"
    ;;
  *)
    echo "error: unsupported BUILD_ANDROID_OUTPUT_TYPE: $BUILD_OUTPUT_TYPE" >&2
    exit 1
    ;;
esac

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARTIFACT_SUBDIR="${BUILD_ANDROID_ARTIFACT_SUBDIR:-android-${BUILD_OUTPUT_TYPE}}"
ARTIFACT_DIR="${ANDROID_BUILD_ARTIFACT_DIR:-$ROOT_DIR/artifacts/$ARTIFACT_SUBDIR/$TIMESTAMP}"
APK_PATH="$ANDROID_DIR/app/build/outputs/apk/$BUILD_OUTPUT_TYPE/$APK_NAME"
OUTPUT_METADATA_PATH="$ANDROID_DIR/app/build/outputs/apk/$BUILD_OUTPUT_TYPE/$OUTPUT_METADATA_NAME"
LOG_FILE="$ARTIFACT_DIR/gradle-build.log"
INFO_FILE="$ARTIFACT_DIR/build-info.txt"

if [[ -n "$BUILD_ARCHITECTURES" ]]; then
  GRADLE_ARGS+=("-PreactNativeArchitectures=$BUILD_ARCHITECTURES")
fi

# Inject commit hash and build date for build info
if [[ -z "${COMMIT_HASH:-}" ]]; then
  export COMMIT_HASH="$(git -C "$ROOT_DIR" rev-parse --short=7 HEAD 2>/dev/null || echo '')"
fi
if [[ -z "${BUILD_DATE:-}" ]]; then
  export BUILD_DATE="$(git -C "$ROOT_DIR" log -1 --format=%cI 2>/dev/null || date -u '+%Y-%m-%dT%H:%M:%SZ')"
fi

if [[ -z "${NODE_ENV:-}" ]]; then
  if [[ "$BUILD_OUTPUT_TYPE" == "debug" ]]; then
    export NODE_ENV=development
  else
    export NODE_ENV=production
  fi
fi
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$HOME/.gradle}"

mkdir -p "$ARTIFACT_DIR"

{
  echo "timestamp_utc=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "root_dir=$ROOT_DIR"
  echo "android_dir=$ANDROID_DIR"
  echo "build_task=$BUILD_TASK"
  echo "build_output_type=$BUILD_OUTPUT_TYPE"
  echo "build_variant_label=$BUILD_VARIANT_LABEL"
  echo "build_architectures=$BUILD_ARCHITECTURES"
  echo "gradle_user_home=$GRADLE_USER_HOME"
  echo "node_env=$NODE_ENV"
  echo "git_commit=$(git -C "$ROOT_DIR" rev-parse HEAD)"
  echo "git_describe=$(git -C "$ROOT_DIR" describe --always --dirty --broken)"
  echo "node=$(node --version)"
  echo "npm=$(npm --version)"
  echo "java=$(java -version 2>&1 | head -n 1)"
  echo "git_status:"
  git -C "$ROOT_DIR" status --short --branch
} > "$INFO_FILE"

compute_sha256() {
  local target="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$target" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$target" | awk '{ print $1 }'
  else
    echo "error: sha256sum or shasum is required for checksum verification" >&2
    exit 1
  fi
}

compute_sha256_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{ print $1 }'
  else
    echo "error: sha256sum or shasum is required for checksum verification" >&2
    exit 1
  fi
}

MODEL_FILENAMES=(
  "meal-input-assist.task"
  "universal_dining_23class.task"
  "personal_multilabel_44tag.task"
)
expected_sha256_for_model() {
  local model_file="$1"
  case "$model_file" in
    "meal-input-assist.task")
      echo "${MEDIAPIPE_MODEL_SHA256:-3b3916614aae9e8d6ea85358b4b26aba024c54902b9257ae28338c80eadaa601}"
      ;;
    "universal_dining_23class.task")
      echo "${MEDIAPIPE_UNIVERSAL_MODEL_SHA256:-39c14ffa40a53c6e23aa53c6e0d2ec5a45cce9d4e4f5543cc35c1b2509686e4b}"
      ;;
    "personal_multilabel_44tag.task")
      echo "${MEDIAPIPE_PERSONAL_MODEL_SHA256:-b6cb09574bd034cef43546d3808f82ff28b3a67369f19069aa5c7cbb61e9c971}"
      ;;
    *)
      echo "error: unknown MediaPipe model file: $model_file" >&2
      exit 1
      ;;
  esac
}
MODEL_ASSET_DIR="$ANDROID_DIR/app/src/main/assets/mediapipe"
REQUIRE_BUNDLED_MODEL="${REQUIRE_BUNDLED_MODEL:-}"
if [[ -z "$REQUIRE_BUNDLED_MODEL" ]]; then
  if [[ "$BUILD_OUTPUT_TYPE" == "release" || "$BUILD_TASK" == *"Release"* ]]; then
    REQUIRE_BUNDLED_MODEL="true"
  else
    REQUIRE_BUNDLED_MODEL="false"
  fi
fi

if [[ "$REQUIRE_BUNDLED_MODEL" == "true" ]]; then
  echo "Ensuring and verifying bundled MediaPipe model assets..."
  bash "$ENSURE_MEDIAPIPE_MODEL_SCRIPT"

  for model_file in "${MODEL_FILENAMES[@]}"; do
    target_path="$MODEL_ASSET_DIR/$model_file"
    if [[ ! -f "$target_path" || ! -s "$target_path" ]]; then
      echo "error: MediaPipe model asset is missing or empty at $target_path" >&2
      echo "Release builds require all bundled model assets to be present before building." >&2
      exit 1
    fi
    actual_sha="$(compute_sha256 "$target_path")"
    expected_sha="$(expected_sha256_for_model "$model_file")"
    if [[ "$actual_sha" != "$expected_sha" ]]; then
      echo "error: SHA256 checksum mismatch for bundled model $model_file at $target_path (expected=$expected_sha, actual=$actual_sha)" >&2
      exit 1
    fi
    echo "Verified bundled model asset exists and matches checksum: $target_path ($(wc -c < "$target_path" | tr -d ' ') bytes, sha256=$actual_sha)"
  done
fi

echo "Building Android $BUILD_VARIANT_LABEL APK..."
echo "Artifacts will be stored in: $ARTIFACT_DIR"

(
  cd "$ANDROID_DIR"
  ./gradlew "$BUILD_TASK" --stacktrace "${GRADLE_ARGS[@]}"
) 2>&1 | tee "$LOG_FILE"

if [[ ! -f "$APK_PATH" ]]; then
  echo "error: expected APK was not created at $APK_PATH" >&2
  exit 1
fi

if [[ "$REQUIRE_BUNDLED_MODEL" == "true" ]]; then
  echo "Verifying bundled MediaPipe model assets inside APK..."
  for model_file in "${MODEL_FILENAMES[@]}"; do
    APK_MODEL_ENTRY="assets/mediapipe/$model_file"
    if ! unzip -l "$APK_PATH" "$APK_MODEL_ENTRY" >/dev/null 2>&1; then
      echo "error: APK verification failed - '$APK_MODEL_ENTRY' is missing in $APK_PATH" >&2
      exit 1
    fi
    APK_MODEL_SIZE="$(unzip -l "$APK_PATH" "$APK_MODEL_ENTRY" | awk -v entry="$APK_MODEL_ENTRY" '$NF == entry { print $1 }')"
    if [[ -z "$APK_MODEL_SIZE" || "$APK_MODEL_SIZE" -le 0 ]]; then
      echo "error: APK verification failed - '$APK_MODEL_ENTRY' is empty or invalid size ($APK_MODEL_SIZE bytes) in $APK_PATH" >&2
      exit 1
    fi
    APK_MODEL_SHA="$(unzip -p "$APK_PATH" "$APK_MODEL_ENTRY" | compute_sha256_stream)"
    expected_sha="$(expected_sha256_for_model "$model_file")"
    if [[ "$APK_MODEL_SHA" != "$expected_sha" ]]; then
      echo "error: APK verification failed - SHA256 checksum mismatch for '$APK_MODEL_ENTRY' in $APK_PATH (expected=$expected_sha, actual=$APK_MODEL_SHA)" >&2
      exit 1
    fi
    echo "  ✓ Bundled model verified in APK: $APK_MODEL_ENTRY ($APK_MODEL_SIZE bytes, sha256=$APK_MODEL_SHA)"
  done
fi

cp "$APK_PATH" "$ARTIFACT_DIR/$APK_NAME"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$ARTIFACT_DIR/$APK_NAME" > "$ARTIFACT_DIR/$APK_NAME.sha256"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$ARTIFACT_DIR/$APK_NAME" > "$ARTIFACT_DIR/$APK_NAME.sha256"
fi

if [[ -f "$OUTPUT_METADATA_PATH" ]]; then
  cp "$OUTPUT_METADATA_PATH" "$ARTIFACT_DIR/output-metadata.json"
fi

if [[ "$BUILD_OUTPUT_TYPE" == "release" ]]; then
  MAPPING_DIR="$ANDROID_DIR/app/build/outputs/mapping/$BUILD_OUTPUT_TYPE"
  if [[ ! -d "$MAPPING_DIR" ]]; then
    echo "error: release mapping directory is missing at $MAPPING_DIR" >&2
    exit 1
  fi
  if ! cp -R "$MAPPING_DIR" "$ARTIFACT_DIR/mapping"; then
    echo "error: failed to copy mapping directory from $MAPPING_DIR to $ARTIFACT_DIR/mapping" >&2
    exit 1
  fi
fi

echo "Build complete."
echo "APK: $ARTIFACT_DIR/$APK_NAME"
echo "Log: $LOG_FILE"
echo "Info: $INFO_FILE"

