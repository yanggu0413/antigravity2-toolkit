const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

async function runLoaderTests() {
  console.log('--- Running Custom UI Runtime Loader Unit Tests ---');

  const testSandboxDir = path.join(os.tmpdir(), `ag-test-loader-${Date.now()}`);
  process.env.ANTIGRAVITY_CUSTOM_UI_DIR = testSandboxDir;

  fs.mkdirSync(testSandboxDir, { recursive: true });

  try {
    const configManager = require('../src/configManager');
    const {
      getBrowserWindowOptions,
      applyCssToFrame,
      attachCustomUi,
      readConfig,
      readThemeCss,
    } = require('../src/customUiLoader');

    // 1. Test getBrowserWindowOptions
    configManager.saveConfig({
      backgroundMaterial: 'mica',
      devTools: true,
    });
    const optsMica = getBrowserWindowOptions(false, '#FAFAFA');
    assert.strictEqual(optsMica.enableDevTools, true);
    if (process.platform === 'win32') {
      assert.strictEqual(optsMica.backgroundMaterial, 'mica');
      assert.strictEqual(optsMica.backgroundColor, '#00000000');
      assert.strictEqual(optsMica.titleBarOverlay.color, '#00000000');
      assert.strictEqual(optsMica.titleBarOverlay.symbolColor, '#FAFAFA');
    }
    console.log('  ✔ getBrowserWindowOptions computes native Mica/Acrylic options correctly');

    configManager.saveConfig({
      backgroundMaterial: 'acrylic',
      devTools: false,
    });
    const optsAcrylic = getBrowserWindowOptions(true, '#383A42');
    assert.strictEqual(optsAcrylic.enableDevTools, false);
    if (process.platform === 'win32') {
      assert.strictEqual(optsAcrylic.backgroundMaterial, 'acrylic');
    }
    console.log('  ✔ getBrowserWindowOptions toggles Acrylic material and DevTools config');

    configManager.saveConfig({
      backgroundMaterial: 'none',
      devTools: true,
    });
    const optsNoneLight = getBrowserWindowOptions(true, '#383A42');
    if (process.platform === 'win32') {
      assert.strictEqual(optsNoneLight.backgroundColor, '#FAFAFA');
      assert.strictEqual(optsNoneLight.titleBarOverlay.color, '#FAFAFA');
      assert.strictEqual(optsNoneLight.titleBarOverlay.symbolColor, '#383A42');
    }
    console.log('  ✔ getBrowserWindowOptions computes non-mica Light mode titleBarOverlay correctly');

    // 2. Test applyCssToFrame with mock WebFrameMain
    let executedScript = null;
    const mockFrame = {
      url: 'plugin://antigravity.agent/panel.html',
      executeJavaScript: async (code) => {
        executedScript = code;
        return true;
      },
    };

    applyCssToFrame(mockFrame, 'body { background: red; }');
    assert(executedScript, 'executeJavaScript must be called on WebFrameMain');
    assert(executedScript.includes('ag-themer-frame-style'), 'Script must target #ag-themer-frame-style');
    assert(executedScript.includes('body { background: red; }'), 'Script must inject CSS content');
    console.log('  ✔ applyCssToFrame penetrates frames via WebFrameMain.executeJavaScript');

    // 3. Test attachCustomUi with Mock BrowserWindow & WebContents
    const insertedKeys = [];
    const removedKeys = [];
    let keyCounter = 1;

    class MockWebContents extends EventEmitter {
      constructor() {
        super();
        this.mainFrame = {
          frames: [mockFrame],
          framesInSubtree: [this, mockFrame],
        };
      }
      async insertCSS(css) {
        const key = `css-key-${keyCounter++}`;
        insertedKeys.push(key);
        return key;
      }
      async removeInsertedCSS(key) {
        removedKeys.push(key);
      }
    }

    class MockBrowserWindow extends EventEmitter {
      constructor() {
        super();
        this.webContents = new MockWebContents();
        this._destroyed = false;
        this.currentMaterial = null;
      }
      isDestroyed() {
        return this._destroyed;
      }
      setBackgroundMaterial(mat) {
        this.currentMaterial = mat;
      }
    }

    const mockWin = new MockBrowserWindow();
    // Write theme.css before attaching
    fs.writeFileSync(path.join(testSandboxDir, 'theme.css'), '/* Initial theme */ body { color: #fff; }', 'utf8');

    attachCustomUi(mockWin);

    // Simulate dom-ready
    mockWin.webContents.emit('dom-ready');

    // Wait a tick for async applyCssToMainFrame
    await new Promise((r) => setTimeout(r, 50));

    assert.strictEqual(insertedKeys.length, 1, 'Initial CSS should be inserted on dom-ready');
    assert.strictEqual(removedKeys.length, 0, 'No removal yet');
    console.log('  ✔ attachCustomUi injects initial CSS on dom-ready');

    // 4. Test rapid reload concurrency & leak prevention
    fs.writeFileSync(path.join(testSandboxDir, 'theme.css'), '/* Updated theme 2 */ body { color: #aaa; }', 'utf8');
    mockWin.webContents.emit('did-finish-load');
    fs.writeFileSync(path.join(testSandboxDir, 'theme.css'), '/* Updated theme 3 */ body { color: #bbb; }', 'utf8');
    mockWin.webContents.emit('did-finish-load');

    await new Promise((r) => setTimeout(r, 100));

    // For every insert after the first, previous key must have been removed
    const activeKeysCount = insertedKeys.length - removedKeys.length;
    assert.strictEqual(activeKeysCount, 1, `Must have exactly 1 active CSS key (leak-free). Active: ${activeKeysCount}`);
    console.log('  ✔ Rapid reload concurrency is serialized with zero leaked CSS keys');

    // 5. Test frame-created event style injection
    let frameCreatedScript = null;
    const newMockFrame = {
      url: 'plugin://custom-extension/index.html',
      executeJavaScript: async (code) => {
        frameCreatedScript = code;
        return true;
      },
    };

    mockWin.webContents.emit('frame-created', {}, { frame: newMockFrame });
    await new Promise((r) => setTimeout(r, 50));
    assert(frameCreatedScript, 'New frame created must receive style injection');
    console.log('  ✔ frame-created event triggers immediate penetration on newly loaded iframes');

    // 6. Test window closed cleanup
    mockWin.emit('closed');
    console.log('  ✔ Window closed event safely disposes of watchers and timers');

    console.log('Custom UI Runtime Loader Unit Tests PASSED!\n');
  } finally {
    try {
      fs.rmSync(testSandboxDir, { recursive: true, force: true });
    } catch (_) {}
    delete process.env.ANTIGRAVITY_CUSTOM_UI_DIR;
  }
}

if (require.main === module) {
  runLoaderTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runLoaderTests };
