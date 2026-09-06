const childProcess = require('child_process');
const paths = require('./paths');

function extractInstallDir(args) {
  const inline = args.find((arg) => arg.startsWith('--install-dir='));
  if (inline) return inline.slice('--install-dir='.length) || null;

  const index = args.indexOf('--install-dir');
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

function shouldRequestElevation(args) {
  if (args.length === 0) return true;
  if (args.includes('--help') || args.includes('-h')) return false;

  const optionsWithValues = new Set([
    '--brand-title',
    '--install-dir',
    '--opacity',
    '--blur',
    '--wallpaper',
    '-o',
    '-b',
    '-w',
  ]);
  const positional = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (optionsWithValues.has(arg)) {
      index++;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const [command, action] = positional;
  if (['menu', 'ui', 'interactive', 'patch', 'restore', 'huifu'].includes(command)) return true;
  if (['locale', 'localize'].includes(command)) return ['install', 'restore', 'uninstall'].includes(action);
  if (command === 'dev-mode') return ['on', 'enable', 'off', 'disable'].includes((action || 'status').toLowerCase());

  if (command) {
    return false;
  }

  return args.includes('--huifu') || args.includes('--tw') || args.includes('--brand-title');
}

function relaunchWithSudoIfNeeded(args, overrides = {}) {
  const platform = overrides.platform ?? process.platform;
  const getuid = overrides.getuid ?? process.getuid;
  const isTestMode = overrides.isTestMode ?? Boolean(process.env.ANTIGRAVITY_TEST_MODE);

  if (platform !== 'linux' || isTestMode || !shouldRequestElevation(args)) {
    return { relaunched: false, exitCode: null };
  }

  if (typeof getuid === 'function' && getuid() === 0) {
    return { relaunched: false, exitCode: null };
  }

  const manualDir = extractInstallDir(args);
  const checkInstallation = overrides.checkInstallation ?? paths.checkInstallation;
  if (!checkInstallation(manualDir).valid) {
    return { relaunched: false, exitCode: null };
  }

  const checkWritePermissions = overrides.checkWritePermissions ?? paths.checkWritePermissions;
  const permissions = checkWritePermissions(manualDir);
  if (permissions.writable || !permissions.needsElevation) {
    return { relaunched: false, exitCode: null };
  }

  const isInteractiveTerminal = overrides.isInteractiveTerminal
    ?? Boolean(process.stdin.isTTY && process.stderr.isTTY);
  if (!isInteractiveTerminal) {
    throw new Error('Linux 安裝目錄需要管理員權限。請從互動式終端執行此指令，以便 sudo 顯示密碼輸入提示。');
  }

  const spawnSync = overrides.spawnSync ?? childProcess.spawnSync;
  const execPath = overrides.execPath ?? process.execPath;
  const scriptPath = overrides.scriptPath ?? require.main.filename;
  const env = overrides.env ?? process.env;
  const logger = overrides.logger ?? console;

  logger.log('偵測到 Linux 安裝目錄需要管理員權限，請依 sudo 提示輸入密碼...');
  const child = spawnSync('sudo', [
    '--',
    execPath,
    scriptPath,
    ...args,
  ], {
    stdio: 'inherit',
    shell: false,
    env,
  });

  if (child.error) {
    if (child.error.code === 'ENOENT') {
      throw new Error('找不到 sudo。請先安裝 sudo，或以 root 身分執行此工具。');
    }
    throw child.error;
  }

  return {
    relaunched: true,
    exitCode: Number.isInteger(child.status) ? child.status : 1,
  };
}

module.exports = {
  extractInstallDir,
  shouldRequestElevation,
  relaunchWithSudoIfNeeded,
};
