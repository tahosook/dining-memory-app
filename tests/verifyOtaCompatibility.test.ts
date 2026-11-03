import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('verify-ota-compatibility.sh', () => {
  const scriptPath = path.resolve(__dirname, '../scripts/verify-ota-compatibility.sh');
  const tempBaseDir = path.resolve(__dirname, '../node_modules/.cache/verify-ota-test');

  beforeAll(() => {
    fs.rmSync(tempBaseDir, { recursive: true, force: true });
    fs.mkdirSync(tempBaseDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempBaseDir, { recursive: true, force: true });
  });

  function setupTestRepo(testName: string) {
    const repoDir = path.join(tempBaseDir, testName);
    fs.mkdirSync(repoDir, { recursive: true });

    // Initialize git
    spawnSync('git', ['init', '-b', 'main'], { cwd: repoDir, encoding: 'utf-8' });
    spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir, encoding: 'utf-8' });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], {
      cwd: repoDir,
      encoding: 'utf-8',
    });

    // Create directories
    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(repoDir, 'android/app/src/main/res/values'), { recursive: true });

    // Create initial baseline files
    fs.writeFileSync(
      path.join(repoDir, 'app.json'),
      JSON.stringify({ expo: { name: 'dining-memory', runtimeVersion: '1.0.0' } }, null, 2)
    );
    fs.writeFileSync(
      path.join(repoDir, 'android/app/src/main/res/values/strings.xml'),
      '<resources><string name="expo_runtime_version">1.0.0</string></resources>'
    );
    fs.writeFileSync(
      path.join(repoDir, 'package.json'),
      JSON.stringify(
        {
          name: 'dining-memory',
          version: '1.0.0',
          dependencies: {
            react: '18.3.1',
            'react-native': '0.76.7',
            expo: '~52.0.0',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(path.join(repoDir, 'src/App.tsx'), 'export const App = () => null;\n');

    // Initial commit
    spawnSync('git', ['add', '.'], { cwd: repoDir, encoding: 'utf-8' });
    spawnSync('git', ['commit', '-m', 'initial commit'], { cwd: repoDir, encoding: 'utf-8' });

    return repoDir;
  }

  test('fails when working tree has uncommitted changes without --allow-dirty', () => {
    const repoDir = setupTestRepo('dirty-test');
    fs.writeFileSync(path.join(repoDir, 'src/App.tsx'), '// modified uncommitted\n');

    const res = spawnSync('bash', [scriptPath], {
      cwd: repoDir,
      env: { ...process.env, ROOT_DIR: repoDir },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Working tree has uncommitted changes');
  });

  test('passes with --allow-dirty when working tree has uncommitted pure JS changes', () => {
    const repoDir = setupTestRepo('allow-dirty-test');
    fs.writeFileSync(path.join(repoDir, 'src/App.tsx'), '// modified uncommitted pure JS\n');

    const res = spawnSync('bash', [scriptPath, '--allow-dirty', '--base', 'HEAD'], {
      cwd: repoDir,
      env: { ...process.env, ROOT_DIR: repoDir },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('OTA compatibility check passed');
  });

  test('fails when app.json and strings.xml runtimeVersion do not match', () => {
    const repoDir = setupTestRepo('runtime-mismatch-test');
    fs.writeFileSync(
      path.join(repoDir, 'android/app/src/main/res/values/strings.xml'),
      '<resources><string name="expo_runtime_version">2.0.0</string></resources>'
    );
    spawnSync('git', ['commit', '-am', 'bump native string'], { cwd: repoDir, encoding: 'utf-8' });

    const res = spawnSync('bash', [scriptPath, '--base', 'HEAD~1'], {
      cwd: repoDir,
      env: { ...process.env, ROOT_DIR: repoDir },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('runtimeVersion mismatch');
  });

  test('passes when only pure JS files (src/*) are changed and committed', () => {
    const repoDir = setupTestRepo('pure-js-test');
    fs.writeFileSync(path.join(repoDir, 'src/App.tsx'), 'export const App = () => "updated";\n');
    spawnSync('git', ['commit', '-am', 'update App component'], {
      cwd: repoDir,
      encoding: 'utf-8',
    });

    const res = spawnSync('bash', [scriptPath, '--base', 'HEAD~1'], {
      cwd: repoDir,
      env: { ...process.env, ROOT_DIR: repoDir },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain(
      'No native changes detected. All diffs are safe JS/TS logic or assets.'
    );
    expect(res.stdout).toContain('OTA compatibility check passed');
  });

  test('fails when native android directory files are changed', () => {
    const repoDir = setupTestRepo('native-android-change-test');
    fs.writeFileSync(path.join(repoDir, 'android/app/build.gradle'), '// modified gradle\n');
    spawnSync('git', ['add', '.'], { cwd: repoDir, encoding: 'utf-8' });
    spawnSync('git', ['commit', '-m', 'modify build.gradle'], { cwd: repoDir, encoding: 'utf-8' });

    const res = spawnSync('bash', [scriptPath, '--base', 'HEAD~1'], {
      cwd: repoDir,
      env: { ...process.env, ROOT_DIR: repoDir },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Native-sensitive files were modified');
    expect(res.stderr).toContain('android/app/build.gradle');
  });

  test('fails when static native configuration files (e.g. babel.config.js, eas.json) are changed', () => {
    const repoDir = setupTestRepo('static-config-test');
    fs.writeFileSync(path.join(repoDir, 'eas.json'), '{"build": {}}\n');
    spawnSync('git', ['add', '.'], { cwd: repoDir, encoding: 'utf-8' });
    spawnSync('git', ['commit', '-m', 'add eas.json'], { cwd: repoDir, encoding: 'utf-8' });

    const res = spawnSync('bash', [scriptPath, '--base', 'HEAD~1'], {
      cwd: repoDir,
      env: { ...process.env, ROOT_DIR: repoDir },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Native-sensitive files were modified');
    expect(res.stderr).toContain('eas.json');
  });

  test('fails when native dependency is added or modified in package.json', () => {
    const repoDir = setupTestRepo('native-dep-test');
    fs.writeFileSync(
      path.join(repoDir, 'package.json'),
      JSON.stringify(
        {
          name: 'dining-memory',
          version: '1.0.0',
          dependencies: {
            react: '18.3.1',
            'react-native': '0.76.7',
            expo: '~52.0.0',
            'expo-camera': '~16.0.0',
          },
        },
        null,
        2
      )
    );
    spawnSync('git', ['commit', '-am', 'add expo-camera'], { cwd: repoDir, encoding: 'utf-8' });

    const res = spawnSync('bash', [scriptPath, '--base', 'HEAD~1'], {
      cwd: repoDir,
      env: { ...process.env, ROOT_DIR: repoDir },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Native dependency changes detected in package.json');
  });

  test('passes when pure JS dependency is modified in package.json', () => {
    const repoDir = setupTestRepo('pure-js-dep-test');
    fs.writeFileSync(
      path.join(repoDir, 'package.json'),
      JSON.stringify(
        {
          name: 'dining-memory',
          version: '1.0.0',
          dependencies: {
            react: '18.3.1',
            'react-native': '0.76.7',
            expo: '~52.0.0',
            piexifjs: '^1.0.6',
          },
        },
        null,
        2
      )
    );
    spawnSync('git', ['commit', '-am', 'add piexifjs'], { cwd: repoDir, encoding: 'utf-8' });

    const res = spawnSync('bash', [scriptPath, '--base', 'HEAD~1'], {
      cwd: repoDir,
      env: { ...process.env, ROOT_DIR: repoDir },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('OTA compatibility check passed');
  });
});
