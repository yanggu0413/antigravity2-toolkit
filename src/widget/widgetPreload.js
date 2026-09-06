const { contextBridge, ipcRenderer, webFrame } = require('electron');

/**
 * Secure preload bridge for Antigravity Desktop Floating Widget.
 * Enforces strict channel whitelisting to eliminate sandbox escape / RCE vulnerabilities.
 */

const VALID_SEND_CHANNELS = new Set([
  'ag-widget-toggle-collapse',
  'ag-widget-close',
  'ag-widget-focus-main',
  'ag-widget-answer-question',
]);

const VALID_RECEIVE_CHANNELS = new Set([
  'ag-widget-update',
]);

contextBridge.exposeInMainWorld('agWidgetBridge', {
  send: (channel, ...args) => {
    if (VALID_SEND_CHANNELS.has(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  on: (channel, callback) => {
    if (VALID_RECEIVE_CHANNELS.has(channel) && typeof callback === 'function') {
      const subscription = (_event, data) => callback(data);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
  setZoomFactor: (factor) => {
    if (typeof factor === 'number' && factor >= 0.5 && factor <= 3.0) {
      webFrame.setZoomFactor(factor);
    }
  },
});
