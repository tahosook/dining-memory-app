const { execSync } = require('child_process');

try {
  execSync('pnpm test tests/StatsSettingsScreens.test.tsx', { stdio: 'inherit' });
} catch (e) {}
