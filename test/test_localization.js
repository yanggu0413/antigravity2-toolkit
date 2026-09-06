const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const asar = require('@electron/asar');
const localizationManager = require('../src/localizationManager');
const patcher = require('../src/patcher');
const backupManager = require('../src/backupManager');
const devModeManager = require('../src/devModeManager');
const configManager = require('../src/configManager');
const paths = require('../src/paths');

async function runLocalizationTests() {
  console.log('--- Running Chinese Localization & Integrated Capabilities Tests ---');

  // 1. Test Dictionary Loading & Parity
  const cnDict = localizationManager.loadDictionary({ locale: 'zh-CN', brandTitle: 'english' });
  const twDict = localizationManager.loadDictionary({ locale: 'zh-TW', brandTitle: 'english' });

  assert(Object.keys(cnDict).length > 500, 'Simplified Chinese dictionary must contain > 500 entries');
  assert(Object.keys(twDict).length > 500, 'Traditional Chinese dictionary must contain > 500 entries');
  assert.strictEqual(Object.keys(cnDict).length, Object.keys(twDict).length, 'Both dictionaries should have 1:1 key parity');
  assert.strictEqual(cnDict['Antigravity'], undefined, 'Brand title "english" must not translate Antigravity');
  console.log(`  ✔ Dictionaries loaded successfully with 1:1 parity (${Object.keys(cnDict).length} keys)`);

  // 1.1 Test Brand Title Modes
  const hiddenDict = localizationManager.loadDictionary({ locale: 'zh-CN', brandTitle: 'hidden' });
  assert.strictEqual(hiddenDict['Antigravity'], '', 'Brand title "hidden" must set Antigravity to empty string');

  const translatedDict = localizationManager.loadDictionary({ locale: 'zh-CN', brandTitle: 'translated' });
  assert(translatedDict['Antigravity'] !== undefined, 'Brand title "translated" must retain translation');
  console.log('  ✔ Brand title modes (english, hidden, translated) handled correctly');

  // 2. Test Preload.js Generation & JavaScript Syntax Compilation
  const preloadCn = localizationManager.generatePreloadJs({ locale: 'zh-CN' });
  assert(preloadCn.includes(localizationManager.SIGNATURE_START), 'Must include localization start signature');
  assert(preloadCn.includes(localizationManager.SIGNATURE_END), 'Must include localization end signature');
  assert(preloadCn.includes('const USE_TW = false;'), 'zh-CN must set USE_TW = false');

  // Validate that generated client code is 100% syntactically valid JavaScript
  assert.doesNotThrow(() => {
    new vm.Script(preloadCn);
  }, 'Generated zh-CN preload code must be syntactically valid');

  const preloadTw = localizationManager.generatePreloadJs({ locale: 'zh-TW' });
  assert(preloadTw.includes('const USE_TW = true;'), 'zh-TW must set USE_TW = true');
  assert.doesNotThrow(() => {
    new vm.Script(preloadTw);
  }, 'Generated zh-TW preload code must be syntactically valid');
  console.log('  ✔ Preload.js generated and verified as 100% valid JavaScript syntax for both zh-CN and zh-TW');

  // 3. Test Preload.js Patching & Idempotency
  const stockPreload = `"use strict";\nconst electron = require('electron');\nconsole.log('Stock preload');\n`;
  const patchedPreload = localizationManager.patchPreloadJs(stockPreload, { locale: 'zh-CN' });
  assert(localizationManager.isPatchedLocalization(patchedPreload), 'isPatchedLocalization must detect patch');
  assert.strictEqual(localizationManager.detectPatchedLocale(patchedPreload), 'zh-CN', 'Must detect zh-CN locale');

  // Idempotency: patching again must produce identical result without duplicating blocks
  const doublePatchedPreload = localizationManager.patchPreloadJs(patchedPreload, { locale: 'zh-CN' });
  assert.strictEqual(
    (doublePatchedPreload.match(new RegExp(localizationManager.SIGNATURE_START.replace(/\*/g, '\\*'), 'g')) || []).length,
    1,
    'Patching must be strictly idempotent'
  );

  // Unpatch
  const unpatchedPreload = localizationManager.unpatchPreloadJs(patchedPreload);
  assert(!localizationManager.isPatchedLocalization(unpatchedPreload), 'unpatchPreloadJs must remove patch');
  assert(unpatchedPreload.includes('Stock preload'), 'unpatchPreloadJs must preserve original code');
  console.log('  ✔ Preload.js patch, idempotency, and unpatch verified');

  // 4. Test Menu.js Patching & Unpatching
  const stockMenu = `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nconst electron_1 = require("electron");\nfunction setMenu(menu) {\n    electron_1.Menu.setApplicationMenu(menu);\n}\n`;
  const patchedMenuTw = localizationManager.patchMenuJs(stockMenu, { locale: 'zh-TW' });
  assert(patchedMenuTw.includes('Antigravity Native Menu Chinese Translation'), 'Must include menu translation block');
  assert(patchedMenuTw.includes("'File': '檔案'"), 'zh-TW menu must translate File to 檔案');

  const unpatchedMenu = localizationManager.unpatchMenuJs(patchedMenuTw);
  assert(!unpatchedMenu.includes('Antigravity Native Menu Chinese Translation'), 'unpatchMenuJs must clean translation block');
  console.log('  ✔ Native application menu.js patch and unpatch verified');

  // 5. Test Tray.js Patching & Unpatching
  const stockTray = `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nfunction createTray(actions) {\n    return actions;\n}\nfunction updateTrayAgentCount(count) {\n    countItem.label = (count > 0 ? \`\${count}\` : 'No') + ' agents' + ' running';\n}\n`;
  const patchedTrayCn = localizationManager.patchTrayJs(stockTray, { locale: 'zh-CN' });
  assert(patchedTrayCn.includes('/* --- TRAY TRANSLATION START --- */'), 'Must include tray translation block');
  assert(patchedTrayCn.includes('无运行中的 Agent'), 'zh-CN tray must translate No agents running');
  assert(patchedTrayCn.includes('个 Agent 运行中'), 'zh-CN tray must translate running count');

  const unpatchedTray = localizationManager.unpatchTrayJs(patchedTrayCn);
  assert(!unpatchedTray.includes('/* --- TRAY TRANSLATION START --- */'), 'unpatchTrayJs must clean tray block');
  console.log('  ✔ System tray.js patch and unpatch verified');

  // 6. Test LoadingOverlay.js & Updater.js Patching
  const stockOverlay = `<div class="loading"><div class="text">Loading Antigravity</div></div>`;
  const patchedOverlayTw = localizationManager.patchLoadingOverlayJs(stockOverlay, { locale: 'zh-TW' });
  assert(patchedOverlayTw.includes('Antigravity 正在載入中...'), 'Must translate loading text in zh-TW');
  const unpatchedOverlay = localizationManager.unpatchLoadingOverlayJs(patchedOverlayTw);
  assert.strictEqual(unpatchedOverlay, stockOverlay, 'Must restore exact stock loading overlay');

  const stockUpdater = `function checkUpdates() {\n    electron.dialog.showMessageBox({\n        title: 'Check for Updates',\n        message: 'No updates available',\n        buttons: ['OK'],\n    });\n}`;
  const patchedUpdaterCn = localizationManager.patchUpdaterJs(stockUpdater, { locale: 'zh-CN' });
  assert(patchedUpdaterCn.includes("title: '检查更新'"), 'Must translate update dialog title');
  const unpatchedUpdater = localizationManager.unpatchUpdaterJs(patchedUpdaterCn);
  assert(unpatchedUpdater.includes("title: 'Check for Updates'"), 'Must restore stock updater dialog');
  console.log('  ✔ Loading overlay and updater dialog patch & unpatch verified');

  // 7. Test Exclusion Protection Rules in Client Script
  assert(preloadCn.includes('monaco-editor'), 'Physical protection must filter monaco-editor');
  assert(preloadCn.includes('xterm'), 'Physical protection must filter xterm');
  assert(preloadCn.includes('thinking'), 'Physical protection must filter thinking');
  assert(preloadCn.includes('prosemirror'), 'Physical protection must filter prosemirror');
  assert(preloadCn.includes('composer'), 'Physical protection must filter composer');
  assert(preloadCn.includes('SKIP_TAGS'), 'Must define SKIP_TAGS');
  console.log('  ✔ Physical protection rules for editor, terminal, inputs, and thinking verified');

  // 8. End-to-End Integrated ASAR Test: Both Wallpaper & Localization Patched Simultaneously
  const sandboxResources = path.join(os.tmpdir(), `ag-test-unified-res-${Date.now()}`);
  const sandboxCustomUi = path.join(os.tmpdir(), `ag-test-unified-ui-${Date.now()}`);
  process.env.ANTIGRAVITY_RESOURCES_DIR = sandboxResources;
  process.env.ANTIGRAVITY_CUSTOM_UI_DIR = sandboxCustomUi;
  process.env.ANTIGRAVITY_TEST_MODE = '1';

  fs.mkdirSync(sandboxResources, { recursive: true });

  try {
    const mockAppDir = path.join(os.tmpdir(), `ag-mock-unified-${Date.now()}`);
    const mockDist = path.join(mockAppDir, 'dist');
    const mockMcp = path.join(mockAppDir, 'node_modules', 'chrome-devtools-mcp', 'build');
    fs.mkdirSync(mockDist, { recursive: true });
    fs.mkdirSync(mockMcp, { recursive: true });

    // Populate mock app files
    const stockUtils = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const loadingOverlay_1 = require("./loadingOverlay");
function createWindow(url) {
    const theme = 'DARK';
    const isLight = false;
    const backgroundColor = '#131313';
    const foregroundColor = '#FAFAFA';
    const win = new electron_1.BrowserWindow({
        titleBarStyle: 'hidden',
        titleBarOverlay: isMacOS() ? false : { color: backgroundColor, symbolColor: foregroundColor, height: 30 },
        backgroundColor,
        webPreferences: { preload: 'preload.js', devTools: !electron_1.app.isPackaged },
    });
    (0, loadingOverlay_1.attachLoadingOverlay)(win, foregroundColor, backgroundColor);
    return win;
}
`;
    const stockKeybindings = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function registerKeybindings(win, actions) {
    const isCmdOrCtrl = (0, utils_1.isMacOS)() ? input.meta : input.control;
    return isCmdOrCtrl;
}
`;
    fs.writeFileSync(path.join(mockDist, 'utils.js'), stockUtils, 'utf8');
    fs.writeFileSync(path.join(mockDist, 'keybindings.js'), stockKeybindings, 'utf8');
    fs.writeFileSync(path.join(mockDist, 'preload.js'), stockPreload, 'utf8');
    fs.writeFileSync(path.join(mockDist, 'menu.js'), stockMenu, 'utf8');
    fs.writeFileSync(path.join(mockDist, 'tray.js'), stockTray, 'utf8');
    fs.writeFileSync(path.join(mockDist, 'loadingOverlay.js'), stockOverlay, 'utf8');
    fs.writeFileSync(path.join(mockDist, 'updater.js'), stockUpdater, 'utf8');
    fs.writeFileSync(path.join(mockMcp, 'mcp_server.js'), 'module.exports = {};', 'utf8');

    const asarTarget = path.join(sandboxResources, 'app.asar');
    await asar.createPackageWithOptions(mockAppDir, asarTarget, {
      unpack: '**/chrome-devtools-mcp/**',
      unpackDir: 'node_modules/chrome-devtools-mcp',
    });

    // 8.1 Execute unified patch: both theme AND Traditional Chinese localization in a single pass!
    const patchRes = await patcher.patchAsar({
      skipProcessCheck: true,
      theme: true,
      localization: {
        locale: 'zh-TW',
        brandTitle: 'english',
      },
    });

    assert(patchRes.success, 'ASAR patch must succeed');
    assert(patchRes.themePatched, 'Theme must be marked as patched');
    assert(patchRes.localizationPatched, 'Localization must be marked as patched');

    // Verify status inspection detects both features
    const patchStatus = backupManager.getPatchStatus();
    assert.strictEqual(patchStatus.mode, 'asar-patched', 'Status must report asar-patched');
    assert(patchStatus.isPatched, 'Status must report theme as patched');
    assert(patchStatus.isLocalizationPatched, 'Status must report localization as patched');
    assert.strictEqual(patchStatus.activeLocale, 'zh-TW', 'Status must detect zh-TW active locale');
    console.log('  ✔ Unified ASAR patch executed in a single pass: wallpaper hooks + Traditional Chinese localization active');

    // 8.2 Verify content inside repacked ASAR
    const repackedUtils = asar.extractFile(asarTarget, 'dist/utils.js').toString('utf8');
    assert(repackedUtils.includes('AG-THEMER-LOADER-START'), 'Repacked ASAR must include loader');

    const repackedPreload = asar.extractFile(asarTarget, 'dist/preload.js').toString('utf8');
    assert(repackedPreload.includes('const USE_TW = true;'), 'Repacked ASAR must include Traditional Chinese preload');

    const repackedMenu = asar.extractFile(asarTarget, 'dist/menu.js').toString('utf8');
    assert(repackedMenu.includes('開新視窗'), 'Repacked ASAR must include Traditional Chinese menu');

    const repackedTray = asar.extractFile(asarTarget, 'dist/tray.js').toString('utf8');
    assert(repackedTray.includes('無執行中的 Agent'), 'Repacked ASAR must include Traditional Chinese tray');
    console.log('  ✔ All injection points confirmed intact inside repacked ASAR file');

    // 8.3 Test Unified Dev Mode (Folder Mode) with Localization
    const devModeRes = await devModeManager.enableDevMode({
      skipProcessCheck: true,
      theme: true,
      localization: {
        locale: 'zh-CN',
        brandTitle: 'english',
      },
    });
    assert(devModeRes.success, 'Dev mode enable must succeed');
    const devStatus = backupManager.getPatchStatus();
    assert.strictEqual(devStatus.mode, 'folder', 'Dev status must report folder mode');
    assert(devStatus.isLocalizationPatched, 'Dev mode must have localization patched');
    console.log('  ✔ Unified Folder Dev Mode verified with instant Chinese localization');

    await devModeManager.disableDevMode({ skipProcessCheck: true });

    // 8.4 Test Full Restore to Stock
    const restoreRes = backupManager.restoreAsar();
    assert(restoreRes.success, 'restoreAsar must succeed');
    const restoredStatus = backupManager.getPatchStatus();
    assert.strictEqual(restoredStatus.mode, 'stock', 'Restored ASAR must be in stock mode');
    assert(!restoredStatus.isPatched, 'Restored ASAR must not have theme patched');
    assert(!restoredStatus.isLocalizationPatched, 'Restored ASAR must not have localization patched');
    console.log('  ✔ Complete restore reverts ASAR to 100% official pristine stock');

    // Clean mock directories
    fs.rmSync(mockAppDir, { recursive: true, force: true });
  } finally {
    delete process.env.ANTIGRAVITY_RESOURCES_DIR;
    delete process.env.ANTIGRAVITY_CUSTOM_UI_DIR;
    delete process.env.ANTIGRAVITY_TEST_MODE;
    fs.rmSync(sandboxResources, { recursive: true, force: true });
    fs.rmSync(sandboxCustomUi, { recursive: true, force: true });
  }

  // 9. Test Legacy 1.0 HTML Architecture functions
  const mock10Dir = path.join(os.tmpdir(), `ag-test-10-${Date.now()}`);
  const mock10Workbench = path.join(mock10Dir, 'resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench');
  fs.mkdirSync(mock10Workbench, { recursive: true });

  try {
    const stockHtml = `<!DOCTYPE html><html><head><title>Antigravity</title></head><body><h1>Workbench</h1></body></html>`;
    const htmlPath = path.join(mock10Workbench, 'workbench.html');
    fs.writeFileSync(htmlPath, stockHtml, 'utf8');

    localizationManager.install10(mock10Dir, { locale: 'zh-CN' });
    const patchedHtml = fs.readFileSync(htmlPath, 'utf8');
    assert(patchedHtml.includes('ag_agent_hanhua.js'), '1.0 install must inject script tag into HTML');
    assert(fs.existsSync(path.join(mock10Dir, 'resources', 'app', 'out', 'ag_agent_hanhua.js')), 'Must generate ag_agent_hanhua.js');

    localizationManager.restore10(mock10Dir);
    const restoredHtml = fs.readFileSync(htmlPath, 'utf8');
    assert(!restoredHtml.includes('ag_agent_hanhua.js'), '1.0 restore must remove script tag');
    assert(!fs.existsSync(path.join(mock10Dir, 'resources', 'app', 'out', 'ag_agent_hanhua.js')), 'Must remove ag_agent_hanhua.js');
    console.log('  ✔ Antigravity 1.0 HTML architecture install and restore verified');
  } finally {
    fs.rmSync(mock10Dir, { recursive: true, force: true });
  }

  console.log('Chinese Localization & Integrated Capabilities Unit Tests PASSED!\n');
}

module.exports = {
  runLocalizationTests,
};
