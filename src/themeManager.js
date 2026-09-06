const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const configManager = require('./configManager');

const PRESET_THEMES = {
  'mica-glass': {
    name: 'mica-glass',
    title: 'Windows 11 Mica Glass',
    description: 'Native Windows 11 Mica acrylic transparency, glassmorphic panels, and neon aurora borders',
    recommendedMaterial: 'mica',
    css: `/* ==========================================================
   Antigravity 2.0 Theme: Windows 11 Mica Glass
   ========================================================== */

:root, :host, html, body {
  --background: transparent !important;
  --color-background: transparent !important;
  --sidebar: rgba(22, 24, 30, 0.55) !important;
  --color-sidebar: rgba(22, 24, 30, 0.55) !important;
  --sidebar-secondary: rgba(30, 34, 45, 0.40) !important;
  --card: rgba(30, 34, 45, 0.45) !important;
  --color-card: rgba(30, 34, 45, 0.45) !important;
  --card-border: rgba(255, 255, 255, 0.12) !important;
  --border: rgba(255, 255, 255, 0.08) !important;
  --foreground: #f1f5f9 !important;
  --color-foreground: #f1f5f9 !important;
  --primary: #38bdf8 !important;
}

/* Zero out root background to let Mica penetrate from Desktop */
html, body {
  background: transparent !important;
  background-color: transparent !important;
  color: var(--foreground) !important;
}

#root, div[id="root"], body > div, .bg-background {
  background: transparent !important;
  background-color: transparent !important;
}

.bg-sidebar, [class*="sidebar"] {
  background-color: var(--sidebar) !important;
  backdrop-filter: blur(24px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
  border-right: 1px solid var(--card-border) !important;
}

.bg-card, [class*="card"], [class*="message"] {
  background-color: var(--card) !important;
  backdrop-filter: blur(14px) !important;
  -webkit-backdrop-filter: blur(14px) !important;
  border: 1px solid var(--card-border) !important;
  border-radius: 10px !important;
}

textarea, input[type="text"], [class*="input"], [contenteditable="true"] {
  background: rgba(15, 18, 26, 0.6) !important;
  border: 1px solid var(--card-border) !important;
  border-radius: 8px !important;
  color: #fff !important;
  backdrop-filter: blur(8px) !important;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 9999px;
}
`,
  },

  'custom-wallpaper': {
    name: 'custom-wallpaper',
    title: 'Custom Wallpaper (Stock Dark/Light Preserved)',
    description: 'Custom desktop wallpaper background while preserving 100% official stock Dark or Light theme',
    recommendedMaterial: 'none',
    css: `/* ==========================================================
   Antigravity 2.0 Theme: Custom Wallpaper
   Preserves 100% official stock Dark or Light theme colors, cards,
   code blocks, diffs, and fonts.
   ========================================================== */

body::before {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  opacity: var(--ag-wallpaper-opacity, 0.35) !important;
  filter: blur(var(--ag-wallpaper-blur, 0px)) !important;
  pointer-events: none !important;
  z-index: -1 !important;
}

/* Make top-level window background transparent so wallpaper shows through chat */
html,
body,
#root,
#root > div,
.h-screen.w-screen.bg-background {
  background-color: transparent !important;
}

/* User prompt sticky wrapper: transparent with no cloudy fog or gradient strips across wallpaper */
div.sticky.bg-background,
div.sticky.top-0,
div[class*="sticky"] {
  background-color: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

div.sticky.bg-background::after,
div.sticky.top-0::after,
div[class*="sticky"]::after {
  display: none !important;
}

/* User message card: clean full-width official card with clear action button layout */
div[class*="group/user-input-step"] {
  align-items: stretch !important;
  width: 100% !important;
}

div[class*="group/user-input-step"] > div {
  position: relative !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  background-color: var(--card) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid var(--card-border) !important;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05) !important;
}

div[class*="group/user-input-step"] div.bg-card {
  background-color: transparent !important;
}

/* Ensure prompt text wraps properly without overflow */
div[class*="group/user-input-step"] div.whitespace-pre-wrap {
  word-break: break-word !important;
}

/* Step/Tool buttons: compact pill styling with soft, subtle frosted hover */
button[class*="tabular-nums"][class*="hover:bg-muted"],
button.group.flex.items-center.tabular-nums {
  width: fit-content !important;
  max-width: 100% !important;
  transition: background-color 0.15s ease, opacity 0.15s ease !important;
}

button[class*="tabular-nums"][class*="hover:bg-muted"]:hover,
button.group.flex.items-center.tabular-nums:hover {
  background-color: color-mix(in srgb, var(--muted) 45%, transparent) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
}

/* Remove bottom fade gradient bar that creates an ugly dark shadow on the wallpaper */
div[style*="linear-gradient(to top"] {
  display: none !important;
}

/* Left Sidebar: outer container subtle translucency */
div.h-full.w-full.flex.flex-col.pb-2.bg-sidebar {
  background-color: color-mix(in srgb, var(--sidebar) 85%, transparent) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
}

/* Prevent nested sidebar items from stacking dark boxes (strictly exclude floating menus/popovers!) */
.bg-sidebar div.bg-sidebar:not(.border-menu-border):not([class*="z-"]):not([class*="absolute"]):not([class*="fixed"]),
button[class*="group/headerbtn"],
div[class*="group/section-header"] {
  background-color: transparent !important;
}

/* Floating menus, dropdowns, context menus, popovers, and dialogs:
   MUST have 100% solid official background so underlying text/wallpaper never bleeds through */
.bg-sidebar div.border-menu-border,
div.bg-sidebar.border-menu-border,
div.border-menu-border,
div[class*="border-menu-border"],
div[class*="z-[8000]"],
div[class*="z-[9999]"],
div[class*="z-50"].bg-sidebar,
div[class*="z-50"].bg-popover,
[role="menu"],
[role="dialog"],
[role="listbox"]:not(:empty),
.bg-popover,
[data-radix-popper-content-wrapper] > div,
[data-radix-menu-content] {
  background-color: var(--vscode-dropdown-background, var(--sidebar, #ffffff)) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid var(--border-menu-border, var(--border, rgba(128, 128, 128, 0.2))) !important;
  box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.15), 0 4px 6px -4px rgba(0, 0, 0, 0.1) !important;
  opacity: 1 !important;
}

/* Ensure buttons inside menus have natural foreground and hover background */
div.border-menu-border button,
div[class*="z-[8000]"] button,
[role="menu"] button,
[data-radix-menu-content] button {
  color: var(--foreground) !important;
}

div.border-menu-border button:hover,
div[class*="z-[8000]"] button:hover,
[role="menu"] button:hover,
[data-radix-menu-content] button:hover {
  background-color: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.12)) !important;
}

/* Ensure the right editor pane retains its native 100% solid background (never transparent!) */
div:has(> .flex-grow.overflow-hidden),
div:has(> .flex-grow.overflow-hidden) > div,
.flex-grow.overflow-hidden,
div.shrink-0.flex.items-center[class*="border-b"],
div[class*="group/file-row"],
[class*="monaco-editor"],
div.flex.flex-col.gap-4.h-full.w-full.bg-background {
  background-color: var(--vscode-editor-background, var(--background)) !important;
}

/* Diff editor highlights: preserve and protect native green (added) and red (removed) backgrounds */
.bg-diffEditor-insertedLineBackground,
[class*="diffEditor-insertedLineBackground"],
div[class*="insertedLineBackground"] {
  background-color: var(--vscode-diffEditor-insertedLineBackground, rgba(46, 160, 67, 0.15)) !important;
}

.bg-diffEditor-removedLineBackground,
[class*="diffEditor-removedLineBackground"],
div[class*="removedLineBackground"] {
  background-color: var(--vscode-diffEditor-removedLineBackground, rgba(248, 81, 73, 0.15)) !important;
}

.bg-diffEditor-insertedTextBackground,
[class*="diffEditor-insertedTextBackground"] {
  background-color: var(--vscode-diffEditor-insertedTextBackground, rgba(46, 160, 67, 0.3)) !important;
}

.bg-diffEditor-removedTextBackground,
[class*="diffEditor-removedTextBackground"] {
  background-color: var(--vscode-diffEditor-removedTextBackground, rgba(248, 81, 73, 0.3)) !important;
}

/* Diff count badges (+X, -Y) in review header, sidebar, and chat steps */
.text-green-500,
[class*="text-green-500"],
span[class*="text-green"] {
  color: var(--vscode-gitDecoration-addedResourceForeground, #22c55e) !important;
  display: inline-block !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.text-red-500,
[class*="text-red-500"],
span[class*="text-red"] {
  color: var(--vscode-gitDecoration-deletedResourceForeground, #ef4444) !important;
  display: inline-block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
`,
  },

  'stock-wallpaper': {
    name: 'stock-wallpaper',
    title: 'Stock Wallpaper Overlay',
    description: 'Clean stock Antigravity UI with wallpaper overlay (supports both Light and Dark mode)',
    recommendedMaterial: 'none',
    css: `/* ==========================================================
   Antigravity 2.0 Theme: Stock Wallpaper
   Preserves 100% official stock Dark or Light theme colors, cards,
   code blocks, diffs, and fonts.
   ========================================================== */

body::before {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  opacity: var(--ag-wallpaper-opacity, 0.35) !important;
  filter: blur(var(--ag-wallpaper-blur, 0px)) !important;
  pointer-events: none !important;
  z-index: -1 !important;
}

/* Make top-level window background transparent so wallpaper shows through chat */
html,
body,
#root,
#root > div,
.h-screen.w-screen.bg-background {
  background-color: transparent !important;
}

/* User prompt sticky wrapper: transparent with no cloudy fog or gradient strips across wallpaper */
div.sticky.bg-background,
div.sticky.top-0,
div[class*="sticky"] {
  background-color: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

div.sticky.bg-background::after,
div.sticky.top-0::after,
div[class*="sticky"]::after {
  display: none !important;
}

/* User message card: clean full-width official card with clear action button layout */
div[class*="group/user-input-step"] {
  align-items: stretch !important;
  width: 100% !important;
}

div[class*="group/user-input-step"] > div {
  position: relative !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  background-color: var(--card) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid var(--card-border) !important;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05) !important;
}

div[class*="group/user-input-step"] div.bg-card {
  background-color: transparent !important;
}

/* Ensure prompt text wraps properly without overflow */
div[class*="group/user-input-step"] div.whitespace-pre-wrap {
  word-break: break-word !important;
}

/* Step/Tool buttons: compact pill styling with soft, subtle frosted hover */
button[class*="tabular-nums"][class*="hover:bg-muted"],
button.group.flex.items-center.tabular-nums {
  width: fit-content !important;
  max-width: 100% !important;
  transition: background-color 0.15s ease, opacity 0.15s ease !important;
}

button[class*="tabular-nums"][class*="hover:bg-muted"]:hover,
button.group.flex.items-center.tabular-nums:hover {
  background-color: color-mix(in srgb, var(--muted) 45%, transparent) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
}

/* Remove bottom fade gradient bar that creates an ugly dark shadow on the wallpaper */
div[style*="linear-gradient(to top"] {
  display: none !important;
}

/* Left Sidebar: outer container subtle translucency */
div.h-full.w-full.flex.flex-col.pb-2.bg-sidebar {
  background-color: color-mix(in srgb, var(--sidebar) 85%, transparent) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
}

/* Prevent nested sidebar items from stacking dark boxes (strictly exclude floating menus/popovers!) */
.bg-sidebar div.bg-sidebar:not(.border-menu-border):not([class*="z-"]):not([class*="absolute"]):not([class*="fixed"]),
button[class*="group/headerbtn"],
div[class*="group/section-header"] {
  background-color: transparent !important;
}

/* Floating menus, dropdowns, context menus, popovers, and dialogs:
   MUST have 100% solid official background so underlying text/wallpaper never bleeds through */
.bg-sidebar div.border-menu-border,
div.bg-sidebar.border-menu-border,
div.border-menu-border,
div[class*="border-menu-border"],
div[class*="z-[8000]"],
div[class*="z-[9999]"],
div[class*="z-50"].bg-sidebar,
div[class*="z-50"].bg-popover,
[role="menu"],
[role="dialog"],
[role="listbox"]:not(:empty),
.bg-popover,
[data-radix-popper-content-wrapper] > div,
[data-radix-menu-content] {
  background-color: var(--vscode-dropdown-background, var(--sidebar, #ffffff)) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid var(--border-menu-border, var(--border, rgba(128, 128, 128, 0.2))) !important;
  box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.15), 0 4px 6px -4px rgba(0, 0, 0, 0.1) !important;
  opacity: 1 !important;
}

/* Ensure buttons inside menus have natural foreground and hover background */
div.border-menu-border button,
div[class*="z-[8000]"] button,
[role="menu"] button,
[data-radix-menu-content] button {
  color: var(--foreground) !important;
}

div.border-menu-border button:hover,
div[class*="z-[8000]"] button:hover,
[role="menu"] button:hover,
[data-radix-menu-content] button:hover {
  background-color: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.12)) !important;
}

/* Ensure the right editor pane retains its native 100% solid background (never transparent!) */
div:has(> .flex-grow.overflow-hidden),
div:has(> .flex-grow.overflow-hidden) > div,
.flex-grow.overflow-hidden,
div.shrink-0.flex.items-center[class*="border-b"],
div[class*="group/file-row"],
[class*="monaco-editor"],
div.flex.flex-col.gap-4.h-full.w-full.bg-background {
  background-color: var(--vscode-editor-background, var(--background)) !important;
}

/* Diff editor highlights: preserve and protect native green (added) and red (removed) backgrounds */
.bg-diffEditor-insertedLineBackground,
[class*="diffEditor-insertedLineBackground"],
div[class*="insertedLineBackground"] {
  background-color: var(--vscode-diffEditor-insertedLineBackground, rgba(46, 160, 67, 0.15)) !important;
}

.bg-diffEditor-removedLineBackground,
[class*="diffEditor-removedLineBackground"],
div[class*="removedLineBackground"] {
  background-color: var(--vscode-diffEditor-removedLineBackground, rgba(248, 81, 73, 0.15)) !important;
}

.bg-diffEditor-insertedTextBackground,
[class*="diffEditor-insertedTextBackground"] {
  background-color: var(--vscode-diffEditor-insertedTextBackground, rgba(46, 160, 67, 0.3)) !important;
}

.bg-diffEditor-removedTextBackground,
[class*="diffEditor-removedTextBackground"] {
  background-color: var(--vscode-diffEditor-removedTextBackground, rgba(248, 81, 73, 0.3)) !important;
}

/* Diff count badges (+X, -Y) in review header, sidebar, and chat steps */
.text-green-500,
[class*="text-green-500"],
span[class*="text-green"] {
  color: var(--vscode-gitDecoration-addedResourceForeground, #22c55e) !important;
  display: inline-block !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.text-red-500,
[class*="text-red-500"],
span[class*="text-red"] {
  color: var(--vscode-gitDecoration-deletedResourceForeground, #ef4444) !important;
  display: inline-block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
`,
  },

  'stock-clean': {
    name: 'stock-clean',
    title: 'Stock Clean (Original Antigravity)',
    description: '100% official stock Antigravity theme with no overrides',
    recommendedMaterial: 'none',
    css: `/* ==========================================================
   Antigravity 2.0 Theme: Stock Clean
   100% official stock theme, no modifications.
   ========================================================== */
`,
  },

  'catppuccin-mocha': {
    name: 'catppuccin-mocha',
    title: 'Catppuccin Mocha',
    description: 'Soothing pastel dark palette with Lavender, Mauve, and Crust accents',
    recommendedMaterial: 'none',
    css: `/* ==========================================================
   Antigravity 2.0 Theme: Catppuccin Mocha
   ========================================================== */

:root, :host, html, body {
  --background: #1e1e2e !important;
  --color-background: #1e1e2e !important;
  --sidebar: #181825 !important;
  --color-sidebar: #181825 !important;
  --sidebar-secondary: #11111b !important;
  --card: #313244 !important;
  --color-card: #313244 !important;
  --card-border: #45475a !important;
  --border: #313244 !important;
  --foreground: #cdd6f4 !important;
  --color-foreground: #cdd6f4 !important;
  --primary: #cba6f7 !important;
  --primary-foreground: #11111b !important;
  --muted: #45475a !important;
  --muted-foreground: #a6adc8 !important;
}

html, body, .bg-background {
  background-color: var(--background) !important;
  color: var(--foreground) !important;
}

#root, div[id="root"], body > div {
  background-color: var(--background) !important;
}

.bg-sidebar, [class*="sidebar"] {
  background-color: var(--sidebar) !important;
  border-right: 1px solid var(--card-border) !important;
}

.bg-card, [class*="card"] {
  background-color: var(--card) !important;
  border: 1px solid var(--card-border) !important;
  border-radius: 8px !important;
  color: var(--foreground) !important;
}

textarea, input[type="text"], [class*="input"], [contenteditable="true"] {
  background-color: var(--sidebar-secondary) !important;
  border: 1px solid var(--card-border) !important;
  color: var(--foreground) !important;
  border-radius: 6px !important;
}
`,
  },

  'tokyo-night': {
    name: 'tokyo-night',
    title: 'Tokyo Night',
    description: 'Vibrant cyberpunk dark theme inspired by Tokyo city lights at night',
    recommendedMaterial: 'none',
    css: `/* ==========================================================
   Antigravity 2.0 Theme: Tokyo Night
   ========================================================== */

:root, :host, html, body {
  --background: #1a1b26 !important;
  --color-background: #1a1b26 !important;
  --sidebar: #16161e !important;
  --color-sidebar: #16161e !important;
  --sidebar-secondary: #13141c !important;
  --card: #24283b !important;
  --color-card: #24283b !important;
  --card-border: #292e42 !important;
  --border: #292e42 !important;
  --foreground: #c0caf5 !important;
  --color-foreground: #c0caf5 !important;
  --primary: #7aa2f7 !important;
  --primary-foreground: #16161e !important;
  --muted: #414868 !important;
  --muted-foreground: #a9b1d6 !important;
}

html, body, .bg-background {
  background-color: var(--background) !important;
  color: var(--foreground) !important;
}

#root, div[id="root"], body > div {
  background-color: var(--background) !important;
}

.bg-sidebar, [class*="sidebar"] {
  background-color: var(--sidebar) !important;
  border-right: 1px solid var(--card-border) !important;
}

.bg-card, [class*="card"] {
  background-color: var(--card) !important;
  border: 1px solid var(--card-border) !important;
  border-radius: 8px !important;
  color: var(--foreground) !important;
}

textarea, input[type="text"], [class*="input"], [contenteditable="true"] {
  background-color: var(--sidebar-secondary) !important;
  border: 1px solid var(--card-border) !important;
  color: var(--foreground) !important;
  border-radius: 6px !important;
}
`,
  },

  'nord': {
    name: 'nord',
    title: 'Nord Arctic',
    description: 'Clean, Arctic ice-inspired north bluish color palette',
    recommendedMaterial: 'none',
    css: `/* ==========================================================
   Antigravity 2.0 Theme: Nord
   ========================================================== */

:root, :host, html, body {
  --background: #2e3440 !important;
  --color-background: #2e3440 !important;
  --sidebar: #3b4252 !important;
  --color-sidebar: #3b4252 !important;
  --sidebar-secondary: #272d38 !important;
  --card: #434c5e !important;
  --color-card: #434c5e !important;
  --card-border: #4c566a !important;
  --border: #4c566a !important;
  --foreground: #d8dee9 !important;
  --color-foreground: #d8dee9 !important;
  --primary: #88c0d0 !important;
  --primary-foreground: #2e3440 !important;
  --muted: #4c566a !important;
  --muted-foreground: #eceff4 !important;
}

html, body, .bg-background {
  background-color: var(--background) !important;
  color: var(--foreground) !important;
}

#root, div[id="root"], body > div {
  background-color: var(--background) !important;
}

.bg-sidebar, [class*="sidebar"] {
  background-color: var(--sidebar) !important;
  border-right: 1px solid var(--card-border) !important;
}

.bg-card, [class*="card"] {
  background-color: var(--card) !important;
  border: 1px solid var(--card-border) !important;
  border-radius: 6px !important;
}
`,
  },

  'one-dark': {
    name: 'one-dark',
    title: 'One Dark Pro',
    description: 'Iconic Atom editor dark palette with soft tones and balanced contrast',
    recommendedMaterial: 'none',
    css: `/* ==========================================================
   Antigravity 2.0 Theme: One Dark Pro
   ========================================================== */

:root, :host, html, body {
  --background: #282c34 !important;
  --color-background: #282c34 !important;
  --sidebar: #21252b !important;
  --color-sidebar: #21252b !important;
  --sidebar-secondary: #1b1d23 !important;
  --card: #2c313c !important;
  --color-card: #2c313c !important;
  --card-border: #3e4451 !important;
  --border: #3e4451 !important;
  --foreground: #abb2bf !important;
  --color-foreground: #abb2bf !important;
  --primary: #61afef !important;
  --primary-foreground: #21252b !important;
  --muted: #3e4451 !important;
  --muted-foreground: #7f848e !important;
}

html, body, .bg-background {
  background-color: var(--background) !important;
  color: var(--foreground) !important;
}

#root, div[id="root"], body > div {
  background-color: var(--background) !important;
}

.bg-sidebar, [class*="sidebar"] {
  background-color: var(--sidebar) !important;
  border-right: 1px solid var(--card-border) !important;
}

.bg-card, [class*="card"] {
  background-color: var(--card) !important;
  border: 1px solid var(--card-border) !important;
  border-radius: 6px !important;
}
`,
  },
};

/**
 * Initializes preset theme CSS files inside custom-ui/themes/
 */
function initPresets(force = false) {
  configManager.ensureCustomUiDirs();
  const themesDir = paths.getThemesDir();

  for (const [key, preset] of Object.entries(PRESET_THEMES)) {
    const filePath = path.join(themesDir, `${key}.css`);
    if (!fs.existsSync(filePath) || force) {
      fs.writeFileSync(filePath, preset.css, 'utf8');
    }
  }
}

/**
 * Lists all available themes (both builtin and user-created).
 */
function listThemes() {
  initPresets();
  const themesDir = paths.getThemesDir();
  const currentConfig = configManager.getConfig();

  const themes = [];
  const files = fs.readdirSync(themesDir);

  for (const file of files) {
    if (file.endsWith('.css')) {
      const name = file.replace(/\.css$/, '');
      const preset = PRESET_THEMES[name];
      themes.push({
        name,
        title: preset?.title || name,
        description: preset?.description || 'Custom user theme',
        isBuiltin: Boolean(preset),
        isActive: currentConfig.currentTheme === name,
        recommendedMaterial: preset?.recommendedMaterial || 'none',
      });
    }
  }

  return themes;
}

/**
 * Retrieves raw CSS for a theme by name.
 */
function getThemeCss(name) {
  initPresets();
  const themesDir = paths.getThemesDir();
  const filePath = path.join(themesDir, `${name}.css`);

  // If it's a builtin preset, ensure file is kept up to date and return preset CSS
  if (PRESET_THEMES[name]) {
    try {
      fs.writeFileSync(filePath, PRESET_THEMES[name].css, 'utf8');
    } catch (_) {}
    return PRESET_THEMES[name].css;
  }

  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  throw new Error(`Theme '${name}' not found.`);
}

/**
 * Formats a wallpaper file path or web URL into a safe, valid CSS url(...) value.
 * Handles Windows drive paths, POSIX paths, encoding spaces, and special characters.
 */
function formatWallpaperUrl(imagePath) {
  if (!imagePath || typeof imagePath !== 'string' || imagePath.trim().length === 0) {
    return 'none';
  }
  let trimmed = imagePath.trim();
  // Strip leading and trailing quotes (common when copying paths on Windows)
  trimmed = trimmed.replace(/^["']+|["']+$/g, '').trim();

  // If already a web URL or data URL, return as-is
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:')
  ) {
    return `url("${trimmed}")`;
  }

  // If it's a local file, convert to Base64 Data URL so Chromium (serving over HTTPS)
  // will NOT block it with "Not allowed to load local resource"
  let localPath = trimmed;
  if (localPath.startsWith('file:///')) {
    localPath = decodeURI(localPath.slice(8));
  } else if (localPath.startsWith('file://')) {
    localPath = decodeURI(localPath.slice(7));
  }

  if (fs.existsSync(localPath)) {
    try {
      const ext = path.extname(localPath).toLowerCase().replace('.', '');
      let mimeType = 'image/png';
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'webp') mimeType = 'image/webp';
      else if (ext === 'svg') mimeType = 'image/svg+xml';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'bmp') mimeType = 'image/bmp';

      const buffer = fs.readFileSync(localPath);
      const base64 = buffer.toString('base64');
      return `url("data:${mimeType};base64,${base64}")`;
    } catch (err) {
      console.warn('[ag-themer] Failed to read local wallpaper into base64:', err.message);
    }
  }

  // Fallback to normalized file URL if file is not directly readable
  const normalized = trimmed.replace(/\\/g, '/');
  let fileUrl;
  if (/^[a-zA-Z]:\//.test(normalized)) {
    fileUrl = `file:///${encodeURI(normalized).replace(/#/g, '%23')}`;
  } else if (normalized.startsWith('/')) {
    fileUrl = `file://${encodeURI(normalized).replace(/#/g, '%23')}`;
  } else {
    const resolved = path.resolve(trimmed).replace(/\\/g, '/');
    fileUrl = `file:///${encodeURI(resolved).replace(/#/g, '%23')}`;
  }
  return `url("${fileUrl}")`;
}

/**
 * Applies a theme by writing it to custom-ui/theme.css and updating config.json.
 */
function applyTheme(name, options = {}) {
  initPresets();
  const baseCss = getThemeCss(name);
  let finalCss = baseCss;

  const currentConfig = configManager.getConfig();
  const preset = PRESET_THEMES[name];

  // If wallpaper options are provided or configured
  const wallpaperConfig = options.wallpaper
    ? { ...currentConfig.wallpaper, ...options.wallpaper }
    : currentConfig.wallpaper;

  const shouldApplyWallpaper =
    (name === 'custom-wallpaper' || name === 'stock-wallpaper' || wallpaperConfig?.enabled) &&
    wallpaperConfig?.enabled !== false &&
    wallpaperConfig?.imagePath;
  if (shouldApplyWallpaper) {
    const imgUrl = formatWallpaperUrl(wallpaperConfig?.imagePath);
    const opacity = wallpaperConfig?.opacity !== undefined ? wallpaperConfig.opacity : 0.35;
    const blur = wallpaperConfig?.blur !== undefined ? `${wallpaperConfig.blur}px` : '0px';

    const wallpaperOverride = `
/* --- Dynamic Wallpaper Settings --- */
:root {
  --ag-wallpaper-opacity: ${opacity} !important;
  --ag-wallpaper-blur: ${blur} !important;
}

body::before {
  background-image: ${imgUrl} !important;
  opacity: ${opacity} !important;
  filter: blur(${blur}) !important;
}
`;
    finalCss = finalCss + '\n' + wallpaperOverride;
  }

  // Append user custom CSS if present
  if (currentConfig.customCss && currentConfig.customCss.trim().length > 0) {
    finalCss += '\n/* --- User Custom CSS --- */\n' + currentConfig.customCss;
  }

  // Write to custom-ui/theme.css (which triggers the hot-reloader)
  const themeCssPath = paths.getThemeCssPath();
  fs.writeFileSync(themeCssPath, finalCss, 'utf8');

  // Update config
  const updateData = {
    currentTheme: name,
  };
  if (preset?.recommendedMaterial) {
    updateData.backgroundMaterial = preset.recommendedMaterial;
  }
  if (options.wallpaper) {
    const cleanWallpaper = { ...options.wallpaper };
    if (typeof cleanWallpaper.imagePath === 'string') {
      cleanWallpaper.imagePath = cleanWallpaper.imagePath.replace(/^["']+|["']+$/g, '').trim();
    }
    updateData.wallpaper = { ...currentConfig.wallpaper, ...cleanWallpaper };
  } else if (currentConfig.wallpaper && typeof currentConfig.wallpaper.imagePath === 'string') {
    const cleanedPath = currentConfig.wallpaper.imagePath.replace(/^["']+|["']+$/g, '').trim();
    if (cleanedPath !== currentConfig.wallpaper.imagePath) {
      updateData.wallpaper = { ...currentConfig.wallpaper, imagePath: cleanedPath };
    }
  }

  configManager.updateConfig(updateData);
  return { success: true, theme: name, themePath: themeCssPath };
}

/**
 * Creates or updates a custom theme.
 */
function createTheme(name, cssContent, metadata = {}) {
  initPresets();
  const cleanName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const themesDir = paths.getThemesDir();
  const filePath = path.join(themesDir, `${cleanName}.css`);
  fs.writeFileSync(filePath, cssContent, 'utf8');
  return { success: true, name: cleanName, path: filePath };
}

/**
 * Sets or updates the desktop wallpaper for Antigravity.
 * Automatically enables wallpaper, normalizes path/URL/Base64,
 * applies the perfected stock-preserving layout, and persists to config.
 */
function setWallpaper(imagePath, options = {}) {
  const currentConfig = configManager.getConfig();
  const currentWp = currentConfig.wallpaper || {};

  const cleanPath = (imagePath || currentWp.imagePath || '').replace(/^["']+|["']+$/g, '').trim();
  if (!cleanPath) {
    throw new Error('Please provide a valid wallpaper image path or URL.');
  }

  const opacity = options.opacity !== undefined ? Number(options.opacity) : (currentWp.opacity ?? 0.35);
  const blur = options.blur !== undefined ? Number(options.blur) : (currentWp.blur ?? 0);

  return applyTheme('custom-wallpaper', {
    wallpaper: {
      enabled: true,
      imagePath: cleanPath,
      opacity: Math.max(0, Math.min(1, opacity)),
      blur: Math.max(0, blur),
    },
  });
}

/**
 * Removes/clears custom wallpaper and restores 100% official stock clean Antigravity UI.
 */
function clearWallpaper() {
  const currentConfig = configManager.getConfig();
  configManager.updateConfig({
    currentTheme: 'stock-clean',
    wallpaper: {
      ...currentConfig.wallpaper,
      enabled: false,
    },
  });
  return applyTheme('stock-clean');
}

/**
 * Returns current wallpaper configuration and state.
 */
function getWallpaperConfig() {
  const config = configManager.getConfig();
  const isEnabled = config.currentTheme === 'custom-wallpaper' && config.wallpaper?.enabled !== false && Boolean(config.wallpaper?.imagePath);
  return {
    enabled: isEnabled,
    imagePath: config.wallpaper?.imagePath || '',
    opacity: config.wallpaper?.opacity !== undefined ? config.wallpaper.opacity : 0.35,
    blur: config.wallpaper?.blur !== undefined ? config.wallpaper.blur : 0,
    theme: config.currentTheme,
  };
}

module.exports = {
  PRESET_THEMES,
  initPresets,
  listThemes,
  getThemeCss,
  applyTheme,
  createTheme,
  formatWallpaperUrl,
  setWallpaper,
  clearWallpaper,
  getWallpaperConfig,
};

