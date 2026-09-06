"use strict";

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const configManager = require('./configManager');

/**
 * Antigravity Desktop Floating Widget Manager
 * 
 * Manages the secondary transparent BrowserWindow anchored to the desktop corner,
 * displaying real-time agent status, active thinking time, file operations (+add/-del),
 * and interactive Ask Question decision prompts.
 * 
 * Zero emojis in any UI or notification elements (100% SVG vector icon compliant).
 */

let widgetWindow = null;
let mainWindowRef = null;
let moveDebounceTimer = null;
let isCollapsedState = false;
let electronRef = null;
let onAnswerCallback = null;

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
  const candidates = [
    path.join(__dirname, 'widget', 'widget.html'),
    path.join(__dirname, 'widget.html'),
    path.join(paths.getCustomUiDir(), 'widget', 'widget.html'),
    path.join(paths.getCustomUiDir(), 'widget.html'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }

  // Fallback to default packaged widget path
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

  const config = configManager.getFloatingWidgetConfig();
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
    alwaysOnTop: config.alwaysOnTop !== false,
    skipTaskbar: true,
    resizable: false,
    show: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true,
    },
  });

  const htmlPath = resolveWidgetHtmlPath();
  if (typeof widgetWindow.loadFile === 'function') {
    widgetWindow.loadFile(htmlPath).catch(() => {});
  } else if (typeof widgetWindow.loadURL === 'function') {
    widgetWindow.loadURL(`file://${htmlPath.replace(/\\/g, '/')}`);
  }

  widgetWindow.once('ready-to-show', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    if (typeof widgetWindow.showInactive === 'function') {
      widgetWindow.showInactive();
    } else {
      widgetWindow.show();
    }
    // Synchronize initial collapse state
    updateStatus({ isCollapsed: isCollapsedState });
  });

  // Track dragging / movement to remember coordinates
  widgetWindow.on('move', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    clearTimeout(moveDebounceTimer);
    moveDebounceTimer = setTimeout(() => {
      if (!widgetWindow || widgetWindow.isDestroyed()) return;
      try {
        const [curX, curY] = widgetWindow.getPosition();
        configManager.updateFloatingWidgetConfig({
          position: { x: curX, y: curY },
        });
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
    }
    configManager.updateFloatingWidgetConfig({ collapsed: isCollapsedState });
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
  }
}

function show() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    if (typeof widgetWindow.showInactive === 'function') {
      widgetWindow.showInactive();
    } else {
      widgetWindow.show();
    }
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
}

function getWindow() {
  return widgetWindow;
}

function isCollapsed() {
  return isCollapsedState;
}

module.exports = {
  init,
  toggle,
  show,
  hide,
  destroy,
  updateStatus,
  getWindow,
  isCollapsed,
  calculateDefaultPosition,
  isPositionOnAnyDisplay,
  resolveWidgetHtmlPath,
  setOnAnswerCallback: (cb) => {
    onAnswerCallback = cb;
  },
};
