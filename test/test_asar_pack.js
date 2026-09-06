const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const asar = require('@electron/asar');

async function runAsarPackTests() {
  console.log('--- Running ASAR Pack & Boundary Tests ---');

  const sandboxResourcesDir = path.join(os.tmpdir(), `ag-test-resources-${Date.now()}`);
  const sandboxCustomUiDir = path.join(os.tmpdir(), `ag-test-customui-${Date.now()}`);

  process.env.ANTIGRAVITY_RESOURCES_DIR = sandboxResourcesDir;
  process.env.ANTIGRAVITY_CUSTOM_UI_DIR = sandboxCustomUiDir;
  process.env.ANTIGRAVITY_TEST_MODE = '1';

  fs.mkdirSync(sandboxResourcesDir, { recursive: true });

  try {
    // 1. Build a realistic mock application structure
    const mockAppDir = path.join(os.tmpdir(), `ag-mock-app-${Date.now()}`);
    const mockDist = path.join(mockAppDir, 'dist');
    const mockMcp = path.join(mockAppDir, 'node_modules', 'chrome-devtools-mcp', 'build', 'src', 'bin');

    fs.mkdirSync(mockDist, { recursive: true });
    fs.mkdirSync(mockMcp, { recursive: true });

    // Copy or write stock files
    const stockUtils = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const loadingOverlay_1 = require("./loadingOverlay");

function createWindow(url, storageManager) {
    const theme = 'DARK';
    const isLight = false;
    const backgroundColor = '#131313';
    const foregroundColor = '#FAFAFA';
    const win = new electron_1.BrowserWindow({
        titleBarStyle: 'hidden',
        titleBarOverlay: isMacOS()
            ? false
            : {
                color: backgroundColor,
                symbolColor: foregroundColor,
                height: 30,
            },
        backgroundColor,
        webPreferences: {
            preload: 'preload.js',
            devTools: !electron_1.app.isPackaged,
        },
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
            if (isCmdOrCtrl && input.key.toLowerCase() === 'q') {
                actions.onQuitRequested();
            }
        }
    });
}
`;
    fs.writeFileSync(path.join(mockDist, 'utils.js'), stockUtils, 'utf8');
    fs.writeFileSync(path.join(mockDist, 'keybindings.js'), stockKeybindings, 'utf8');
    fs.writeFileSync(path.join(mockMcp, 'chrome-devtools-mcp.js'), '// MCP Server Entry Point', 'utf8');
    fs.writeFileSync(path.join(mockAppDir, 'package.json'), JSON.stringify({ name: 'antigravity-mock', version: '2.12.2' }), 'utf8');

    // 2. Package into mock app.asar
    const targetAsar = path.join(sandboxResourcesDir, 'app.asar');
    await asar.createPackageWithOptions(mockAppDir, targetAsar, {
      unpack: '**/chrome-devtools-mcp/**',
      unpackDir: 'node_modules/chrome-devtools-mcp',
    });
    assert(fs.existsSync(targetAsar), 'Mock app.asar should be created');
    console.log('  ✔ Mock app.asar created successfully');

    // Clean up mock source
    fs.rmSync(mockAppDir, { recursive: true, force: true });

    // 3. Run patchAsar
    const patcher = require('../src/patcher');
    const backupManager = require('../src/backupManager');

    const patchResult = await patcher.patchAsar();
    assert(patchResult.success, 'patchAsar should succeed');
    assert(fs.existsSync(targetAsar), 'Patched app.asar must exist');
    assert(fs.existsSync(path.join(sandboxResourcesDir, 'app.asar.bak')), 'Backup app.asar.bak must exist');
    assert(fs.existsSync(path.join(sandboxResourcesDir, 'app.asar.unpacked.bak')), 'Backup app.asar.unpacked.bak must exist');
    console.log('  ✔ patchAsar created backup (both app.asar and unpacked dependencies) and repacked ASAR');

    // 4. Verify contents inside repacked ASAR
    const list = asar.listPackage(targetAsar);
    assert(list.some((f) => f.includes('customUiLoader.js')), 'customUiLoader.js must be present in ASAR');
    assert(list.some((f) => f.includes('floatingWidgetManager.js')), 'floatingWidgetManager.js must be present in ASAR');
    assert(list.some((f) => f.includes('agentStatusObserver.js')), 'agentStatusObserver.js must be present in ASAR');
    assert(list.some((f) => f.includes('paths.js')), 'paths.js must be present in ASAR');
    assert(list.some((f) => f.includes('configManager.js')), 'configManager.js must be present in ASAR');

    const utilsContent = asar.extractFile(targetAsar, 'dist/utils.js').toString('utf8');
    assert(utilsContent.includes('AG-THEMER-LOADER-START'), 'Repacked utils.js must contain loader hook');
    assert(utilsContent.includes('AG-THEMER-ATTACH-START'), 'Repacked utils.js must contain attach hook');

    const keysContent = asar.extractFile(targetAsar, 'dist/keybindings.js').toString('utf8');
    assert(keysContent.includes('AG-THEMER-SHORTCUTS-START'), 'Repacked keybindings must contain shortcuts');
    console.log('  ✔ Repacked ASAR contains all injected hooks and loader');

    // 5. Critical Boundary Check: chrome-devtools-mcp must be unpacked
    const unpackedMcp = path.join(
      sandboxResourcesDir,
      'app.asar.unpacked',
      'node_modules',
      'chrome-devtools-mcp',
      'build',
      'src',
      'bin',
      'chrome-devtools-mcp.js'
    );
    assert(fs.existsSync(unpackedMcp), `chrome-devtools-mcp must exist at unpacked path: ${unpackedMcp}`);
    console.log('  ✔ Packaging boundary verified: chrome-devtools-mcp is unpacked for Language Server');

    // 6. Test restoring from backup
    const restoreResult = backupManager.restoreAsar();
    assert(restoreResult.success, 'restoreAsar should succeed');
    const restoredUtils = asar.extractFile(targetAsar, 'dist/utils.js').toString('utf8');
    assert(!restoredUtils.includes('AG-THEMER'), 'Restored ASAR must be stock and have no AG-THEMER markers');
    assert(fs.existsSync(unpackedMcp), 'Restored unpacked directory must contain chrome-devtools-mcp');
    console.log('  ✔ ASAR restore successfully reverts to stock version and preserves unpacked tree');

    console.log('ASAR Pack & Boundary Tests PASSED!\n');
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
  runAsarPackTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runAsarPackTests };
