const assert = require('assert');
const path = require('path');

const {
  extractInstallDir,
  shouldRequestElevation,
  relaunchWithSudoIfNeeded,
} = require('../src/elevationManager');

function runElevationTests() {
  console.log('--- Running Linux Privilege Elevation Tests ---');

  assert.strictEqual(extractInstallDir(['patch', '--install-dir', '/opt/custom app']), '/opt/custom app');
  assert.strictEqual(extractInstallDir(['patch', '--install-dir=/srv/antigravity']), '/srv/antigravity');

  assert.strictEqual(shouldRequestElevation([]), true, 'interactive menu can perform protected writes');
  assert.strictEqual(shouldRequestElevation(['patch']), true);
  assert.strictEqual(shouldRequestElevation(['locale', 'install']), true);
  assert.strictEqual(shouldRequestElevation(['locale', 'install', '--tw']), true);
  assert.strictEqual(shouldRequestElevation(['locale', 'restore']), true);
  assert.strictEqual(shouldRequestElevation(['locale', 'uninstall']), true);
  assert.strictEqual(shouldRequestElevation(['dev-mode', 'on']), true);
  assert.strictEqual(shouldRequestElevation(['status']), false);
  assert.strictEqual(shouldRequestElevation(['status', '--tw']), false);
  assert.strictEqual(shouldRequestElevation(['patch', '--help']), false);
  assert.strictEqual(shouldRequestElevation(['locale', 'install', '-h']), false);
  assert.strictEqual(shouldRequestElevation(['theme', 'list']), false);
  assert.strictEqual(shouldRequestElevation(['dev-mode', 'status']), false);
  console.log('  ✔ Mutating and read-only commands are classified correctly');

  const calls = [];
  const scriptPath = path.join('/workspace', 'bin', 'antigravity2-toolkit.js');
  const result = relaunchWithSudoIfNeeded(['patch', '--install-dir', '/opt/custom app'], {
    platform: 'linux',
    getuid: () => 1000,
    isTestMode: false,
    isInteractiveTerminal: true,
    checkInstallation: () => ({ valid: true }),
    checkWritePermissions: () => ({ writable: false, needsElevation: true }),
    spawnSync: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, signal: null, error: null };
    },
    execPath: '/usr/bin/node',
    scriptPath,
    env: { PATH: '/usr/bin' },
  });

  assert.deepStrictEqual(result, { relaunched: true, exitCode: 0 });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].command, 'sudo');
  assert.deepStrictEqual(calls[0].args, [
    '--',
    '/usr/bin/node',
    scriptPath,
    'patch',
    '--install-dir',
    '/opt/custom app',
  ]);
  assert.deepStrictEqual(calls[0].options.stdio, 'inherit', 'sudo must inherit the terminal for password entry');
  assert.strictEqual(calls[0].options.shell, false, 'arguments must not pass through a shell');
  console.log('  ✔ Protected Linux writes relaunch through sudo with an inherited terminal');

  const readOnlyResult = relaunchWithSudoIfNeeded(['status'], {
    platform: 'linux',
    getuid: () => 1000,
    isTestMode: false,
    isInteractiveTerminal: true,
    checkInstallation: () => ({ valid: true }),
    checkWritePermissions: () => ({ writable: false, needsElevation: true }),
    spawnSync: () => { throw new Error('must not spawn'); },
  });
  assert.deepStrictEqual(readOnlyResult, { relaunched: false, exitCode: null });

  const alreadyRootResult = relaunchWithSudoIfNeeded(['patch'], {
    platform: 'linux',
    getuid: () => 0,
    isTestMode: false,
    isInteractiveTerminal: true,
    checkInstallation: () => ({ valid: true }),
    checkWritePermissions: () => ({ writable: false, needsElevation: true }),
    spawnSync: () => { throw new Error('must not spawn'); },
  });
  assert.deepStrictEqual(alreadyRootResult, { relaunched: false, exitCode: null });
  console.log('  ✔ Read-only commands and already-elevated processes never recurse into sudo');

  assert.throws(
    () => relaunchWithSudoIfNeeded(['patch'], {
      platform: 'linux',
      getuid: () => 1000,
      isTestMode: false,
      isInteractiveTerminal: false,
      checkInstallation: () => ({ valid: true }),
      checkWritePermissions: () => ({ writable: false, needsElevation: true }),
      spawnSync: () => { throw new Error('must not spawn'); },
    }),
    /互動式終端/,
  );
  console.log('  ✔ Missing terminal produces actionable password-prompt guidance');

  console.log('Linux Privilege Elevation Tests PASSED!\n');
}

if (require.main === module) {
  runElevationTests();
}

module.exports = { runElevationTests };
