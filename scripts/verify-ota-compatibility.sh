#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# verify-ota-compatibility.sh
#
# OTA (EAS Update) compatibility checker:
# 1. Verifies that runtimeVersion in app.json matches strings.xml.
# 2. Ensures the git working tree is clean (unless --allow-dirty is passed).
# 3. Compares changes against a base reference to ensure NO native-sensitive files
#    or Tier 1 native dependencies were altered.
# If native changes are detected, OTA update must be blocked and a full local build
# is required.
# -----------------------------------------------------------------------------

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ALLOW_DIRTY=false
BASE_REF="${OTA_BASE_REF:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-dirty)
      ALLOW_DIRTY=true
      shift
      ;;
    --base)
      BASE_REF="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--base <git-ref>] [--allow-dirty]"
      echo "Checks whether current changes are safe to publish via EAS Update (OTA)."
      exit 0
      ;;
    *)
      if [[ -z "$BASE_REF" ]]; then
        BASE_REF="$1"
      fi
      shift
      ;;
  esac
done

echo "🔍 Verifying OTA (EAS Update) compatibility..."

# 1. Clean working tree check
if [[ "$ALLOW_DIRTY" != "true" ]]; then
  if ! git -C "$ROOT_DIR" diff --quiet || ! git -C "$ROOT_DIR" diff --cached --quiet; then
    echo "❌ [OTA GATE FAIL] Working tree has uncommitted changes." >&2
    echo "   Please commit or stash your changes before publishing an OTA update," >&2
    echo "   or pass --allow-dirty for local exploratory testing." >&2
    exit 1
  fi
  echo "  ✓ Working tree is clean."
else
  echo "  ℹ Dirty working tree allowed via --allow-dirty."
fi

# 2. runtimeVersion alignment check
APP_JSON="$ROOT_DIR/app.json"
STRINGS_XML="$ROOT_DIR/android/app/src/main/res/values/strings.xml"

if [[ ! -f "$APP_JSON" ]]; then
  echo "❌ [OTA GATE FAIL] app.json not found at $APP_JSON" >&2
  exit 1
fi
if [[ ! -f "$STRINGS_XML" ]]; then
  echo "❌ [OTA GATE FAIL] strings.xml not found at $STRINGS_XML" >&2
  exit 1
fi

APP_RUNTIME_VERSION="$(node -e 'const c = require(process.argv[1]); process.stdout.write(String(c?.expo?.runtimeVersion ?? ""));' "$APP_JSON")"
if [[ -z "$APP_RUNTIME_VERSION" ]]; then
  echo "❌ [OTA GATE FAIL] expo.runtimeVersion is missing or empty in app.json" >&2
  exit 1
fi

STRINGS_RUNTIME_VERSION="$(grep -E '<string[^>]*name="expo_runtime_version"[^>]*>' "$STRINGS_XML" | sed -E 's/.*<string[^>]*>([^<]+)<\/string>.*/\1/' | tr -d '[:space:]')"
if [[ -z "$STRINGS_RUNTIME_VERSION" ]]; then
  echo "❌ [OTA GATE FAIL] 'expo_runtime_version' string resource is missing in strings.xml" >&2
  exit 1
fi

if [[ "$APP_RUNTIME_VERSION" != "$STRINGS_RUNTIME_VERSION" ]]; then
  echo "❌ [OTA GATE FAIL] runtimeVersion mismatch: app.json ($APP_RUNTIME_VERSION) != strings.xml ($STRINGS_RUNTIME_VERSION)" >&2
  exit 1
fi
echo "  ✓ runtimeVersion is consistent ($APP_RUNTIME_VERSION)."

# 3. Determine base ref for native change comparison
if [[ -z "$BASE_REF" ]]; then
  # Try to find the commit where runtimeVersion was last touched, or default to origin/main or HEAD~1
  LAST_RUNTIME_COMMIT="$(git -C "$ROOT_DIR" log -n 1 --format=%H -S "runtimeVersion" "$APP_JSON" 2>/dev/null || true)"
  if [[ -n "$LAST_RUNTIME_COMMIT" && "$LAST_RUNTIME_COMMIT" != "$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)" ]]; then
    BASE_REF="$LAST_RUNTIME_COMMIT"
  elif git -C "$ROOT_DIR" rev-parse --verify origin/main >/dev/null 2>&1; then
    BASE_REF="origin/main"
  elif git -C "$ROOT_DIR" rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    BASE_REF="HEAD~1"
  else
    BASE_REF="HEAD"
  fi
fi

echo "  ℹ Comparing native-sensitive changes against base: $BASE_REF"

CHANGED_FILES="$(git -C "$ROOT_DIR" diff --name-only "$BASE_REF" 2>/dev/null || true)"

if [[ -z "$CHANGED_FILES" ]]; then
  echo "  ✓ No changes detected compared to $BASE_REF."
  echo "✅ OTA compatibility check passed (safe for EAS Update)."
  exit 0
fi

# 4. Check for static native file changes
STATIC_NATIVE_PATTERN='^(android/|package-lock\.json$|app\.json$|app\.config\..*|babel\.config\..*|metro\.config\..*|eas\.json$)'
NATIVE_MATCHES="$(echo "$CHANGED_FILES" | grep -E "$STATIC_NATIVE_PATTERN" || true)"

if [[ -n "$NATIVE_MATCHES" ]]; then
  echo "❌ [OTA GATE FAIL] Native-sensitive files were modified since $BASE_REF:" >&2
  echo "$NATIVE_MATCHES" | sed 's/^/   - /' >&2
  echo "" >&2
  echo "   [Action Required]" >&2
  echo "   These changes affect the native binary and CANNOT be delivered via OTA update." >&2
  echo "   1. Bump 'runtimeVersion' in app.json and strings.xml." >&2
  echo "   2. Rebuild and reinstall the Android APK locally: npm run release:android" >&2
  exit 1
fi

# 5. Check package.json for Tier 1 native dependency changes
if echo "$CHANGED_FILES" | grep -q '^package\.json$'; then
  HAS_NATIVE_DEP_CHANGE="$(node -e '
    const cp = require("child_process");
    const fs = require("fs");
    const path = require("path");

    function isNativePackage(name, inDeps) {
      if (
        name === "expo" ||
        name.startsWith("expo-") ||
        name.startsWith("@expo/") ||
        name === "react" ||
        name === "react-dom" ||
        name === "react-native" ||
        name === "react-native-web" ||
        name.startsWith("react-native-") ||
        name.startsWith("@react-native/") ||
        name.startsWith("@react-native-community/") ||
        name === "react-test-renderer" ||
        name === "@types/react" ||
        name === "llama.rn" ||
        name.startsWith("@bam.tech/") ||
        name === "jest-expo"
      ) {
        return true;
      }
      const isPureJs = name === "piexifjs" || name.startsWith("@react-navigation/");
      return !isPureJs && inDeps;
    }

    const root = process.argv[1];
    const baseRef = process.argv[2];

    let baseObj = {};
    try {
      const baseRaw = cp.execFileSync("git", ["-C", root, "show", `${baseRef}:package.json`], { encoding: "utf8" });
      baseObj = JSON.parse(baseRaw);
    } catch (_) {
      baseObj = {};
    }

    let headObj = {};
    try {
      headObj = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    } catch (_) {
      headObj = {};
    }

    const baseDeps = { ...(baseObj.dependencies || {}) };
    const headDeps = { ...(headObj.dependencies || {}) };

    const changedKeys = new Set();
    for (const k of Object.keys(baseDeps)) {
      if (baseDeps[k] !== headDeps[k]) changedKeys.add(k);
    }
    for (const k of Object.keys(headDeps)) {
      if (baseDeps[k] !== headDeps[k]) changedKeys.add(k);
    }

    const nativeChanged = Array.from(changedKeys).filter(k => isNativePackage(k, true));
    if (nativeChanged.length > 0) {
      console.error("   Modified native dependencies: " + nativeChanged.join(", "));
      process.stdout.write("true");
    } else {
      process.stdout.write("false");
    }
  ' "$ROOT_DIR" "$BASE_REF")"

  if [[ "$HAS_NATIVE_DEP_CHANGE" == "true" ]]; then
    echo "❌ [OTA GATE FAIL] Native dependency changes detected in package.json." >&2
    echo "   Native dependencies cannot be updated via OTA." >&2
    echo "   Bump 'runtimeVersion' and rebuild the APK with 'npm run release:android'." >&2
    exit 1
  fi
fi

echo "  ✓ No native changes detected. All diffs are safe JS/TS logic or assets."
echo "✅ OTA compatibility check passed (safe for EAS Update)."
exit 0
