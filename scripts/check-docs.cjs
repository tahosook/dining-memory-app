#!/usr/bin/env node
/**
 * Documentation Integrity & Drift Checker
 *
 * Purpose:
 * Mechanical safety guard to prevent AI agents (and human contributors) from:
 * 1. Breaking internal Markdown cross-references (broken relative links).
 * 2. Accidentally reintroducing retired UI or runtime specifications as current behavior.
 * 3. Accidentally reintroducing tool-specific operational rules or retired filenames into active docs.
 * 4. Missing required canonical documentation files.
 * 5. Referencing deprecated documentation without awareness (warned, not failed).
 *
 * Design Principles:
 * - Deterministic & mechanical checks only (no subjective style/prose lints).
 * - Zero external CLI dependencies (no ripgrep) and zero extra npm dependencies.
 * - Clear distinction between ERROR (CI failure, exit code 1) and WARNING (advisory, exit code 0).
 * - Rule granularity is intentionally specific to prevent false positives.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');

// Directories excluded from active content analysis (historical / non-canonical data)
const EXCLUDED_DIRS = [
  'docs/deprecated',
  'docs/working',
  'node_modules',
  '.git',
];

// -----------------------------------------------------------------------------
// Canonical Documentation Requirements
// -----------------------------------------------------------------------------
// All canonical documents defined in docs/index.md must exist in the repository.
// If any of these are deleted or misplaced, CI must fail immediately.
const REQUIRED_CANONICAL_DOCS = [
  'README.md',
  'AGENTS.md',
  'TASKS.md',
  'PLANS.md',
  'docs/index.md',
  'docs/product/overview.md',
  'docs/product/progress.md',
  'docs/architecture/tech-spec.md',
  'docs/domain/database-design.md',
  'docs/ux/screen-designs.md',
  'docs/ux/user-flows.md',
  'docs/engineering/context-map.md',
  'docs/engineering/coding-standards.md',
  'docs/engineering/development-workflow.md',
  'docs/engineering/github-security-settings.md',
  'docs/engineering/food-labeling-guidelines.md',
  'docs/engineering/mediapipe-labeling-workflow.md',
  'docs/engineering/immediate-improvements.md',
];

// -----------------------------------------------------------------------------
// Specification Drift Rules
// -----------------------------------------------------------------------------
// Prevent reintroduction of retired UI & runtime specifications.
// These patterns target specific historical implementation contracts that are no longer valid.
// Generic words like 'AI', 'mock', 'candidate', 'provider' are intentionally NOT banned on their own
// to avoid false positives.
const SPEC_DRIFT_RULES = [
  {
    id: 'legacy-candidate-chips',
    pattern: /(?:料理名と料理ジャンル候補|AI candidates should appear as tappable chips|AIで候補|候補チップ)/,
    description: 'Retired candidate-chip UI contract (replaced by noteDraft append flow)',
  },
  {
    id: 'legacy-mock-provider',
    pattern: /local mock provider/,
    description: 'Retired mock runtime described as current (replaced by real local runtime or disabled reason)',
  },
  {
    id: 'legacy-phase1-contract',
    pattern: /候補は `料理名` `料理ジャンル`/,
    description: 'Retired Phase 1 return contract described as current behavior',
  },
];

// -----------------------------------------------------------------------------
// AI Tool Neutrality Rules
// -----------------------------------------------------------------------------
// Prevent reintroduction of tool-specific operational rules or retired filenames in active docs.
// Active docs must remain tool-neutral. Legitimate historical records (e.g. past record of
// using Codex in mediapipe-labeling-workflow.md or CLI args like codex_cli) are preserved.
const TOOL_NEUTRALITY_RULES = [
  {
    id: 'retired-filename-codex-context-map',
    pattern: /codex-context-map(?:\.md)?/,
    description: 'Retired tool-specific filename (renamed to context-map.md)',
  },
  {
    id: 'retired-filename-codex-workflow',
    pattern: /codex-workflow(?:\.md)?/,
    description: 'Retired tool-specific filename (renamed to development-workflow.md)',
  },
  {
    id: 'tool-specific-current-rules',
    pattern: /(?:Codex\s*の(?:固定)?ルール|Codex\s*がこの\s*repo\s*で|Audience:.*?\bCodex\b|Codex\s*fixed\s*working\s*rules)/,
    description: 'Current rules/audience framed specifically for Codex instead of neutral AI agent/developer rules',
  },
];

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

function isExcludedPath(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  return EXCLUDED_DIRS.some(dir => normalized === dir || normalized.startsWith(`${dir}/`));
}

function findMarkdownFiles(dirPath, fileList = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
    if (isExcludedPath(relPath)) {
      continue;
    }
    if (entry.isDirectory()) {
      findMarkdownFiles(fullPath, fileList);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function getActiveMarkdownFiles() {
  const files = [];

  // Root canonical / guidance markdown files
  for (const rootFile of ['AGENTS.md', 'README.md', 'TASKS.md', 'PLANS.md']) {
    const fullPath = path.join(ROOT_DIR, rootFile);
    if (fs.existsSync(fullPath)) {
      files.push(fullPath);
    }
  }

  // docs directory files (excluding deprecated & working)
  const docsDir = path.join(ROOT_DIR, 'docs');
  if (fs.existsSync(docsDir)) {
    findMarkdownFiles(docsDir, files);
  }

  return files;
}

// -----------------------------------------------------------------------------
// Main Verification Logic
// -----------------------------------------------------------------------------

function run(options = {}) {
  const silent = options.silent || false;
  const canonicalDocs = options.requiredCanonicalDocs || REQUIRED_CANONICAL_DOCS;
  const errors = [];
  const warnings = [];

  const log = silent ? () => {} : console.log;
  const warn = silent ? () => {} : console.warn;
  const error = silent ? () => {} : console.error;

  // 1. Verify required canonical documentation files exist
  for (const canonicalDoc of canonicalDocs) {
    const fullPath = path.join(ROOT_DIR, canonicalDoc);
    if (!fs.existsSync(fullPath)) {
      errors.push({
        type: 'missing-canonical-doc',
        file: canonicalDoc,
        message: `Required canonical documentation file does not exist: ${canonicalDoc}`,
      });
    }
  }

  // 2. Scan active markdown files
  const activeFiles = getActiveMarkdownFiles();
  const linkRegex = /!?\[([^\]]*)\]\(([^)#\s]+)(?:#[^)]*)?\)/g;

  for (const filePath of activeFiles) {
    const relFile = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    // Line-by-line checks for content drift and tool neutrality
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineNum = lineIndex + 1;
      const line = lines[lineIndex];

      // Check specification drift rules
      for (const rule of SPEC_DRIFT_RULES) {
        const match = line.match(rule.pattern);
        if (match) {
          errors.push({
            type: 'legacy-terminology',
            file: relFile,
            line: lineNum,
            rule: rule.id,
            matched: match[0],
            message: `${rule.description} (matched: "${match[0]}")`,
          });
        }
      }

      // Check tool neutrality rules
      for (const rule of TOOL_NEUTRALITY_RULES) {
        const match = line.match(rule.pattern);
        if (match) {
          errors.push({
            type: 'tool-neutrality',
            file: relFile,
            line: lineNum,
            rule: rule.id,
            matched: match[0],
            message: `${rule.description} (matched: "${match[0]}")`,
          });
        }
      }
    }

    // Markdown link checking
    let linkMatch;
    linkRegex.lastIndex = 0;
    while ((linkMatch = linkRegex.exec(content)) !== null) {
      const rawTarget = linkMatch[2].trim();

      // Skip external protocols and empty links
      if (
        !rawTarget ||
        rawTarget.startsWith('http://') ||
        rawTarget.startsWith('https://') ||
        rawTarget.startsWith('mailto:') ||
        rawTarget.startsWith('tel:')
      ) {
        continue;
      }

      // Compute line number of link match
      const lineNum = content.slice(0, linkMatch.index).split(/\r?\n/).length;

      // Resolve destination path relative to the containing file
      const dirPath = path.dirname(filePath);
      const resolved = path.resolve(dirPath, rawTarget);
      const relResolved = path.relative(ROOT_DIR, resolved).replace(/\\/g, '/');

      // Check for broken link
      if (!fs.existsSync(resolved)) {
        errors.push({
          type: 'internal-link',
          file: relFile,
          line: lineNum,
          target: rawTarget,
          resolved: relResolved,
          message: `Broken internal link: "${rawTarget}" -> resolved to non-existent "${relResolved}"`,
        });
      } else {
        // If link exists but points to docs/deprecated, record an advisory WARNING
        if (relResolved.startsWith('docs/deprecated')) {
          warnings.push({
            type: 'deprecated-reference',
            file: relFile,
            line: lineNum,
            target: rawTarget,
            resolved: relResolved,
            message: `Reference to deprecated document: "${rawTarget}" (points to ${relResolved})`,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Report Results
  // ---------------------------------------------------------------------------
  log('--- Documentation Integrity Check ---');
  log(`Active documents scanned: ${activeFiles.length} files`);
  log(`Canonical documents verified: ${canonicalDocs.length} files\n`);

  if (warnings.length > 0) {
    warn(`WARNINGS (${warnings.length}):`);
    for (const w of warnings) {
      warn(`  WARNING [${w.type}]`);
      warn(`    file: ${w.file}:${w.line}`);
      if (w.target) warn(`    link: ${w.target}`);
      if (w.resolved) warn(`    target: ${w.resolved}`);
      warn(`    message: ${w.message}\n`);
    }
  }

  if (errors.length > 0) {
    error(`ERRORS (${errors.length}):`);
    for (const e of errors) {
      error(`  ERROR [${e.type}]`);
      error(`    file: ${e.file}${e.line ? `:${e.line}` : ''}`);
      if (e.target) error(`    link: ${e.target}`);
      if (e.resolved) error(`    resolved: ${e.resolved}`);
      if (e.matched) error(`    matched: ${e.matched}`);
      error(`    message: ${e.message}\n`);
    }

    error('Summary:');
    error(`  errors: ${errors.length}`);
    error(`  warnings: ${warnings.length}`);
    error('\ncheck-docs: FAILED\n');
    return { exitCode: 1, errors, warnings };
  }

  log('Summary:');
  log(`  errors: 0`);
  log(`  warnings: ${warnings.length}`);
  log('\ncheck-docs: PASSED\n');
  return { exitCode: 0, errors, warnings };
}

if (require.main === module) {
  const result = run();
  process.exit(result.exitCode);
}

module.exports = {
  run,
  REQUIRED_CANONICAL_DOCS,
  SPEC_DRIFT_RULES,
  TOOL_NEUTRALITY_RULES,
  getActiveMarkdownFiles,
};
