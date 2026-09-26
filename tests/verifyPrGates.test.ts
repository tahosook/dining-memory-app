/// <reference types="node" />
import { spawnSync } from 'child_process';
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
});
