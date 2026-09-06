const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const asar = require('@electron/asar');

async function runDevModeTests() {
  console.log('--- Running Folder Dev Mode Unit Tests ---');

  const sandboxResourcesDir = path.join(os.tmpdir(), `ag-test-devmode-${Date.now()}`);
  const sandboxCustomUiDir = path.join(os.tmpdir(), `ag-test-customui-${Date.now()}`);

  process.env.ANTIGRAVITY_RESOURCES_DIR = sandboxResourcesDir;
  process.env.ANTIGRAVITY_CUSTOM_UI_DIR = sandboxCustomUiDir;
  process.env.ANTIGRAVITY_TEST_MODE = '1';

  fs.mkdirSync(sandboxResourcesDir, { recursive: true });

  try {
    // 1. Build initial mock app.asar
    const mockAppDir = path.join(os.tmpdir(), `ag-mock-dev-src-${Date.now()}`);
    const mockDist = path.join(mockAppDir, 'dist');
    const mockMcp = path.join(mockAppDir, 'node_modules', 'chrome-devtools-mcp', 'build', 'src', 'bin');

    fs.mkdirSync(mockDist, { recursive: true });
    fs.mkdirSync(mockMcp, { recursive: true });

    const stockUtils = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const loadingOverlay_1 = require("./loadingOverlay");

function createWindow(url, storageManager) {
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
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown') {
            const isCmdOrCtrl = (0, utils_1.isMacOS)() ? input.meta : input.control;
            if (isCmdOrCtrl && input.key.toLowerCase() === 'q') actions.onQuitRequested();
        }
    });
}
`;
    fs.writeFileSync(path.join(mockDist, 'utils.js'), stockUtils, 'utf8');
    fs.writeFileSync(path.join(mockDist, 'keybindings.js'), stockKeybindings, 'utf8');
    fs.writeFileSync(path.join(mockDist, 'preload.js'), '// mock preload.js\n', 'utf8');
    fs.writeFileSync(path.join(mockMcp, 'chrome-devtools-mcp.js'), '// MCP Server Entry Point', 'utf8');
    fs.writeFileSync(path.join(mockAppDir, 'package.json'), JSON.stringify({ name: 'antigravity-dev-mock', version: '2.12.2' }), 'utf8');

    const targetAsar = path.join(sandboxResourcesDir, 'app.asar');
    await asar.createPackageWithOptions(mockAppDir, targetAsar, {
      unpack: '**/chrome-devtools-mcp/**',
      unpackDir: 'node_modules/chrome-devtools-mcp',
    });
    fs.rmSync(mockAppDir, { recursive: true, force: true });

    const devModeManager = require('../src/devModeManager');
    const backupManager = require('../src/backupManager');

    // 2. Initial status check
    const initialStatus = devModeManager.getDevModeStatus();
    assert(!initialStatus.enabled, 'Dev mode should initially be disabled');
    assert(initialStatus.isAsarActive, 'app.asar should initially be active');
    console.log('  ✔ Initial status correctly identifies ASAR mode');

    // 3. Enable Folder Dev Mode
    const enableResult = await devModeManager.enableDevMode();
    assert(enableResult.success, 'enableDevMode should succeed');
    assert(fs.existsSync(enableResult.folderPath), 'resources/app folder must exist');
    assert(fs.existsSync(path.join(sandboxResourcesDir, 'app.asar.dev-disabled')), 'app.asar.dev-disabled must exist');
    assert(fs.existsSync(path.join(sandboxResourcesDir, 'app.asar.bak')), 'app.asar.bak must exist');

    // Verify files inside resources/app
    const devUtils = fs.readFileSync(path.join(enableResult.folderPath, 'dist', 'utils.js'), 'utf8');
    assert(devUtils.includes('AG-THEMER-LOADER-START'), 'Folder mode utils.js must be patched');
    assert(fs.existsSync(path.join(enableResult.folderPath, 'dist', 'customUiLoader.js')), 'customUiLoader.js must exist in resources/app/dist');
    console.log('  ✔ Folder Dev Mode enabled: files extracted and patched in resources/app/');

    // 4. Status check in dev mode
    const activeStatus = devModeManager.getDevModeStatus();
    assert(activeStatus.enabled, 'Dev mode should be active');
    assert(activeStatus.isFolderActive, 'Folder should be active');
    assert(activeStatus.isAsarDisabled, 'app.asar should be disabled');

    const patchStatus = backupManager.getPatchStatus();
    assert.strictEqual(patchStatus.mode, 'folder', 'Patch status should report folder mode');
    assert(patchStatus.isPatched, 'Patch status should detect patched state');
    console.log('  ✔ Status inspection correctly reports active Folder Dev Mode');

    // 5. Simulate instant developer edit in Folder mode
    const devUtilsPath = path.join(enableResult.folderPath, 'dist', 'utils.js');
    const customDevNote = '// Instant developer modification without ASAR repacking!';
    fs.writeFileSync(devUtilsPath, customDevNote + '\n' + devUtils, 'utf8');
    const readBack = fs.readFileSync(devUtilsPath, 'utf8');
    assert(readBack.includes(customDevNote), 'Direct modification must be retained without repacking');
    console.log('  ✔ Direct filesystem edits work instantaneously in Folder Mode');

    // 6. Disable Folder Dev Mode with automatic safety backup
    const disableResult = await devModeManager.disableDevMode();
    assert(disableResult.success, 'disableDevMode should succeed');
    assert(!fs.existsSync(enableResult.folderPath), 'resources/app folder must be removed');
    assert(fs.existsSync(path.join(sandboxResourcesDir, 'app.asar')), 'app.asar must be restored');
    assert(!fs.existsSync(path.join(sandboxResourcesDir, 'app.asar.dev-disabled')), 'app.asar.dev-disabled must not exist');

    // Verify automatic safety backup directory was created
    const backupDirs = fs.readdirSync(sandboxResourcesDir).filter(f => f.startsWith('app.dev-bak-'));
    assert(backupDirs.length > 0, 'A safety backup folder app.dev-bak-* must be preserved before folder deletion');
    console.log('  ✔ Folder Dev Mode disabled: automatic safety backup created and app.asar restored');

    // 7. Status check after reverting
    const revertedStatus = devModeManager.getDevModeStatus();
    assert(!revertedStatus.enabled, 'Dev mode should be disabled');
    assert(revertedStatus.isAsarActive, 'app.asar should be active again');
    console.log('  ✔ Status inspection confirms return to ASAR mode');

    // 8. Test Ghost Patch Fix: patchAsar syncing resources/app/ during active Dev Mode
    await devModeManager.enableDevMode();
    const patcher = require('../src/patcher');
    const syncPatchResult = await patcher.patchAsar({
      localization: { locale: 'zh-TW', brandTitle: 'hidden' }
    });
    assert(syncPatchResult.success, 'patchAsar during Dev Mode should succeed');
    const devPreload = path.join(sandboxResourcesDir, 'app', 'dist', 'preload.js');
    assert(fs.existsSync(devPreload), 'Dev Mode folder resources/app/dist/preload.js must exist and be synced');
    const devPreloadContent = fs.readFileSync(devPreload, 'utf8');
    assert(devPreloadContent.includes('ANTIGRAVITY CHINESE LOCALIZATION') && devPreloadContent.includes('USE_TW = true'), 'Dev Mode folder must receive localization patch without ghost disconnect');
    console.log('  ✔ Active Dev Mode receives patch sync directly without ghost state disconnect');

    // 9. Test disableDevMode with repack option
    const devUtilsFile = path.join(sandboxResourcesDir, 'app', 'dist', 'utils.js');
    fs.appendFileSync(devUtilsFile, '\n// __REPACKED_DEV_MODIFICATIONS__\n', 'utf8');
    const repackDisableResult = await devModeManager.disableDevMode({ repack: true });
    assert(repackDisableResult.success, 'disableDevMode with repack option should succeed');
    const repackedUtils = asar.extractFile(path.join(sandboxResourcesDir, 'app.asar'), 'dist/utils.js').toString('utf8');
    assert(repackedUtils.includes('__REPACKED_DEV_MODIFICATIONS__'), 'Repacked ASAR must incorporate Dev Mode changes');
    console.log('  ✔ disableDevMode with repack option preserves and bundles developer modifications');

    console.log('Folder Dev Mode Unit Tests PASSED!\n');
  } finally {
    try {
      fs.rmSync(sandboxResourcesDir, { recursive: true, force: true });
      fs.rmSync(sandboxCustomUiDir, { recursive: true, force: true });
    } catch (_) {}
    delete process.env.ANTIGRAVITY_RESOURCES_DIR;
    delete process.env.ANTIGRAVITY_CUSTOM_UI_DIR;
    delete process.env.ANTIGRAVITY_TEST_MODE;
  }
}

if (require.main === module) {
  runDevModeTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runDevModeTests };
