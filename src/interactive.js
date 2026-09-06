const prompts = require('prompts');
const pc = require('picocolors');
const fs = require('fs');
const paths = require('./paths');
const backupManager = require('./backupManager');
const processManager = require('./processManager');
const themeManager = require('./themeManager');
const configManager = require('./configManager');
const patcher = require('./patcher');
const devModeManager = require('./devModeManager');
const localizationManager = require('./localizationManager');
const { execSync } = require('child_process');

function printBanner() {
  console.clear();
  console.log(pc.cyan(pc.bold(`
    _    ____     _____           _ _    _ _   
   / \\  / ___|   |_   _|__   ___ | | | _(_) |_ 
  / _ \\| |  _ _____| |/ _ \\ / _ \\| | |/ / | __|
 / ___ \\ |_| |_____| | (_) | (_) | |   <| | |_ 
/_/   \\_\\____|     |_|\\___/ \\___/|_|_|\\_\\_|\\__|
`)));
  console.log(pc.white(pc.bold('  Antigravity 2 全能增強工具箱 (antigravity2-toolkit)')) + pc.gray(' v2.0.0'));
  console.log(pc.gray('  桌布美化 ‧ 繁簡中文化 ‧ 100% 保持官方原生深色/淺色主題與穩定性'));
  console.log(pc.gray('  ------------------------------------------------------------'));
}

function printStatusDashboard() {
  const status = backupManager.getPatchStatus();
  const wpConfig = themeManager.getWallpaperConfig();
  const locConfig = configManager.getLocalizationConfig();
  const running = processManager.getRunningProcesses();

  let modeBadge = pc.green('官方原版 (未修補)');
  if (status.mode === 'folder') {
    modeBadge = pc.magenta(pc.bold('Folder 開發模式 (即時生效)'));
  } else if (status.isPatched || status.isLocalizationPatched) {
    modeBadge = pc.cyan(pc.bold('ASAR 已修補'));
  }

  const runningText = running.length > 0
    ? pc.yellow(`運行中 (${running.length} 個程序)`)
    : pc.gray('已停止');

  const backupText = status.backupExists
    ? pc.green('已安全備份 (app.asar.bak)')
    : pc.red('尚未備份');

  const wpStatusText = wpConfig.enabled
    ? pc.green(pc.bold('✔ 已啟用自訂背景'))
    : pc.gray('○ 未啟用 (官方原生純色)');

  let locStatusText = pc.gray('○ 未安裝 (官方英文)');
  if (status.isLocalizationPatched || locConfig.enabled) {
    const localeName = (status.activeLocale === 'zh-TW' || locConfig.locale === 'zh-TW') ? '繁體中文 (zh-TW)' : '簡體中文 (zh-CN)';
    locStatusText = pc.green(pc.bold(`✔ 已安裝 ${localeName}`));
  }

  const brandModeText = locConfig.brandTitle === 'hidden'
    ? '隱藏品牌名'
    : locConfig.brandTitle === 'translated'
    ? '品牌名在地化'
    : '保留英文 Antigravity';

  const widgetConfig = configManager.getFloatingWidgetConfig();
  const widgetStatusText = widgetConfig.enabled !== false
    ? pc.green(pc.bold('[已啟用] (預設螢幕右下角, 快捷鍵 Ctrl+Shift+W)'))
    : pc.gray('[已停用]');

  console.log(pc.bold('  目前系統狀態：'));
  console.log(`    修補模式:    ${modeBadge}`);
  console.log(`    程序狀態:    ${runningText}`);
  console.log(`    原廠備份:    ${backupText}`);
  console.log(`    中文化狀態:  ${locStatusText} [${brandModeText}]`);
  console.log(`    桌布狀態:    ${wpStatusText}`);
  console.log(`    即時懸浮窗:  ${widgetStatusText}`);
  if (wpConfig.imagePath) {
    console.log(`    圖片路徑:    ${pc.cyan(wpConfig.imagePath)}`);
    console.log(`    透明度:      ${pc.yellow(String(wpConfig.opacity))} (${Math.round(wpConfig.opacity * 100)}%)`);
    console.log(`    模糊度:      ${pc.yellow(String(wpConfig.blur) + 'px')}`);
  }
  console.log(pc.gray('  ------------------------------------------------------------\n'));
}

async function handleSetWallpaper() {
  const currentWp = themeManager.getWallpaperConfig();

  const questions = [
    {
      type: 'text',
      name: 'imagePath',
      message: '請輸入背景圖片完整路徑 (或圖片網址)：',
      initial: currentWp.imagePath || '',
      validate: (val) => {
        const clean = (val || '').replace(/^["']+|["']+$/g, '').trim();
        if (!clean) return '路徑不能為空！';
        return true;
      },
    },
    {
      type: 'number',
      name: 'opacity',
      message: '請設定背景透明度 (0.0 ~ 1.0，建議 0.35)：',
      initial: currentWp.opacity !== undefined ? currentWp.opacity : 0.35,
      float: true,
      min: 0,
      max: 1,
      increment: 0.05,
    },
    {
      type: 'number',
      name: 'blur',
      message: '請設定背景模糊度 (0 ~ 50 px，0 為清晰高清)：',
      initial: currentWp.blur !== undefined ? currentWp.blur : 0,
      min: 0,
      max: 50,
      increment: 1,
    },
  ];

  const res = await prompts(questions);
  if (!res.imagePath) return;

  const cleanPath = res.imagePath.replace(/^["']+|["']+$/g, '').trim();
  if (!/^https?:\/\//i.test(cleanPath) && !fs.existsSync(cleanPath)) {
    console.log(pc.yellow(`\n⚠️  注意：找不到本機檔案「${cleanPath}」，但仍會儲存並嘗試套用。`));
  }

  try {
    const result = themeManager.setWallpaper(cleanPath, {
      opacity: res.opacity,
      blur: res.blur,
    });

    console.log(pc.green(`\n✔ 自訂背景設定完成！`));
    console.log(pc.gray(`  圖片路徑: ${cleanPath}`));
    console.log(pc.gray(`  透明度:   ${res.opacity} | 模糊度: ${res.blur}px`));
    console.log(pc.gray(`  樣式寫入: ${result.themePath}`));

    const status = backupManager.getPatchStatus();
    if (!status.isPatched && status.mode !== 'folder') {
      console.log(pc.yellow('\n⚠️  提示：Antigravity 目前處於官方原版狀態（未注入補丁）。'));
      console.log(pc.yellow('   背景樣式需在修補 ASAR 或啟用 Folder 模式後才會在視窗中生效。'));
      const patchPrompt = await prompts({
        type: 'confirm',
        name: 'doPatch',
        message: '是否立即修補 Antigravity (Patch ASAR) 以啟用自定義背景？',
        initial: true,
      });
      if (patchPrompt.doPatch) {
        await handlePatchAsar();
        return;
      }
    } else {
      console.log(pc.cyan('⚡ 已透過 Hot-Reload 即時生效，無需重啟視窗！'));
    }
  } catch (err) {
    console.log(pc.red(`✖ 設定背景失敗: ${err.message}`));
  }
  await waitForKey();
}

async function handleClearWallpaper() {
  const res = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: '確定要清除自訂背景並恢復官方原生純色外觀嗎？',
    initial: true,
  });

  if (!res.confirm) return;

  try {
    themeManager.clearWallpaper();
    console.log(pc.green('\n✔ 已成功清除自訂背景，恢復官方原生純色外觀！'));
    console.log(pc.cyan('⚡ 已透過 Hot-Reload 即時生效。'));
  } catch (err) {
    console.log(pc.red(`✖ 清除失敗: ${err.message}`));
  }
  await waitForKey();
}

async function handleInstallChinese(targetLocale = 'zh-CN') {
  const isTw = targetLocale === 'zh-TW';
  const langName = isTw ? '繁體中文' : '簡體中文';

  const brandPrompt = await prompts({
    type: 'select',
    name: 'brandTitle',
    message: `請選擇「${langName}」左上角品牌名顯示方式：`,
    choices: [
      { title: '保持英文 Antigravity（預設推薦，保持原生美觀）', value: 'english' },
      { title: '隱藏品牌名稱', value: 'hidden' },
      { title: '啟用品牌名稱在地化 (反重力)', value: 'translated' },
    ],
    initial: 0,
  });

  if (!brandPrompt.brandTitle) return;

  const running = processManager.isAntigravityRunning();
  let kill = false;

  if (running) {
    const res = await prompts({
      type: 'confirm',
      name: 'kill',
      message: `Antigravity 正在運行中。是否先關閉以解除檔案鎖定？`,
      initial: true,
    });
    if (!res.kill) {
      console.log(pc.yellow('已取消安裝。'));
      await waitForKey();
      return;
    }
    kill = true;
  }

  const devStatus = devModeManager.getDevModeStatus();

  console.log(pc.cyan(`\n正在安裝 ${langName} 在地化...`));
  try {
    if (devStatus.enabled) {
      // Direct in-folder patch
      if (kill) processManager.killProcesses();
      localizationManager.patchDirectoryLocalization(devStatus.folderPath, {
        locale: targetLocale,
        brandTitle: brandPrompt.brandTitle,
      });
      configManager.updateLocalizationConfig({
        enabled: true,
        locale: targetLocale,
        brandTitle: brandPrompt.brandTitle,
      });
      console.log(pc.green(`✔ ${langName} 已直接注入 Folder 開發模式中！`));
    } else {
      // ASAR repack
      const result = await patcher.patchAsar({
        kill,
        localization: {
          locale: targetLocale,
          brandTitle: brandPrompt.brandTitle,
        },
      });
      console.log(pc.green(`✔ ${langName} 在地化部署完成！`));
      console.log(pc.gray(`  ASAR 路徑: ${result.asarPath}`));
    }

    if (running) {
      const launchPrompt = await prompts({
        type: 'confirm',
        name: 'launch',
        message: '是否立即重新啟動 Antigravity？',
        initial: true,
      });
      if (launchPrompt.launch) {
        processManager.launchApp();
        console.log(pc.green('✔ Antigravity 已成功啟動！'));
      }
    }
  } catch (err) {
    console.log(pc.red(`✖ 安裝失敗: ${err.message}`));
  }
  await waitForKey();
}

async function handleFullPatch() {
  const currentLoc = configManager.getLocalizationConfig();
  const currentWp = themeManager.getWallpaperConfig();

  const choices = [
    { title: '繁體中文 (zh-TW) + 自訂背景/原生透明度修補', value: 'zh-TW' },
    { title: '簡體中文 (zh-CN) + 自訂背景/原生透明度修補', value: 'zh-CN' },
  ];

  const selectPrompt = await prompts({
    type: 'select',
    name: 'locale',
    message: '請選擇要一同注入的中文化語言：',
    choices,
    initial: currentLoc.locale === 'zh-TW' ? 0 : 1,
  });

  if (!selectPrompt.locale) return;

  const running = processManager.isAntigravityRunning();
  let kill = false;

  if (running) {
    const res = await prompts({
      type: 'confirm',
      name: 'kill',
      message: 'Antigravity 正在運行中。是否自動關閉程序以進行修補？',
      initial: true,
    });
    if (!res.kill) return;
    kill = true;
  }

  console.log(pc.cyan('\n正在執行全能一鍵修補 (桌布增強 + 中文化)...'));
  try {
    const result = await patcher.patchAsar({
      kill,
      theme: true,
      localization: {
        locale: selectPrompt.locale,
        brandTitle: currentLoc.brandTitle || 'english',
      },
    });

    console.log(pc.green(`✔ 全能一鍵修補成功！`));
    console.log(pc.gray(`  ASAR 檔案: ${result.asarPath}`));
    console.log(pc.gray(`  原廠備份: ${result.backupPath}`));

    if (running) {
      const launchPrompt = await prompts({
        type: 'confirm',
        name: 'launch',
        message: '是否立即啟動 Antigravity 檢驗效果？',
        initial: true,
      });
      if (launchPrompt.launch) {
        processManager.launchApp();
        console.log(pc.green('✔ Antigravity 已成功啟動！'));
      }
    }
  } catch (err) {
    console.log(pc.red(`✖ 修補失敗: ${err.message}`));
  }
  await waitForKey();
}

async function handlePatchAsar() {
  const running = processManager.isAntigravityRunning();
  let kill = false;

  if (running) {
    const res = await prompts({
      type: 'confirm',
      name: 'kill',
      message: 'Antigravity 正在運行中。是否關閉程序以修補 app.asar？',
      initial: true,
    });
    if (!res.kill) {
      console.log(pc.yellow('修補已取消。'));
      await waitForKey();
      return;
    }
    kill = true;
  }

  console.log(pc.cyan('\n解包、注入樣式與重建 app.asar 中...'));
  try {
    const result = await patcher.patchAsar({ kill });
    console.log(pc.green(`✔ 成功修補 ASAR: ${result.asarPath}`));
    console.log(pc.gray(`  原廠備份已保存於: ${result.backupPath}`));
  } catch (err) {
    console.log(pc.red(`✖ 修補失敗: ${err.message}`));
  }
  await waitForKey();
}

async function handleDevMode() {
  const status = devModeManager.getDevModeStatus();
  const willEnable = !status.enabled;

  const res = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: willEnable
      ? '啟用 Folder 開發模式？（將解包至 resources/app/，支援免重新打包即時修改）'
      : '關閉 Folder 開發模式並恢復為 ASAR 打包模式？',
    initial: true,
  });

  if (!res.confirm) return;

  const running = processManager.isAntigravityRunning();
  let kill = false;
  if (running) {
    const killRes = await prompts({
      type: 'confirm',
      name: 'kill',
      message: 'Antigravity 正在運行中。是否關閉程序以繼續？',
      initial: true,
    });
    if (!killRes.kill) return;
    kill = true;
  }

  try {
    if (willEnable) {
      console.log(pc.cyan('\n正在 resources/app/ 中配置 Folder 開發模式...'));
      const result = await devModeManager.enableDevMode({ kill });
      console.log(pc.green(`✔ Folder 開發模式已啟用於: ${result.folderPath}`));
      console.log(pc.gray('  您現在可以直接修改該目錄中的所有代碼與翻譯，立即生效！'));
    } else {
      console.log(pc.cyan('\n正在清理 Folder 開發模式並還原 ASAR 模式...'));
      const result = await devModeManager.disableDevMode({ kill });
      console.log(pc.green(`✔ Folder 開發模式已關閉。還原至: ${result.asarPath}`));
    }
  } catch (err) {
    console.log(pc.red(`✖ 操作失敗: ${err.message}`));
  }
  await waitForKey();
}

async function handleRestore() {
  const res = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: pc.yellow('確定要還原為官方原始版本嗎？此操作將移除所有背景修補與中文化注入。'),
    initial: false,
  });

  if (!res.confirm) return;

  const running = processManager.isAntigravityRunning();
  let kill = false;
  if (running) {
    const killRes = await prompts({
      type: 'confirm',
      name: 'kill',
      message: 'Antigravity 正在運行中。是否關閉程序以執行還原？',
      initial: true,
    });
    if (!killRes.kill) return;
    kill = true;
  }

  try {
    if (kill) processManager.killProcesses();
    const result = backupManager.restoreAsar();
    console.log(pc.green(`✔ 已完全恢復官方原版 ASAR 於: ${result.restoredTo}`));
  } catch (err) {
    console.log(pc.red(`✖ 還原失敗: ${err.message}`));
  }
  await waitForKey();
}

function handleOpenExplorer() {
  const customUiDir = paths.getCustomUiDir();
  configManager.ensureCustomUiDirs();
  try {
    if (process.platform === 'win32') {
      execSync(`explorer "${customUiDir}"`);
    } else if (process.platform === 'darwin') {
      execSync(`open "${customUiDir}"`);
    } else {
      execSync(`xdg-open "${customUiDir}"`);
    }
    console.log(pc.green(`✔ 已開啟目錄: ${customUiDir}`));
  } catch (err) {
    console.log(pc.red(`✖ 無法開啟檔案總管: ${err.message}`));
  }
}

async function handleLaunchOrRestart() {
  const running = processManager.isAntigravityRunning();
  if (running) {
    const res = await prompts({
      type: 'confirm',
      name: 'restart',
      message: 'Antigravity 已在運行中。是否重啟它？',
      initial: true,
    });
    if (!res.restart) return;
    processManager.killProcesses();
  }

  try {
    const pid = processManager.launchApp();
    console.log(pc.green(`✔ 已成功啟動 Antigravity (PID: ${pid})`));
  } catch (err) {
    console.log(pc.red(`✖ 啟動失敗: ${err.message}`));
  }
  await waitForKey();
}

async function handleKill() {
  const running = processManager.getRunningProcesses();
  if (running.length === 0) {
    console.log(pc.yellow('\n目前沒有運行中的 Antigravity 程序。'));
    await waitForKey();
    return;
  }

  const res = await prompts({
    type: 'confirm',
    name: 'kill',
    message: `確定要關閉 ${running.length} 個運行中的 Antigravity 程序嗎？`,
    initial: true,
  });

  if (!res.kill) return;
  processManager.killProcesses();
  console.log(pc.green('✔ Antigravity 程序已全數關閉。'));
  await waitForKey();
}

async function handleToggleWidget() {
  const cfg = configManager.getFloatingWidgetConfig();
  const res = await prompts({
    type: 'select',
    name: 'action',
    message: `桌面即時懸浮窗目前為【${cfg.enabled !== false ? '已啟用' : '已停用'}】，請選擇操作：`,
    choices: [
      { title: cfg.enabled !== false ? '停用桌面即時懸浮窗' : '啟用桌面即時懸浮窗', value: 'toggle_enable' },
      { title: '重設懸浮窗座標至螢幕右下角預設位置', value: 'reset_pos' },
      { title: '切換啟動型態 (膠囊微型 / 完整儀表板)', value: 'toggle_collapse' },
      { title: '返回主選單', value: 'back' },
    ],
  });

  if (!res.action || res.action === 'back') return;

  if (res.action === 'toggle_enable') {
    const updated = configManager.updateFloatingWidgetConfig({ enabled: !(cfg.enabled !== false) });
    console.log(pc.green(`\n✔ 桌面即時懸浮窗已設定為：${updated.enabled ? '啟用' : '停用'}`));
  } else if (res.action === 'reset_pos') {
    configManager.updateFloatingWidgetConfig({ position: { x: null, y: null } });
    console.log(pc.green('\n✔ 已重設懸浮窗座標至螢幕右下角預設位置！'));
  } else if (res.action === 'toggle_collapse') {
    const updated = configManager.updateFloatingWidgetConfig({ collapsed: !cfg.collapsed });
    console.log(pc.green(`\n✔ 懸浮窗預設型態已設定為：${updated.collapsed ? '微型膠囊' : '完整儀表板'}`));
  }

  await waitForKey();
}

async function waitForKey() {
  await prompts({
    type: 'invisible',
    name: 'continue',
    message: pc.gray('\n按 Enter 鍵繼續...'),
  });
}

async function startInteractiveMenu() {
  themeManager.initPresets();

  while (true) {
    printBanner();
    printStatusDashboard();

    const res = await prompts({
      type: 'select',
      name: 'action',
      message: '請選擇操作項目：',
      choices: [
        { title: '🖼️   設定 / 更換自訂背景 (Set / Change Wallpaper)', value: 'set_wallpaper' },
        { title: '🧹   清除背景 (恢復官方原生純色) (Remove / Clear Wallpaper)', value: 'clear_wallpaper' },
        { title: '🇨🇳   安裝簡體中文在地化 (Install Simplified Chinese)', value: 'install_cn' },
        { title: '🇹🇼   安裝繁體中文在地化 (Install Traditional Chinese)', value: 'install_tw' },
        { title: '⚡   一鍵完整修補 (桌布增強 + 中文化) (Full Unified Patch)', value: 'full_patch' },
        { title: '🛠️   切換 Folder 開發模式 (Toggle Dev Mode: Instant Edit)', value: 'dev_mode' },
        { title: '[浮窗] 設定 / 開關桌面即時懸浮窗 (Floating Widget Settings)', value: 'toggle_widget' },
        { title: '🔄   還原官方原廠備份 (Restore Official Backup)', value: 'restore' },
        { title: '🚀   啟動 / 重啟 Antigravity (Launch / Restart)', value: 'launch' },
        { title: '🛑   關閉 Antigravity 處理程序 (Kill Processes)', value: 'kill' },
        { title: '📂   開啟配置與樣式目錄 (Open Config Directory)', value: 'open' },
        { title: '❌   離開 (Exit)', value: 'exit' },
      ],
    });

    if (!res.action || res.action === 'exit') {
      console.log(pc.cyan('\n感謝使用 Antigravity 全能工具箱，再見！\n'));
      break;
    }

    switch (res.action) {
      case 'set_wallpaper':
        await handleSetWallpaper();
        break;
      case 'clear_wallpaper':
        await handleClearWallpaper();
        break;
      case 'install_cn':
        await handleInstallChinese('zh-CN');
        break;
      case 'install_tw':
        await handleInstallChinese('zh-TW');
        break;
      case 'full_patch':
        await handleFullPatch();
        break;
      case 'dev_mode':
        await handleDevMode();
        break;
      case 'toggle_widget':
        await handleToggleWidget();
        break;
      case 'restore':
        await handleRestore();
        break;
      case 'open':
        handleOpenExplorer();
        await waitForKey();
        break;
      case 'launch':
        await handleLaunchOrRestart();
        break;
      case 'kill':
        await handleKill();
        break;
    }
  }
}

module.exports = {
  startInteractiveMenu,
  printBanner,
  printStatusDashboard,
  handleSetWallpaper,
  handleClearWallpaper,
  handleInstallChinese,
  handleFullPatch,
  handleRestore,
  handleToggleWidget,
};
