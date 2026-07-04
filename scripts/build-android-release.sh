#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
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

cp "$APK_PATH" "$ARTIFACT_DIR/$APK_NAME"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$ARTIFACT_DIR/$APK_NAME" > "$ARTIFACT_DIR/$APK_NAME.sha256"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$ARTIFACT_DIR/$APK_NAME" > "$ARTIFACT_DIR/$APK_NAME.sha256"
fi

if [[ -f "$OUTPUT_METADATA_PATH" ]]; then
  cp "$OUTPUT_METADATA_PATH" "$ARTIFACT_DIR/output-metadata.json"
fi

echo "Build complete."
echo "APK: $ARTIFACT_DIR/$APK_NAME"
echo "Log: $LOG_FILE"
echo "Info: $INFO_FILE"
