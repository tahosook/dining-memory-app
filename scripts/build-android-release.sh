#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARTIFACT_DIR="${ANDROID_BUILD_ARTIFACT_DIR:-$ROOT_DIR/artifacts/android-release/$TIMESTAMP}"
APK_PATH="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
OUTPUT_METADATA_PATH="$ANDROID_DIR/app/build/outputs/apk/release/output-metadata.json"
LOG_FILE="$ARTIFACT_DIR/gradle-build.log"
INFO_FILE="$ARTIFACT_DIR/build-info.txt"

mkdir -p "$ARTIFACT_DIR"

{
  echo "timestamp_utc=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "root_dir=$ROOT_DIR"
  echo "android_dir=$ANDROID_DIR"
  echo "git_commit=$(git -C "$ROOT_DIR" rev-parse HEAD)"
  echo "git_describe=$(git -C "$ROOT_DIR" describe --always --dirty --broken)"
  echo "node=$(node --version)"
  echo "npm=$(npm --version)"
  echo "java=$(java -version 2>&1 | head -n 1)"
  echo "git_status:"
  git -C "$ROOT_DIR" status --short --branch
} > "$INFO_FILE"

echo "Building Android release APK..."
echo "Artifacts will be stored in: $ARTIFACT_DIR"

(
  cd "$ANDROID_DIR"
  ./gradlew assembleRelease
) 2>&1 | tee "$LOG_FILE"

if [[ ! -f "$APK_PATH" ]]; then
  echo "error: expected APK was not created at $APK_PATH" >&2
  exit 1
fi

cp "$APK_PATH" "$ARTIFACT_DIR/app-release.apk"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$ARTIFACT_DIR/app-release.apk" > "$ARTIFACT_DIR/app-release.apk.sha256"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$ARTIFACT_DIR/app-release.apk" > "$ARTIFACT_DIR/app-release.apk.sha256"
fi

if [[ -f "$OUTPUT_METADATA_PATH" ]]; then
  cp "$OUTPUT_METADATA_PATH" "$ARTIFACT_DIR/output-metadata.json"
fi

echo "Build complete."
echo "APK: $ARTIFACT_DIR/app-release.apk"
echo "Log: $LOG_FILE"
echo "Info: $INFO_FILE"
