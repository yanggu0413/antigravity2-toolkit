const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const DEFAULT_CONFIG = {
  version: 1,
  enabled: true,
  currentTheme: 'custom-wallpaper',
  backgroundMaterial: 'none', // 'mica' | 'acrylic' | 'none'
  devTools: true,
  wallpaper: {
    enabled: false,
    imagePath: '',
    opacity: 0.35,
    blur: 0,
  },
  customCss: '',
  localization: {
    enabled: false,
    locale: 'zh-CN', // 'zh-CN' | 'zh-TW'
    brandTitle: 'english', // 'english' | 'hidden' | 'translated'
  },
  floatingWidget: {
    enabled: true,
    collapsed: false,
    alwaysOnTop: true,
    position: { x: null, y: null },
    size: { width: 420, height: 480 },
  },
};

function ensureCustomUiDirs() {
  const customUiDir = paths.getCustomUiDir();
  const themesDir = paths.getThemesDir();
  const assetsDir = paths.getAssetsDir();

  if (!fs.existsSync(customUiDir)) {
    fs.mkdirSync(customUiDir, { recursive: true });
  }
  if (!fs.existsSync(themesDir)) {
    fs.mkdirSync(themesDir, { recursive: true });
  }
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  const widgetDir = path.join(customUiDir, 'widget');
  if (!fs.existsSync(widgetDir)) {
    fs.mkdirSync(widgetDir, { recursive: true });
  }
  const destWidgetHtml = path.join(widgetDir, 'widget.html');
  const srcWidgetHtml = path.join(__dirname, 'widget', 'widget.html');
  if (!fs.existsSync(destWidgetHtml) && fs.existsSync(srcWidgetHtml)) {
    try {
      fs.copyFileSync(srcWidgetHtml, destWidgetHtml);
    } catch (_) {}
  }
  const destWidgetPreload = path.join(widgetDir, 'widgetPreload.js');
  const srcWidgetPreload = path.join(__dirname, 'widget', 'widgetPreload.js');
  if (!fs.existsSync(destWidgetPreload) && fs.existsSync(srcWidgetPreload)) {
    try {
      fs.copyFileSync(srcWidgetPreload, destWidgetPreload);
    } catch (_) {}
  }
  paths.restoreOwnership(customUiDir);
}

function getConfig() {
  ensureCustomUiDirs();
  const configPath = paths.getConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        wallpaper: {
          ...DEFAULT_CONFIG.wallpaper,
          ...(parsed.wallpaper || {}),
        },
        localization: {
          ...DEFAULT_CONFIG.localization,
          ...(parsed.localization || {}),
        },
        floatingWidget: {
          ...DEFAULT_CONFIG.floatingWidget,
          ...(parsed.floatingWidget || {}),
          position: {
            ...DEFAULT_CONFIG.floatingWidget.position,
            ...((parsed.floatingWidget && parsed.floatingWidget.position) || {}),
          },
        },
      };
    } catch (e) {
      console.warn('Failed to parse config.json, returning default:', e.message);
    }
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  ensureCustomUiDirs();
  const configPath = paths.getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  paths.restoreOwnership(configPath);
}

function updateConfig(partial) {
  const current = getConfig();
  const merged = {
    ...current,
    ...partial,
    wallpaper: {
      ...current.wallpaper,
      ...(partial.wallpaper || {}),
    },
    localization: {
      ...current.localization,
      ...(partial.localization || {}),
    },
    floatingWidget: {
      ...current.floatingWidget,
      ...(partial.floatingWidget || {}),
      position: {
        ...(current.floatingWidget?.position || {}),
        ...((partial.floatingWidget && partial.floatingWidget.position) || {}),
      },
    },
  };
  saveConfig(merged);
  return merged;
}

function getLocalizationConfig() {
  const cfg = getConfig();
  return cfg.localization || DEFAULT_CONFIG.localization;
}

function updateLocalizationConfig(partial) {
  const current = getLocalizationConfig();
  const updated = { ...current, ...partial };
  updateConfig({ localization: updated });
  return updated;
}

function getFloatingWidgetConfig() {
  const cfg = getConfig();
  return cfg.floatingWidget || DEFAULT_CONFIG.floatingWidget;
}

function updateFloatingWidgetConfig(partial) {
  const current = getFloatingWidgetConfig();
  const updated = {
    ...current,
    ...partial,
    position: {
      ...(current.position || {}),
      ...((partial && partial.position) || {}),
    },
  };
  updateConfig({ floatingWidget: updated });
  return updated;
}

module.exports = {
  DEFAULT_CONFIG,
  ensureCustomUiDirs,
  getConfig,
  saveConfig,
  updateConfig,
  getLocalizationConfig,
  updateLocalizationConfig,
  getFloatingWidgetConfig,
  updateFloatingWidgetConfig,
};
