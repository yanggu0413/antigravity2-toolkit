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

  // 2. Inject agOpts before new electron_1.BrowserWindow
  const winAnchor = 'const win = new electron_1.BrowserWindow({';
  if (!text.includes(winAnchor)) {
    throw new Error('Could not find "const win = new electron_1.BrowserWindow({" in utils.js');
  }
  text = text.replace(winAnchor, `${OPTS_INJECTION}\n    ${winAnchor}`);

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
    const tolerantRegex = /titleBarOverlay:\s*isMacOS\(\)[\s\S]*?backgroundColor,/m;
    if (tolerantRegex.test(text)) {
      text = text.replace(tolerantRegex, WINCONFIG_INJECTION);
    } else {
      throw new Error('Could not find titleBarOverlay/backgroundColor block in utils.js');
    }
  }

  // 4. Inject devTools option
  const devToolsOriginal = 'devTools: !electron_1.app.isPackaged,';
  if (text.includes(devToolsOriginal)) {
    text = text.replace(devToolsOriginal, DEVTOOLS_INJECTION);
  } else {
    const devToolsRegex = /devTools:\s*!electron_1\.app\.isPackaged,?/;
    if (devToolsRegex.test(text)) {
      text = text.replace(devToolsRegex, DEVTOOLS_INJECTION);
    }
  }

  // 5. Inject attachCustomUi
  const attachAnchor = '(0, loadingOverlay_1.attachLoadingOverlay)(win, foregroundColor, backgroundColor);';
  if (text.includes(attachAnchor)) {
    text = text.replace(attachAnchor, `${attachAnchor}\n${ATTACH_INJECTION}`);
  } else {
    const altAnchor = 'void win.loadURL(url);';
    if (text.includes(altAnchor)) {
      text = text.replace(altAnchor, `${ATTACH_INJECTION}\n    ${altAnchor}`);
    }
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

  const keyAnchor = 'const isCmdOrCtrl = (0, utils_1.isMacOS)() ? input.meta : input.control;';
  if (!text.includes(keyAnchor)) {
    throw new Error('Could not find key combination anchor in keybindings.js');
  }

  text = text.replace(keyAnchor, `${keyAnchor}\n${KEYBINDINGS_INJECTION}`);
  return text;
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

/**
 * Full ASAR patch pipeline:
 *  1. Process check & optional kill
 *  2. Backup app.asar -> app.asar.bak
 *  3. Extract app.asar to temp directory
 *  4. Patch directory (theming + optional localization)
 *  5. Re-package ASAR with unpack flags
 *  6. Replace app.asar atomically
 *  7. Initialize presets & theme.css
 *  8. Re-sign app on macOS if applicable
 */
async function patchAsar(options = {}) {
  const manualDir = options.manualDir || null;

  // Permission check on Unix
  const perm = paths.checkWritePermissions(manualDir);
  if (!perm.writable && perm.needsElevation) {
    throw new Error(perm.hint);
  }

  const asarPath = paths.getAsarPath(manualDir);
  const backupPath = paths.getAsarBackupPath(manualDir);

  // 1. Process check
  if (!options.skipProcessCheck && !process.env.ANTIGRAVITY_TEST_MODE && processManager.isAntigravityRunning()) {
    if (options.kill) {
      processManager.killProcesses();
    } else {
      throw new Error('Antigravity is currently running. Close it or specify --kill.');
    }
  }

  // If app.asar does not exist but backup does, restore from backup
  if (!fs.existsSync(asarPath) && fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, asarPath);
  }

  if (!fs.existsSync(asarPath)) {
    throw new Error(`Target ASAR not found at: ${asarPath}`);
  }

  // 2. Ensure backup
  backupManager.backupAsar(false, manualDir);

  // 3. Extract to temp directory
  const tempDir = path.join(os.tmpdir(), `ag-toolkit-pack-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    asar.extractAll(asarPath, tempDir);

    // Ensure chrome-devtools-mcp is present in tempDir before repacking
    const unpackedDir = paths.getAsarUnpackedDir(manualDir);
    const tempMcp = path.join(tempDir, 'node_modules', 'chrome-devtools-mcp');
    if (!fs.existsSync(tempMcp) && fs.existsSync(unpackedDir)) {
      const srcMcp = path.join(unpackedDir, 'node_modules', 'chrome-devtools-mcp');
      if (fs.existsSync(srcMcp)) {
        fs.cpSync(srcMcp, tempMcp, { recursive: true, force: true });
      }
    }

    // 4. Patch files inside tempDir
    const patchResult = patchDirectory(tempDir, options);

    // 5. Pack back to temporary asar file
    const tempAsar = path.join(os.tmpdir(), `ag-toolkit-out-${Date.now()}.asar`);
    await asar.createPackageWithOptions(tempDir, tempAsar, {
      unpack: '**/chrome-devtools-mcp/**',
      unpackDir: 'node_modules/chrome-devtools-mcp',
    });

    // 6. Replace target asar
    fs.copyFileSync(tempAsar, asarPath);
    try { fs.rmSync(tempAsar, { force: true }); } catch (_) {}

    // Copy .unpacked directory if generated
    const tempUnpacked = tempAsar + '.unpacked';
    const targetUnpacked = asarPath + '.unpacked';
    if (fs.existsSync(tempUnpacked)) {
      if (fs.existsSync(targetUnpacked)) {
        try { fs.rmSync(targetUnpacked, { recursive: true, force: true }); } catch (_) {}
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
    };
  } finally {
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
