#!/usr/bin/env node

const { createCli } = require('../src/cli');
const { startInteractiveMenu } = require('../src/interactive');
const patcher = require('../src/patcher');
const backupManager = require('../src/backupManager');
const processManager = require('../src/processManager');
const paths = require('../src/paths');
const { relaunchWithSudoIfNeeded } = require('../src/elevationManager');
const pc = require('picocolors');

async function main() {
  const args = process.argv.slice(2);

  const elevation = relaunchWithSudoIfNeeded(args);
  if (elevation.relaunched) {
    process.exitCode = elevation.exitCode;
    return;
  }

  // If no arguments provided, launch interactive menu directly
  if (args.length === 0) {
    await startInteractiveMenu();
    return;
  }

  // Backwards-compatibility with direct localization_engine flags:
  // e.g., node ag-toolkit.js --brand-title english
  // e.g., node ag-toolkit.js --tw --brand-title hidden
  // e.g., node ag-toolkit.js --huifu
  const knownCommands = ['menu', 'ui', 'interactive', 'set', 'wallpaper', 'clear', 'remove', 'unset', 'status', 'patch', 'locale', 'localize', 'dev-mode', 'restore', 'huifu', 'theme', 'config', 'open', 'launch', 'kill'];
  const firstArg = args[0];

  if (args.includes('--status') && !args.includes('status')) {
    const sIdx = args.indexOf('--status');
    args.splice(sIdx, 1, 'status');
    process.argv = [process.argv[0], process.argv[1], ...args];
  }

  if (firstArg && !firstArg.startsWith('-') && !knownCommands.includes(firstArg)) {
    // Unrecognized command, fall through to CLI parser
  } else if (args.includes('--huifu') && !args.some(a => ['restore', 'locale', 'patch'].includes(a))) {
    // Direct restore request
    const noKill = args.includes('--no-kill');
    let installDir = null;
    const dirIdx = args.indexOf('--install-dir');
    if (dirIdx !== -1 && args[dirIdx + 1]) installDir = args[dirIdx + 1];

    if (!noKill) processManager.killProcesses();
    console.log(pc.cyan('正在還原為官方原版 Antigravity...'));
    const res = backupManager.restoreAsar(installDir);
    console.log(pc.green(`[成功] 官方原版 app.asar 已還原至: ${res.restoredTo}`));
    return;
  } else if ((args.includes('--tw') || args.includes('--brand-title')) && !args.some(a => ['patch', 'locale', 'localize', 'set', 'theme', 'status'].includes(a))) {
    // Direct localization install request from legacy scripts
    const isTw = args.includes('--tw');
    const noKill = args.includes('--no-kill');
    let brandTitle = 'english';
    const btIdx = args.indexOf('--brand-title');
    if (btIdx !== -1 && args[btIdx + 1]) brandTitle = args[btIdx + 1];

    let installDir = null;
    const dirIdx = args.indexOf('--install-dir');
    if (dirIdx !== -1 && args[dirIdx + 1]) installDir = args[dirIdx + 1];

    const locale = isTw ? 'zh-TW' : 'zh-CN';
    const langName = isTw ? '繁體中文' : '簡體中文';
    console.log(pc.cyan(`Installing ${langName} localization (brand: ${brandTitle})...`));

    const wasRunning = processManager.isAntigravityRunning();
    if (!noKill && wasRunning) {
      processManager.killProcesses();
    }

    const res = await patcher.patchAsar({
      kill: false,
      manualDir: installDir,
      theme: true, // preserve theme hooks
      localization: {
        locale,
        brandTitle,
      },
    });

    console.log(pc.green(`[成功] ${langName} 在地化部署成功！`));
    console.log(pc.gray(`  ASAR 路徑: ${res.asarPath}`));

    if (wasRunning && !noKill) {
      try {
        processManager.launchApp(installDir);
        console.log(pc.green('[成功] Antigravity 重新啟動成功！'));
      } catch (_) {}
    }
    return;
  }

  const cli = createCli();
  await cli.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(pc.red('[錯誤] 執行異常:'), err.message || err);
  process.exit(1);
});
