const fs = require('fs');
const path = require('path');
const os = require('os');
const asar = require('@electron/asar');
const paths = require('./paths');
const backupManager = require('./backupManager');
const processManager = require('./processManager');
const themeManager = require('./themeManager');
const configManager = require('./configManager');
const localizationManager = require('./localizationManager');

/**
 * Patcher module:
 * Performs AST/string injections on dist/utils.js, dist/keybindings.js,
 * copies customUiLoader.js, applies Chinese localization to dist/preload.js,
 * dist/menu.js, dist/tray.js, dist/loadingOverlay.js, and dist/updater.js,
 * and handles ASAR unpacking & repacking with boundary guarantees.
 */

const LOADER_INJECTION = `/* === AG-THEMER-LOADER-START === */
const agThemer = (function() {
    try { return require('./customUiLoader'); }
    catch (e) { console.error('[ag-themer] loader failed:', e); return null; }
})();
/* === AG-THEMER-LOADER-END === */`;

const OPTS_INJECTION = `    /* === AG-THEMER-OPTS-START === */
    const agOpts = agThemer?.getBrowserWindowOptions ? agThemer.getBrowserWindowOptions(isLight, foregroundColor) : null;
    /* === AG-THEMER-OPTS-END === */`;

const WINCONFIG_INJECTION = `        /* === AG-THEMER-WINCONFIG-START === */
        titleBarOverlay: isMacOS()
            ? false
            : (agOpts?.titleBarOverlay ?? {
                color: backgroundColor,
                symbolColor: foregroundColor,
                height: 30,
            }),
        backgroundColor: agOpts?.backgroundColor ?? backgroundColor,
        ...(agOpts?.backgroundMaterial ? { backgroundMaterial: agOpts.backgroundMaterial } : {}),
        ...(agOpts?.vibrancy ? { vibrancy: agOpts.vibrancy } : {}),
        ...(agOpts?.visualEffectState ? { visualEffectState: agOpts.visualEffectState } : {}),
        ...(agOpts?.transparent !== undefined ? { transparent: agOpts.transparent } : {}),
        /* === AG-THEMER-WINCONFIG-END === */`;

const DEVTOOLS_INJECTION = `            /* === AG-THEMER-DEVTOOLS-START === */
            devTools: agOpts?.enableDevTools ?? true,
            /* === AG-THEMER-DEVTOOLS-END === */`;

const ATTACH_INJECTION = `    /* === AG-THEMER-ATTACH-START === */
    if (agThemer?.attachCustomUi) {
        agThemer.attachCustomUi(win);
    }
    /* === AG-THEMER-ATTACH-END === */`;

const KEYBINDINGS_INJECTION = `            /* === AG-THEMER-SHORTCUTS-START === */
            // F12 or Ctrl+Shift+I: Toggle DevTools
            if (input.key === 'F12' || (isCmdOrCtrl && input.shift && input.key.toLowerCase() === 'i')) {
                win.webContents.toggleDevTools();
                event.preventDefault();
                return;
            }
            // F5 or Ctrl+R: Reload
            if (input.key === 'F5' || (isCmdOrCtrl && !input.shift && input.key.toLowerCase() === 'r')) {
                win.webContents.reload();
                event.preventDefault();
                return;
            }
            // Ctrl+Shift+R: Hard reload
            if (isCmdOrCtrl && input.shift && input.key.toLowerCase() === 'r') {
                win.webContents.reloadIgnoringCache();
                event.preventDefault();
                return;
            }
            // Ctrl+Shift+W: Toggle Desktop Floating Widget
            if (isCmdOrCtrl && input.shift && input.key.toLowerCase() === 'w') {
                try {
                    const agThemerModule = require('./customUiLoader');
                    if (agThemerModule && typeof agThemerModule.toggleFloatingWidget === 'function') {
                        agThemerModule.toggleFloatingWidget();
                        event.preventDefault();
                        return;
                    }
                } catch (_) {}
            }
            /* === AG-THEMER-SHORTCUTS-END === */`;

function isPatchedUtilsJs(content) {
  return content.includes('/* === AG-THEMER-LOADER-START === */');
}

function unpatchUtilsJs(content) {
  let cleaned = content;
  cleaned = cleaned.replace(/[ \t]*\/\* === AG-THEMER-LOADER-START === \*\/[\s\S]*?\/\* === AG-THEMER-LOADER-END === \*\/\r?\n?/g, '');
  cleaned = cleaned.replace(/[ \t]*\/\* === AG-THEMER-OPTS-START === \*\/[\s\S]*?\/\* === AG-THEMER-OPTS-END === \*\/\r?\n?/g, '');
  cleaned = cleaned.replace(/[ \t]*\/\* === AG-THEMER-ATTACH-START === \*\/[\s\S]*?\/\* === AG-THEMER-ATTACH-END === \*\/\r?\n?/g, '');

  const winConfigRegex = /[ \t]*\/\* === AG-THEMER-WINCONFIG-START === \*\/[\s\S]*?\/\* === AG-THEMER-WINCONFIG-END === \*\//g;
  const originalWinConfig = `        titleBarOverlay: isMacOS()
            ? false
            : {
                color: backgroundColor,
                symbolColor: foregroundColor,
                height: 30,
            },
        backgroundColor,`;
  cleaned = cleaned.replace(winConfigRegex, originalWinConfig);

  const devToolsRegex = /[ \t]*\/\* === AG-THEMER-DEVTOOLS-START === \*\/[\s\S]*?\/\* === AG-THEMER-DEVTOOLS-END === \*\//g;
  cleaned = cleaned.replace(devToolsRegex, '            devTools: !electron_1.app.isPackaged,');

  return cleaned;
}

function patchUtilsJs(content) {
  if (isPatchedUtilsJs(content)) {
    return content;
  }
  let text = content;

  // 1. Inject loader hook at top (after imports)
  const importAnchor = 'const loadingOverlay_1 = require("./loadingOverlay");';
  if (text.includes(importAnchor)) {
    text = text.replace(importAnchor, `${importAnchor}\n${LOADER_INJECTION}`);
  } else {
    text = `${LOADER_INJECTION}\n${text}`;
  }

  // 2. Inject agOpts before new BrowserWindow
  const winAnchorRegex = /(?:const|let|var)\s+win\s*=\s*new\s+(?:[\w$.]+\.)?BrowserWindow\s*\(\{/;
  const winMatch = text.match(winAnchorRegex);
  if (winMatch) {
    text = text.replace(winMatch[0], `${OPTS_INJECTION}\n    ${winMatch[0]}`);
  } else if (text.includes('const win = new electron_1.BrowserWindow({')) {
    text = text.replace('const win = new electron_1.BrowserWindow({', `${OPTS_INJECTION}\n    const win = new electron_1.BrowserWindow({`);
  } else {
    throw new Error('Could not find BrowserWindow creation anchor in utils.js');
  }

  // 3. Inject winconfig (backgroundColor, titleBarOverlay, backgroundMaterial)
  const targetConfig = `titleBarOverlay: isMacOS()
            ? false
            : {
                color: backgroundColor,
                symbolColor: foregroundColor,
                height: 30,
            },
        backgroundColor,`;
  if (text.includes(targetConfig)) {
    text = text.replace(targetConfig, WINCONFIG_INJECTION);
  } else {
    const tolerantRegex = /titleBarOverlay:\s*(?:\(0,\s*[\w$.]+\.isMacOS\)\(\)|[\w$.]+\.isMacOS\(\)|isMacOS\(\))\s*\?\s*false\s*:\s*\{[\s\S]*?\},?\s*backgroundColor,?[ \t]*/m;
    if (tolerantRegex.test(text)) {
      text = text.replace(tolerantRegex, WINCONFIG_INJECTION);
    } else {
      const broadRegex = /titleBarOverlay:\s*[^?]+\?[^:]+:\s*\{[\s\S]*?\},?\s*backgroundColor,?[ \t]*/m;
      if (broadRegex.test(text)) {
        text = text.replace(broadRegex, WINCONFIG_INJECTION);
      } else {
        throw new Error('Could not find titleBarOverlay/backgroundColor block in utils.js');
      }
    }
  }

  // 4. Inject devTools option
  const devToolsOriginal = 'devTools: !electron_1.app.isPackaged,';
  if (text.includes(devToolsOriginal)) {
    text = text.replace(devToolsOriginal, DEVTOOLS_INJECTION);
  } else {
    const devToolsRegex = /devTools:\s*!(?:[\w$.]+\.)?(?:app\.)?isPackaged,?[ \t]*/;
    if (devToolsRegex.test(text)) {
      text = text.replace(devToolsRegex, DEVTOOLS_INJECTION);
    }
  }

  // 5. Inject attachCustomUi
  const attachRegex = /(?:\(0\s*,\s*[\w$.]+\.attachLoadingOverlay\)|[\w$.]+\.attachLoadingOverlay|attachLoadingOverlay)\s*\([^)]*\);?/;
  const attachMatch = text.match(attachRegex);
  if (attachMatch) {
    text = text.replace(attachMatch[0], `${attachMatch[0]}\n${ATTACH_INJECTION}`);
  } else {
    const altRegex = /(?:void\s+)?win\.loadURL\s*\([^)]*\);?/;
    const altMatch = text.match(altRegex);
    if (altMatch) {
      text = text.replace(altMatch[0], `${ATTACH_INJECTION}\n    ${altMatch[0]}`);
    }
  }

  // Ensure attachCustomUi was actually injected (never silently skip!)
  if (!text.includes('/* === AG-THEMER-ATTACH-START === */')) {
    throw new Error('Could not find window attachment anchor (attachLoadingOverlay or win.loadURL) in utils.js');
  }

  return text;
}

function unpatchKeybindingsJs(content) {
  return content.replace(/[ \t]*\/\* === AG-THEMER-SHORTCUTS-START === \*\/[\s\S]*?\/\* === AG-THEMER-SHORTCUTS-END === \*\/\r?\n?/g, '');
}

function patchKeybindingsJs(content) {
  if (content.includes('/* === AG-THEMER-SHORTCUTS-START === */')) {
    return content;
  }
  let text = content;

  const keyRegex = /(?:const|let|var)\s+isCmdOrCtrl\s*=[^;]+input\.meta\s*:\s*input\.control;?/;
  const match = text.match(keyRegex);
  if (match) {
    text = text.replace(match[0], `${match[0]}\n${KEYBINDINGS_INJECTION}`);
    return text;
  }

  const exactAnchor = 'const isCmdOrCtrl = (0, utils_1.isMacOS)() ? input.meta : input.control;';
  if (text.includes(exactAnchor)) {
    text = text.replace(exactAnchor, `${exactAnchor}\n${KEYBINDINGS_INJECTION}`);
    return text;
  }

  throw new Error('Could not find key combination anchor in keybindings.js');
}

function installCustomUiLoader(targetDistDir) {
  const filesToCopy = [
    'customUiLoader.js',
    'floatingWidgetManager.js',
    'agentStatusObserver.js',
  ];
  for (const f of filesToCopy) {
    const source = path.join(__dirname, f);
    const dest = path.join(targetDistDir, f);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, dest);
    }
  }

  const widgetDir = path.join(targetDistDir, 'widget');
  if (!fs.existsSync(widgetDir)) {
    fs.mkdirSync(widgetDir, { recursive: true });
  }
  const sourceWidget = path.join(__dirname, 'widget', 'widget.html');
  if (fs.existsSync(sourceWidget)) {
    fs.copyFileSync(sourceWidget, path.join(widgetDir, 'widget.html'));
  }
  const sourcePreload = path.join(__dirname, 'widget', 'widgetPreload.js');
  if (fs.existsSync(sourcePreload)) {
    fs.copyFileSync(sourcePreload, path.join(widgetDir, 'widgetPreload.js'));
  }
}

/**
 * Patches an unpacked app directory in-place.
 * Supports both wallpaper/theming hooks and Chinese localization hooks.
 */
function patchDirectory(unpackedDir, options = {}) {
  const distDir = path.join(unpackedDir, 'dist');
  const utilsPath = path.join(distDir, 'utils.js');
  const keybindingsPath = path.join(distDir, 'keybindings.js');

  const shouldPatchTheme = options.theme !== false;
  let shouldPatchLocale = Boolean(options.localization);

  if (options.localization === undefined) {
    const cfg = configManager.getConfig();
    if (cfg.localization && cfg.localization.enabled) {
      shouldPatchLocale = true;
    }
  }

  // 1. Theme and wallpaper hooks
  if (shouldPatchTheme) {
    if (!fs.existsSync(utilsPath) || !fs.existsSync(keybindingsPath)) {
      throw new Error(`Target dist files not found in: ${distDir}`);
    }

    installCustomUiLoader(distDir);

    const utilsContent = fs.readFileSync(utilsPath, 'utf8');
    const patchedUtils = patchUtilsJs(utilsContent);
    fs.writeFileSync(utilsPath, patchedUtils, 'utf8');

    const keybindingsContent = fs.readFileSync(keybindingsPath, 'utf8');
    const patchedKeybindings = patchKeybindingsJs(keybindingsContent);
    fs.writeFileSync(keybindingsPath, patchedKeybindings, 'utf8');
  }

  // 2. Localization hooks
  if (shouldPatchLocale) {
    const locOpts = typeof options.localization === 'object'
      ? options.localization
      : (configManager.getConfig().localization || {});
    localizationManager.patchDirectoryLocalization(unpackedDir, locOpts);
  }

  return {
    success: true,
    themePatched: shouldPatchTheme,
    localizationPatched: shouldPatchLocale,
  };
}

/**
 * Unpatches an unpacked app directory in-place.
 */
function unpatchDirectory(unpackedDir, options = {}) {
  const distDir = path.join(unpackedDir, 'dist');
  const utilsPath = path.join(distDir, 'utils.js');
  const keybindingsPath = path.join(distDir, 'keybindings.js');
  const loaderPath = path.join(distDir, 'customUiLoader.js');

  if (options.theme !== false) {
    if (fs.existsSync(utilsPath)) {
      const utils = fs.readFileSync(utilsPath, 'utf8');
      fs.writeFileSync(utilsPath, unpatchUtilsJs(utils), 'utf8');
    }
    if (fs.existsSync(keybindingsPath)) {
      const keybindings = fs.readFileSync(keybindingsPath, 'utf8');
      fs.writeFileSync(keybindingsPath, unpatchKeybindingsJs(keybindings), 'utf8');
    }
    const filesToRemove = [
      path.join(distDir, 'customUiLoader.js'),
      path.join(distDir, 'floatingWidgetManager.js'),
      path.join(distDir, 'agentStatusObserver.js'),
      path.join(distDir, 'widget', 'widget.html'),
    ];
    for (const f of filesToRemove) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (_) {}
      }
    }
    const widgetDir = path.join(distDir, 'widget');
    if (fs.existsSync(widgetDir)) {
      try { fs.rmdirSync(widgetDir); } catch (_) {}
    }
  }

  if (options.localization !== false) {
    localizationManager.unpatchDirectoryLocalization(unpackedDir);
  }

  return { success: true };
}

const activeTempDirs = new Set();
function registerGlobalTempCleanup() {
  if (global.__ag_temp_cleanup_registered) return;
  global.__ag_temp_cleanup_registered = true;

  const cleanup = () => {
    for (const d of activeTempDirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
    }
    if (process.stdout.isTTY) {
      try { process.stdout.write('\x1B[?25h'); } catch (_) {}
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
  process.on('exit', cleanup);
}
registerGlobalTempCleanup();

/**
 * Full ASAR patch pipeline:
 *  1. Process check & optional kill with verification
 *  2. Backup app.asar -> app.asar.bak (protecting 0-byte files)
 *  3. Extract app.asar to temp directory and preserve all unpacked dependencies
 *  4. Patch directory (theming + optional localization + dev mode sync)
 *  5. Re-package ASAR with comprehensive native unpack flags
 *  6. Replace app.asar atomically via staged rename and merge unpacked folder
 *  7. Initialize presets & theme.css
 *  8. Re-sign app on macOS if applicable
 */
async function patchAsar(options = {}) {
  const manualDir = options.manualDir || null;

  // Permission check
  const perm = paths.checkWritePermissions(manualDir);
  if (!perm.writable && perm.needsElevation) {
    throw new Error(perm.hint);
  }

  const asarPath = paths.getAsarPath(manualDir);
  const backupPath = paths.getAsarBackupPath(manualDir);

  // 1. Process check
  if (!options.skipProcessCheck && !process.env.ANTIGRAVITY_TEST_MODE && processManager.isAntigravityRunning()) {
    if (options.kill) {
      const killed = processManager.killProcesses();
      if (!killed && processManager.isAntigravityRunning()) {
        throw new Error('Failed to terminate all Antigravity processes. Please close them manually.');
      }
    } else {
      throw new Error('Antigravity is currently running. Close it or specify --kill.');
    }
  }

  const isCorruptedOrEmpty = (p) => {
    if (!p || !fs.existsSync(p)) return true;
    try {
      const stat = fs.statSync(p);
      return !stat.isFile() || stat.size === 0;
    } catch (_) {
      return true;
    }
  };

  // If app.asar does not exist or is 0-byte but backup does, restore from backup
  if (isCorruptedOrEmpty(asarPath) && !isCorruptedOrEmpty(backupPath)) {
    console.warn('[ag-toolkit] Target ASAR is missing or 0 bytes. Self-healing from backup...');
    fs.copyFileSync(backupPath, asarPath);
  }

  if (!fs.existsSync(asarPath) || fs.statSync(asarPath).size === 0) {
    throw new Error(`Target ASAR not found or empty at: ${asarPath}`);
  }

  // 2. Ensure backup
  backupManager.backupAsar(false, manualDir);

  // Ghost patch check: if Dev Mode is active (resources/app exists), patch it directly too
  const devAppDir = paths.getDevAppDir(manualDir);
  let devModePatched = false;
  if (fs.existsSync(devAppDir)) {
    patchDirectory(devAppDir, options);
    devModePatched = true;
  }

  // 3. Extract to temp directory
  const tempDir = path.join(os.tmpdir(), `ag-toolkit-pack-${Date.now()}`);
  activeTempDirs.add(tempDir);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    asar.extractAll(asarPath, tempDir);

    // CRITICAL: Preserve all official unpacked native binaries
    const unpackedDir = paths.getAsarUnpackedDir(manualDir);
    const existingUnpackedRelPaths = [];
    if (fs.existsSync(unpackedDir)) {
      try {
        fs.cpSync(unpackedDir, tempDir, { recursive: true, force: true });
        const scanDir = (currDir, relBase) => {
          const items = fs.readdirSync(currDir);
          for (const item of items) {
            const fullPath = path.join(currDir, item);
            const relPath = relBase ? `${relBase}/${item}` : item;
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              if (relPath.startsWith('node_modules/')) {
                existingUnpackedRelPaths.push(relPath);
              }
              scanDir(fullPath, relPath);
            }
          }
        };
        scanDir(unpackedDir, '');
      } catch (e) {
        console.warn('[ag-toolkit] Warning scanning unpacked dependencies:', e.message);
      }
    }

    // 4. Patch files inside tempDir
    const patchResult = patchDirectory(tempDir, options);

    // 5. Pack back to temporary asar file with dynamic unpack patterns
    const unpackPatterns = [
      '**/*.node',
      '**/*.dll',
      '**/*.dylib',
      '**/*.so',
      '**/chrome-devtools-mcp/**',
    ];
    for (const rel of existingUnpackedRelPaths) {
      unpackPatterns.push(`**/${rel}/**`);
    }
    const unpackPattern = '{' + Array.from(new Set(unpackPatterns)).join(',') + '}';

    const tempAsar = path.join(os.tmpdir(), `ag-toolkit-out-${Date.now()}.asar`);
    await asar.createPackageWithOptions(tempDir, tempAsar, {
      unpack: unpackPattern,
      unpackDir: 'node_modules/chrome-devtools-mcp',
    });

    // 6. Replace target asar atomically using staged rename
    const asarDir = path.dirname(asarPath);
    const stagedAsar = path.join(asarDir, `.app.asar.staged-${Date.now()}`);
    fs.copyFileSync(tempAsar, stagedAsar);
    try { fs.rmSync(tempAsar, { force: true }); } catch (_) {}

    try {
      fs.renameSync(stagedAsar, asarPath);
    } catch (renameErr) {
      try {
        if (fs.existsSync(asarPath)) fs.unlinkSync(asarPath);
        fs.renameSync(stagedAsar, asarPath);
      } catch (_) {
        fs.copyFileSync(stagedAsar, asarPath);
        try { fs.unlinkSync(stagedAsar); } catch (_) {}
      }
    }

    // Merge .unpacked directory into targetUnpacked (NEVER rmSync targetUnpacked!)
    const tempUnpacked = tempAsar + '.unpacked';
    const targetUnpacked = asarPath + '.unpacked';
    if (fs.existsSync(tempUnpacked)) {
      if (!fs.existsSync(targetUnpacked)) {
        fs.mkdirSync(targetUnpacked, { recursive: true });
      }
      fs.cpSync(tempUnpacked, targetUnpacked, { recursive: true, force: true });
      try { fs.rmSync(tempUnpacked, { recursive: true, force: true }); } catch (_) {}
    }

    // Clear asar in-memory header cache
    try { asar.uncache(asarPath); } catch (_) {}

    // 7. Make sure presets and active theme exist
    if (options.theme !== false) {
      themeManager.initPresets();
      const currentConfig = configManager.getConfig();
      themeManager.applyTheme(currentConfig.currentTheme || 'custom-wallpaper');
    }

    // Update localization config if specified
    if (options.localization) {
      const locOpts = typeof options.localization === 'object'
        ? options.localization
        : {};
      configManager.updateLocalizationConfig({
        enabled: true,
        locale: locOpts.locale || 'zh-CN',
        brandTitle: locOpts.brandTitle || 'english',
      });
    }

    // 8. Re-sign app on macOS
    localizationManager.resignAppOnMac(paths.getResourcesDir(manualDir));

    return {
      success: true,
      mode: 'asar',
      asarPath,
      backupPath,
      themePatched: patchResult.themePatched,
      localizationPatched: patchResult.localizationPatched,
      devModePatched,
    };
  } finally {
    activeTempDirs.delete(tempDir);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

module.exports = {
  patchUtilsJs,
  unpatchUtilsJs,
  patchKeybindingsJs,
  unpatchKeybindingsJs,
  installCustomUiLoader,
  patchDirectory,
  unpatchDirectory,
  patchAsar,
};
