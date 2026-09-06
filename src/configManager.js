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

module.exports = {
  DEFAULT_CONFIG,
  ensureCustomUiDirs,
  getConfig,
  saveConfig,
  updateConfig,
  getLocalizationConfig,
  updateLocalizationConfig,
};
