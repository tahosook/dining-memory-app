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
    detailsCount?: number;
  }

  function createEvaluationReport(fileName: string, options: MetricOptions = {}): string {
    const total = options.total !== undefined ? options.total : 7;
    const top1Correct = options.top1_correct !== undefined ? options.top1_correct : 2;
    const top3Correct = options.top3_correct !== undefined ? options.top3_correct : 5;
    const latency = options.avg_latency_ms !== undefined ? options.avg_latency_ms : 50.0;
    const minorityTop3 = options.minorityTop3Count !== undefined ? options.minorityTop3Count : 1;
    const detailsTargetCount = options.detailsCount !== undefined ? options.detailsCount : total;

    const details: Array<{ ground_truth: string; is_top1: boolean; is_top3: boolean }> = [];

    // Minority classes: fried_dish, stir_fry, other_or_exclude
    const minorityClasses = ['fried_dish', 'stir_fry', 'other_or_exclude'];
    for (let i = 0; i < minorityTop3 && details.length < detailsTargetCount; i++) {
      details.push({
        ground_truth: minorityClasses[i % minorityClasses.length],
        is_top1: false,
        is_top3: true,
      });
    }

    // Fill remaining up to detailsTargetCount
    while (details.length < detailsTargetCount) {
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
      expect(runGate(challenger, champion)).toBe('REJECT_CHAMPION_NOT_EVALUATED');
    });

    it('blocks gate when Challenger details count is 6 while metrics.total is 7', () => {
      const challenger = createEvaluationReport('chal_details_6.json', {
        total: 7,
        detailsCount: 6,
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_valid_details.json', {
        total: 7,
        detailsCount: 7,
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

    it('blocks promotion when Champion has metrics.total=7 but details is empty array (REJECT_CHAMPION_NOT_EVALUATED)', () => {
      const challenger = createEvaluationReport('chal_valid_for_empty_champ.json', {
        total: 7,
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_empty_details.json', {
        total: 7,
        detailsCount: 0,
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('REJECT_CHAMPION_NOT_EVALUATED');
    });

    it('blocks promotion when Champion has metrics.total=7 but details has only 6 items (REJECT_CHAMPION_NOT_EVALUATED)', () => {
      const challenger = createEvaluationReport('chal_valid_for_champ_6.json', {
        total: 7,
        top3_correct: 5,
        top1_correct: 2,
        minorityTop3Count: 1,
      });
      const champion = createEvaluationReport('champ_details_6.json', {
        total: 7,
        detailsCount: 6,
        top3_correct: 4,
        top1_correct: 2,
        minorityTop3Count: 0,
      });
      expect(runGate(challenger, champion)).toBe('REJECT_CHAMPION_NOT_EVALUATED');
    });
  });

  describe('Dataset Validation and Class Compatibility (run-autonomous-model-improvement.sh)', () => {
    const REQUIRED_CLASSES = [
      'curry_rice', 'drink', 'fish_dish', 'fried_dish',
      'meat_dish', 'noodles', 'other_or_exclude', 'simmered_dish', 'stir_fry'
    ];

    function createDummyDataset(dirName: string, classes: string[], options: { includeLeakage?: boolean; extraClass?: string } = {}): {
      datasetDir: string;
      goldenDir: string;
    } {
      const baseDir = path.join(tempDir, dirName);
      const datasetDir = path.join(baseDir, 'exported_dataset');
      const goldenDir = path.join(baseDir, 'golden_test');
      fs.mkdirSync(goldenDir, { recursive: true });

      // Create Golden Test with 7 distinct files
      const goldenHashes: string[] = [];
      for (let i = 0; i < 7; i++) {
        const filePath = path.join(goldenDir, `golden_sample_${i}.jpg`);
        const content = `dummy_golden_image_content_${i}`;
        fs.writeFileSync(filePath, content, 'utf-8');
        goldenHashes.push(content);
      }

      for (const split of ['train', 'val', 'test']) {
        const splitDir = path.join(datasetDir, split);
        const splitClasses = [...classes];
        if (options.extraClass && split === 'train') {
          splitClasses.push(options.extraClass);
        }
        for (const cls of splitClasses) {
          const clsDir = path.join(splitDir, cls);
          fs.mkdirSync(clsDir, { recursive: true });
          const imgContent = options.includeLeakage && split === 'train' && cls === splitClasses[0]
            ? goldenHashes[0] // Intentionally leak first golden sample
            : `unique_${split}_${cls}_image_content`;
          fs.writeFileSync(path.join(clsDir, 'sample.jpg'), imgContent, 'utf-8');
        }
      }

      fs.writeFileSync(path.join(datasetDir, 'labels.txt'), classes.join('\n') + '\n', 'utf-8');
      return { datasetDir, goldenDir };
    }

    function runValidate(datasetDir: string, goldenDir: string) {
      const result = spawnSync('bash', [scriptPath, '--validate-dataset', datasetDir, goldenDir], {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf-8',
      });
      return {
        exitCode: result.status,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      };
    }

    function runCheckCompatibility(chalFile: string, champFile: string) {
      const result = spawnSync('bash', [scriptPath, '--check-class-compatibility', chalFile, champFile], {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf-8',
      });
      return {
        exitCode: result.status,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      };
    }

    it('accepts valid 9-class dataset without data leakage', () => {
      const { datasetDir, goldenDir } = createDummyDataset('valid_ds', REQUIRED_CLASSES);
      const res = runValidate(datasetDir, goldenDir);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Dataset validation PASSED: 9 classes verified');
    });

    it('rejects dataset when a required class (e.g. noodles) is missing', () => {
      const missingClasses = REQUIRED_CLASSES.filter(c => c !== 'noodles');
      const { datasetDir, goldenDir } = createDummyDataset('missing_noodles_ds', missingClasses);
      const res = runValidate(datasetDir, goldenDir);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('Missing required class(es) in dataset: noodles');
    });

    it('rejects dataset when unexpected unknown class is present', () => {
      const { datasetDir, goldenDir } = createDummyDataset('unknown_class_ds', REQUIRED_CLASSES, { extraClass: 'ramen' });
      const res = runValidate(datasetDir, goldenDir);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('Unknown unexpected class(es) in dataset: ramen');
    });

    it('rejects dataset when Golden Test sample is leaked into training split (SHA256 match)', () => {
      const { datasetDir, goldenDir } = createDummyDataset('leakage_ds', REQUIRED_CLASSES, { includeLeakage: true });
      const res = runValidate(datasetDir, goldenDir);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('Data leakage detected! Image');
    });

    it('verifies class compatibility passes when both models have 9 classes', () => {
      const chalFile = path.join(tempDir, 'chal_9_classes.json');
      const champFile = path.join(tempDir, 'champ_9_classes.json');
      fs.writeFileSync(chalFile, JSON.stringify({ labels: REQUIRED_CLASSES }));
      fs.writeFileSync(champFile, JSON.stringify({ labels: REQUIRED_CLASSES }));

      const res = runCheckCompatibility(chalFile, champFile);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Class compatibility verified: Champion (9 classes) === Challenger (9 classes) === 9');
    });

    it('verifies class compatibility fails when class counts differ (e.g. Challenger has 8 classes, Champion has 9)', () => {
      const chalFile = path.join(tempDir, 'chal_8_classes.json');
      const champFile = path.join(tempDir, 'champ_9_classes_diff.json');
      fs.writeFileSync(chalFile, JSON.stringify({ labels: REQUIRED_CLASSES.slice(0, 8) }));
      fs.writeFileSync(champFile, JSON.stringify({ labels: REQUIRED_CLASSES }));

      const res = runCheckCompatibility(chalFile, champFile);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('Class compatibility mismatch! Challenger has 8 classes, Champion has 9 classes');
    });
  });
});
