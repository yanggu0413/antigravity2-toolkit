"use strict";

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Antigravity Custom UI Runtime Loader
 * Injected into the Electron main process (dist/customUiLoader.js).
 * Handles:
 *  - Native Windows 11 Mica / Acrylic material configuration
 *  - Transparent titlebar overlay and zero-alpha background color
 *  - Safe CSS insertion & hot-reload with removeInsertedCSS (prevents memory & style leaks)
 *  - plugin:// iframe and sub-frame style penetration via WebFrameMain.executeJavaScript
 *  - Live window backdrop material switching on config change
 */

function getCustomUiDir() {
  if (process.env.ANTIGRAVITY_CUSTOM_UI_DIR) {
    return path.resolve(process.env.ANTIGRAVITY_CUSTOM_UI_DIR);
  }
  return path.join(os.homedir(), '.gemini', 'antigravity', 'custom-ui');
}

function getConfigFilePath() {
  return path.join(getCustomUiDir(), 'config.json');
}

function getThemeCssPath() {
  return path.join(getCustomUiDir(), 'theme.css');
}

function readConfig() {
  try {
    const configPath = getConfigFilePath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('[ag-themer] Warning reading config.json:', err.message);
  }
  return {
    backgroundMaterial: 'mica',
    devTools: true,
    enabled: true,
  };
}

function readThemeCss() {
  try {
    const cssPath = getThemeCssPath();
    if (fs.existsSync(cssPath)) {
      return fs.readFileSync(cssPath, 'utf8');
    }
  } catch (err) {
    console.warn('[ag-themer] Warning reading theme.css:', err.message);
  }
  return '';
}

/**
 * Computes BrowserWindow constructor overrides for Mica/Acrylic transparency and DevTools.
 * Windows 11 Mica requires:
 *   - backgroundMaterial: 'mica' (or 'acrylic')
 *   - backgroundColor: '#00000000'
 *   - titleBarOverlay: transparent color
 *   - transparent: false (MUST NOT be true, otherwise Mica fails)
 */
function getBrowserWindowOptions(isLight, foregroundColor) {
  const config = readConfig();
  const isWindows = process.platform === 'win32';
  const symbolColor = foregroundColor || (isLight ? '#383A42' : '#FAFAFA');

  const options = {
    enableDevTools: config.devTools !== false,
  };

  const material = (config.backgroundMaterial || 'mica').toLowerCase();
  if (isWindows && (material === 'mica' || material === 'acrylic')) {
    options.backgroundMaterial = material;
    options.backgroundColor = '#00000000';
    options.titleBarOverlay = {
      color: '#00000000',
      symbolColor: symbolColor,
      height: 30,
    };
  } else {
    // Non-mica default
    options.backgroundColor = isLight ? '#FAFAFA' : '#131313';
  }

  return options;
}

/**
 * Injects CSS into a specific WebFrameMain instance using executeJavaScript.
 * WebFrameMain in Electron does not have insertCSS, so script injection
 * of a persistent <style id="ag-themer-frame-style"> is the standard robust mechanism.
 */
function applyCssToFrame(frame, cssContent) {
  if (!frame || typeof frame.executeJavaScript !== 'function') return;
  try {
    const serializedCss = JSON.stringify(cssContent || '');
    const script = `
      (function() {
        function inject() {
          var doc = document;
          if (!doc || (!doc.head && !doc.documentElement)) {
            setTimeout(inject, 50);
            return;
          }
          var id = 'ag-themer-frame-style';
          var el = doc.getElementById(id);
          if (!el) {
            el = doc.createElement('style');
            el.id = id;
            (doc.head || doc.documentElement).appendChild(el);
          }
          el.textContent = ${serializedCss};
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', inject, { once: true });
        } else {
          inject();
        }
      })();
    `;
    frame.executeJavaScript(script).catch(() => {});
  } catch (_) {}
}

/**
 * Attaches the custom CSS injector and hot reloader to a BrowserWindow instance.
 */
function attachCustomUi(win) {
  if (!win || !win.webContents) {
    return;
  }

  let currentCssKey = null;
  let cssWatcher = null;
  let pollInterval = null;
  let lastMtime = 0;
  let debounceTimer = null;
  let isApplying = false;
  let pendingReload = false;

  /**
   * Applies CSS to the main frame safely without race-condition key leaks.
   */
  async function applyCssToMainFrame(cssContent) {
    if (!win || win.isDestroyed()) return;

    if (isApplying) {
      pendingReload = true;
      return;
    }

    isApplying = true;
    try {
      if (currentCssKey) {
        const keyToRemove = currentCssKey;
        currentCssKey = null;
        try {
          await win.webContents.removeInsertedCSS(keyToRemove);
        } catch (_) {
          // Page may have navigated or frame destroyed
        }
      }

      if (cssContent && cssContent.trim().length > 0 && !win.isDestroyed()) {
        currentCssKey = await win.webContents.insertCSS(cssContent);
      }
    } catch (err) {
      if (!win.isDestroyed()) {
        console.warn('[ag-themer] Failed to insert CSS into main frame:', err.message);
      }
    } finally {
      isApplying = false;
      if (pendingReload) {
        pendingReload = false;
        void applyCssToMainFrame(readThemeCss());
      }
    }
  }

  /**
   * Applies CSS across main frame and all child/plugin frames.
   */
  function applyCssToAllFrames(cssContent) {
    if (!win || win.isDestroyed()) return;
    void applyCssToMainFrame(cssContent);

    // Update main frame style tag as well for persistent reliability
    try {
      const mainFrame = win.webContents.mainFrame;
      if (mainFrame) {
        applyCssToFrame(mainFrame, cssContent);
        const frames = Array.isArray(mainFrame.framesInSubtree)
          ? mainFrame.framesInSubtree.filter((f) => f !== mainFrame)
          : (mainFrame.frames || []);
        for (const frame of frames) {
          applyCssToFrame(frame, cssContent);
        }
      }
    } catch (_) {}
  }

  /**
   * Updates native window material live if supported.
   */
  function updateWindowMaterial() {
    if (!win || win.isDestroyed() || process.platform !== 'win32') return;
    try {
      const cfg = readConfig();
      const mat = (cfg.backgroundMaterial || 'mica').toLowerCase();
      if (typeof win.setBackgroundMaterial === 'function') {
        win.setBackgroundMaterial(mat === 'mica' || mat === 'acrylic' ? mat : 'none');
      }
    } catch (_) {}
  }

  function reloadTheme() {
    updateWindowMaterial();
    const cssContent = readThemeCss();
    applyCssToAllFrames(cssContent);
  }

  // Initial injection when DOM is ready or finishes loading
  win.webContents.on('dom-ready', () => {
    reloadTheme();
  });

  win.webContents.on('did-finish-load', () => {
    reloadTheme();
  });

  win.webContents.on('did-navigate', () => {
    currentCssKey = null;
    reloadTheme();
  });

  // Penetrate plugin:// and other child frames on creation
  win.webContents.on('frame-created', (_event, details) => {
    const frame = details?.frame;
    if (!frame) return;

    const inject = () => {
      if (!win || win.isDestroyed()) return;
      const cssContent = readThemeCss();
      applyCssToFrame(frame, cssContent);
    };

    inject();
    setTimeout(inject, 100);
    setTimeout(inject, 500);
    setTimeout(inject, 1500);
  });

  // Setup Hot-Reload Watcher
  const cssPath = getThemeCssPath();
  const configPath = getConfigFilePath();

  function triggerHotReload() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        if (fs.existsSync(cssPath)) {
          const stat = fs.statSync(cssPath);
          lastMtime = stat.mtimeMs;
        }
      } catch (_) {}
      reloadTheme();
    }, 100);
  }

  try {
    const customUiDir = getCustomUiDir();
    if (!fs.existsSync(customUiDir)) {
      fs.mkdirSync(customUiDir, { recursive: true });
    }
    cssWatcher = fs.watch(customUiDir, (_eventType, filename) => {
      if (filename === 'theme.css' || filename === 'config.json') {
        triggerHotReload();
      }
    });
  } catch (err) {
    console.warn('[ag-themer] fs.watch setup warning:', err.message);
  }

  // Polling fallback every 2000ms in case OS file watch events are missed
  pollInterval = setInterval(() => {
    try {
      if (fs.existsSync(cssPath)) {
        const stat = fs.statSync(cssPath);
        if (stat.mtimeMs !== lastMtime) {
          lastMtime = stat.mtimeMs;
          reloadTheme();
        }
      }
    } catch (_) {}
  }, 2000);

  // Clean up all resources when window is closed
  win.once('closed', () => {
    if (cssWatcher) {
      try { cssWatcher.close(); } catch (_) {}
      cssWatcher = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    clearTimeout(debounceTimer);
    currentCssKey = null;
  });
}

module.exports = {
  getBrowserWindowOptions,
  applyCssToFrame,
  attachCustomUi,
  readConfig,
  readThemeCss,
};
