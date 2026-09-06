const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function runThemeTests() {
  console.log('--- Running Theme & Config Unit Tests ---');

  // Create isolated sandbox directory for test
  const testSandboxDir = path.join(os.tmpdir(), `ag-test-customui-${Date.now()}`);
  process.env.ANTIGRAVITY_CUSTOM_UI_DIR = testSandboxDir;

  try {
    const configManager = require('../src/configManager');
    const themeManager = require('../src/themeManager');

    // 1. Test directory initialization
    configManager.ensureCustomUiDirs();
    assert(fs.existsSync(testSandboxDir), 'Sandbox custom-ui dir must exist');
    assert(fs.existsSync(path.join(testSandboxDir, 'themes')), 'Themes dir must exist');
    console.log('  ✔ Custom UI directories created properly');

    // 2. Test preset initialization
    themeManager.initPresets();
    const themes = themeManager.listThemes();
    assert(themes.length >= 6, 'Must have at least 6 builtin themes');
    const names = themes.map((t) => t.name);
    assert(names.includes('mica-glass'), 'Must contain mica-glass');
    assert(names.includes('custom-wallpaper'), 'Must contain custom-wallpaper');
    assert(names.includes('catppuccin-mocha'), 'Must contain catppuccin-mocha');
    assert(names.includes('tokyo-night'), 'Must contain tokyo-night');
    assert(names.includes('nord'), 'Must contain nord');
    assert(names.includes('one-dark'), 'Must contain one-dark');
    console.log('  ✔ All 6 builtin theme presets discovered and initialized');

    // 3. Test applying mica-glass theme
    const micaResult = themeManager.applyTheme('mica-glass');
    assert(micaResult.success, 'Applying mica-glass should succeed');
    assert(fs.existsSync(micaResult.themePath), 'theme.css must exist');
    const micaCss = fs.readFileSync(micaResult.themePath, 'utf8');
    assert(micaCss.includes('Mica Glass'), 'theme.css must contain Mica Glass content');
    const config1 = configManager.getConfig();
    assert.strictEqual(config1.currentTheme, 'mica-glass');
    assert.strictEqual(config1.backgroundMaterial, 'mica');
    console.log('  ✔ mica-glass theme applied with backgroundMaterial: mica');

    // 4. Test applying custom-wallpaper with dynamic wallpaper parameters
    const wpResult = themeManager.applyTheme('custom-wallpaper', {
      wallpaper: {
        enabled: true,
        imagePath: 'C:\\test\\wallpaper.jpg',
        opacity: 0.45,
        blur: 10,
      },
    });
    assert(wpResult.success);
    const wpCss = fs.readFileSync(wpResult.themePath, 'utf8');
    assert(wpCss.includes('file:///C:/test/wallpaper.jpg'), 'Must contain formatted valid file:/// wallpaper url');
    assert(wpCss.includes('--ag-wallpaper-opacity: 0.45'), 'Must contain wallpaper opacity');
    assert(wpCss.includes('--ag-wallpaper-blur: 10px'), 'Must contain wallpaper blur');

    // 4b. Test formatWallpaperUrl helper with various edge cases
    const { formatWallpaperUrl } = themeManager;
    assert.strictEqual(formatWallpaperUrl(''), 'none');
    assert.strictEqual(formatWallpaperUrl(null), 'none');
    assert.strictEqual(formatWallpaperUrl('https://example.com/bg.png'), 'url("https://example.com/bg.png")');
    assert(formatWallpaperUrl('C:\\My Wallpapers\\cool space.png').includes('file:///C:/My%20Wallpapers/cool%20space.png'));
    console.log('  ✔ custom-wallpaper applied with dynamic CSS variable compilation & robust URL formatting');

    // 5. Test creating and applying custom user theme
    const customCss = `/* Custom Cyber Sunset */
:root { --accent: #ff007f; }
body { background: #100020 !important; }`;
    const createResult = themeManager.createTheme('cyber-sunset', customCss);
    assert(createResult.success);
    assert(fs.existsSync(createResult.path));

    const updatedThemes = themeManager.listThemes();
    assert(updatedThemes.some((t) => t.name === 'cyber-sunset'), 'New theme must appear in list');

    themeManager.applyTheme('cyber-sunset');
    const appliedCustom = fs.readFileSync(path.join(testSandboxDir, 'theme.css'), 'utf8');
    assert(appliedCustom.includes('Custom Cyber Sunset'));
    console.log('  ✔ Custom user theme created, listed, and applied successfully');

    // 6. Test config updating
    configManager.updateConfig({ devTools: false, customCss: '/* test append */' });
    const config2 = configManager.getConfig();
    assert.strictEqual(config2.devTools, false);
    assert.strictEqual(config2.customCss, '/* test append */');
    console.log('  ✔ Config manager updates and persists settings accurately');

    // 7. Test setWallpaper and getWallpaperConfig
    const setWpRes = themeManager.setWallpaper('C:\\Wallpapers\\test.png', { opacity: 0.4, blur: 5 });
    assert(setWpRes.success);
    const wpStatus1 = themeManager.getWallpaperConfig();
    assert.strictEqual(wpStatus1.enabled, true);
    assert(wpStatus1.imagePath.includes('test.png'));
    assert.strictEqual(wpStatus1.opacity, 0.4);
    assert.strictEqual(wpStatus1.blur, 5);

    // 8. Test clearWallpaper
    themeManager.clearWallpaper();
    const wpStatus2 = themeManager.getWallpaperConfig();
    assert.strictEqual(wpStatus2.enabled, false);
    const clearedCss = fs.readFileSync(path.join(testSandboxDir, 'theme.css'), 'utf8');
    assert(!clearedCss.includes('--ag-wallpaper-opacity'), 'Cleared CSS must not include wallpaper variables');
    console.log('  ✔ setWallpaper, getWallpaperConfig, and clearWallpaper work seamlessly');

    console.log('Theme & Config Unit Tests PASSED!\n');
  } finally {
    // Clean up sandbox
    try {
      fs.rmSync(testSandboxDir, { recursive: true, force: true });
    } catch (_) {}
    delete process.env.ANTIGRAVITY_CUSTOM_UI_DIR;
  }
}

if (require.main === module) {
  runThemeTests();
}

module.exports = { runThemeTests };
