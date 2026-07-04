#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VARIANT="${INSTALL_ANDROID_VARIANT:-release}"
APK_NAME="${INSTALL_ANDROID_APK_NAME:-app-${VARIANT}.apk}"
ARTIFACT_ROOT="${INSTALL_ANDROID_ARTIFACT_ROOT:-$ROOT_DIR/artifacts/android-${VARIANT}}"
APK_PATH="${INSTALL_ANDROID_APK_PATH:-}"

if [[ -z "$APK_PATH" ]]; then
  while IFS= read -r candidate; do
    APK_PATH="$candidate"
  done < <(find "$ARTIFACT_ROOT" -maxdepth 2 -type f -name "$APK_NAME" | sort)
  if [[ -z "${APK_PATH:-}" ]]; then
    echo "error: no APK found for variant '$VARIANT' under $ARTIFACT_ROOT" >&2
    exit 1
  fi
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "error: APK does not exist: $APK_PATH" >&2
  exit 1
fi

echo "Installing APK: $APK_PATH"
adb install -r "$APK_PATH"
