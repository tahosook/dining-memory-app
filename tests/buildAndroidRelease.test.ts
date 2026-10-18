/// <reference types="node" />
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { MEDIAPIPE_CLASSIFIER_MODELS } from '../src/ai/mealInputAssist/modelConfig';

describe('build-android-release.sh and MediaPipe Model Bundling Verification', () => {
  const tempTestDir = path.resolve(__dirname, '../node_modules/.cache/build-script-test');
  const releaseScript = path.resolve(__dirname, '../scripts/build-android-release.sh');
  const ensureScript = path.resolve(__dirname, '../scripts/ensure-mediapipe-model.sh');

  beforeEach(() => {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
    fs.mkdirSync(tempTestDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  });

  const computeSha256Hex = (data: Buffer | string): string => {
    return crypto.createHash('sha256').update(data).digest('hex');
  };

  test('verifies SHA-256 constants consistency and model mapping across modelConfig, ensure-script, and build-script', () => {
    const ensureScriptContent = fs.readFileSync(ensureScript, 'utf-8');
    const releaseScriptContent = fs.readFileSync(releaseScript, 'utf-8');

    // 1. Model 1: meal-input-assist.task (cooking_method_9class)
    const expectedModel1Sha = MEDIAPIPE_CLASSIFIER_MODELS.cooking_method_9class.sha256;
    expect(ensureScriptContent).toMatch(
      new RegExp(`MODEL_1_FILE="meal-input-assist\\.task"[\\s\\S]*?${expectedModel1Sha}`)
    );
    expect(releaseScriptContent).toMatch(
      new RegExp(`"meal-input-assist\\.task"\\)[\\s\\S]*?${expectedModel1Sha}`)
    );

    // 2. Model 2: universal_scene_7class.task (universal_scene_7class)
    const expectedModel2Sha = MEDIAPIPE_CLASSIFIER_MODELS.universal_scene_7class.sha256;
    expect(ensureScriptContent).toMatch(
      new RegExp(`MODEL_2_FILE="universal_scene_7class\\.task"[\\s\\S]*?${expectedModel2Sha}`)
    );
    expect(releaseScriptContent).toMatch(
      new RegExp(`"universal_scene_7class\\.task"\\)[\\s\\S]*?${expectedModel2Sha}`)
    );

    // 3. Model 3: personal_household_8class.task (personal_household_8class)
    const expectedModel3Sha = MEDIAPIPE_CLASSIFIER_MODELS.personal_household_8class.sha256;
    expect(ensureScriptContent).toMatch(
      new RegExp(`MODEL_3_FILE="personal_household_8class\\.task"[\\s\\S]*?${expectedModel3Sha}`)
    );
    expect(releaseScriptContent).toMatch(
      new RegExp(`"personal_household_8class\\.task"\\)[\\s\\S]*?${expectedModel3Sha}`)
    );
  });

  test('verifies android/app/build.gradle verifyReleaseMediaPipeModelAsset task checks all 3 models and SHA-256 checksums', () => {
    const buildGradlePath = path.resolve(__dirname, '../android/app/build.gradle');
    const buildGradleContent = fs.readFileSync(buildGradlePath, 'utf-8');

    // Task must be registered
    expect(buildGradleContent).toContain('tasks.register("verifyReleaseMediaPipeModelAsset")');

    // All 3 models and expected SHA-256 checksums must be configured
    expect(buildGradleContent).toMatch(
      new RegExp(
        `name:\\s*"meal-input-assist\\.task"[\\s\\S]*?${MEDIAPIPE_CLASSIFIER_MODELS.cooking_method_9class.sha256}`
      )
    );
    expect(buildGradleContent).toMatch(
      new RegExp(
        `name:\\s*"universal_scene_7class\\.task"[\\s\\S]*?${MEDIAPIPE_CLASSIFIER_MODELS.universal_scene_7class.sha256}`
      )
    );
    expect(buildGradleContent).toMatch(
      new RegExp(
        `name:\\s*"personal_household_8class\\.task"[\\s\\S]*?${MEDIAPIPE_CLASSIFIER_MODELS.personal_household_8class.sha256}`
      )
    );

    // MessageDigest SHA-256 and checksum verification logic
    expect(buildGradleContent).toContain('MessageDigest.getInstance("SHA-256")');
    expect(buildGradleContent).toContain('SHA-256 checksum mismatch for bundled model');

    // mergeReleaseAssets must depend on verifyReleaseMediaPipeModelAsset
    expect(buildGradleContent).toMatch(
      /tasks\.matching\s*\{\s*it\.name\s*==\s*"mergeReleaseAssets"\s*\}\.configureEach\s*\{\s*dependsOn\s*"verifyReleaseMediaPipeModelAsset"\s*\}/
    );
  });

  interface MockEnvOptions {
    preBuildAssetOverrides?: {
      [filename: string]: { content?: string; delete?: boolean };
    };
    apkAssetOverrides?: {
      [filename: string]: { content?: string; delete?: boolean };
    };
    skipApkCreation?: boolean;
  }

  const setupMockBuildEnvironment = (testCaseDir: string, options: MockEnvOptions = {}) => {
    const mockAndroidDir = path.join(testCaseDir, 'android');
    const mockAssetsDir = path.join(mockAndroidDir, 'app/src/main/assets/mediapipe');
    const mockArtifactDir = path.join(testCaseDir, 'artifacts');
    fs.mkdirSync(mockAssetsDir, { recursive: true });
    fs.mkdirSync(mockArtifactDir, { recursive: true });

    // Dummy payloads for the 3 models
    const dummyPayloads: Record<string, string> = {
      'meal-input-assist.task': 'test-dummy-binary-content-for-model-1',
      'universal_scene_7class.task': 'test-dummy-binary-content-for-model-2',
      'personal_household_8class.task': 'test-dummy-binary-content-for-model-3',
    };

    const expectedHashes: Record<string, string> = {};
    for (const [filename, payload] of Object.entries(dummyPayloads)) {
      expectedHashes[filename] = computeSha256Hex(payload);
    }

    // Write pre-build assets
    for (const [filename, defaultPayload] of Object.entries(dummyPayloads)) {
      const override = options.preBuildAssetOverrides?.[filename];
      if (override?.delete) {
        continue;
      }
      const content = override?.content !== undefined ? override.content : defaultPayload;
      fs.writeFileSync(path.join(mockAssetsDir, filename), content);
    }

    // Mock ensure-mediapipe-model.sh that succeeds without downloading
    const mockEnsureScript = path.join(testCaseDir, 'mock-ensure.sh');
    fs.writeFileSync(
      mockEnsureScript,
      '#!/usr/bin/env bash\necho "mock ensure-mediapipe-model ok"\n'
    );
    fs.chmodSync(mockEnsureScript, 0o755);

    // Mock gradlew script that builds a fake app-release.apk zip archive containing requested assets
    const mockGradlew = path.join(mockAndroidDir, 'gradlew');
    const mockApkOutputDir = path.join(mockAndroidDir, 'app/build/outputs/apk/release');
    const mockApkStagingDir = path.join(testCaseDir, 'apk-staging');
    const mockApkAssetsDir = path.join(mockApkStagingDir, 'assets/mediapipe');
    fs.mkdirSync(mockApkAssetsDir, { recursive: true });

    if (!options.skipApkCreation) {
      for (const [filename, defaultPayload] of Object.entries(dummyPayloads)) {
        const override = options.apkAssetOverrides?.[filename];
        if (override?.delete) {
          continue;
        }
        const content = override?.content !== undefined ? override.content : defaultPayload;
        fs.writeFileSync(path.join(mockApkAssetsDir, filename), content);
      }
    }

    const gradlewScriptContent = `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "${mockApkOutputDir}"
echo '{"version": 1}' > "${mockApkOutputDir}/output-metadata.json"
${
  options.skipApkCreation
    ? 'echo "skipping APK creation as requested"'
    : `(cd "${mockApkStagingDir}" && zip -qr "${mockApkOutputDir}/app-release.apk" assets)`
}
`;
    fs.writeFileSync(mockGradlew, gradlewScriptContent);
    fs.chmodSync(mockGradlew, 0o755);

    const baseEnv = {
      ...process.env,
      ROOT_DIR: testCaseDir,
      ANDROID_DIR: mockAndroidDir,
      ENSURE_MEDIAPIPE_MODEL_SCRIPT: mockEnsureScript,
      ANDROID_BUILD_ARTIFACT_DIR: mockArtifactDir,
      BUILD_ANDROID_OUTPUT_TYPE: 'release',
      REQUIRE_BUNDLED_MODEL: 'true',
      MEDIAPIPE_MODEL_SHA256: expectedHashes['meal-input-assist.task'],
      MEDIAPIPE_UNIVERSAL_MODEL_SHA256: expectedHashes['universal_scene_7class.task'],
      MEDIAPIPE_PERSONAL_MODEL_SHA256: expectedHashes['personal_household_8class.task'],
    };

    return {
      mockAndroidDir,
      mockArtifactDir,
      expectedHashes,
      baseEnv,
    };
  };

  test('successfully executes full build-android-release.sh with pre-build and post-build APK SHA-256 verification', () => {
    const testCaseDir = path.join(tempTestDir, 'full-success-test');
    const { baseEnv, mockArtifactDir } = setupMockBuildEnvironment(testCaseDir);

    const res = spawnSync('bash', [releaseScript], {
      env: baseEnv,
      encoding: 'utf-8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Ensuring and verifying bundled MediaPipe model assets...');
    expect(res.stdout).toContain('Verified bundled model asset exists and matches checksum');
    expect(res.stdout).toContain('Verifying bundled MediaPipe model assets inside APK...');
    expect(res.stdout).toContain(
      'Bundled model verified in APK: assets/mediapipe/meal-input-assist.task'
    );
    expect(res.stdout).toContain(
      'Bundled model verified in APK: assets/mediapipe/universal_scene_7class.task'
    );
    expect(res.stdout).toContain(
      'Bundled model verified in APK: assets/mediapipe/personal_household_8class.task'
    );
    expect(res.stdout).toContain('Build complete.');

    // Verify artifact files were created
    expect(fs.existsSync(path.join(mockArtifactDir, 'app-release.apk'))).toBe(true);
    expect(fs.existsSync(path.join(mockArtifactDir, 'app-release.apk.sha256'))).toBe(true);
  });

  test('build-android-release.sh fails pre-build check when bundled model asset is missing', () => {
    const testCaseDir = path.join(tempTestDir, 'prebuild-missing-test');
    const { baseEnv } = setupMockBuildEnvironment(testCaseDir, {
      preBuildAssetOverrides: {
        'meal-input-assist.task': { delete: true },
      },
    });

    const res = spawnSync('bash', [releaseScript], {
      env: baseEnv,
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('error: MediaPipe model asset is missing or empty');
    expect(res.stderr).toContain('meal-input-assist.task');
  });

  test('build-android-release.sh fails pre-build check when bundled model asset is empty (0 bytes)', () => {
    const testCaseDir = path.join(tempTestDir, 'prebuild-empty-test');
    const { baseEnv } = setupMockBuildEnvironment(testCaseDir, {
      preBuildAssetOverrides: {
        'universal_scene_7class.task': { content: '' },
      },
    });

    const res = spawnSync('bash', [releaseScript], {
      env: baseEnv,
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('error: MediaPipe model asset is missing or empty');
    expect(res.stderr).toContain('universal_scene_7class.task');
  });

  test('build-android-release.sh fails pre-build check when bundled model asset has mismatched SHA-256 checksum', () => {
    const testCaseDir = path.join(tempTestDir, 'prebuild-corrupt-test');
    const { baseEnv } = setupMockBuildEnvironment(testCaseDir, {
      preBuildAssetOverrides: {
        'personal_household_8class.task': { content: 'unexpected-tampered-content' },
      },
    });

    const res = spawnSync('bash', [releaseScript], {
      env: baseEnv,
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain(
      'error: SHA256 checksum mismatch for bundled model personal_household_8class.task'
    );
  });

  test('build-android-release.sh fails post-build check when expected model asset is missing from APK archive', () => {
    const testCaseDir = path.join(tempTestDir, 'postbuild-missing-in-apk-test');
    const { baseEnv } = setupMockBuildEnvironment(testCaseDir, {
      apkAssetOverrides: {
        'meal-input-assist.task': { delete: true },
      },
    });

    const res = spawnSync('bash', [releaseScript], {
      env: baseEnv,
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain(
      "error: APK verification failed - 'assets/mediapipe/meal-input-assist.task' is missing"
    );
  });

  test('build-android-release.sh fails post-build check when model inside APK has mismatched SHA-256 checksum', () => {
    const testCaseDir = path.join(tempTestDir, 'postbuild-corrupt-in-apk-test');
    const { baseEnv } = setupMockBuildEnvironment(testCaseDir, {
      apkAssetOverrides: {
        'universal_scene_7class.task': { content: 'corrupted-inside-apk' },
      },
    });

    const res = spawnSync('bash', [releaseScript], {
      env: baseEnv,
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain(
      "error: APK verification failed - SHA256 checksum mismatch for 'assets/mediapipe/universal_scene_7class.task'"
    );
  });

  test('ensure-mediapipe-model.sh skips download when valid model already exists with matching checksum', () => {
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
