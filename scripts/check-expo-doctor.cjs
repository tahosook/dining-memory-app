#!/usr/bin/env node

/**
 * Custom Expo Doctor Runner & Strict CI Gate
 *
 * Runs `npx expo-doctor` and enforces hard failure on:
 * - Any major version mismatches (e.g. expo-* upgraded across Expo SDK boundaries)
 * - Any structural, Metro, configuration, peer dependency, or project setup failures
 *
 * Distinguishes remote npm patch advisories (e.g. expo releasing 57.0.24 on npm
 * while repository is on 57.0.23) from real compatibility breakage.
 */

const { spawnSync } = require('child_process');

console.log('--- Running Expo Doctor Compatibility & Health Check ---');

const result = spawnSync('npx', ['--yes', 'expo-doctor'], {
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
});

const stdout = result.stdout || '';
const stderr = result.stderr || '';
const fullOutput = stdout + (stderr ? '\n' + stderr : '');

// Print the output for CI visibility
console.log(fullOutput.trim());

if (result.status === 0) {
  console.log('\ncheck-expo-doctor: PASSED (all checks passed)');
  process.exit(0);
}

// Inspect failures
const hasMajorMismatch = fullOutput.includes('Major version mismatches');
const failedCheckLines = fullOutput
  .split('\n')
  .filter(line => line.trim().startsWith('✖'));

const otherFailures = failedCheckLines.filter(
  line => !line.includes('Check that packages match versions required by installed Expo SDK')
);

if (hasMajorMismatch) {
  console.error('\nERROR: Major version mismatches detected in Expo dependencies!');
  console.error('Expo dependencies must remain aligned with the installed Expo SDK version.');
  process.exit(1);
}

if (otherFailures.length > 0) {
  console.error('\nERROR: Expo Doctor detected critical project issues:');
  otherFailures.forEach(f => console.error('  ' + f.trim()));
  process.exit(1);
}

if (fullOutput.includes('Patch version mismatches')) {
  console.log('\nNOTICE: Non-breaking patch advisories detected for Expo SDK.');
  console.log('Recommended patch updates should be reviewed during scheduled maintenance.');
  console.log('check-expo-doctor: PASSED with patch advisory');
  process.exit(0);
}

// Fallback: any other unhandled non-zero exit
console.error('\nERROR: Expo Doctor failed with exit code ' + result.status);
process.exit(result.status || 1);
