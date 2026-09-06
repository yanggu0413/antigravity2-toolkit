const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');

function runCliTests() {
  console.log('--- Running CLI Flags & Execution Tests ---');
  const binPath = path.resolve(__dirname, '..', 'bin', 'antigravity2-toolkit.js');

  // 1. Test --version
  const versionOut = execFileSync(process.execPath, [binPath, '--version'], {
    encoding: 'utf8',
    env: { ...process.env, ANTIGRAVITY_TEST_MODE: '1' },
  }).trim();
  assert.strictEqual(versionOut, pkg.version, `--version output must match package.json version (${pkg.version})`);
  console.log('  ✔ CLI --version returns correct version string');

  // 2. Test --help
  const helpOut = execFileSync(process.execPath, [binPath, '--help'], {
    encoding: 'utf8',
    env: { ...process.env, ANTIGRAVITY_TEST_MODE: '1' },
  });
  assert.ok(helpOut.includes('antigravity2-toolkit'), 'Help output must include toolkit name');
  assert.ok(helpOut.includes('status'), 'Help output must include status command');
  assert.ok(helpOut.includes('patch'), 'Help output must include patch command');
  assert.ok(helpOut.includes('dev-mode'), 'Help output must include dev-mode command');
  assert.ok(helpOut.includes('theme'), 'Help output must include theme command');
  console.log('  ✔ CLI --help displays comprehensive command usage');

  // 3. Test status --json
  const statusJsonOut = execFileSync(process.execPath, [binPath, 'status', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, ANTIGRAVITY_TEST_MODE: '1' },
  });
  const parsedStatus = JSON.parse(statusJsonOut);
  assert.ok(parsedStatus && typeof parsedStatus === 'object', 'status --json must output valid JSON');
  assert.ok('status' in parsedStatus, 'JSON status must contain status object');
  assert.ok('wallpaper' in parsedStatus, 'JSON status must contain wallpaper object');
  assert.ok('localization' in parsedStatus, 'JSON status must contain localization object');
  console.log('  ✔ CLI status --json outputs valid structured JSON');

  // 4. Test top-level --status --json
  const topStatusJsonOut = execFileSync(process.execPath, [binPath, '--status', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, ANTIGRAVITY_TEST_MODE: '1' },
  });
  const parsedTopStatus = JSON.parse(topStatusJsonOut);
  assert.ok(parsedTopStatus && parsedTopStatus.status, '--status --json must output valid JSON');
  console.log('  ✔ CLI top-level --status --json behaves identically to status subcommand');

  // 5. Test plain status human-readable output
  const plainStatusOut = execFileSync(process.execPath, [binPath, 'status'], {
    encoding: 'utf8',
    env: { ...process.env, ANTIGRAVITY_TEST_MODE: '1' },
  });
  assert.ok(plainStatusOut.includes('Antigravity Toolkit Status'), 'Status output must include title header');
  assert.ok(plainStatusOut.includes('Resources Path:'), 'Status output must include Resources Path line');
  console.log('  ✔ CLI human-readable status table rendered successfully');

  console.log('CLI Flags & Execution Tests PASSED!\n');
}

if (require.main === module) {
  runCliTests();
}

module.exports = { runCliTests };
