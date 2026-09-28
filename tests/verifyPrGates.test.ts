/// <reference types="node" />
import fs from 'fs';
import { spawnSync, execSync } from 'child_process';
import path from 'path';

describe('verify-pr-gates.sh Machine Gates and Evidence Gate', () => {
  const scriptPath = path.resolve(__dirname, '../scripts/verify-pr-gates.sh');
  const testRepoDir = path.resolve(
    __dirname,
    '../node_modules/.cache/gate-test-repo'
  );

  function runGate(args: string[] = [], env: Record<string, string> = {}) {
    return spawnSync('bash', [scriptPath, ...args], {
      cwd: testRepoDir,
      env: { ...process.env, ...env },
      encoding: 'utf-8',
    });
  }

  function execGit(cmd: string) {
    return execSync(cmd, { cwd: testRepoDir, stdio: 'pipe', encoding: 'utf-8' });
  }

  let baseCommit = '';

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

  beforeAll(() => {
    fs.rmSync(testRepoDir, { recursive: true, force: true });
    fs.mkdirSync(testRepoDir, { recursive: true });
    execGit('git init -b main');
    execGit('git config user.name "GateTester"');
    execGit('git config user.email "gatetester@example.com"');

    // Commit 1: initial empty baseline
    fs.writeFileSync(path.join(testRepoDir, 'init.txt'), 'init\n');
    execGit('git add .');
    execGit('git commit -m "initial commit"');

    // Commit 2: valid non-zero diff with a source and test file
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
    execGit('git commit -m "baseline files"');
    baseCommit = execGit('git rev-parse HEAD').trim();
  });

  afterAll(() => {
    fs.rmSync(testRepoDir, { recursive: true, force: true });
  });

  afterEach(() => {
    execGit('git checkout main');
    execGit(`git reset --hard ${baseCommit}`);
    execGit('git clean -fd');
  });

  describe('PR body Evidence Gate', () => {
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
      const res = runGate([
        'HEAD~1...HEAD',
        '--pr-body',
        bodyWithHtmlCommentOnly,
      ]);
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
        const res = runGate([
          'HEAD~1...HEAD',
          '--pr-body',
          bodyWithPlaceholder,
        ]);
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

    it('7. 通常の有効なPR本文 (環境変数経由) -> PASS', () => {
      const res = runGate(['HEAD~1...HEAD'], { PR_BODY: fullValidBody });
      expect(res.stdout).toContain('PR body Evidence Gate passed');
      expect(res.stdout).toContain(
        'All PR machine gates passed successfully for HEAD~1...HEAD'
      );
      expect(res.status).toBe(0);
    });

    it('8. 見出し柔軟性 (## 見出し、ナンバリング付き、英語単体) -> PASS', () => {
      const level2Body = [
        '## 具体的な問題 (Problem)\nIssue description',
        '## 客観的証拠 (Evidence)\nBenchmark 10ms -> 2ms',
        '## 期待される効果 (Expected Impact)\nFaster',
        '## 意図して変更しなかったこと (Out of Scope)\nNone',
      ].join('\n\n');
      const res2 = runGate(['HEAD~1...HEAD', '--pr-body', level2Body]);
      expect(res2.status).toBe(0);
      expect(res2.stdout).toContain('PR body Evidence Gate passed');

      const numberedBody = [
        '### 1. 具体的な問題 (Problem)\nIssue description',
        '### 2. 客観的証拠 (Evidence)\nBenchmark 10ms -> 2ms',
        '### 3. 期待される効果 (Expected Impact)\nFaster',
        '### 4. 意図して変更しなかったこと (Out of Scope)\nNone',
      ].join('\n\n');
      const resNumbered = runGate(['HEAD~1...HEAD', '--pr-body', numberedBody]);
      expect(resNumbered.status).toBe(0);
      expect(resNumbered.stdout).toContain('PR body Evidence Gate passed');

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

    it('9. 見出し柔軟性 (日本語単体見出し) -> PASS', () => {
      const pureJapaneseBody = [
        '### 具体的な問題\nバグが存在する',
        '### 客観的証拠\n実測値 100ms -> 15ms、テスト PASS',
        '### 期待される効果\n処理速度の向上',
        '### 意図して変更しなかったこと\nDBスキーマの変更',
      ].join('\n\n');
      const res = runGate(['HEAD~1...HEAD', '--pr-body', pureJapaneseBody]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('PR body Evidence Gate passed');
    });

    it('10. 見出し柔軟性 (エージェント形式: What/Why/Measured Improvement/Verification) -> PASS', () => {
      const julesVerificationBody = [
        '## 💡 What\nFix accessibility for stats buttons',
        '## 🔍 Verification\nVerified with screen reader and automated smoke test',
        '## 🎯 Why\nImproves usability for visually impaired users',
        '## Out of Scope\nUI redesign',
      ].join('\n\n');
      const res1 = runGate(['HEAD~1...HEAD', '--pr-body', julesVerificationBody]);
      expect(res1.status).toBe(0);
      expect(res1.stdout).toContain('PR body Evidence Gate passed');

      const julesPerfBody = [
        '## 💡 What\nOptimize file copy in BackupService',
        '## 📊 Measured Improvement\nBackup export time reduced by 60% with chunked parallel copy',
        '## 🎯 Why\nFaster exports for large datasets',
        '## Non-Goals\nRefactoring compression logic',
      ].join('\n\n');
      const res2 = runGate(['HEAD~1...HEAD', '--pr-body', julesPerfBody]);
      expect(res2.status).toBe(0);
      expect(res2.stdout).toContain('PR body Evidence Gate passed');
    });

    it('11. ドメイン名詞 (Accessibility 単体など) は Evidence とみなされず FAIL', () => {
      const misleadingBody = [
        '## 💡 What\nAdd accessibility features',
        '## ♿ Accessibility\nSome generic accessibility notes without explicit verification',
        '## 🎯 Why\nBetter UX',
        '## Out of Scope\nNone',
      ].join('\n\n');
      const res = runGate(['HEAD~1...HEAD', '--pr-body', misleadingBody]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('PR body is missing mandatory section(s)');
      expect(res.stderr).toContain('### 客観的証拠 (Evidence)');
    });

    it('12. ドメイン名詞 (Accessibility 単体など) は Out of Scope とみなされず FAIL', () => {
      const misleadingBody = [
        '## 💡 What\nAdd accessibility features',
        '## 🔍 Verification\nTested and verified with test suite passing',
        '## 🎯 Why\nBetter UX',
        '## ♿ Accessibility\nSome generic accessibility notes without explicit out of scope',
      ].join('\n\n');
      const res = runGate(['HEAD~1...HEAD', '--pr-body', misleadingBody]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('PR body is missing mandatory section(s)');
      expect(res.stderr).toContain('### 意図して変更しなかったこと (Out of Scope)');
    });

    it('13. 正規の Out of Scope セクション (Out of Scope / Non-Goals / 意図して変更しなかったこと) は通る -> PASS', () => {
      for (const heading of [
        '### 意図して変更しなかったこと (Out of Scope)',
        '## Out of Scope',
        '## Non-Goals',
        '### 意図して変更しなかったこと',
        '### スコープ外',
      ]) {
        const bodyWithOutOfScope = [
          validProblem,
          validEvidence,
          validImpact,
          `${heading}\nNo database schema or migration changes.`,
        ].join('\n\n');
        const res = runGate(['HEAD~1...HEAD', '--pr-body', bodyWithOutOfScope]);
        expect(res.status).toBe(0);
        expect(res.stdout).toContain('PR body Evidence Gate passed');
      }
    });

    it('14. 正規の Evidence セクション (客観的証拠 / Evidence / Verification / Measured Improvement / Benchmark) は通る -> PASS', () => {
      for (const heading of [
        '### 客観的証拠 (Evidence)',
        '## 🔍 Verification',
        '## 📊 Measured Improvement',
        '### Benchmark',
        '### 証拠',
      ]) {
        const bodyWithEvidence = [
          validProblem,
          `${heading}\nBenchmark results show 45ms -> 12ms, 100% test coverage.`,
          validImpact,
          validOutOfScope,
        ].join('\n\n');
        const res = runGate(['HEAD~1...HEAD', '--pr-body', bodyWithEvidence]);
        expect(res.status).toBe(0);
        expect(res.stdout).toContain('PR body Evidence Gate passed');
      }
    });

    it('15. 意味の違う見出し (Architecture / Summary / Notes など) は alias として誤認識されず FAIL', () => {
      const unrelatedHeadingBody = [
        '## Architecture\nOverview of system architecture',
        '## Summary\nOverall summary of changes',
        '## Notes\nAdditional design notes',
        '## Future Work\nFuture plans',
      ].join('\n\n');
      const res = runGate(['HEAD~1...HEAD', '--pr-body', unrelatedHeadingBody]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('PR body is missing mandatory section(s)');
    });
  });

  describe('Machine Code Gates', () => {
    it('ゼロ差分ブロック: 差分がない場合は exit 1', () => {
      const res = runGate(['HEAD...HEAD', '--pr-body', fullValidBody]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain('Zero diff detected');
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

        const res = runGate(['HEAD~1...HEAD', '--pr-body', fullValidBody]);
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

        const res = runGate(['HEAD~1...HEAD', '--pr-body', fullValidBody]);
        expect(res.status).toBe(1);
        expect(res.stdout).toContain('Escape hatch comment detected');

        execGit('git reset --hard HEAD~1');
      }
    });

    it('テスト保護: tests/ 配下のテストファイル削除をブロックする', () => {
      fs.unlinkSync(path.join(testRepoDir, 'tests/sample.test.ts'));
      execGit('git add tests/sample.test.ts');
      execGit('git commit -m "delete test"');

      const res = runGate(['HEAD~1...HEAD', '--pr-body', fullValidBody]);
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

        const res = runGate(['HEAD~1...HEAD', '--pr-body', fullValidBody]);
        expect(res.status).toBe(1);
        expect(res.stdout).toContain(
          'Test skipping / weakening detected in tests/'
        );

        execGit('git reset --hard HEAD~1');
      }
    });
  });
});
