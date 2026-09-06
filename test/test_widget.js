const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

async function runWidgetTests() {
  console.log('--- Running Desktop Floating Widget Unit Tests ---');

  const testSandboxDir = path.join(os.tmpdir(), `ag-test-widget-${Date.now()}`);
  process.env.ANTIGRAVITY_CUSTOM_UI_DIR = testSandboxDir;
  fs.mkdirSync(testSandboxDir, { recursive: true });

  try {
    const configManager = require('../src/configManager');
    const floatingWidgetManager = require('../src/floatingWidgetManager');
    const agentStatusObserver = require('../src/agentStatusObserver');

    // 1. Config Persistence & Defaults
    const defaultConfig = configManager.getFloatingWidgetConfig();
    assert.strictEqual(defaultConfig.enabled, true, 'Widget should be enabled by default');
    assert.strictEqual(defaultConfig.collapsed, false, 'Widget should not be collapsed by default');
    assert.strictEqual(defaultConfig.alwaysOnTop, true, 'Widget should be alwaysOnTop by default');
    assert.deepStrictEqual(defaultConfig.position, { x: null, y: null }, 'Default position should be null/null');

    const updated = configManager.updateFloatingWidgetConfig({
      collapsed: true,
      position: { x: 1200, y: 750 },
    });
    assert.strictEqual(updated.collapsed, true);
    assert.strictEqual(updated.position.x, 1200);
    assert.strictEqual(updated.position.y, 750);

    const reloaded = configManager.getFloatingWidgetConfig();
    assert.strictEqual(reloaded.collapsed, true);
    assert.strictEqual(reloaded.position.x, 1200);
    assert.strictEqual(reloaded.position.y, 750);
    console.log('  ✔ Floating widget config schema, defaults, and persistence verified');

    // 2. Default Positioning Calculation
    const fullHdArea = { x: 0, y: 0, width: 1920, height: 1080 };
    const posExpanded = floatingWidgetManager.calculateDefaultPosition(fullHdArea, false);
    assert.strictEqual(posExpanded.width, 320);
    assert.strictEqual(posExpanded.height, 240);
    assert.strictEqual(posExpanded.x, 1920 - 320 - 20); // 1580
    assert.strictEqual(posExpanded.y, 1080 - 240 - 20); // 820

    const posCollapsed = floatingWidgetManager.calculateDefaultPosition(fullHdArea, true);
    assert.strictEqual(posCollapsed.width, 320);
    assert.strictEqual(posCollapsed.height, 38);
    assert.strictEqual(posCollapsed.x, 1580);
    assert.strictEqual(posCollapsed.y, 1080 - 38 - 20); // 1022

    // Multi-monitor offset
    const secondaryArea = { x: 1920, y: 100, width: 2560, height: 1440 };
    const posSecondary = floatingWidgetManager.calculateDefaultPosition(secondaryArea, false);
    assert.strictEqual(posSecondary.x, 1920 + 2560 - 320 - 20);
    assert.strictEqual(posSecondary.y, 100 + 1440 - 240 - 20);
    console.log('  ✔ Default corner positioning and multi-monitor coordinates computed accurately');

    // 3. Agent Status & DOM Scraping Parsers
    const editStep = agentStatusObserver.parseStepText('Edited | configManager.js | +37 | -5');
    assert.strictEqual(editStep.type, 'edit');
    assert.strictEqual(editStep.text, 'configManager.js');
    assert.strictEqual(editStep.diff, '+37 -5');
    assert.strictEqual(editStep.addLines, 37);
    assert.strictEqual(editStep.delLines, 5);

    const readStep = agentStatusObserver.parseStepText('Explored | 11 files, 1 search');
    assert.strictEqual(readStep.type, 'read');
    assert.strictEqual(readStep.text, '11 files, 1 search');

    const cmdStep = agentStatusObserver.parseStepText('Ran | git status');
    assert.strictEqual(cmdStep.type, 'cmd');
    assert.strictEqual(cmdStep.text, 'git status');

    // Test real DOM single-line space-separated format
    const domEditStep = agentStatusObserver.parseStepText('Edited src/widget/widget.html +88 -6');
    assert.strictEqual(domEditStep.type, 'edit');
    assert.strictEqual(domEditStep.text, 'src/widget/widget.html');
    assert.strictEqual(domEditStep.diff, '+88 -6');
    assert.strictEqual(domEditStep.addLines, 88);
    assert.strictEqual(domEditStep.delLines, 6);

    const domCmdStep = agentStatusObserver.parseStepText('Ran node scratch/test.js');
    assert.strictEqual(domCmdStep.type, 'cmd');
    assert.strictEqual(domCmdStep.text, 'test.js');

    const domReadStep = agentStatusObserver.parseStepText('Explored 5 files');
    assert.strictEqual(domReadStep.type, 'read');
    assert.strictEqual(domReadStep.text, '5 files');

    const metrics = agentStatusObserver.extractMetrics([
      'Explored | 3 files',
      'Edited | index.js | +10 | -2',
      'Edited | utils.js | +5 | -1',
      'Edited | index.js | +2 | -0', // duplicate file edit
      'Ran | npm test',
      'Ran | git status',
    ]);
    assert.strictEqual(metrics.readCount, 1);
    assert.strictEqual(metrics.editCount, 2); // 2 unique files: index.js, utils.js
    assert.strictEqual(metrics.addLines, 17);
    assert.strictEqual(metrics.delLines, 3);
    assert.strictEqual(metrics.cmdCount, 2);
    assert.strictEqual(metrics.activities.length, 6);

    const statusAsk = agentStatusObserver.deduceAgentStatus({ hasAsk: true, isWorking: true });
    assert.strictEqual(statusAsk.status, 'ask');

    const statusThinking = agentStatusObserver.deduceAgentStatus({
      hasAsk: false,
      isWorking: true,
      thinkingText: 'Thought for 8s',
    });
    assert.strictEqual(statusThinking.status, 'thinking');
    assert.strictEqual(statusThinking.statusText, 'Thought for 8s');

    const statusIdle = agentStatusObserver.deduceAgentStatus({ hasAsk: false, isWorking: false });
    assert.strictEqual(statusIdle.status, 'idle');
    console.log('  ✔ Agent step parser, diff metrics (+add -del), and status deduction validated');

    // 4. Mock Electron Window Lifecycle & IPC
    const ipcHandlers = {};
    const mockIpcMain = {
      on: (channel, handler) => {
        ipcHandlers[channel] = handler;
      },
    };

    class MockWebContents extends EventEmitter {
      constructor() {
        super();
        this.sentEvents = [];
      }
      send(channel, ...args) {
        this.sentEvents.push({ channel, args });
      }
    }

    class MockBrowserWindow extends EventEmitter {
      constructor(opts) {
        super();
        this.options = opts;
        this.bounds = {
          x: opts.x || 0,
          y: opts.y || 0,
          width: opts.width || 320,
          height: opts.height || 240,
        };
        this.webContents = new MockWebContents();
        this._destroyed = false;
        this._visible = false;
        this.loadedUrl = null;
      }
      isDestroyed() { return this._destroyed; }
      isVisible() { return this._visible; }
      show() { this._visible = true; }
      showInactive() { this._visible = true; }
      hide() { this._visible = false; }
      destroy() { this._destroyed = true; }
      getPosition() { return [this.bounds.x, this.bounds.y]; }
      getBounds() { return { ...this.bounds }; }
      setBounds(b) { this.bounds = { ...this.bounds, ...b }; }
      async loadFile(file) { this.loadedUrl = file; }
      async loadURL(url) { this.loadedUrl = url; }
    }

    const mockScreen = {
      getPrimaryDisplay: () => ({ workArea: fullHdArea }),
      getAllDisplays: () => [{ workArea: fullHdArea }],
    };

    const mockElectron = {
      BrowserWindow: MockBrowserWindow,
      screen: mockScreen,
      ipcMain: mockIpcMain,
    };

    const mockMainWin = new MockBrowserWindow({ width: 1200, height: 800 });
    let mainFocused = false;
    mockMainWin.focus = () => { mainFocused = true; };

    // Reset position for clean test
    configManager.updateFloatingWidgetConfig({ position: { x: null, y: null }, collapsed: false });

    const win = floatingWidgetManager.init(mockMainWin, {
      electron: mockElectron,
      force: true,
    });
    assert(win, 'floatingWidgetManager.init should return created window');
    assert.strictEqual(win.options.transparent, true, 'Window must be transparent');
    assert.strictEqual(win.options.frame, false, 'Window must be frameless');
    assert.strictEqual(win.options.alwaysOnTop, true, 'Window must be always on top');

    // Simulate ready-to-show
    win.emit('ready-to-show');
    assert(win.isVisible(), 'Window should become visible on ready-to-show');

    // Test Collapse IPC
    assert(ipcHandlers['ag-widget-toggle-collapse'], 'Must register ag-widget-toggle-collapse handler');
    ipcHandlers['ag-widget-toggle-collapse']({}, true);
    assert.strictEqual(win.getBounds().height, 38, 'Height must collapse to 38px');
    assert.strictEqual(configManager.getFloatingWidgetConfig().collapsed, true);

    ipcHandlers['ag-widget-toggle-collapse']({}, false);
    assert.strictEqual(win.getBounds().height, 240, 'Height must expand to 240px');
    assert.strictEqual(configManager.getFloatingWidgetConfig().collapsed, false);

    // Test Focus Main Window IPC
    assert(ipcHandlers['ag-widget-focus-main'], 'Must register ag-widget-focus-main handler');
    ipcHandlers['ag-widget-focus-main']({});
    assert(mainFocused, 'Main window must be focused');

    // Test Answer Question IPC
    assert(ipcHandlers['ag-widget-answer-question'], 'Must register ag-widget-answer-question handler');
    ipcHandlers['ag-widget-answer-question']({}, 1);
    const sentToMain = mockMainWin.webContents.sentEvents.find(e => e.channel === 'ag-widget-select-option');
    assert(sentToMain, 'ag-widget-select-option must be forwarded to main window');
    assert.strictEqual(sentToMain.args[0], 1, 'Option index 1 must match');

    // Test Status Sync IPC
    assert(ipcHandlers['ag-status-sync'], 'Must register ag-status-sync handler');
    ipcHandlers['ag-status-sync']({}, { status: 'running', statusText: 'Compiling...' });
    const sentToWidget = win.webContents.sentEvents.slice().reverse().find(e => e.channel === 'ag-widget-update' && e.args[0] && e.args[0].status);
    assert(sentToWidget, 'ag-widget-update must be dispatched to widget window');
    assert.strictEqual(sentToWidget.args[0].status, 'running');

    // Clean up
    floatingWidgetManager.destroy();
    assert(win.isDestroyed(), 'Widget window must be destroyed');
    console.log('  ✔ Mock Electron window lifecycle, acrylic transparency, and IPC bus verified');

    // 5. Strictly Zero Emojis Constraint Verification
    const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

    const widgetHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'widget', 'widget.html'), 'utf8');
    assert(!emojiRegex.test(widgetHtmlContent), 'widget.html MUST NOT contain any emoji characters');
    assert(widgetHtmlContent.includes('<svg'), 'widget.html must use inline SVG vector icons');

    const widgetManagerContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'floatingWidgetManager.js'), 'utf8');
    assert(!emojiRegex.test(widgetManagerContent), 'floatingWidgetManager.js MUST NOT contain any emoji characters');

    const observerContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'agentStatusObserver.js'), 'utf8');
    assert(!emojiRegex.test(observerContent), 'agentStatusObserver.js MUST NOT contain any emoji characters');

    console.log('  ✔ Strictly zero emojis verified: 100% SVG vector icons utilized');

    console.log('Desktop Floating Widget Unit Tests PASSED!\n');
    return true;
  } finally {
    try {
      fs.rmSync(testSandboxDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

module.exports = {
  runWidgetTests,
};

if (require.main === module) {
  runWidgetTests().catch((err) => {
    console.error('Desktop Floating Widget Unit Tests FAILED:', err);
    process.exit(1);
  });
}
