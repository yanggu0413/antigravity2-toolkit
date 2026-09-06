const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const paths = require('../src/paths');
const configManager = require('../src/configManager');
const customUiLoader = require('../src/customUiLoader');
const processManager = require('../src/processManager');

const originalPlatform = process.platform;

function setMockPlatform(p) {
  Object.defineProperty(process, 'platform', {
    value: p,
    configurable: true,
  });
}

function restorePlatform() {
  Object.defineProperty(process, 'platform', {
    value: originalPlatform,
    configurable: true,
  });
}

async function runTests() {
  console.log('--- Running Cross-Platform Compatibility Tests ---');

  const originalSudoUser = process.env.SUDO_USER;
  const originalCustomUi = process.env.ANTIGRAVITY_CUSTOM_UI_DIR;
  const originalResourcesDir = process.env.ANTIGRAVITY_RESOURCES_DIR;
  const originalExePath = process.env.ANTIGRAVITY_EXE_PATH;
  const originalInstallDir = process.env.ANTIGRAVITY_INSTALL_DIR;

  delete process.env.ANTIGRAVITY_CUSTOM_UI_DIR;
  delete process.env.ANTIGRAVITY_RESOURCES_DIR;
  delete process.env.ANTIGRAVITY_EXE_PATH;
  delete process.env.ANTIGRAVITY_INSTALL_DIR;

  try {
    // ============================================================
    // 1. Test SUDO_USER Real Home Directory Resolution
    // ============================================================
    // On Linux
    setMockPlatform('linux');
    process.env.SUDO_USER = 'testuser';
    const linuxHome = paths.getRealUserHome();
    assert.strictEqual(typeof linuxHome, 'string');
    assert.ok(linuxHome.includes('testuser') || linuxHome === os.homedir());

    // On Darwin
    setMockPlatform('darwin');
    process.env.SUDO_USER = 'macuser';
    const macHome = paths.getRealUserHome();
    assert.strictEqual(typeof macHome, 'string');
    assert.ok(macHome.includes('macuser') || macHome === os.homedir());

    // On Windows (should ignore SUDO_USER)
    setMockPlatform('win32');
    process.env.SUDO_USER = 'someuser';
    const winHome = paths.getRealUserHome();
    assert.strictEqual(winHome, os.homedir());

    console.log('  ✔ SUDO_USER and home directory resolution verified across platforms');

    // ============================================================
    // 2. Test Installation Directory & Exe Path Fallbacks
    // ============================================================
    // macOS
    setMockPlatform('darwin');
    paths.clearInstallDirCache();
    const macDefault = paths.detectInstallationDir();
    assert.strictEqual(macDefault, '/Applications/Antigravity.app');
    const macExe = paths.getExePath('/Applications/Antigravity.app').replace(/\\/g, '/');
    assert.ok(macExe.includes('Contents/MacOS') || macExe === '/Applications/Antigravity.app');

    // Linux
    setMockPlatform('linux');
    paths.clearInstallDirCache();
    const linuxDefault = paths.detectInstallationDir();
    assert.strictEqual(linuxDefault, '/opt/antigravity');
    const linuxExe = paths.getExePath('/opt/antigravity').replace(/\\/g, '/');
    assert.ok(linuxExe.includes('antigravity'));

    // Windows
    setMockPlatform('win32');
    paths.clearInstallDirCache();
    const winDefault = paths.detectInstallationDir();
    assert.ok(winDefault.toLowerCase().includes('antigravity'));
    const winExe = paths.getExePath('C:\\Mock\\Antigravity');
    assert.ok(winExe.endsWith('Antigravity.exe'));

    console.log('  ✔ Path resolution and executable candidate detection verified');

    // ============================================================
    // 3. Test checkWritePermissions
    // ============================================================
    setMockPlatform('linux');
    // Test with a mock non-writable path
    const mockRestrictedDir = path.join(os.tmpdir(), `ag-perm-test-${Date.now()}`);
    fs.mkdirSync(mockRestrictedDir, { recursive: true });

    // Current dir is writable
    const writableCheck = paths.checkWritePermissions(mockRestrictedDir);
    assert.strictEqual(writableCheck.writable, true);

    // Mock an inaccessible path
    const nonExistentDir = path.join(mockRestrictedDir, 'nonexistent_sub');
    const permResult = paths.checkWritePermissions(nonExistentDir);
    assert.strictEqual(permResult.writable, false);
    assert.strictEqual(permResult.needsElevation, true);
    assert.ok(permResult.hint.includes('sudo'));

    fs.rmSync(mockRestrictedDir, { recursive: true, force: true });
    console.log('  ✔ checkWritePermissions diagnosis & sudo hints verified');

    // ============================================================
    // 4. Test BrowserWindow Options Across Platforms
    // ============================================================
    // A. Windows Mica
    setMockPlatform('win32');
    configManager.saveConfig({
      backgroundMaterial: 'mica',
      devTools: true,
    });
    const winMicaOpts = customUiLoader.getBrowserWindowOptions(false, '#FAFAFA');
    assert.strictEqual(winMicaOpts.backgroundMaterial, 'mica');
    assert.strictEqual(winMicaOpts.backgroundColor, '#00000000');
    assert.strictEqual(winMicaOpts.titleBarOverlay.color, '#00000000');

    // B. macOS Vibrancy
    setMockPlatform('darwin');
    configManager.saveConfig({
      backgroundMaterial: 'mica',
      devTools: true,
    });
    const macVibOpts = customUiLoader.getBrowserWindowOptions(false, '#FAFAFA');
    assert.strictEqual(macVibOpts.vibrancy, 'under-window');
    assert.strictEqual(macVibOpts.visualEffectState, 'active');
    assert.strictEqual(macVibOpts.backgroundColor, '#00000000');

    // macOS Custom Vibrancy
    configManager.saveConfig({
      macosVibrancy: 'fullscreen-ui',
      devTools: true,
    });
    const macCustomVib = customUiLoader.getBrowserWindowOptions(false, '#FAFAFA');
    assert.strictEqual(macCustomVib.vibrancy, 'fullscreen-ui');

    // macOS None
    configManager.saveConfig({
      backgroundMaterial: 'none',
      macosVibrancy: 'none',
      devTools: true,
    });
    const macNoneOpts = customUiLoader.getBrowserWindowOptions(true, '#383A42');
    assert.strictEqual(macNoneOpts.backgroundColor, '#FAFAFA');
    assert.strictEqual(macNoneOpts.vibrancy, undefined);

    // C. Linux Safe Default & Transparent Toggle
    setMockPlatform('linux');
    configManager.saveConfig({
      backgroundMaterial: 'mica',
      linuxTransparentWindow: false,
      devTools: true,
    });
    const linuxDefaultOpts = customUiLoader.getBrowserWindowOptions(false, '#FAFAFA');
    assert.strictEqual(linuxDefaultOpts.backgroundColor, '#131313');
    assert.strictEqual(linuxDefaultOpts.transparent, undefined);

    // Linux with linuxTransparentWindow: true
    configManager.saveConfig({
      backgroundMaterial: 'mica',
      linuxTransparentWindow: true,
      devTools: true,
    });
    const linuxTransOpts = customUiLoader.getBrowserWindowOptions(false, '#FAFAFA');
    assert.strictEqual(linuxTransOpts.transparent, true);
    assert.strictEqual(linuxTransOpts.backgroundColor, '#00000000');

    console.log('  ✔ BrowserWindow options verified across Windows (Mica), macOS (Vibrancy) and Linux');

    // ============================================================
    // 5. Test Launcher Scripts Integrity
    // ============================================================
    const rootDir = path.resolve(__dirname, '..');
    const shScript = path.join(rootDir, '啟動工具箱.sh');
    const commandScript = path.join(rootDir, '啟動工具箱.command');

    assert.ok(fs.existsSync(shScript), '啟動工具箱.sh must exist in project root');
    assert.ok(fs.existsSync(commandScript), '啟動工具箱.command must exist in project root');

    const shContent = fs.readFileSync(shScript, 'utf8');
    assert.ok(shContent.includes('command -v node'), '啟動工具箱.sh must check node environment');
    assert.ok(shContent.includes('antigravity2-toolkit.js'), '啟動工具箱.sh must execute toolkit');
    assert.ok(shContent.includes('"$@"'), '啟動工具箱.sh must forward CLI arguments');

    const cmdContent = fs.readFileSync(commandScript, 'utf8');
    assert.ok(cmdContent.includes('啟動工具箱.sh'), '啟動工具箱.command must delegate to 啟動工具箱.sh');

    console.log('  ✔ Universal launcher scripts (啟動工具箱.sh & .command) verified');

    console.log('Cross-Platform Compatibility Tests PASSED!');
  } finally {
    restorePlatform();
    if (originalSudoUser !== undefined) process.env.SUDO_USER = originalSudoUser;
    else delete process.env.SUDO_USER;
    if (originalCustomUi !== undefined) process.env.ANTIGRAVITY_CUSTOM_UI_DIR = originalCustomUi;
    else delete process.env.ANTIGRAVITY_CUSTOM_UI_DIR;
    if (originalResourcesDir !== undefined) process.env.ANTIGRAVITY_RESOURCES_DIR = originalResourcesDir;
    else delete process.env.ANTIGRAVITY_RESOURCES_DIR;
    if (originalExePath !== undefined) process.env.ANTIGRAVITY_EXE_PATH = originalExePath;
    else delete process.env.ANTIGRAVITY_EXE_PATH;
    if (originalInstallDir !== undefined) process.env.ANTIGRAVITY_INSTALL_DIR = originalInstallDir;
    else delete process.env.ANTIGRAVITY_INSTALL_DIR;
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Cross-Platform Compatibility Tests FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
