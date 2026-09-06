const { Command } = require('commander');
const pc = require('picocolors');
const paths = require('./paths');
const backupManager = require('./backupManager');
const processManager = require('./processManager');
const themeManager = require('./themeManager');
const configManager = require('./configManager');
const patcher = require('./patcher');
const devModeManager = require('./devModeManager');
const localizationManager = require('./localizationManager');
const { startInteractiveMenu } = require('./interactive');
const { execSync } = require('child_process');

function createCli() {
  const program = new Command();

  program
    .name('antigravity2-toolkit')
    .alias('ag2-toolkit')
    .description('Antigravity 2 All-in-One Toolkit: Wallpaper Customizer & Chinese Localization Suite')
    .version('2.0.0')
    .option('--tw', 'Use Traditional Chinese (Taiwan dictionary)')
    .option('--huifu', 'Restore official English original version (same as restore)')
    .option('--brand-title <mode>', 'Brand title mode: english, hidden, or translated', 'english')
    .option('--install-dir <path>', 'Custom Antigravity installation path')
    .option('--no-kill', 'Skip closing running Antigravity processes');

  // Interactive menu command
  program
    .command('menu')
    .alias('ui')
    .alias('interactive')
    .description('Start interactive terminal menu')
    .action(async () => {
      await startInteractiveMenu();
    });

  // Set wallpaper command
  program
    .command('set <imagePath>')
    .alias('wallpaper')
    .description('Set custom wallpaper image (preserves official stock Dark/Light theme)')
    .option('-o, --opacity <number>', 'Specify wallpaper opacity (0.0 to 1.0, default: 0.35)', parseFloat)
    .option('-b, --blur <number>', 'Specify wallpaper blur in pixels (default: 0)', parseInt)
    .action((imagePath, opts) => {
      try {
        const res = themeManager.setWallpaper(imagePath, {
          opacity: opts.opacity,
          blur: opts.blur,
        });
        console.log(pc.green(`✔ Successfully set wallpaper: ${pc.bold(imagePath)}`));
        console.log(pc.gray(`  Opacity: ${opts.opacity !== undefined ? opts.opacity : 0.35} | Blur: ${opts.blur !== undefined ? opts.blur : 0}px`));
        console.log(pc.gray(`  CSS updated at: ${res.themePath}`));

        const status = backupManager.getPatchStatus();
        if (!status.isPatched && status.mode !== 'folder') {
          console.log(pc.yellow('\n⚠️  Notice: Antigravity is currently in Stock (Official) mode.'));
          console.log(pc.yellow('   Run `ag-toolkit patch` to activate custom wallpaper in the app.'));
        } else {
          console.log(pc.cyan('⚡ Hot-reloaded immediately in running Antigravity window!'));
        }
      } catch (err) {
        console.error(pc.red(`✖ Error: ${err.message}`));
        process.exit(1);
      }
    });

  // Clear wallpaper command
  program
    .command('clear')
    .alias('remove')
    .alias('unset')
    .description('Remove custom wallpaper and restore 100% official stock clean appearance')
    .action(() => {
      try {
        themeManager.clearWallpaper();
        console.log(pc.green('✔ Removed custom wallpaper. Official stock appearance restored!'));
        console.log(pc.cyan('⚡ Hot-reloaded immediately in running Antigravity window!'));
      } catch (err) {
        console.error(pc.red(`✖ Error: ${err.message}`));
        process.exit(1);
      }
    });

  // Status command
  program
    .command('status')
    .description('Display Antigravity installation, wallpaper, and localization status')
    .option('--install-dir <path>', 'Custom installation directory')
    .action((opts) => {
      const manualDir = opts.installDir || program.opts().installDir;
      const status = backupManager.getPatchStatus(manualDir);
      const wpConfig = themeManager.getWallpaperConfig();
      const locConfig = configManager.getLocalizationConfig();
      const running = processManager.getRunningProcesses();

      console.log(pc.bold('\n--- Antigravity Toolkit Status ---'));
      console.log(`Resources Path:     ${status.resourcesDir}`);
      console.log(`Installation:       ${status.valid ? pc.green('Found') : pc.red('Missing')}`);
      console.log(`Executable:         ${status.exeExists ? pc.green('Found') : pc.red('Missing')} (${status.exePath})`);
      console.log(`Patch Mode:         ${status.mode}`);
      console.log(`Theme Patched:      ${status.isPatched ? pc.cyan('Yes') : pc.gray('No')}`);
      console.log(`Locale Patched:     ${status.isLocalizationPatched ? pc.green('Yes') : pc.gray('No')}`);
      console.log(`Active Locale:      ${status.activeLocale || pc.gray('English (Official)')}`);
      console.log(`Brand Title Mode:   ${locConfig.brandTitle || 'english'}`);
      console.log(`Backup Preserved:   ${status.backupExists ? pc.green('Yes') : pc.yellow('No')}`);
      console.log(`Process Status:     ${running.length > 0 ? pc.yellow(`Running (${running.length} processes)`) : pc.gray('Stopped')}`);
      console.log(`Wallpaper Active:   ${wpConfig.enabled ? pc.green('Yes') : pc.gray('No (Stock Clean)')}`);
      if (wpConfig.imagePath) {
        console.log(`Wallpaper Image:    ${pc.cyan(wpConfig.imagePath)}`);
        console.log(`Opacity:            ${wpConfig.opacity} (${Math.round(wpConfig.opacity * 100)}%)`);
        console.log(`Blur:               ${wpConfig.blur}px`);
      }
      console.log('');
    });

  // Unified Patch command
  program
    .command('patch')
    .description('Unpack, patch ASAR with theming and/or Chinese localization, and repack')
    .option('-k, --kill', 'Terminate running Antigravity processes automatically')
    .option('--tw', 'Include Traditional Chinese localization')
    .option('--cn', 'Include Simplified Chinese localization')
    .option('--brand-title <mode>', 'Brand title mode: english, hidden, or translated', 'english')
    .option('--theme-only', 'Patch only wallpaper / theming hooks')
    .option('--locale-only', 'Patch only Chinese localization hooks')
    .option('--install-dir <path>', 'Custom installation directory')
    .action(async (opts) => {
      try {
        const manualDir = opts.installDir || program.opts().installDir;
        const patchOpts = {
          kill: opts.kill,
          manualDir,
        };

        if (opts.localeOnly) {
          patchOpts.theme = false;
        }

        const wantTw = opts.tw || program.opts().tw;
        const wantCn = opts.cn;
        const brandTitle = opts.brandTitle || program.opts().brandTitle || 'english';

        if (wantTw || wantCn || !opts.themeOnly) {
          patchOpts.localization = {
            locale: wantTw ? 'zh-TW' : 'zh-CN',
            brandTitle,
          };
        }

        console.log(pc.cyan('Patching Antigravity ASAR...'));
        const res = await patcher.patchAsar(patchOpts);
        console.log(pc.green(`✔ Successfully patched ASAR: ${res.asarPath}`));
        if (res.themePatched) console.log(pc.gray('  ✔ Wallpaper and Theme hooks injected'));
        if (res.localizationPatched) console.log(pc.gray(`  ✔ Chinese localization (${patchOpts.localization.locale}) injected`));
      } catch (err) {
        console.error(pc.red(`✖ Error: ${err.message}`));
        process.exit(1);
      }
    });

  // Locale command
  const localeCmd = program.command('locale').alias('localize').description('Manage Chinese localization');

  localeCmd
    .command('install')
    .description('Install Chinese localization (Simplified or Traditional)')
    .option('--tw', 'Use Traditional Chinese (Taiwan dictionary)')
    .option('--brand-title <mode>', 'Brand title display: english, hidden, or translated', 'english')
    .option('--install-dir <path>', 'Custom installation directory')
    .option('-k, --kill', 'Close running processes automatically')
    .action(async (opts) => {
      try {
        const isTw = opts.tw || program.opts().tw;
        const brandTitle = opts.brandTitle || program.opts().brandTitle || 'english';
        const manualDir = opts.installDir || program.opts().installDir;
        const locale = isTw ? 'zh-TW' : 'zh-CN';

        const devStatus = devModeManager.getDevModeStatus(manualDir);
        if (devStatus.enabled) {
          localizationManager.patchDirectoryLocalization(devStatus.folderPath, {
            locale,
            brandTitle,
          });
          configManager.updateLocalizationConfig({ enabled: true, locale, brandTitle });
          console.log(pc.green(`✔ Successfully installed ${locale} in Folder Dev Mode!`));
        } else {
          console.log(pc.cyan(`Installing ${locale} localization...`));
          const res = await patcher.patchAsar({
            kill: opts.kill,
            manualDir,
            theme: false,
            localization: { locale, brandTitle },
          });
          console.log(pc.green(`✔ Successfully installed ${locale} localization!`));
          console.log(pc.gray(`  ASAR: ${res.asarPath}`));
        }
      } catch (err) {
        console.error(pc.red(`✖ Error: ${err.message}`));
        process.exit(1);
      }
    });

  localeCmd
    .command('restore')
    .alias('uninstall')
    .description('Uninstall localization and revert to official English')
    .option('--install-dir <path>', 'Custom installation directory')
    .option('-k, --kill', 'Close running processes automatically')
    .action((opts) => {
      try {
        const manualDir = opts.installDir || program.opts().installDir;
        if (opts.kill) processManager.killProcesses();
        const res = backupManager.restoreAsar(manualDir);
        console.log(pc.green(`✔ Restored official English ASAR to: ${res.restoredTo}`));
      } catch (err) {
        console.error(pc.red(`✖ Error: ${err.message}`));
        process.exit(1);
      }
    });

  // Dev-mode command
  program
    .command('dev-mode [action]')
    .description('Folder Mode operations: "on" (enable), "off" (disable), "status"')
    .option('-k, --kill', 'Terminate running Antigravity processes automatically')
    .option('--install-dir <path>', 'Custom installation directory')
    .action(async (action = 'status', opts) => {
      const act = action.toLowerCase();
      const manualDir = opts.installDir || program.opts().installDir;
      try {
        if (act === 'on' || act === 'enable') {
          console.log(pc.cyan('Enabling Folder Dev Mode...'));
          const res = await devModeManager.enableDevMode({ kill: opts.kill, manualDir });
          console.log(pc.green(`✔ Folder Dev Mode enabled at: ${res.folderPath}`));
        } else if (act === 'off' || act === 'disable') {
          console.log(pc.cyan('Disabling Folder Dev Mode...'));
          const res = await devModeManager.disableDevMode({ kill: opts.kill, manualDir });
          console.log(pc.green(`✔ Reverted to ASAR mode at: ${res.asarPath}`));
        } else {
          const status = devModeManager.getDevModeStatus(manualDir);
          console.log(pc.bold('\n--- Dev Mode Status ---'));
          console.log(`Folder Active:    ${status.isFolderActive ? pc.green('Yes') : pc.gray('No')}`);
          console.log(`Folder Path:      ${status.folderPath}`);
          console.log(`ASAR Disabled:    ${status.isAsarDisabled ? pc.yellow('Yes') : pc.gray('No')}\n`);
        }
      } catch (err) {
        console.error(pc.red(`✖ Error: ${err.message}`));
        process.exit(1);
      }
    });

  // Restore command
  program
    .command('restore')
    .alias('huifu')
    .description('Restore original stock app.asar and remove all patches')
    .option('-k, --kill', 'Terminate running Antigravity processes automatically')
    .option('--install-dir <path>', 'Custom installation directory')
    .action((opts) => {
      try {
        const manualDir = opts.installDir || program.opts().installDir;
        if (opts.kill) processManager.killProcesses();
        const res = backupManager.restoreAsar(manualDir);
        console.log(pc.green(`✔ Restored official ASAR to: ${res.restoredTo}`));
      } catch (err) {
        console.error(pc.red(`✖ Error: ${err.message}`));
        process.exit(1);
      }
    });

  // Theme command
  const themeCmd = program.command('theme').description('Manage UI themes');

  themeCmd
    .command('list')
    .description('List all available preset and custom themes')
    .action(() => {
      const themes = themeManager.listThemes();
      const config = configManager.getConfig();
      console.log(pc.bold('\nAvailable Themes:'));
      for (const t of themes) {
        const activeMarker = t.name === config.currentTheme ? pc.green(' [ACTIVE]') : '';
        const builtinMarker = t.isBuiltin ? pc.blue(' [builtin]') : pc.gray(' [custom]');
        console.log(`  • ${pc.bold(t.name)}${activeMarker}${builtinMarker}`);
        console.log(`    ${pc.gray(t.description)} (Material: ${t.recommendedMaterial})`);
      }
      console.log('');
    });

  themeCmd
    .command('apply <name>')
    .description('Apply a theme by name and update theme.css')
    .option('-w, --wallpaper <path>', 'Specify custom wallpaper image path or URL')
    .option('--opacity <number>', 'Specify wallpaper opacity (0.0 - 1.0)', parseFloat)
    .option('--blur <number>', 'Specify wallpaper blur in pixels (e.g. 0, 10)', parseInt)
    .action((name, opts) => {
      try {
        const applyOpts = {};
        if (opts.wallpaper || opts.opacity !== undefined || opts.blur !== undefined) {
          applyOpts.wallpaper = {
            enabled: true,
            ...(opts.wallpaper ? { imagePath: opts.wallpaper } : {}),
            ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
            ...(opts.blur !== undefined ? { blur: opts.blur } : {}),
          };
        }
        const res = themeManager.applyTheme(name, applyOpts);
        console.log(pc.green(`✔ Applied theme: ${pc.bold(res.theme)}`));
        console.log(pc.gray(`  Written to: ${res.themePath}`));

        const status = backupManager.getPatchStatus();
        if (!status.isPatched && status.mode !== 'folder') {
          console.log(pc.yellow('\n⚠️  Notice: Antigravity is currently in Stock (Official) mode.'));
          console.log(pc.yellow('   Run `ag-toolkit patch` or `ag-toolkit dev-mode on` to activate in the app.'));
        }
      } catch (err) {
        console.error(pc.red(`✖ Error: ${err.message}`));
        process.exit(1);
      }
    });

  themeCmd
    .command('create <name> [file]')
    .description('Create a new custom theme from a CSS file or template')
    .action((name, file) => {
      try {
        let cssContent = `/* Custom Theme: ${name} */\n`;
        if (file) {
          const fs = require('fs');
          if (!fs.existsSync(file)) {
            throw new Error(`CSS source file not found: ${file}`);
          }
          cssContent = fs.readFileSync(file, 'utf8');
        } else {
          cssContent += `:root {\n  --ag-accent: #38bdf8;\n}\nhtml, body {\n  background-color: #1e1e2e !important;\n  color: #cdd6f4 !important;\n}\n`;
        }
        const res = themeManager.createTheme(name, cssContent);
        console.log(pc.green(`✔ Created custom theme: ${pc.bold(res.name)}`));
        console.log(pc.gray(`  Saved to: ${res.path}`));
      } catch (err) {
        console.error(pc.red(`✖ Error: ${err.message}`));
        process.exit(1);
      }
    });

  themeCmd
    .command('current')
    .description('Show currently active theme')
    .action(() => {
      const config = configManager.getConfig();
      console.log(`Current theme: ${pc.cyan(pc.bold(config.currentTheme || 'none'))}`);
    });

  // Config command
  const configCmd = program.command('config').description('Get or set configuration options');

  configCmd
    .command('get [key]')
    .description('Read config value or whole configuration')
    .action((key) => {
      const config = configManager.getConfig();
      if (key) {
        console.log(config[key]);
      } else {
        console.log(JSON.stringify(config, null, 2));
      }
    });

  configCmd
    .command('set <key> <value>')
    .description('Update a configuration key (e.g. backgroundMaterial mica, devTools true)')
    .action((key, value) => {
      let parsed = value;
      if (value === 'true') parsed = true;
      else if (value === 'false') parsed = false;
      else if (!isNaN(Number(value))) parsed = Number(value);

      configManager.updateConfig({ [key]: parsed });
      console.log(pc.green(`✔ Config updated: ${key} = ${parsed}`));
    });

  // Open directory command
  program
    .command('open')
    .description('Open custom-ui directory in File Explorer / Finder')
    .action(() => {
      const dir = paths.getCustomUiDir();
      configManager.ensureCustomUiDirs();
      try {
        if (process.platform === 'win32') {
          execSync(`explorer "${dir}"`);
        } else if (process.platform === 'darwin') {
          execSync(`open "${dir}"`);
        } else {
          execSync(`xdg-open "${dir}"`);
        }
        console.log(pc.green(`✔ Opened directory: ${dir}`));
      } catch (err) {
        console.error(pc.red(`✖ Error opening explorer: ${err.message}`));
      }
    });

  // Launch command
  program
    .command('launch')
    .description('Launch Antigravity executable')
    .option('--install-dir <path>', 'Custom installation directory')
    .action((opts) => {
      try {
        const manualDir = opts.installDir || program.opts().installDir;
        const pid = processManager.launchApp(manualDir);
        console.log(pc.green(`✔ Launched Antigravity (PID: ${pid})`));
      } catch (err) {
        console.error(pc.red(`✖ Error launching app: ${err.message}`));
        process.exit(1);
      }
    });

  // Kill command
  program
    .command('kill')
    .description('Terminate running Antigravity processes')
    .action(() => {
      try {
        processManager.killProcesses();
        console.log(pc.green('✔ Successfully killed Antigravity processes.'));
      } catch (err) {
        console.error(pc.red(`✖ Error killing processes: ${err.message}`));
      }
    });

  return program;
}

module.exports = {
  createCli,
};
