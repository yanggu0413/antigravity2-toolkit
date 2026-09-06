const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');
const paths = require('./paths');
const backupManager = require('./backupManager');
const processManager = require('./processManager');
const patcher = require('./patcher');
const themeManager = require('./themeManager');
const localizationManager = require('./localizationManager');

/**
 * Dev Mode (Folder Mode) Manager
 * Exploits Electron Fuse OnlyLoadAppFromAsar: Disabled to unpack
 * the application into resources/app/ for instant, no-repack customization.
 */

function getDevModeStatus(manualDir = null) {
  const devAppDir = paths.getDevAppDir(manualDir);
  const asarDisabledPath = paths.getAsarDisabledPath(manualDir);
  const asarPath = paths.getAsarPath(manualDir);

  const isFolderActive = fs.existsSync(devAppDir);
  const isAsarDisabled = fs.existsSync(asarDisabledPath);
  const isAsarActive = fs.existsSync(asarPath);

  return {
    enabled: isFolderActive,
    isFolderActive,
    isAsarDisabled,
    isAsarActive,
    folderPath: devAppDir,
  };
}

async function enableDevMode(options = {}) {
  const manualDir = options.manualDir || null;

  if (!options.skipProcessCheck && !process.env.ANTIGRAVITY_TEST_MODE && processManager.isAntigravityRunning()) {
    if (options.kill) {
      processManager.killProcesses();
    } else {
      throw new Error('Antigravity is currently running. Close it or specify --kill.');
    }
  }

  const devAppDir = paths.getDevAppDir(manualDir);
  const asarPath = paths.getAsarPath(manualDir);
  const asarBackupPath = paths.getAsarBackupPath(manualDir);
  const asarDisabledPath = paths.getAsarDisabledPath(manualDir);

  // 1. Ensure backup exists
  backupManager.backupAsar(false, manualDir);

  // 2. Identify source ASAR
  let sourceAsar = null;
  if (fs.existsSync(asarPath)) {
    sourceAsar = asarPath;
  } else if (fs.existsSync(asarDisabledPath)) {
    sourceAsar = asarDisabledPath;
  } else if (fs.existsSync(asarBackupPath)) {
    sourceAsar = asarBackupPath;
  } else {
    throw new Error('No valid ASAR source found to extract into Folder Mode.');
  }

  // 3. Extract to resources/app/
  if (fs.existsSync(devAppDir)) {
    fs.rmSync(devAppDir, { recursive: true, force: true });
  }
  fs.mkdirSync(devAppDir, { recursive: true });

  asar.extractAll(sourceAsar, devAppDir);

  // 4. Also copy unpacked dependencies into resources/app/node_modules if needed
  const unpackedDir = paths.getAsarUnpackedDir(manualDir);
  if (fs.existsSync(unpackedDir)) {
    const destNodeModules = path.join(devAppDir, 'node_modules');
    const srcUnpackedModules = path.join(unpackedDir, 'node_modules');
    if (fs.existsSync(srcUnpackedModules)) {
      try {
        fs.cpSync(srcUnpackedModules, destNodeModules, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  // 5. Apply patch to resources/app/ (both theme and localization)
  patcher.patchDirectory(devAppDir, options);

  // 6. Disable packed asar so Electron loads resources/app/ cleanly
  if (fs.existsSync(asarPath)) {
    if (fs.existsSync(asarDisabledPath)) {
      try { fs.rmSync(asarDisabledPath, { force: true }); } catch (_) {}
    }
    fs.renameSync(asarPath, asarDisabledPath);
  }

  // 7. Ensure theme presets exist
  if (options.theme !== false) {
    themeManager.initPresets();
    const currentConfig = require('./configManager').getConfig();
    themeManager.applyTheme(currentConfig.currentTheme || 'custom-wallpaper');
  }

  // 8. Re-sign app on macOS
  localizationManager.resignAppOnMac(paths.getResourcesDir(manualDir));

  return {
    success: true,
    mode: 'folder',
    folderPath: devAppDir,
  };
}

async function disableDevMode(options = {}) {
  const manualDir = options.manualDir || null;

  if (!options.skipProcessCheck && !process.env.ANTIGRAVITY_TEST_MODE && processManager.isAntigravityRunning()) {
    if (options.kill) {
      processManager.killProcesses();
    } else {
      throw new Error('Antigravity is currently running. Close it or specify --kill.');
    }
  }

  const devAppDir = paths.getDevAppDir(manualDir);
  const asarPath = paths.getAsarPath(manualDir);
  const asarDisabledPath = paths.getAsarDisabledPath(manualDir);
  const asarBackupPath = paths.getAsarBackupPath(manualDir);

  // 1. Remove resources/app/
  if (fs.existsSync(devAppDir)) {
    fs.rmSync(devAppDir, { recursive: true, force: true });
  }

  // 2. Restore asar
  if (fs.existsSync(asarDisabledPath)) {
    if (fs.existsSync(asarPath)) {
      try { fs.rmSync(asarPath, { force: true }); } catch (_) {}
    }
    fs.renameSync(asarDisabledPath, asarPath);
  } else if (!fs.existsSync(asarPath) && fs.existsSync(asarBackupPath)) {
    fs.copyFileSync(asarBackupPath, asarPath);
  }

  try { asar.uncache(asarPath); } catch (_) {}

  // 3. Re-sign app on macOS
  localizationManager.resignAppOnMac(paths.getResourcesDir(manualDir));

  return {
    success: true,
    mode: 'asar',
    asarPath,
  };
}

module.exports = {
  getDevModeStatus,
  enableDevMode,
  disableDevMode,
};
