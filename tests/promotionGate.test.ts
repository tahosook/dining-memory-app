/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

describe('Promotion Gate Evaluation Logic (run-autonomous-model-improvement.sh)', () => {
  const scriptPath = path.resolve(__dirname, '../scripts/run-autonomous-model-improvement.sh');
  const tempDir = path.resolve(__dirname, '../node_modules/.cache/promotion-gate-test');

  beforeAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  interface MetricOptions {
    total?: number;
    top1_correct?: number;
    top3_correct?: number;
    avg_latency_ms?: number;
    minorityTop3Count?: number;
  }

  function createEvaluationReport(fileName: string, options: MetricOptions = {}): string {
    const total = options.total !== undefined ? options.total : 7;
    const top1Correct = options.top1_correct !== undefined ? options.top1_correct : 2;
    const top3Correct = options.top3_correct !== undefined ? options.top3_correct : 5;
    const latency = options.avg_latency_ms !== undefined ? options.avg_latency_ms : 50.0;
    const minorityTop3 = options.minorityTop3Count !== undefined ? options.minorityTop3Count : 1;

    const details: Array<{ ground_truth: string; is_top1: boolean; is_top3: boolean }> = [];

    // Minority classes: fried_dish, stir_fry, other_or_exclude
    const minorityClasses = ['fried_dish', 'stir_fry', 'other_or_exclude'];
    for (let i = 0; i < minorityTop3; i++) {
      details.push({
        ground_truth: minorityClasses[i % minorityClasses.length],
        is_top1: false,
        is_top3: true,
      });
    }

    // Fill remaining up to total
    while (details.length < total) {
      details.push({
        ground_truth: 'drink',
        is_top1: details.length < top1Correct,
        is_top3: details.length < top3Correct,
      });
    }

    const report = {
      test: {
        metrics: {
          total,
          top1_correct: top1Correct,
          top3_correct: top3Correct,
          avg_latency_ms: latency,
        },
        details,
      },
    };

    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
    return filePath;
  }

  function runGate(challengerFile: string, championFile?: string, env: Record<string, string> = {}) {
    const args = ['--evaluate-gate', challengerFile];
    if (championFile) {
      args.push(championFile);
    }
    const result = spawnSync('bash', [scriptPath, ...args], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, ...env },
      encoding: 'utf-8',
    });
    return result.stdout.trim();
  }

  describe('Top-3 Correct Count Check', () => {
    it('passes promotion when Top-3 correct is 5/7 (>= 5)', () => {
      const challenger = createEvaluationReport('chal_top3_5.json', {
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_top3_baseline.json', {
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('PROMOTE');
    });

    it('fails promotion when Top-3 correct is 4/7 (< 5)', () => {
      const challenger = createEvaluationReport('chal_top3_4.json', {
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_top3_baseline.json', {
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('MAINTAIN_OR_TIE');
    });
  });

  describe('Top-1 Correct Count Check', () => {
    it('passes promotion when Top-1 correct is 2/7 (>= 2)', () => {
      const challenger = createEvaluationReport('chal_top1_2.json', {
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_top1_baseline.json', {
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('PROMOTE');
    });

    it('fails promotion when Top-1 correct is 1/7 (< 2)', () => {
      const challenger = createEvaluationReport('chal_top1_1.json', {
        top3_correct: 5,
        top1_correct: 1,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_top1_baseline.json', {
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('REJECT');
    });
  });

  describe('Minority Class Coverage Comparison (Challenger vs Champion)', () => {
    it('PASS when Champion has 0 and Challenger has 1 (0 -> 1)', () => {
      const challenger = createEvaluationReport('chal_min_1.json', {
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_min_0.json', {
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('PROMOTE');
    });

    it('FAIL when Champion has 1 and Challenger has 1 (1 -> 1, tie/maintain)', () => {
      const challenger = createEvaluationReport('chal_min_1_tie.json', {
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_min_1.json', {
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      expect(runGate(challenger, champion)).toBe('MAINTAIN_OR_TIE');
    });

    it('FAIL when Champion has 1 and Challenger has 0 (1 -> 0, regression)', () => {
      const challenger = createEvaluationReport('chal_min_0.json', {
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      const champion = createEvaluationReport('champ_min_1.json', {
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      expect(runGate(challenger, champion)).toBe('MAINTAIN_OR_TIE');
    });

    it('FAIL when Champion has 2 and Challenger has 1 (2 -> 1, regression)', () => {
      const challenger = createEvaluationReport('chal_min_1_reg.json', {
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_min_2.json', {
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 2,
      });
      expect(runGate(challenger, champion)).toBe('MAINTAIN_OR_TIE');
    });
  });

  describe('Latency Check (CI/Host Eval Gate <= 100.0ms)', () => {
    it('passes promotion when latency is exactly 100.0ms', () => {
      const challenger = createEvaluationReport('chal_lat_100.json', {
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
        avg_latency_ms: 100.0,
      });
      const champion = createEvaluationReport('champ_lat.json', {
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('PROMOTE');
    });

    it('fails promotion when latency exceeds 100.0ms (e.g. 100.1ms)', () => {
      const challenger = createEvaluationReport('chal_lat_100_1.json', {
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
        avg_latency_ms: 100.1,
      });
      const champion = createEvaluationReport('champ_lat.json', {
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('MAINTAIN_OR_TIE');
    });
  });

  describe('Golden Test Set Sample Count Verification', () => {
    it('proceeds normally when sample count is exactly 7', () => {
      const challenger = createEvaluationReport('chal_total_7.json', {
        total: 7,
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_total_7.json', {
        total: 7,
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('PROMOTE');
    });

    it('blocks gate when Challenger sample count is 6 (invalid test set)', () => {
      const challenger = createEvaluationReport('chal_total_6.json', {
        total: 6,
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_total_7.json', {
        total: 7,
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('REJECT_INVALID_TEST_SET');
    });

    it('blocks gate when Challenger sample count is 8 (invalid test set)', () => {
      const challenger = createEvaluationReport('chal_total_8.json', {
        total: 8,
        top3_correct: 6,
        top1_correct: 3,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_total_7.json', {
        total: 7,
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('REJECT_INVALID_TEST_SET');
    });

    it('blocks gate when Champion sample count is not 7', () => {
      const challenger = createEvaluationReport('chal_total_7.json', {
        total: 7,
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_total_6.json', {
        total: 6,
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('REJECT_INVALID_TEST_SET');
    });
  });

  describe('Mandatory Champion Evaluation Verification', () => {
    it('blocks promotion when Champion report is missing (REJECT_CHAMPION_NOT_EVALUATED)', () => {
      const challenger = createEvaluationReport('chal_no_champ.json', {
        total: 7,
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      expect(runGate(challenger, undefined)).toBe('REJECT_CHAMPION_NOT_EVALUATED');
    });

    it('blocks promotion when Champion report file does not exist (REJECT_CHAMPION_NOT_EVALUATED)', () => {
      const challenger = createEvaluationReport('chal_missing_champ_file.json', {
        total: 7,
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const nonExistentFile = path.join(tempDir, 'non_existent_champion.json');
      expect(runGate(challenger, nonExistentFile)).toBe('REJECT_CHAMPION_NOT_EVALUATED');
    });

    it('blocks promotion when Champion report JSON is invalid or missing test metrics', () => {
      const challenger = createEvaluationReport('chal_valid_metrics.json', {
        total: 7,
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const malformedChampion = path.join(tempDir, 'malformed_champion.json');
      fs.writeFileSync(malformedChampion, JSON.stringify({ invalid: true }), 'utf-8');
      expect(runGate(challenger, malformedChampion)).toBe('REJECT_CHAMPION_NOT_EVALUATED');
    });
  });
});
