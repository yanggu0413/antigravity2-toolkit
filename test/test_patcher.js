const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  patchUtilsJs,
  unpatchUtilsJs,
  patchKeybindingsJs,
  unpatchKeybindingsJs,
} = require('../src/patcher');

function runPatcherTests() {
  console.log('--- Running Patcher Unit Tests ---');

  // Sample stock utils.js snippet matching real Antigravity structure
  const stockUtilsJs = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const constants_1 = require("./constants");
const keybindings_1 = require("./keybindings");
const path_1 = __importDefault(require("path"));
const fs = __importStar(require("fs"));
const paths_1 = require("./paths");
const loadingOverlay_1 = require("./loadingOverlay");

function createWindow(url, storageManager) {
    ensureAppIsInDock();
    const theme = getThemeMode().toUpperCase();
    const isLight = theme.includes('LIGHT');
    const backgroundColor = isLight ? '#FAFAFA' : '#131313';
    const foregroundColor = isLight ? '#383A42' : '#FAFAFA';
    const win = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 500,
        minHeight: 400,
        title: electron_1.app.getName(),
        icon: path_1.default.join(__dirname, '..', 'icon.png'),
        titleBarStyle: 'hidden',
        titleBarOverlay: isMacOS()
            ? false
            : {
                color: backgroundColor,
                symbolColor: foregroundColor,
                height: 30,
            },
        backgroundColor,
        trafficLightPosition: { x: 12, y: 12 },
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path_1.default.join(__dirname, 'preload.js'),
            devTools: !electron_1.app.isPackaged,
        },
    });
    (0, loadingOverlay_1.attachLoadingOverlay)(win, foregroundColor, backgroundColor);
    return win;
}
`;

  // 1. Test basic patching of utils.js
  const patched1 = patchUtilsJs(stockUtilsJs);
  assert(patched1.includes('AG-THEMER-LOADER-START'), 'Must include loader hook');
  assert(patched1.includes('AG-THEMER-OPTS-START'), 'Must include options hook');
  assert(patched1.includes('AG-THEMER-WINCONFIG-START'), 'Must include window config hook');
  assert(patched1.includes('AG-THEMER-DEVTOOLS-START'), 'Must include devtools hook');
  assert(patched1.includes('AG-THEMER-ATTACH-START'), 'Must include attach hook');
  console.log('  ✔ utils.js successfully patched with all required injection points');

  // 2. Test idempotency: patching an already patched file must produce identical output
  const patched2 = patchUtilsJs(patched1);
  assert.strictEqual(patched1, patched2, 'Patching twice must yield strictly identical results (idempotent)');
  console.log('  ✔ utils.js patch is strictly idempotent');

  // 3. Test unpatching utils.js
  const unpatched = unpatchUtilsJs(patched1);
  assert(!unpatched.includes('AG-THEMER'), 'Unpatched utils.js must contain no AG-THEMER markers');
  assert(unpatched.includes('titleBarOverlay: isMacOS()'), 'Original titleBarOverlay restored');
  assert(unpatched.includes('devTools: !electron_1.app.isPackaged,'), 'Original devTools restored');
  console.log('  ✔ utils.js unpatch restores original structure cleanly');

  // Sample stock keybindings.js matching real Antigravity structure
  const stockKeybindingsJs = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerKeybindings = registerKeybindings;
const utils_1 = require("./utils");
function registerKeybindings(win, actions) {
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown') {
            const isCmdOrCtrl = (0, utils_1.isMacOS)() ? input.meta : input.control;
            if (isCmdOrCtrl && input.shift && input.key.toLowerCase() === 'n') {
                actions.createNewWindow();
                event.preventDefault();
            }
            if (isCmdOrCtrl && input.key.toLowerCase() === 'q') {
                actions.onQuitRequested();
                event.preventDefault();
            }
        }
    });
}
`;

  // 4. Test keybindings patching
  const patchedKeys1 = patchKeybindingsJs(stockKeybindingsJs);
  assert(patchedKeys1.includes('AG-THEMER-SHORTCUTS-START'), 'Must include shortcuts block');
  assert(patchedKeys1.includes("input.key === 'F12'"), 'Must include F12 DevTools handler');
  assert(patchedKeys1.includes("input.key === 'F5'"), 'Must include F5 reload handler');
  console.log('  ✔ keybindings.js successfully patched with F12 and F5 shortcuts');

  // 5. Test keybindings idempotency
  const patchedKeys2 = patchKeybindingsJs(patchedKeys1);
  assert.strictEqual(patchedKeys1, patchedKeys2, 'Keybindings patch must be strictly idempotent');
  console.log('  ✔ keybindings.js patch is strictly idempotent');

  // 6. Test keybindings unpatching
  const unpatchedKeys = unpatchKeybindingsJs(patchedKeys1);
  assert(!unpatchedKeys.includes('AG-THEMER'), 'Unpatched keybindings must contain no markers');
  console.log('  ✔ keybindings.js unpatch restores original keybindings');

  // 7. Error handling: invalid content missing anchors
  assert.throws(() => {
    patchUtilsJs('invalid code with no browser window');
  }, /Could not find/, 'Must throw on invalid file content');
  console.log('  ✔ Error handling catches invalid target code gracefully');

  console.log('Patcher Unit Tests PASSED!\n');
}

if (require.main === module) {
  runPatcherTests();
}

module.exports = { runPatcherTests };
