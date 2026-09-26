/// <reference types="node" />
import fs from 'fs';
import { spawnSync, execSync } from 'child_process';
import path from 'path';

describe('verify-pr-gates.sh Evidence Gate and Machine Gates', () => {
  const scriptPath = path.resolve(__dirname, '../scripts/verify-pr-gates.sh');

  function runGate(args: string[] = [], env: Record<string, string> = {}) {
    return spawnSync('bash', [scriptPath, ...args], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, ...env },
      encoding: 'utf-8',
    });
  }

  const validProblem = '### 具体的な問題 (Problem)\nIssue description here';
  const validEvidence =
    '### 客観的証拠 (Evidence)\nBenchmark shows 45ms -> 12ms, test passing.';
  const validImpact = '### 期待される効果 (Expected Impact)\nReduced latency.';
  const validOutOfScope =
    '### 意図して変更しなかったこと (Out of Scope)\nNo database schema changes.';

  const fullValidBody = [
    validProblem,
    validEvidence,
    validImpact,
    validOutOfScope,
  ].join('\n\n');

  it('1. Evidenceあり -> PASS', () => {
    const res = runGate(['HEAD~1...HEAD', '--pr-body', fullValidBody]);
    expect(res.stdout).toContain('PR body Evidence Gate passed');
    expect(res.status).toBe(0);
  });

  it('2. Evidenceセクションなし -> FAIL', () => {
    const bodyWithoutEvidence = [
      validProblem,
      validImpact,
      validOutOfScope,
    ].join('\n\n');
    const res = runGate(['HEAD~1...HEAD', '--pr-body', bodyWithoutEvidence]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('PR body is missing mandatory section(s)');
    expect(res.stderr).toContain('### 客観的証拠 (Evidence)');
  });

  it('3. Evidenceが空 -> FAIL', () => {
    const bodyWithEmptyEvidence = [
      validProblem,
      '### 客観的証拠 (Evidence)\n',
      validImpact,
      validOutOfScope,
    ].join('\n\n');
    const res = runGate(['HEAD~1...HEAD', '--pr-body', bodyWithEmptyEvidence]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Evidence section in PR body is empty');
  });

  it('4. EvidenceがHTMLコメントだけ -> FAIL', () => {
    const bodyWithHtmlCommentOnly = [
      validProblem,
      '### 客観的証拠 (Evidence)\n<!-- 失敗するテストログ、実測ベンチマークなど -->',
      validImpact,
      validOutOfScope,
    ].join('\n\n');
    const res = runGate(['HEAD~1...HEAD', '--pr-body', bodyWithHtmlCommentOnly]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(
      'Evidence section in PR body is empty (or contains only HTML comments)'
    );
  });

  it('5. EvidenceがTODO/TBD/N/Aだけ -> FAIL', () => {
    for (const placeholder of [
      'TODO',
      'TBD',
      'N/A',
      'NA',
      '-',
      'none',
      'なし',
    ]) {
      const bodyWithPlaceholder = [
        validProblem,
        `### 客観的証拠 (Evidence)\n${placeholder}`,
        validImpact,
        validOutOfScope,
      ].join('\n\n');
      const res = runGate(['HEAD~1...HEAD', '--pr-body', bodyWithPlaceholder]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain(
        'Evidence section contains only a placeholder'
      );
    }
  });

  it('6. Feature/Spec + Issue/Spec参照 -> PASS', () => {
    const featureSpecBody = [
      validProblem,
      '### 客観的証拠 (Evidence)\n- Specifications per docs/issues/issue-13-mediapipe-remote-model-pipeline.md\n- Acceptance criteria in GitHub Issue #120 verified.',
      validImpact,
      validOutOfScope,
    ].join('\n\n');
    const res = runGate(['HEAD~1...HEAD', '--pr-body', featureSpecBody]);
    expect(res.stdout).toContain('PR body Evidence Gate passed');
    expect(res.status).toBe(0);
  });

  it('7. 既存の4つのMachine Gateが従来どおり動作する (ゼロ差分ブロック)', () => {
    const res = runGate(['HEAD...HEAD', '--pr-body', fullValidBody]);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('Zero diff detected');
  });

  it('8. 通常の有効なPR本文 (環境変数経由) -> PASS', () => {
    const res = runGate(['HEAD~1...HEAD'], { PR_BODY: fullValidBody });
    expect(res.stdout).toContain('PR body Evidence Gate passed');
    expect(res.stdout).toContain(
      'All PR machine gates passed successfully for HEAD~1...HEAD'
    );
    expect(res.status).toBe(0);
  });

  it('9. 見出し柔軟性 (## 見出し、ナンバリング付き、英語単体) -> PASS', () => {
    // 9a. Level 2 headings
    const level2Body = [
      '## 具体的な問題 (Problem)\nIssue description',
      '## 客観的証拠 (Evidence)\nBenchmark 10ms -> 2ms',
      '## 期待される効果 (Expected Impact)\nFaster',
      '## 意図して変更しなかったこと (Out of Scope)\nNone',
    ].join('\n\n');
    const res2 = runGate(['HEAD~1...HEAD', '--pr-body', level2Body]);
    expect(res2.status).toBe(0);
    expect(res2.stdout).toContain('PR body Evidence Gate passed');

    // 9b. Numbered headings
    const numberedBody = [
      '### 1. 具体的な問題 (Problem)\nIssue description',
      '### 2. 客観的証拠 (Evidence)\nBenchmark 10ms -> 2ms',
      '### 3. 期待される効果 (Expected Impact)\nFaster',
      '### 4. 意図して変更しなかったこと (Out of Scope)\nNone',
    ].join('\n\n');
    const resNumbered = runGate(['HEAD~1...HEAD', '--pr-body', numberedBody]);
    expect(resNumbered.status).toBe(0);
    expect(resNumbered.stdout).toContain('PR body Evidence Gate passed');

    // 9c. English headings
    const englishBody = [
      '### Problem\nIssue description',
      '### Evidence\nBenchmark 10ms -> 2ms',
      '### Expected Impact\nFaster',
      '### Out of Scope\nNone',
    ].join('\n\n');
    const resEnglish = runGate(['HEAD~1...HEAD', '--pr-body', englishBody]);
    expect(resEnglish.status).toBe(0);
    expect(resEnglish.stdout).toContain('PR body Evidence Gate passed');
  });
});

describe('verify-pr-gates.sh Machine Gates (Isolated Git Repository)', () => {
  const scriptPath = path.resolve(__dirname, '../scripts/verify-pr-gates.sh');
  const testRepoDir = path.resolve(
    __dirname,
    '../node_modules/.cache/gate-test-repo'
  );

  function runInTestRepo(args: string[] = []) {
    return spawnSync('bash', [scriptPath, ...args], {
      cwd: testRepoDir,
      encoding: 'utf-8',
    });
  }

  function execGit(cmd: string) {
    return execSync(cmd, { cwd: testRepoDir, stdio: 'pipe', encoding: 'utf-8' });
  }

  const validBody = [
    '### 具体的な問題 (Problem)\nIssue description',
    '### 客観的証拠 (Evidence)\nTest verified',
    '### 期待される効果 (Expected Impact)\nImpact',
    '### 意図して変更しなかったこと (Out of Scope)\nNone',
  ].join('\n\n');

  let initialCommit = '';

  beforeAll(() => {
    fs.rmSync(testRepoDir, { recursive: true, force: true });
    fs.mkdirSync(testRepoDir, { recursive: true });
    execGit('git init -b main');
    execGit('git config user.name "GateTester"');
    execGit('git config user.email "gatetester@example.com"');
    fs.mkdirSync(path.join(testRepoDir, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(testRepoDir, 'src_file.ts'),
      'export const initial = 1;\n'
    );
    fs.writeFileSync(
      path.join(testRepoDir, 'tests/sample.test.ts'),
      'test("ok", () => {});\n'
    );
    execGit('git add .');
    execGit('git commit -m "initial commit"');
    initialCommit = execGit('git rev-parse HEAD').trim();
  });

  afterAll(() => {
    fs.rmSync(testRepoDir, { recursive: true, force: true });
  });

  afterEach(() => {
    execGit('git checkout main');
    execGit(`git reset --hard ${initialCommit}`);
    execGit('git clean -fd');
  });

  it('any 拡張検知: 配列・ジェネリクス・プロミス・レコード・旧式キャストをブロックする', () => {
    const anyWord = 'any';
    const patterns = [
      `export const a: ${anyWord} = 1;`,
      `export const b = 1 as ${anyWord};`,
      `export const c: ${anyWord}[] = [];`,
      `export const d: Array<${anyWord}> = [];`,
      `export async function e(): Promise<${anyWord}> { return 1; }`,
      `export const f: Record<string, ${anyWord}> = {};`,
      `export const g = <${anyWord}>1;`,
    ];

    for (const pat of patterns) {
      fs.writeFileSync(path.join(testRepoDir, 'src_file.ts'), pat + '\n');
      execGit('git add src_file.ts');
      execGit('git commit -m "add any test"');

      const res = runInTestRepo(['HEAD~1...HEAD', '--pr-body', validBody]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain(
        "New 'any' type annotation, generic, array, or cast detected"
      );

      execGit('git reset --hard HEAD~1');
    }
  });

  it('エスケープハッチ検知: ts-ignore, ts-nocheck, eslint 抑止コメントをブロックする', () => {
    const escapes = [
      `// @ts-${'ignore'}\nexport const a = 1;`,
      `// @ts-${'nocheck'}\nexport const b = 1;`,
      `/* eslint-${'disable'} */\nexport const c = 1;`,
    ];

    for (const esc of escapes) {
      fs.writeFileSync(path.join(testRepoDir, 'src_file.ts'), esc + '\n');
      execGit('git add src_file.ts');
      execGit('git commit -m "add escape hatch"');

      const res = runInTestRepo(['HEAD~1...HEAD', '--pr-body', validBody]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain('Escape hatch comment detected');

      execGit('git reset --hard HEAD~1');
    }
  });

  it('テスト保護: tests/ 配下のテストファイル削除をブロックする', () => {
    fs.unlinkSync(path.join(testRepoDir, 'tests/sample.test.ts'));
    execGit('git add tests/sample.test.ts');
    execGit('git commit -m "delete test"');

    const res = runInTestRepo(['HEAD~1...HEAD', '--pr-body', validBody]);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('Deleted test file(s) detected in tests/');
  });

  it('テスト弱体化検知: skip / xit をブロックする', () => {
    const skipWord = 'skip';
    const skipPatterns = [
      `it.${skipWord}("test", () => {});`,
      `test.${skipWord}("test", () => {});`,
      `describe.${skipWord}("suite", () => {});`,
      `x${'it'}("test", () => {});`,
      `x${'describe'}("suite", () => {});`,
    ];

    for (const skipPat of skipPatterns) {
      fs.writeFileSync(
        path.join(testRepoDir, 'tests/sample.test.ts'),
        skipPat + '\n'
      );
      execGit('git add tests/sample.test.ts');
      execGit('git commit -m "add skip test"');

      const res = runInTestRepo(['HEAD~1...HEAD', '--pr-body', validBody]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain(
        'Test skipping / weakening detected in tests/'
      );

      execGit('git reset --hard HEAD~1');
    }
  });
});
