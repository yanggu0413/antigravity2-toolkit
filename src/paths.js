const path = require('path');
const os = require('os');
const fs = require('fs');
const child_process = require('child_process');

/**
 * Resolves Antigravity resource directories, configuration paths,
 * installation directories, and user custom-ui storage directories.
 * Supports multi-platform auto-detection (Windows, macOS, Linux),
 * registry queries, and environment variable overrides for flexible testing.
 */

let cachedInstallDir = null;

function getRealUserHome() {
  const sudoUser = process.env.SUDO_USER;
  if (sudoUser && process.platform !== 'win32') {
    if (process.platform === 'darwin') {
      const macHome = path.join('/Users', sudoUser);
      if (fs.existsSync(macHome)) return macHome;
    } else {
      const linuxHome = path.join('/home', sudoUser);
      if (fs.existsSync(linuxHome)) return linuxHome;
    }
  }
  return os.homedir();
}

function restoreOwnership(targetPath) {
  if (process.platform === 'win32' || !targetPath || !fs.existsSync(targetPath)) {
    return;
  }
  const sudoUid = process.env.SUDO_UID;
  if (!sudoUid) return;
  const uid = parseInt(sudoUid, 10);
  const gid = parseInt(process.env.SUDO_GID || sudoUid, 10);
  if (isNaN(uid) || isNaN(gid)) return;

  try {
    const stat = fs.statSync(targetPath);
    if (stat.uid !== uid || stat.gid !== gid) {
      fs.chownSync(targetPath, uid, gid);
    }
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(targetPath);
      for (const entry of entries) {
        restoreOwnership(path.join(targetPath, entry));
      }
    }
  } catch (_) {}
}

function hasAntigravityResources(candidate) {
  if (!candidate) return false;
  return (
    // Standard resources dir (Windows / Linux / manual)
    fs.existsSync(path.join(candidate, 'resources', 'app.asar')) ||
    fs.existsSync(path.join(candidate, 'resources', 'app.asar.bak')) ||
    fs.existsSync(path.join(candidate, 'resources', 'app.asar.dev-disabled')) ||
    fs.existsSync(path.join(candidate, 'resources', 'app', 'product.json')) ||
    fs.existsSync(path.join(candidate, 'resources', 'app', 'package.json')) ||
    // macOS Contents/Resources
    fs.existsSync(path.join(candidate, 'Contents', 'Resources', 'app.asar')) ||
    fs.existsSync(path.join(candidate, 'Contents', 'Resources', 'app.asar.bak')) ||
    fs.existsSync(path.join(candidate, 'Contents', 'Resources', 'app.asar.dev-disabled')) ||
    fs.existsSync(path.join(candidate, 'Contents', 'Resources', 'app', 'product.json')) ||
    fs.existsSync(path.join(candidate, 'Contents', 'Resources', 'app', 'package.json')) ||
    // Candidate itself is the resources dir
    fs.existsSync(path.join(candidate, 'app.asar')) ||
    fs.existsSync(path.join(candidate, 'app.asar.bak')) ||
    fs.existsSync(path.join(candidate, 'app.asar.dev-disabled')) ||
    fs.existsSync(path.join(candidate, 'app', 'product.json')) ||
    fs.existsSync(path.join(candidate, 'app', 'package.json'))
  );
}

function clearInstallDirCache() {
  cachedInstallDir = null;
}

function detectInstallationDir(manualDir = null) {
  if (manualDir) {
    let resolved = path.resolve(manualDir);
    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      if (stat.isFile() && resolved.endsWith('app.asar')) {
        resolved = path.dirname(resolved);
      }
    }
    return resolved;
  }

  if (cachedInstallDir && fs.existsSync(cachedInstallDir)) {
    return cachedInstallDir;
  }

  if (process.env.ANTIGRAVITY_INSTALL_DIR && fs.existsSync(process.env.ANTIGRAVITY_INSTALL_DIR)) {
    cachedInstallDir = path.resolve(process.env.ANTIGRAVITY_INSTALL_DIR);
    return cachedInstallDir;
  }

  if (process.env.ANTIGRAVITY_HOME && fs.existsSync(process.env.ANTIGRAVITY_HOME)) {
    cachedInstallDir = path.resolve(process.env.ANTIGRAVITY_HOME);
    return cachedInstallDir;
  }

  const candidates = [];
  const seenCandidates = new Set();
  const addCandidate = (candidate) => {
    if (!candidate) return;
    try {
      const normalized = path.resolve(candidate);
      const key = normalized.toLowerCase();
      if (!seenCandidates.has(key)) {
        candidates.push(normalized);
        seenCandidates.add(key);
      }
    } catch (_) {}
  };

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';

  if (isWindows) {
    const registryRoots = [
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ];
    for (const root of registryRoots) {
      try {
        const output = child_process.execSync(`reg query "${root}" /s /f Antigravity /d`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        for (const line of output.split(/\r?\n/)) {
          const match = line.match(/^\s*(InstallLocation|DisplayIcon)\s+REG_\w+\s+(.+)$/i);
          if (!match) continue;
          let value = match[2].trim().replace(/^"|"$/g, '');
          if (/Antigravity\.exe/i.test(value)) {
            value = path.dirname(value);
          }
          addCandidate(value);
        }
      } catch (_) {}
    }

    const localAppdata = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    addCandidate(path.join(localAppdata, 'Programs', 'antigravity'));
    addCandidate(path.join(localAppdata, 'Programs', 'Antigravity'));

    const driveLetters = ['C', 'D', 'E', 'F'];
    for (const drive of driveLetters) {
      addCandidate(`${drive}:\\Programs\\Antigravity`);
      addCandidate(`${drive}:\\Antigravity`);
      addCandidate(`${drive}:\\Program Files\\Antigravity`);
      addCandidate(`${drive}:\\Program Files (x86)\\Antigravity`);
    }
  } else if (isMac) {
    const userHome = getRealUserHome();
    addCandidate('/Applications/Antigravity.app');
    addCandidate('/Applications/antigravity.app');
    addCandidate('/Applications/Antigravity 2.app');
    addCandidate(path.join(userHome, 'Applications', 'Antigravity.app'));
    addCandidate(path.join(userHome, 'Applications', 'antigravity.app'));
  } else if (isLinux) {
    addCandidate('/opt/Antigravity');
    addCandidate('/opt/antigravity');
    addCandidate('/usr/lib/antigravity');
    addCandidate('/usr/lib/Antigravity');
    addCandidate('/usr/share/antigravity');
    addCandidate('/usr/share/Antigravity');
    addCandidate('/usr/local/lib/antigravity');
    addCandidate('/usr/local/share/antigravity');

    const homeDir = getRealUserHome();
    addCandidate(path.join(homeDir, '.local', 'share', 'antigravity'));
    addCandidate(path.join(homeDir, '.local', 'share', 'Antigravity'));
    addCandidate(path.join(homeDir, '.local', 'lib', 'antigravity'));
    addCandidate(path.join(homeDir, '.local', 'lib', 'Antigravity'));
    addCandidate(path.join(homeDir, '.antigravity'));
    addCandidate(path.join(homeDir, 'antigravity'));
    addCandidate(path.join(homeDir, 'Antigravity'));

    try {
      const binPath = child_process.execSync('which antigravity 2>/dev/null || which Antigravity 2>/dev/null', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (binPath && fs.existsSync(binPath)) {
        const realBin = fs.realpathSync(binPath);
        addCandidate(path.dirname(realBin));
        addCandidate(path.dirname(path.dirname(realBin)));
      }
    } catch (_) {}
  }

  for (const p of candidates) {
    if (fs.existsSync(p) && hasAntigravityResources(p)) {
      cachedInstallDir = p;
      return p;
    }
  }

  // Fallback defaults
  if (isWindows) {
    const localAppdata = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppdata, 'Programs', 'antigravity');
  }
  if (isMac) {
    return '/Applications/Antigravity.app';
  }
  return '/opt/antigravity';
}

function getResourcesDir(manualDir = null) {
  if (process.env.ANTIGRAVITY_RESOURCES_DIR) {
    return path.resolve(process.env.ANTIGRAVITY_RESOURCES_DIR);
  }

  const installDir = detectInstallationDir(manualDir);

  if (process.platform === 'darwin') {
    if (installDir.endsWith('Contents/Resources') || installDir.endsWith('Contents\\Resources')) {
      return installDir;
    }
    const macRes = path.join(installDir, 'Contents', 'Resources');
    if (fs.existsSync(macRes)) return macRes;
  }

  if (installDir.endsWith('resources') || installDir.endsWith('resources\\')) {
    return installDir;
  }

  const standardRes = path.join(installDir, 'resources');
  if (fs.existsSync(standardRes)) {
    return standardRes;
  }

  if (fs.existsSync(path.join(installDir, 'app.asar'))) {
    return installDir;
  }

  return standardRes;
}

function getExePath(manualDir = null) {
  if (process.env.ANTIGRAVITY_EXE_PATH) {
    return path.resolve(process.env.ANTIGRAVITY_EXE_PATH);
  }

  if (process.env.ANTIGRAVITY_RESOURCES_DIR) {
    const resDir = path.resolve(process.env.ANTIGRAVITY_RESOURCES_DIR);
    if (process.platform === 'win32') {
      const c1 = path.join(resDir, '..', 'Antigravity.exe');
      const c2 = path.join(resDir, '..', 'antigravity.exe');
      if (fs.existsSync(c1)) return c1;
      if (fs.existsSync(c2)) return c2;
      return c1;
    }
    if (process.platform === 'darwin') {
      const macCandidates = [
        path.join(resDir, '..', 'MacOS', 'Antigravity'),
        path.join(resDir, '..', 'MacOS', 'antigravity'),
        path.join(resDir, '..', 'MacOS', 'Electron'),
      ];
      for (const c of macCandidates) {
        if (fs.existsSync(c)) return c;
      }
      return macCandidates[0];
    }
    const linuxCandidates = [
      path.join(resDir, '..', 'antigravity'),
      path.join(resDir, '..', 'Antigravity'),
      '/usr/bin/antigravity',
      '/usr/local/bin/antigravity',
    ];
    for (const c of linuxCandidates) {
      if (fs.existsSync(c)) return c;
    }
    return linuxCandidates[0];
  }

  const installDir = detectInstallationDir(manualDir);

  if (process.platform === 'win32') {
    const exeCandidates = [
      path.join(installDir, 'Antigravity.exe'),
      path.join(installDir, 'antigravity.exe'),
    ];
    for (const c of exeCandidates) {
      if (fs.existsSync(c)) return c;
    }
    return exeCandidates[0];
  }

  if (process.platform === 'darwin') {
    const macCandidates = [
      path.join(installDir, 'Contents', 'MacOS', 'Antigravity'),
      path.join(installDir, 'Contents', 'MacOS', 'antigravity'),
      path.join(installDir, 'Contents', 'MacOS', 'Electron'),
    ];
    for (const c of macCandidates) {
      if (fs.existsSync(c)) return c;
    }
    return macCandidates[0] || installDir;
  }

  const linuxCandidates = [
    path.join(installDir, 'antigravity'),
    path.join(installDir, 'Antigravity'),
    '/usr/bin/antigravity',
    '/usr/local/bin/antigravity',
  ];
  for (const c of linuxCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return linuxCandidates[0];
}

function getAsarPath(manualDir = null) {
  return path.join(getResourcesDir(manualDir), 'app.asar');
}

function getAsarBackupPath(manualDir = null) {
  return path.join(getResourcesDir(manualDir), 'app.asar.bak');
}

function getDevAppDir(manualDir = null) {
  return path.join(getResourcesDir(manualDir), 'app');
}

function getAsarDisabledPath(manualDir = null) {
  return path.join(getResourcesDir(manualDir), 'app.asar.dev-disabled');
}

function getAsarUnpackedDir(manualDir = null) {
  return path.join(getResourcesDir(manualDir), 'app.asar.unpacked');
}

function getAsarUnpackedBackupDir(manualDir = null) {
  return path.join(getResourcesDir(manualDir), 'app.asar.unpacked.bak');
}

function getCustomUiDir() {
  if (process.env.ANTIGRAVITY_CUSTOM_UI_DIR) {
    return path.resolve(process.env.ANTIGRAVITY_CUSTOM_UI_DIR);
  }
  return path.join(getRealUserHome(), '.gemini', 'antigravity', 'custom-ui');
}

function getConfigPath() {
  return path.join(getCustomUiDir(), 'config.json');
}

function getThemeCssPath() {
  return path.join(getCustomUiDir(), 'theme.css');
}

function getThemesDir() {
  return path.join(getCustomUiDir(), 'themes');
}

function getAssetsDir() {
  return path.join(getCustomUiDir(), 'assets');
}

function checkInstallation(manualDir = null) {
  const resourcesDir = getResourcesDir(manualDir);
  const asarPath = getAsarPath(manualDir);
  const devAppDir = getDevAppDir(manualDir);
  const asarDisabledPath = getAsarDisabledPath(manualDir);
  const backupPath = getAsarBackupPath(manualDir);
  const exePath = getExePath(manualDir);

  const resourcesExist = fs.existsSync(resourcesDir);
  const asarExists = fs.existsSync(asarPath);
  const devAppExists = fs.existsSync(devAppDir);
  const asarDisabledExists = fs.existsSync(asarDisabledPath);
  const backupExists = fs.existsSync(backupPath);
  const exeExists = fs.existsSync(exePath);

  return {
    valid: resourcesExist && (asarExists || devAppExists || asarDisabledExists || backupExists),
    resourcesDir,
    exePath,
    exeExists,
    asarExists,
    devAppExists,
    asarDisabledExists,
    backupExists,
    isDevMode: devAppExists,
  };
}

/**
 * Checks write access to resources directory and asar file,
 * returning diagnosis and elevation advice for macOS / Linux.
 */
function checkWritePermissions(manualDir = null) {
  const installDir = detectInstallationDir(manualDir);
  const resourcesDir = getResourcesDir(manualDir);
  const asarPath = getAsarPath(manualDir);

  const targetDir = fs.existsSync(resourcesDir) ? resourcesDir : (fs.existsSync(installDir) ? installDir : path.dirname(resourcesDir));

  let resourcesWritable = false;
  let asarWritable = true;

  try {
    if (fs.existsSync(targetDir)) {
      if (process.platform === 'win32') {
        const testFile = path.join(targetDir, `.ag-perm-test-${Date.now()}.tmp`);
        try {
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          resourcesWritable = true;
        } catch (_) {
          resourcesWritable = false;
        }
      } else {
        fs.accessSync(targetDir, fs.constants.W_OK | fs.constants.R_OK);
        resourcesWritable = true;
      }
    }
  } catch (_) {
    resourcesWritable = false;
  }

  try {
    if (fs.existsSync(asarPath)) {
      fs.accessSync(asarPath, fs.constants.W_OK | fs.constants.R_OK);
      asarWritable = true;
    }
  } catch (_) {
    asarWritable = false;
  }

  const writable = resourcesWritable && asarWritable;
  const isUnix = process.platform === 'darwin' || process.platform === 'linux';
  const needsElevation = !writable;

  let hint = null;
  if (needsElevation) {
    if (isUnix) {
      hint = `權限不足：無法寫入 ${targetDir}。請使用 'sudo' 重新執行此指令（例如：sudo ./啟動工具箱.sh 或 sudo ag-toolkit ...）。`;
    } else {
      hint = `權限不足：無法寫入 ${targetDir}。Antigravity 安裝於系統保護目錄，請以「系統管理員身分 (Run as Administrator)」開啟 PowerShell 或 CMD 終端機後再重新執行。`;
    }
  }

  return {
    writable,
    resourcesWritable,
    asarWritable,
    needsElevation,
    hint,
  };
}

module.exports = {
  getRealUserHome,
  restoreOwnership,
  detectInstallationDir,
  getResourcesDir,
  getExePath,
  getAsarPath,
  getAsarBackupPath,
  getDevAppDir,
  getAsarDisabledPath,
  getAsarUnpackedDir,
  getAsarUnpackedBackupDir,
  getCustomUiDir,
  getConfigPath,
  getThemeCssPath,
  getThemesDir,
  getAssetsDir,
  checkInstallation,
  checkWritePermissions,
  clearInstallDirCache,
};
