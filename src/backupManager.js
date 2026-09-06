const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const asar = require('@electron/asar');
const localizationManager = require('./localizationManager');
const configManager = require('./configManager');

/**
 * Manages ASAR backups, restoration, and comprehensive status inspection.
 * Accurately backs up both app.asar and app.asar.unpacked to guarantee
 * that Language Server dependencies (chrome-devtools-mcp) are fully preserved.
 */

function backupAsar(force = false, manualDir = null) {
  const perm = paths.checkWritePermissions(manualDir);
  if (!perm.writable && perm.needsElevation) {
    throw new Error(perm.hint);
  }

  const asarPath = paths.getAsarPath(manualDir);
  const backupPath = paths.getAsarBackupPath(manualDir);
  const unpackedDir = paths.getAsarUnpackedDir(manualDir);
  const unpackedBackupDir = paths.getAsarUnpackedBackupDir(manualDir);

  let sourceAsar = null;
  if (fs.existsSync(asarPath)) {
    sourceAsar = asarPath;
  } else {
    const disabledPath = paths.getAsarDisabledPath(manualDir);
    if (fs.existsSync(disabledPath)) {
      sourceAsar = disabledPath;
    } else if (fs.existsSync(backupPath)) {
      sourceAsar = backupPath;
    } else {
      throw new Error(`Cannot create backup: '${asarPath}' not found.`);
    }
  }

  // Backup app.asar
  if (!fs.existsSync(backupPath) || force) {
    fs.copyFileSync(sourceAsar, backupPath);
  }

  // Backup app.asar.unpacked if present
  let unpackedBackedUp = false;
  if (fs.existsSync(unpackedDir) && (!fs.existsSync(unpackedBackupDir) || force)) {
    try {
      if (fs.existsSync(unpackedBackupDir)) {
        fs.rmSync(unpackedBackupDir, { recursive: true, force: true });
      }
      fs.cpSync(unpackedDir, unpackedBackupDir, { recursive: true, force: true });
      unpackedBackedUp = true;
    } catch (e) {
      console.warn('[ag-toolkit] Warning backing up app.asar.unpacked:', e.message);
    }
  }

  return {
    success: true,
    backupPath,
    unpackedBackupDir: fs.existsSync(unpackedBackupDir) ? unpackedBackupDir : null,
    source: sourceAsar,
  };
}

function restoreAsar(manualDir = null) {
  const perm = paths.checkWritePermissions(manualDir);
  if (!perm.writable && perm.needsElevation) {
    throw new Error(perm.hint);
  }

  const asarPath = paths.getAsarPath(manualDir);
  const backupPath = paths.getAsarBackupPath(manualDir);
  const devAppDir = paths.getDevAppDir(manualDir);
  const disabledPath = paths.getAsarDisabledPath(manualDir);
  const unpackedDir = paths.getAsarUnpackedDir(manualDir);
  const unpackedBackupDir = paths.getAsarUnpackedBackupDir(manualDir);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file '${backupPath}' not found. Cannot restore.`);
  }

  // 1. If Folder dev mode is active, remove resources/app
  if (fs.existsSync(devAppDir)) {
    fs.rmSync(devAppDir, { recursive: true, force: true });
  }

  // 2. If asar was disabled, clean up disabled file
  if (fs.existsSync(disabledPath)) {
    try { fs.rmSync(disabledPath, { force: true }); } catch (_) {}
  }

  // 3. Restore app.asar
  if (fs.existsSync(asarPath)) {
    try { fs.rmSync(asarPath, { force: true }); } catch (_) {}
  }
  fs.copyFileSync(backupPath, asarPath);
  try { asar.uncache(asarPath); } catch (_) {}

  // 4. Restore app.asar.unpacked if backup exists
  if (fs.existsSync(unpackedBackupDir)) {
    try {
      if (fs.existsSync(unpackedDir)) {
        fs.rmSync(unpackedDir, { recursive: true, force: true });
      }
      fs.cpSync(unpackedBackupDir, unpackedDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('[ag-toolkit] Warning restoring app.asar.unpacked:', e.message);
    }
  }

  // 5. Update configuration
  configManager.updateLocalizationConfig({ enabled: false });

  // 6. Re-sign macOS bundle if applicable
  localizationManager.resignAppOnMac(paths.getResourcesDir(manualDir));

  return { success: true, restoredTo: asarPath };
}

function getPatchStatus(manualDir = null) {
  const info = paths.checkInstallation(manualDir);
  let mode = 'unknown';
  let isPatched = false;
  let isLocalizationPatched = false;
  let activeLocale = null;

  if (info.devAppExists) {
    mode = 'folder';
    const utilsPath = path.join(paths.getDevAppDir(manualDir), 'dist', 'utils.js');
    if (fs.existsSync(utilsPath)) {
      const content = fs.readFileSync(utilsPath, 'utf8');
      isPatched = content.includes('AG-THEMER');
    }
    const preloadPath = path.join(paths.getDevAppDir(manualDir), 'dist', 'preload.js');
    if (fs.existsSync(preloadPath)) {
      const content = fs.readFileSync(preloadPath, 'utf8');
      isLocalizationPatched = localizationManager.isPatchedLocalization(content);
      activeLocale = localizationManager.detectPatchedLocale(content);
    }
  } else if (info.asarExists) {
    const asarFile = paths.getAsarPath(manualDir);
    try {
      const utilsContent = asar.extractFile(asarFile, 'dist/utils.js').toString('utf8');
      isPatched = utilsContent.includes('AG-THEMER');
    } catch (_) {}

    try {
      const preloadContent = asar.extractFile(asarFile, 'dist/preload.js').toString('utf8');
      isLocalizationPatched = localizationManager.isPatchedLocalization(preloadContent);
      activeLocale = localizationManager.detectPatchedLocale(preloadContent);
    } catch (_) {}

    if (isPatched || isLocalizationPatched) {
      mode = 'asar-patched';
    } else {
      mode = 'stock';
    }
  } else if (info.asarDisabledExists) {
    mode = 'dev-disabled';
  }

  const localizationConfig = configManager.getLocalizationConfig();

  return {
    ...info,
    mode,
    isPatched,
    isLocalizationPatched,
    activeLocale: activeLocale || (localizationConfig.enabled ? localizationConfig.locale : null),
    localizationConfig,
  };
}

module.exports = {
  backupAsar,
  restoreAsar,
  getPatchStatus,
};
