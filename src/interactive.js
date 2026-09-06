const prompts = require('prompts');
const pc = require('picocolors');
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const backupManager = require('./backupManager');
const processManager = require('./processManager');
const themeManager = require('./themeManager');
const configManager = require('./configManager');
const patcher = require('./patcher');
const devModeManager = require('./devModeManager');
const localizationManager = require('./localizationManager');
const { execSync } = require('child_process');

function getWidgetShortcutKey() {
  return process.platform === 'darwin' ? '⌘+Shift+W' : 'Ctrl+Shift+W';
}

function printBanner() {
  console.clear();
  console.log(pc.cyan('  ┌─────────────────────────────────────────────────────────────┐'));
  console.log(pc.cyan('  │') + pc.bold(pc.white('              ANTIGRAVITY 2 全能增強工具箱                   ')) + pc.cyan('│'));
  console.log(pc.cyan('  │') + pc.gray('     繁體/簡體中文在地化 ‧ 自訂背景桌布 ‧ 即時桌面懸浮窗      ') + pc.cyan('│'));
  console.log(pc.cyan('  └─────────────────────────────────────────────────────────────┘'));
}

function printStatusDashboard() {
  const status = backupManager.getPatchStatus();
  const wpConfig = themeManager.getWallpaperConfig();
  const locConfig = configManager.getLocalizationConfig();
  const running = processManager.getRunningProcesses();

  let modeBadge = pc.green('[官方原版] (安全未修改)');
  if (status.mode === 'folder') {
    modeBadge = pc.yellow(pc.bold('[開發模式] (resources/app 資料夾運行中)'));
  } else if (status.mode === 'patched') {
    modeBadge = pc.cyan(pc.bold('[ASAR 已修補] (自訂增強運作中)'));
  }

  const runningText = running.length > 0
    ? pc.yellow(`運行中 (${running.length} 個程序)`)
    : pc.gray('未運行');

  const backupText = status.backupExists
    ? pc.green('[已備份] (app.asar.bak)')
    : pc.gray('[未備份]');

  let locStatusText = pc.gray('官方預設 (英文)');
  if (locConfig.enabled && locConfig.locale) {
    const locName = locConfig.locale === 'zh-TW' ? '繁體中文 (zh-TW)' : '簡體中文 (zh-CN)';
    locStatusText = pc.green(`已啟用 ${locName}`);
  }

  let wpStatusText = pc.gray('官方原生 (純色外觀)');
  if (wpConfig.active) {
    const baseName = wpConfig.imagePath ? path.basename(wpConfig.imagePath) : '無';
    wpStatusText = pc.green(`已啟用 (${baseName}) [透明度: ${Math.round(wpConfig.opacity * 100)}%]`);
  }

  const brandModeText = locConfig.brandTitle === 'hidden'
    ? '隱藏品牌名'
    : locConfig.brandTitle === 'translated'
    ? '品牌名在地化'
    : '保留英文 Antigravity';

  const widgetConfig = configManager.getFloatingWidgetConfig();
  const widgetStatusText = widgetConfig.enabled !== false
    ? pc.green(pc.bold(`[已啟用] (右下角, ${getWidgetShortcutKey()})`))
    : pc.gray('[已停用]');

  console.log(pc.bold('\n  【系統即時狀態】'));
  console.log(`  ├─ 軟體進程:    ${runningText}`);
  console.log(`  ├─ 核心狀態:    ${modeBadge}`);
  console.log(`  ├─ 介面語言:    ${locStatusText} [${brandModeText}]`);
  console.log(`  ├─ 自訂桌布:    ${wpStatusText}`);
  console.log(`  ├─ 桌面懸浮窗:  ${widgetStatusText}`);
  console.log(`  └─ 原廠備份:    ${backupText}`);
  if (wpConfig.enabled && wpConfig.imagePath) {
    console.log(pc.gray(`     ├─ 圖片路徑: ${wpConfig.imagePath}`));
    console.log(pc.gray(`     └─ 顯示效果: 透明度 ${Math.round(wpConfig.opacity * 100)}% | 模糊度 ${wpConfig.blur}px`));
  }
  console.log(pc.cyan('  ─────────────────────────────────────────────────────────────\n'));
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
    console.log(pc.yellow(`\n  [注意] 找不到本機檔案「${cleanPath}」，但仍會儲存設定並嘗試套用。`));
  }

  try {
    const result = themeManager.setWallpaper(cleanPath, {
      opacity: res.opacity,
      blur: res.blur,
    });

    console.log(pc.green(`\n  [成功] 自訂背景設定完成！`));
    console.log(pc.gray(`  圖片路徑: ${cleanPath}`));
    console.log(pc.gray(`  透明度:   ${res.opacity} | 模糊度: ${res.blur}px`));
    console.log(pc.gray(`  樣式寫入: ${result.themePath}`));

    const status = backupManager.getPatchStatus();
    if (!status.isPatched && status.mode !== 'folder') {
      console.log(pc.yellow('\n  [提示] Antigravity 目前處於官方原版狀態（未注入修補）。'));
      console.log(pc.yellow('         自訂背景需在修補 ASAR 後才會在軟體視窗中生效。'));
      const patchPrompt = await prompts({
        type: 'confirm',
        name: 'doPatch',
        message: '是否立即修補 Antigravity (Patch ASAR) 以啟用自訂背景？',
        initial: true,
      });
      if (patchPrompt.doPatch) {
        await handlePatchAsar();
        return;
      }
    } else {
      console.log(pc.cyan('  [即時生效] 已透過 Hot-Reload 套用，無需重啟視窗！'));
    }
  } catch (err) {
    console.log(pc.red(`\n  [失敗] 設定背景失敗: ${err.message}`));
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
    console.log(pc.green('\n  [成功] 已清除自訂背景，恢復官方原生純色外觀！'));
    console.log(pc.cyan('  [即時生效] 已透過 Hot-Reload 套用。'));
  } catch (err) {
    console.log(pc.red(`\n  [失敗] 清除失敗: ${err.message}`));
  }
  await waitForKey();
}

async function handleInstallChinese(targetLocale = 'zh-TW') {
  const isTw = targetLocale === 'zh-TW';
  const langName = isTw ? '繁體中文' : '簡體中文';

  const brandPrompt = await prompts({
    type: 'select',
    name: 'brandTitle',
    message: `請選擇「${langName}」左上角品牌名稱顯示方式：`,
    choices: [
      { title: '保持英文 Antigravity（推薦，美觀原生）', value: 'english' },
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
      message: `Antigravity 正在運行中。是否先關閉以解除檔案鎖定進行安裝？`,
      initial: true,
    });
    if (!res.kill) {
      console.log(pc.yellow('\n  [提示] 已取消安裝。'));
      await waitForKey();
      return;
    }
    kill = true;
  }

  const devStatus = devModeManager.getDevModeStatus();

  console.log(pc.cyan(`\n  正在安裝 ${langName} 在地化...`));
  try {
    if (devStatus.enabled) {
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
      console.log(pc.green(`\n  [成功] ${langName} 已直接注入 Folder 開發模式中！`));
    } else {
      const result = await patcher.patchAsar({
        kill,
        localization: {
          locale: targetLocale,
          brandTitle: brandPrompt.brandTitle,
        },
      });
      console.log(pc.green(`\n  [成功] ${langName} 在地化部署完成！`));
      console.log(pc.gray(`  ASAR 路徑: ${result.asarPath}`));
    }

    if (running) {
      const launchPrompt = await prompts({
        type: 'confirm',
        name: 'launch',
        message: '是否立即重新啟動 Antigravity 檢驗效果？',
        initial: true,
      });
      if (launchPrompt.launch) {
        processManager.launchApp();
        console.log(pc.green('  [成功] Antigravity 已成功重新啟動！'));
      }
    }
  } catch (err) {
    console.log(pc.red(`\n  [失敗] 安裝失敗: ${err.message}`));
  }
  await waitForKey();
}

async function handleManageLocale() {
  const currentLoc = configManager.getLocalizationConfig();
  const curLocale = currentLoc.locale || 'zh-TW';

  const res = await prompts({
    type: 'select',
    name: 'action',
    message: '請選擇中文化設定項目：',
    choices: [
      { title: `[1] 安裝 / 切換為 繁體中文在地化 (zh-TW) ${curLocale === 'zh-TW' ? '[目前使用中]' : '[推薦]'}`, value: 'tw' },
      { title: `[2] 安裝 / 切換為 簡體中文本地化 (zh-CN) ${curLocale === 'zh-CN' ? '[目前使用中]' : ''}`, value: 'cn' },
      { title: '[0] 返回主選單', value: 'back' },
    ],
  });

  if (!res.action || res.action === 'back') return;

  if (res.action === 'tw') {
    await handleInstallChinese('zh-TW');
  } else if (res.action === 'cn') {
    await handleInstallChinese('zh-CN');
  }
}

/**
 * All-in-one Setup Wizard:
 * Prompts user clearly for Language (Traditional/Simplified), Brand Mode,
 * Custom Wallpaper (path, opacity, blur), and Floating Widget toggle,
 * then executes the unified patch and launches the app.
 */
async function handleFullSetupWizard() {
  console.log(pc.cyan('\n  ┌─────────────────────────────────────────────────────────────┐'));
  console.log(pc.cyan('  │') + pc.bold(pc.white('           全能增強引導安裝精靈 (Full Setup Wizard)          ')) + pc.cyan('│'));
  console.log(pc.cyan('  │') + pc.gray('   一步到位完成：語言在地化 ‧ 自訂背景桌布 ‧ 即時桌面懸浮窗  ') + pc.cyan('│'));
  console.log(pc.cyan('  └─────────────────────────────────────────────────────────────┘\n'));

  // Step 1: Language
  const langPrompt = await prompts({
    type: 'select',
    name: 'locale',
    message: '【步驟 1/4】請選擇介面語言在地化版本：',
    choices: [
      { title: '[1] 繁體中文在地化 (zh-TW) [推薦]', value: 'zh-TW' },
      { title: '[2] 簡體中文本地化 (zh-CN)', value: 'zh-CN' },
      { title: '[0] 取消並返回主選單', value: 'cancel' },
    ],
    initial: 0,
  });

  if (!langPrompt.locale || langPrompt.locale === 'cancel') return;
  const targetLocale = langPrompt.locale;
  const langName = targetLocale === 'zh-TW' ? '繁體中文' : '簡體中文';

  // Step 2: Brand Title Style
  const brandPrompt = await prompts({
    type: 'select',
    name: 'brandTitle',
    message: `【步驟 2/4】左上角品牌名稱顯示風格：`,
    choices: [
      { title: '保持英文 Antigravity（預設推薦，保持原生美觀）', value: 'english' },
      { title: '隱藏品牌名稱', value: 'hidden' },
      { title: '啟用在地化名稱 (反重力)', value: 'translated' },
    ],
    initial: 0,
  });

  if (!brandPrompt.brandTitle) return;

  // Step 3: Wallpaper Setup
  const currentWp = themeManager.getWallpaperConfig();
  const wpChoicePrompt = await prompts({
    type: 'select',
    name: 'wpOption',
    message: '【步驟 3/4】是否設定自訂背景桌布？',
    choices: [
      { title: currentWp.enabled && currentWp.imagePath
          ? `保留目前背景圖片 (${path.basename(currentWp.imagePath)})`
          : '設定自訂背景圖片（輸入檔案路徑，支援透明度與模糊度調節）[推薦]', value: 'custom' },
      { title: '暫不設定桌布（保持官方原生純色外觀，隨時可於主選單設定）', value: 'none' },
    ],
    initial: 0,
  });

  if (!wpChoicePrompt.wpOption) return;

  let wallpaperData = null;
  if (wpChoicePrompt.wpOption === 'custom') {
    const wpQuestions = [
      {
        type: 'text',
        name: 'imagePath',
        message: '請輸入背景圖片完整路徑 (或圖片網址)：',
        initial: currentWp.imagePath || '',
        validate: (val) => {
          const clean = (val || '').replace(/^["']+|["']+$/g, '').trim();
          if (!clean) return '圖片路徑不能為空！';
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

    const wpRes = await prompts(wpQuestions);
    if (!wpRes.imagePath) return;
    const cleanPath = wpRes.imagePath.replace(/^["']+|["']+$/g, '').trim();
    if (!/^https?:\/\//i.test(cleanPath) && !fs.existsSync(cleanPath)) {
      console.log(pc.yellow(`\n  [注意] 找不到本機檔案「${cleanPath}」，但仍會儲存設定並嘗試套用。`));
    }
    wallpaperData = {
      imagePath: cleanPath,
      opacity: wpRes.opacity,
      blur: wpRes.blur,
    };
  }

  // Step 4: Floating Widget Toggle
  const currentWidget = configManager.getFloatingWidgetConfig();
  const widgetPrompt = await prompts({
    type: 'select',
    name: 'enableWidget',
    message: '【步驟 4/4】是否啟用桌面即時懸浮窗？',
    choices: [
      { title: `啟用桌面即時懸浮窗 [推薦] (螢幕右下角，即時監控 Agent 進度/檔案/指令，按 ${getWidgetShortcutKey()} 開關)`, value: true },
      { title: '暫不啟用懸浮窗', value: false },
    ],
    initial: currentWidget.enabled !== false ? 0 : 1,
  });

  if (widgetPrompt.enableWidget === undefined) return;
  const enableFloatingWidget = widgetPrompt.enableWidget;

  // Summary Box
  console.log(pc.bold('\n  ┌────────────────────────────────────────────────────────────┐'));
  console.log(pc.bold('  │ 即將套用的全能安裝設定：                                   │'));
  console.log(`  │  - 介面語言:    ${langName} (${targetLocale}) [${brandPrompt.brandTitle === 'hidden' ? '隱藏品牌名' : brandPrompt.brandTitle === 'translated' ? '在地化品牌名' : '保留英文'}]`);
  if (wallpaperData) {
    const baseWp = path.basename(wallpaperData.imagePath);
    console.log(`  │  - 背景桌布:    已啟用 (${baseWp}) [透明度 ${Math.round(wallpaperData.opacity * 100)}% | 模糊度 ${wallpaperData.blur}px]`);
  } else {
    console.log(`  │  - 背景桌布:    官方原生純色外觀`);
  }
  console.log(`  │  - 桌面懸浮窗:  ${enableFloatingWidget ? `啟用 (螢幕右下角, 快捷鍵 ${getWidgetShortcutKey()})` : '停用'}`);
  console.log(pc.bold('  └────────────────────────────────────────────────────────────┘\n'));

  const confirmPrompt = await prompts({
    type: 'confirm',
    name: 'proceed',
    message: '確定立即執行修補並套用所有設定嗎？',
    initial: true,
  });

  if (!confirmPrompt.proceed) {
    console.log(pc.yellow('\n  [提示] 已取消安裝。'));
    await waitForKey();
    return;
  }

  const running = processManager.isAntigravityRunning();
  let kill = false;

  if (running) {
    const res = await prompts({
      type: 'confirm',
      name: 'kill',
      message: 'Antigravity 正在運行中。是否自動關閉軟體以進行修補與安裝？',
      initial: true,
    });
    if (!res.kill) return;
    kill = true;
  }

  console.log(pc.cyan('\n  正在執行全能一鍵安裝與修補...'));
  try {
    // 1. Save wallpaper
    if (wallpaperData) {
      themeManager.setWallpaper(wallpaperData.imagePath, {
        opacity: wallpaperData.opacity,
        blur: wallpaperData.blur,
      });
    } else if (wpChoicePrompt.wpOption === 'none') {
      themeManager.clearWallpaper();
    }

    // 2. Save widget config
    configManager.updateFloatingWidgetConfig({ enabled: enableFloatingWidget });

    // 3. Patch ASAR
    const result = await patcher.patchAsar({
      kill,
      theme: true,
      localization: {
        locale: targetLocale,
        brandTitle: brandPrompt.brandTitle,
      },
    });

    console.log(pc.green(`\n  [成功] 全能安裝修補部署完成！`));
    console.log(pc.gray(`  已注入 ${langName} 語言套件`));
    console.log(pc.gray(`  已配置桌布與透明度樣式`));
    console.log(pc.gray(`  已配置桌面即時懸浮窗模組`));
    console.log(pc.gray(`  ASAR 檔案: ${result.asarPath}`));

    // 4. Offer launch
    const launchPrompt = await prompts({
      type: 'confirm',
      name: 'launch',
      message: '是否立即啟動 Antigravity 檢驗效果？',
      initial: true,
    });
    if (launchPrompt.launch) {
      const pid = processManager.launchApp();
      console.log(pc.green(`\n  [成功] Antigravity 已成功啟動！(PID: ${pid})`));
      if (enableFloatingWidget) {
        console.log(pc.cyan(`  [提示] 桌面即時懸浮窗已在螢幕右下角啟動 (快捷鍵 ${getWidgetShortcutKey()})。`));
      }
    }
  } catch (err) {
    console.log(pc.red(`\n  [失敗] 安裝修補失敗: ${err.message}`));
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
      console.log(pc.yellow('\n  [提示] 修補已取消。'));
      await waitForKey();
      return;
    }
    kill = true;
  }

  console.log(pc.cyan('\n  解包、注入樣式與重建 app.asar 中...'));
  try {
    const result = await patcher.patchAsar({ kill });
    console.log(pc.green(`\n  [成功] 成功修補 ASAR: ${result.asarPath}`));
    console.log(pc.gray(`  原廠備份已保存於: ${result.backupPath}`));
  } catch (err) {
    console.log(pc.red(`\n  [失敗] 修補失敗: ${err.message}`));
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
      console.log(pc.cyan('\n  正在 resources/app/ 中配置 Folder 開發模式...'));
      const result = await devModeManager.enableDevMode({ kill });
      console.log(pc.green(`\n  [成功] Folder 開發模式已啟用於: ${result.folderPath}`));
      console.log(pc.gray('  您現在可以直接修改該目錄中的所有代碼與翻譯，立即生效！'));
    } else {
      console.log(pc.cyan('\n  正在清理 Folder 開發模式並還原 ASAR 模式...'));
      const result = await devModeManager.disableDevMode({ kill });
      console.log(pc.green(`\n  [成功] Folder 開發模式已關閉。還原至: ${result.asarPath}`));
    }
  } catch (err) {
    console.log(pc.red(`\n  [失敗] 操作失敗: ${err.message}`));
  }
  await waitForKey();
}

async function handleRestore() {
  const res = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: pc.yellow('確定要完整還原為官方原版嗎？此操作將移除所有背景修補與中文化注入。'),
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
    console.log(pc.green(`\n  [成功] 已完全恢復官方原版 ASAR 於: ${result.restoredTo}`));
  } catch (err) {
    console.log(pc.red(`\n  [失敗] 還原失敗: ${err.message}`));
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
    console.log(pc.green(`\n  [成功] 已開啟目錄: ${customUiDir}`));
  } catch (err) {
    console.log(pc.red(`\n  [失敗] 無法開啟檔案總管: ${err.message}`));
  }
}

async function handleLaunchOrRestart() {
  const running = processManager.isAntigravityRunning();
  if (running) {
    const res = await prompts({
      type: 'confirm',
      name: 'restart',
      message: 'Antigravity 已在運行中。是否重新啟動它？',
      initial: true,
    });
    if (!res.restart) return;
    processManager.killProcesses();
  }

  try {
    const pid = processManager.launchApp();
    console.log(pc.green(`\n  [成功] 已成功啟動 Antigravity (PID: ${pid})`));
  } catch (err) {
    console.log(pc.red(`\n  [失敗] 啟動失敗: ${err.message}`));
  }
  await waitForKey();
}

async function handleKill() {
  const running = processManager.getRunningProcesses();
  if (running.length === 0) {
    console.log(pc.yellow('\n  [提示] 目前沒有運行中的 Antigravity 程序。'));
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
  console.log(pc.green('\n  [成功] Antigravity 程序已全數關閉。'));
  await waitForKey();
}

async function handleToggleWidget() {
  const cfg = configManager.getFloatingWidgetConfig();
  const res = await prompts({
    type: 'select',
    name: 'action',
    message: `桌面即時懸浮窗目前狀態為【${cfg.enabled !== false ? '已啟用' : '已停用'}】，請選擇操作：`,
    choices: [
      { title: cfg.enabled !== false ? '[開關] 停用桌面即時懸浮窗' : '[開關] 啟用桌面即時懸浮窗', value: 'toggle_enable' },
      { title: '[位置] 重設懸浮窗座標至螢幕右下角預設位置', value: 'reset_pos' },
      { title: '[型態] 切換預設型態 (微型膠囊 / 完整儀表板)', value: 'toggle_collapse' },
      { title: '[返回] 返回主選單', value: 'back' },
    ],
  });

  if (!res.action || res.action === 'back') return;

  if (res.action === 'toggle_enable') {
    const updated = configManager.updateFloatingWidgetConfig({ enabled: !(cfg.enabled !== false) });
    console.log(pc.green(`\n  [成功] 桌面即時懸浮窗已設定為：${updated.enabled ? '啟用' : '停用'}`));
  } else if (res.action === 'reset_pos') {
    configManager.updateFloatingWidgetConfig({ position: { x: null, y: null } });
    console.log(pc.green('\n  [成功] 已重設懸浮窗座標至螢幕右下角預設位置！'));
  } else if (res.action === 'toggle_collapse') {
    const updated = configManager.updateFloatingWidgetConfig({ collapsed: !cfg.collapsed });
    console.log(pc.green(`\n  [成功] 懸浮窗預設型態已設定為：${updated.collapsed ? '微型膠囊' : '完整儀表板'}`));
  }

  await waitForKey();
}

async function waitForKey() {
  await prompts({
    type: 'invisible',
    name: 'continue',
    message: pc.gray('\n  按 Enter 鍵繼續...'),
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
      message: '請使用上下鍵選擇操作項目，按 Enter 確定：',
      choices: [
        { title: '[01] 一鍵全能安裝引導 (繁簡中文化 + 自訂背景桌布 + 桌面懸浮窗) [推薦]', value: 'full_wizard' },
        { title: '[02] 中文化語言管理 (安裝 / 切換 繁體中文 或 簡體中文)', value: 'manage_locale' },
        { title: '[03] 自訂背景桌布 (設定圖片路徑、透明度、模糊度)', value: 'set_wallpaper' },
        { title: '[04] 清除自訂背景 (恢復官方原生純色外觀)', value: 'clear_wallpaper' },
        { title: '[05] 桌面即時懸浮窗管理 (開關 / 重設位置 / 型態切換)', value: 'toggle_widget' },
        { title: '[06] 重啟 / 啟動 Antigravity 軟體視窗', value: 'launch' },
        { title: '[07] 關閉所有 Antigravity 處理程序', value: 'kill' },
        { title: '[08] 完整還原官方原廠狀態 (清除所有修改，還原官方乾淨版)', value: 'restore' },
        { title: '[09] 開啟配置與樣式儲存資料夾 (檔案總管)', value: 'open' },
        { title: '[10] 進階工具：Folder 開發者模式 (免打包即時修改原始碼)', value: 'dev_mode' },
        { title: '[00] 離開工具箱 (Exit)', value: 'exit' },
      ],
    });

    if (!res.action || res.action === 'exit') {
      console.log(pc.cyan('\n  感謝使用 Antigravity 全能工具箱，再見！\n'));
      break;
    }

    switch (res.action) {
      case 'full_wizard':
        await handleFullSetupWizard();
        break;
      case 'manage_locale':
        await handleManageLocale();
        break;
      case 'set_wallpaper':
        await handleSetWallpaper();
        break;
      case 'clear_wallpaper':
        await handleClearWallpaper();
        break;
      case 'toggle_widget':
        await handleToggleWidget();
        break;
      case 'launch':
        await handleLaunchOrRestart();
        break;
      case 'kill':
        await handleKill();
        break;
      case 'restore':
        await handleRestore();
        break;
      case 'open':
        handleOpenExplorer();
        await waitForKey();
        break;
      case 'dev_mode':
        await handleDevMode();
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
  handleManageLocale,
  handleFullSetupWizard,
  handleFullPatch: handleFullSetupWizard,
  handleFullPatchTw: handleFullSetupWizard,
  handleRestore,
  handleToggleWidget,
};
