"use strict";

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Antigravity Desktop Floating Widget Manager
 * 
 * Manages the secondary transparent BrowserWindow anchored to the desktop corner,
 * displaying real-time agent status, active thinking time, file operations (+add/-del),
 * and interactive Ask Question decision prompts.
 * 
 * 100% Self-Contained: No reliance on external paths.js or configManager.js inside app.asar.
 * Zero emojis in any UI or notification elements (100% SVG vector icon compliant).
 */

let widgetWindow = null;
let mainWindowRef = null;
let moveDebounceTimer = null;
let isCollapsedState = false;
let electronRef = null;
let onAnswerCallback = null;

function getCustomUiDir() {
  if (process.env.ANTIGRAVITY_CUSTOM_UI_DIR) {
    return path.resolve(process.env.ANTIGRAVITY_CUSTOM_UI_DIR);
  }
  return path.join(os.homedir(), '.gemini', 'antigravity', 'custom-ui');
}

function getConfigFilePath() {
  return path.join(getCustomUiDir(), 'config.json');
}

function getFloatingWidgetConfig() {
  try {
    const cfgFile = getConfigFilePath();
    if (fs.existsSync(cfgFile)) {
      const data = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
      return data.floatingWidget || { enabled: true };
    }
  } catch (_) {}
  return {
    enabled: true,
    collapsed: false,
    alwaysOnTop: true,
    position: { x: null, y: null },
  };
}

function updateFloatingWidgetConfig(updates) {
  try {
    const configDir = getCustomUiDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const cfgFile = getConfigFilePath();
    let current = {};
    if (fs.existsSync(cfgFile)) {
      try {
        current = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
      } catch (_) {}
    }
    current.floatingWidget = {
      ...(current.floatingWidget || { enabled: true, collapsed: false, alwaysOnTop: true, position: { x: null, y: null } }),
      ...updates,
    };
    fs.writeFileSync(cfgFile, JSON.stringify(current, null, 2), 'utf8');
    return current.floatingWidget;
  } catch (_) {}
  return updates;
}

function getElectron(injectedElectron = null) {
  if (injectedElectron) return injectedElectron;
  if (electronRef) return electronRef;
  try {
    electronRef = require('electron');
    return electronRef;
  } catch (_) {
    return null;
  }
}

/**
 * Resolves the path to widget.html across local sources and custom-ui directories.
 * @returns {string}
 */
function resolveWidgetHtmlPath() {
  const customUiDir = getCustomUiDir();
  const candidates = [
    path.join(__dirname, 'widget', 'widget.html'),
    path.join(__dirname, 'widget.html'),
    path.join(customUiDir, 'widget', 'widget.html'),
    path.join(customUiDir, 'widget.html'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }

  return path.join(__dirname, 'widget', 'widget.html');
}

/**
 * Calculates default position in bottom-right corner of screen workArea.
 * @param {{ x: number, y: number, width: number, height: number }} workArea 
 * @param {boolean} isCollapsed 
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function calculateDefaultPosition(workArea, isCollapsed = false) {
  const area = workArea || { x: 0, y: 0, width: 1920, height: 1080 };
  const width = 320;
  const height = isCollapsed ? 38 : 240;
  const margin = 20;

  const x = Math.round(area.x + area.width - width - margin);
  const y = Math.round(area.y + area.height - height - margin);

  return { x, y, width, height };
}

/**
 * Checks if a coordinate is within any display's work area.
 * @param {number} x 
 * @param {number} y 
 * @param {Array} displays 
 * @returns {boolean}
 */
function isPositionOnAnyDisplay(x, y, displays = []) {
  if (!displays || displays.length === 0) return true;
  return displays.some(display => {
    const wa = display.workArea || display.bounds;
    return (
      x >= wa.x &&
      x <= (wa.x + wa.width - 50) &&
      y >= wa.y &&
      y <= (wa.y + wa.height - 30)
    );
  });
}

/**
 * Enforces highest Z-order level so the floating widget stays permanently on top of all windows.
 */
function enforceAlwaysOnTop() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const config = getFloatingWidgetConfig();
  if (config.alwaysOnTop === false) return;

  try {
    if (typeof widgetWindow.setAlwaysOnTop === 'function') {
      try {
        widgetWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      } catch (_) {
        try {
          widgetWindow.setAlwaysOnTop(true, 'screen-saver');
        } catch (_) {
          widgetWindow.setAlwaysOnTop(true);
        }
      }
    }
  } catch (_) {}

  try {
    if (typeof widgetWindow.setVisibleOnAllWorkspaces === 'function') {
      widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  } catch (_) {}

  try {
    if (typeof widgetWindow.moveTop === 'function') {
      widgetWindow.moveTop();
    }
  } catch (_) {}
}

/**
 * Initializes the Desktop Floating Widget window and IPC bindings.
 * @param {object} mainWin 
 * @param {object} [options] 
 * @returns {object|null}
 */
function init(mainWin, options = {}) {
  const electron = getElectron(options.electron);
  if (!electron || !electron.BrowserWindow) {
    return null;
  }

  mainWindowRef = mainWin;

  const config = getFloatingWidgetConfig();
  if (config.enabled === false && !options.force) {
    return null;
  }

  // If window already exists and not destroyed
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.show();
    return widgetWindow;
  }

  isCollapsedState = Boolean(config.collapsed);

  // Compute screen workArea
  let primaryWorkArea = { x: 0, y: 0, width: 1920, height: 1080 };
  let allDisplays = [];
  if (electron.screen) {
    try {
      const primary = electron.screen.getPrimaryDisplay();
      if (primary && primary.workArea) {
        primaryWorkArea = primary.workArea;
      }
      if (typeof electron.screen.getAllDisplays === 'function') {
        allDisplays = electron.screen.getAllDisplays();
      }
    } catch (_) {}
  }

  const defaultPos = calculateDefaultPosition(primaryWorkArea, isCollapsedState);
  let x = defaultPos.x;
  let y = defaultPos.y;

  if (
    config.position &&
    typeof config.position.x === 'number' &&
    typeof config.position.y === 'number'
  ) {
    if (isPositionOnAnyDisplay(config.position.x, config.position.y, allDisplays)) {
      x = Math.round(config.position.x);
      y = Math.round(config.position.y);
    }
  }

  const width = defaultPos.width;
  const height = defaultPos.height;

  widgetWindow = new electron.BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: config.alwaysOnTop !== false,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true,
    },
  });

  enforceAlwaysOnTop();

  const htmlPath = resolveWidgetHtmlPath();
  if (typeof widgetWindow.loadFile === 'function') {
    widgetWindow.loadFile(htmlPath).catch(() => {});
  } else if (typeof widgetWindow.loadURL === 'function') {
    widgetWindow.loadURL(`file://${htmlPath.replace(/\\/g, '/')}`);
  }

  const showWidget = () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    if (typeof widgetWindow.showInactive === 'function') {
      widgetWindow.showInactive();
    } else {
      widgetWindow.show();
    }
    enforceAlwaysOnTop();
    updateStatus({ isCollapsed: isCollapsedState });
  };

  widgetWindow.once('ready-to-show', showWidget);
  setTimeout(showWidget, 800);

  // Prevent accidental minimization into nowhere
  widgetWindow.on('minimize', (event) => {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      if (typeof widgetWindow.restore === 'function') {
        widgetWindow.restore();
      }
      enforceAlwaysOnTop();
    }
  });

  // Re-assert topmost priority when losing focus so Windows DWM never sinks the widget
  widgetWindow.on('blur', () => {
    enforceAlwaysOnTop();
  });

  // Whenever main window gets focus, restore, or show, ensure widget stays floating on top
  if (mainWindowRef && typeof mainWindowRef.on === 'function') {
    mainWindowRef.on('focus', enforceAlwaysOnTop);
    mainWindowRef.on('restore', enforceAlwaysOnTop);
    mainWindowRef.on('show', enforceAlwaysOnTop);
  }

  // Track dragging / movement to remember coordinates
  widgetWindow.on('move', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    clearTimeout(moveDebounceTimer);
    moveDebounceTimer = setTimeout(() => {
      if (!widgetWindow || widgetWindow.isDestroyed()) return;
      try {
        const [curX, curY] = widgetWindow.getPosition();
        updateFloatingWidgetConfig({
          position: { x: curX, y: curY },
        });
        enforceAlwaysOnTop();
      } catch (_) {}
    }, 500);
  });

  widgetWindow.on('closed', () => {
    clearTimeout(moveDebounceTimer);
    widgetWindow = null;
  });

  // Attach IPC Handlers once
  setupIpcHandlers(electron);

  return widgetWindow;
}

let ipcHandlersAttached = false;

function setupIpcHandlers(electron) {
  if (ipcHandlersAttached || !electron || !electron.ipcMain) return;
  ipcHandlersAttached = true;

  const ipc = electron.ipcMain;

  // Toggle Collapse
  ipc.on('ag-widget-toggle-collapse', (_event, isCollapsed) => {
    isCollapsedState = Boolean(isCollapsed);
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      const bounds = widgetWindow.getBounds();
      const targetHeight = isCollapsedState ? 38 : 240;
      widgetWindow.setBounds({
        x: bounds.x,
        y: isCollapsedState ? (bounds.y + (bounds.height - targetHeight)) : (bounds.y - (targetHeight - bounds.height)),
        width: bounds.width,
        height: targetHeight,
      });
      enforceAlwaysOnTop();
    }
    updateFloatingWidgetConfig({ collapsed: isCollapsedState });
  });

  // Close / Hide
  ipc.on('ag-widget-close', () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.hide();
    }
  });

  // Focus Main Window
  ipc.on('ag-widget-focus-main', () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      if (mainWindowRef.isMinimized && mainWindowRef.isMinimized()) {
        mainWindowRef.restore();
      }
      mainWindowRef.show();
      mainWindowRef.focus();
      // Crucial: Re-assert widget window stays on top of main window
      enforceAlwaysOnTop();
    }
  });

  // Forward Option Click from Widget to Main Window Observer
  ipc.on('ag-widget-answer-question', (_event, optionIndex) => {
    if (typeof onAnswerCallback === 'function') {
      try { onAnswerCallback(optionIndex); } catch (_) {}
    }
    if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.webContents) {
      mainWindowRef.webContents.send('ag-widget-select-option', optionIndex);
    }
  });

  // Status Sync from Agent DOM Observer to Widget Window
  ipc.on('ag-status-sync', (_event, payload) => {
    updateStatus(payload);
  });
}

/**
 * Sends updated status payload to the floating widget renderer.
 * @param {object} payload 
 */
function updateStatus(payload) {
  if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.webContents) {
    try {
      widgetWindow.webContents.send('ag-widget-update', payload);
    } catch (_) {}
  }
}

/**
 * Toggles visibility of the floating widget.
 */
function toggle() {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    if (mainWindowRef) {
      init(mainWindowRef, { force: true });
    }
    return;
  }

  if (widgetWindow.isVisible()) {
    widgetWindow.hide();
  } else {
    if (typeof widgetWindow.showInactive === 'function') {
      widgetWindow.showInactive();
    } else {
      widgetWindow.show();
    }
    enforceAlwaysOnTop();
  }
}

function show() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    if (typeof widgetWindow.showInactive === 'function') {
      widgetWindow.showInactive();
    } else {
      widgetWindow.show();
    }
    enforceAlwaysOnTop();
  } else if (mainWindowRef) {
    init(mainWindowRef, { force: true });
  }
}

function hide() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.hide();
  }
}

function destroy() {
  clearTimeout(moveDebounceTimer);
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.destroy();
  }
  widgetWindow = null;
  mainWindowRef = null;
}

function setOnAnswerCallback(cb) {
  onAnswerCallback = cb;
}

module.exports = {
  init,
  toggle,
  show,
  hide,
  destroy,
  updateStatus,
  calculateDefaultPosition,
  isPositionOnAnyDisplay,
  resolveWidgetHtmlPath,
  setOnAnswerCallback,
  getCustomUiDir,
  getFloatingWidgetConfig,
  updateFloatingWidgetConfig,
  enforceAlwaysOnTop,
  getWindow: () => widgetWindow,
};
