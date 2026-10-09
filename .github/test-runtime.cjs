// Keep release and local review gates identical. Browser checks use the separate
// integration fixture; these tests need only Node and Python.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const suites = [
  'tests/autopilot-settings-navigation.js',
  'tests/content-script-bootstrap.js',
  'tests/package-extension-workflow.cjs',
  'tests/fc27-contextual-card-picker.js',
  'tests/fc27-points-hooks.js',
  'tests/fc27-settings.js',
  'tests/fc27-web-app-hooks.js',
  'tests/fc27-prices.test.mjs',
  'tests/fc27-unsupported-requirements.test.mjs',
  'tests/solver-bronze-max-rating.mjs',
  'tests/solver-concept-minimization.js',
  'tests/concept-buyer-attempt-plans.js',
  'tests/concept-buyer-runtime.cjs',
  'tests/price-bridge-runtime.cjs',
  'tests/review-regressions.cjs',
  'tests/sequence-discovery.cjs',
  'solver/points-solver.test.mjs',
];
const result = spawnSync(process.execPath, ['--test', ...suites], {
  cwd: root, stdio: 'inherit',
});
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
