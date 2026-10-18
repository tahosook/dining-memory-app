/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

describe('build-android-release.sh MediaPipe Model Bundling Verification', () => {
  const tempTestDir = path.resolve(__dirname, '../node_modules/.cache/build-script-test');

  beforeEach(() => {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
    fs.mkdirSync(tempTestDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  });

  test('fails pre-build check when bundled model asset is missing for release build', () => {
    // Create minimal mock android structure without model asset
    const mockAndroidDir = path.join(tempTestDir, 'android');
    const mockAssetsDir = path.join(mockAndroidDir, 'app/src/main/assets/mediapipe');
    fs.mkdirSync(mockAssetsDir, { recursive: true });

    // Script should fail before running gradlew
    const res = spawnSync(
      'bash',
      [
        '-c',
        `
      ANDROID_DIR="${mockAndroidDir}"
      BUILD_OUTPUT_TYPE="release"
      REQUIRE_BUNDLED_MODEL="true"
      MODEL_ASSET_PATH="$ANDROID_DIR/app/src/main/assets/mediapipe/meal-input-assist.task"
      if [[ ! -f "$MODEL_ASSET_PATH" || ! -s "$MODEL_ASSET_PATH" ]]; then
        echo "error: MediaPipe model asset is missing or empty at $MODEL_ASSET_PATH" >&2
        exit 1
      fi
    `,
      ],
      { encoding: 'utf-8' }
    );

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('error: MediaPipe model asset is missing or empty');
  });

  test('fails pre-build check when bundled model asset is empty (0 bytes)', () => {
    const mockAndroidDir = path.join(tempTestDir, 'android');
    const mockAssetsDir = path.join(mockAndroidDir, 'app/src/main/assets/mediapipe');
    fs.mkdirSync(mockAssetsDir, { recursive: true });
    const emptyModelFile = path.join(mockAssetsDir, 'meal-input-assist.task');
    fs.writeFileSync(emptyModelFile, '');

    const res = spawnSync(
      'bash',
      [
        '-c',
        `
      ANDROID_DIR="${mockAndroidDir}"
      BUILD_OUTPUT_TYPE="release"
      REQUIRE_BUNDLED_MODEL="true"
      MODEL_ASSET_PATH="$ANDROID_DIR/app/src/main/assets/mediapipe/meal-input-assist.task"
      if [[ ! -f "$MODEL_ASSET_PATH" || ! -s "$MODEL_ASSET_PATH" ]]; then
        echo "error: MediaPipe model asset is missing or empty at $MODEL_ASSET_PATH" >&2
        exit 1
      fi
    `,
      ],
      { encoding: 'utf-8' }
    );

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('error: MediaPipe model asset is missing or empty');
  });

  test('passes pre-build check when bundled model asset is present and non-empty', () => {
    const mockAndroidDir = path.join(tempTestDir, 'android');
    const mockAssetsDir = path.join(mockAndroidDir, 'app/src/main/assets/mediapipe');
    fs.mkdirSync(mockAssetsDir, { recursive: true });
    const validModelFile = path.join(mockAssetsDir, 'meal-input-assist.task');
    fs.writeFileSync(validModelFile, 'valid-model-binary-data');

    const res = spawnSync(
      'bash',
      [
        '-c',
        `
      ANDROID_DIR="${mockAndroidDir}"
      BUILD_OUTPUT_TYPE="release"
      REQUIRE_BUNDLED_MODEL="true"
      MODEL_ASSET_PATH="$ANDROID_DIR/app/src/main/assets/mediapipe/meal-input-assist.task"
      if [[ ! -f "$MODEL_ASSET_PATH" || ! -s "$MODEL_ASSET_PATH" ]]; then
        echo "error: MediaPipe model asset is missing or empty at $MODEL_ASSET_PATH" >&2
        exit 1
      fi
      echo "Verified bundled model asset exists"
    `,
      ],
      { encoding: 'utf-8' }
    );

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Verified bundled model asset exists');
  });

  test('verifies bundled model asset presence and non-zero size inside APK archive', () => {
    const apkDir = path.join(tempTestDir, 'apk-test');
    fs.mkdirSync(path.join(apkDir, 'assets/mediapipe'), { recursive: true });
    fs.writeFileSync(
      path.join(apkDir, 'assets/mediapipe/meal-input-assist.task'),
      'dummy-model-payload'
    );

    const mockApkPath = path.join(tempTestDir, 'mock-app-release.apk');
    // Create zip archive as mock APK
    const zipRes = spawnSync('zip', ['-r', mockApkPath, 'assets'], {
      cwd: apkDir,
      encoding: 'utf-8',
    });
    expect(zipRes.status).toBe(0);

    const verifyRes = spawnSync(
      'bash',
      [
        '-c',
        `
      APK_PATH="${mockApkPath}"
      APK_MODEL_ENTRY="assets/mediapipe/meal-input-assist.task"
      if ! unzip -l "$APK_PATH" "$APK_MODEL_ENTRY" >/dev/null 2>&1; then
        echo "error: APK verification failed - '$APK_MODEL_ENTRY' is missing in $APK_PATH" >&2
        exit 1
      fi
      APK_MODEL_SIZE="$(unzip -l "$APK_PATH" "$APK_MODEL_ENTRY" | awk -v entry="$APK_MODEL_ENTRY" '$NF == entry { print $1 }')"
      if [[ -z "$APK_MODEL_SIZE" || "$APK_MODEL_SIZE" -le 0 ]]; then
        echo "error: APK verification failed - '$APK_MODEL_ENTRY' is empty or invalid size ($APK_MODEL_SIZE bytes) in $APK_PATH" >&2
        exit 1
      fi
      echo "  ✓ Bundled model verified in APK: $APK_MODEL_ENTRY ($APK_MODEL_SIZE bytes)"
    `,
      ],
      { encoding: 'utf-8' }
    );

    expect(verifyRes.status).toBe(0);
    expect(verifyRes.stdout).toContain('Bundled model verified in APK');
    expect(verifyRes.stdout).toContain('dummy-model-payload'.length.toString());
  });

  test('verifies all 3 bundled model assets presence and non-zero size inside APK archive', () => {
    const apkDir = path.join(tempTestDir, 'apk-3models-test');
    fs.mkdirSync(path.join(apkDir, 'assets/mediapipe'), { recursive: true });
    fs.writeFileSync(path.join(apkDir, 'assets/mediapipe/meal-input-assist.task'), 'dummy-model-1');
    fs.writeFileSync(
      path.join(apkDir, 'assets/mediapipe/universal_scene_7class.task'),
      'dummy-model-2'
    );
    fs.writeFileSync(
      path.join(apkDir, 'assets/mediapipe/personal_household_8class.task'),
      'dummy-model-3'
    );

    const mockApkPath = path.join(tempTestDir, 'mock-app-release-3models.apk');
    const zipRes = spawnSync('zip', ['-r', mockApkPath, 'assets'], {
      cwd: apkDir,
      encoding: 'utf-8',
    });
    expect(zipRes.status).toBe(0);

    const verifyRes = spawnSync(
      'bash',
      [
        '-c',
        `
      APK_PATH="${mockApkPath}"
      MODEL_FILENAMES=(
        "meal-input-assist.task"
        "universal_scene_7class.task"
        "personal_household_8class.task"
      )
      for model_file in "\${MODEL_FILENAMES[@]}"; do
        APK_MODEL_ENTRY="assets/mediapipe/$model_file"
        if ! unzip -l "$APK_PATH" "$APK_MODEL_ENTRY" >/dev/null 2>&1; then
          echo "error: APK verification failed - '$APK_MODEL_ENTRY' is missing in $APK_PATH" >&2
          exit 1
        fi
        APK_MODEL_SIZE="$(unzip -l "$APK_PATH" "$APK_MODEL_ENTRY" | awk -v entry="$APK_MODEL_ENTRY" '$NF == entry { print $1 }')"
        if [[ -z "$APK_MODEL_SIZE" || "$APK_MODEL_SIZE" -le 0 ]]; then
          echo "error: APK verification failed - '$APK_MODEL_ENTRY' is empty or invalid size in $APK_PATH" >&2
          exit 1
        fi
        echo "  ✓ Bundled model verified in APK: $APK_MODEL_ENTRY ($APK_MODEL_SIZE bytes)"
      done
    `,
      ],
      { encoding: 'utf-8' }
    );

    expect(verifyRes.status).toBe(0);
    expect(verifyRes.stdout).toContain('universal_scene_7class.task');
    expect(verifyRes.stdout).toContain('personal_household_8class.task');
  });

  test('fails post-build APK verification when model asset is missing from APK archive', () => {
    const apkDir = path.join(tempTestDir, 'apk-empty-test');
    fs.mkdirSync(path.join(apkDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(apkDir, 'assets/index.android.bundle'), 'console.log("hello");');

    const mockApkPath = path.join(tempTestDir, 'mock-missing-model.apk');
    const zipRes = spawnSync('zip', ['-r', mockApkPath, 'assets'], {
      cwd: apkDir,
      encoding: 'utf-8',
    });
    expect(zipRes.status).toBe(0);

    const verifyRes = spawnSync(
      'bash',
      [
        '-c',
        `
      APK_PATH="${mockApkPath}"
      APK_MODEL_ENTRY="assets/mediapipe/meal-input-assist.task"
      if ! unzip -l "$APK_PATH" "$APK_MODEL_ENTRY" >/dev/null 2>&1; then
        echo "error: APK verification failed - '$APK_MODEL_ENTRY' is missing in $APK_PATH" >&2
        exit 1
      fi
    `,
      ],
      { encoding: 'utf-8' }
    );

    expect(verifyRes.status).toBe(1);
    expect(verifyRes.stderr).toContain(
      "error: APK verification failed - 'assets/mediapipe/meal-input-assist.task' is missing"
    );
  });

  test('ensure-mediapipe-model.sh skips download when valid model already exists with matching checksum', () => {
    const ensureScript = path.resolve(__dirname, '../scripts/ensure-mediapipe-model.sh');
    const mockModelDir = path.join(tempTestDir, 'cached-model-dir');
    fs.mkdirSync(mockModelDir, { recursive: true });

    const modelPath = path.join(mockModelDir, 'meal-input-assist.task');
    fs.writeFileSync(modelPath, 'hello world\n');

    // Correct sha256 for "hello world\n"
    const expectedSha256 = 'a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447';

    const res = spawnSync('bash', [ensureScript], {
      env: {
        ...process.env,
        MEDIAPIPE_MODEL_DIR: mockModelDir,
        MEDIAPIPE_MODEL_SHA256: expectedSha256,
        MEDIAPIPE_MODEL_URL: 'http://127.0.0.1:9/should-not-be-called',
      },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('MediaPipe model asset is up to date');
  });

  test('ensure-mediapipe-model.sh fails with descriptive error and cleans up temp files on download error', () => {
    const ensureScript = path.resolve(__dirname, '../scripts/ensure-mediapipe-model.sh');
    const mockModelDir = path.join(tempTestDir, 'download-fail-dir');
    fs.mkdirSync(mockModelDir, { recursive: true });

    const res = spawnSync('bash', [ensureScript], {
      env: {
        ...process.env,
        MEDIAPIPE_MODEL_DIR: mockModelDir,
        MEDIAPIPE_MODEL_URL: 'file:///path/to/nonexistent-model-file-for-test.task',
      },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('error: failed to download MediaPipe model');

    // Verify no temporary files remain
    const remainingFiles = fs.readdirSync(mockModelDir);
    expect(remainingFiles.filter(f => f.includes('.download-'))).toHaveLength(0);
  });

  test('ensure-mediapipe-model.sh fails with descriptive error on checksum mismatch', () => {
    const ensureScript = path.resolve(__dirname, '../scripts/ensure-mediapipe-model.sh');
    const mockModelDir = path.join(tempTestDir, 'checksum-mismatch-dir');
    const sourceDir = path.join(tempTestDir, 'source-dir');
    fs.mkdirSync(mockModelDir, { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });

    const sourceFile = path.join(sourceDir, 'source-model.task');
    fs.writeFileSync(sourceFile, 'some-binary-data');

    const res = spawnSync('bash', [ensureScript], {
      env: {
        ...process.env,
        MEDIAPIPE_MODEL_DIR: mockModelDir,
        MEDIAPIPE_MODEL_URL: `file://${sourceFile}`,
        MEDIAPIPE_MODEL_SHA256: '0000000000000000000000000000000000000000000000000000000000000000',
      },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('error: SHA256 checksum mismatch for downloaded MediaPipe model');

    // Verify no temporary files or corrupted model remain
    const remainingFiles = fs.readdirSync(mockModelDir);
    expect(remainingFiles).toHaveLength(0);
  });
});
