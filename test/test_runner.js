const { runPatcherTests } = require('./test_patcher');
const { runThemeTests } = require('./test_themes');
const { runAsarPackTests } = require('./test_asar_pack');
const { runDevModeTests } = require('./test_dev_mode');
const { runLoaderTests } = require('./test_loader');
const { runLocalizationTests } = require('./test_localization');
const { runWidgetTests } = require('./test_widget');
const { runTests: runCrossPlatformTests } = require('./test_cross_platform');
const { runCliTests } = require('./test_cli');
const { runElevationTests } = require('./test_elevation');

async function main() {
  console.log('====================================================');
  console.log('  ANTIGRAVITY2-TOOLKIT AUTOMATED TEST SUITE RUNNER  ');
  console.log('====================================================\n');

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;

  const suites = [
    { name: 'Patcher Injections & Idempotency', fn: async () => runPatcherTests() },
    { name: 'Custom UI Runtime Loader & Frame Penetration', fn: async () => runLoaderTests() },
    { name: 'Themes, Presets & Config Persistence', fn: async () => runThemeTests() },
    { name: 'ASAR Pack, Boundary & Unpack Verification', fn: async () => runAsarPackTests() },
    { name: 'Folder Dev Mode Lifecycle & Status', fn: async () => runDevModeTests() },
    { name: 'Chinese Localization & Integrated Capabilities', fn: async () => runLocalizationTests() },
    { name: 'Desktop Floating Widget & Live IPC', fn: async () => runWidgetTests() },
    { name: 'Cross-Platform Compatibility (Win/macOS/Linux)', fn: async () => runCrossPlatformTests() },
    { name: 'CLI Flags & Headless JSON Execution', fn: async () => runCliTests() },
    { name: 'Linux Privilege Elevation', fn: async () => runElevationTests() },
  ];

  for (const suite of suites) {
    try {
      await suite.fn();
      passed++;
    } catch (err) {
      console.error(`\n✖ SUITE FAILED: ${suite.name}`);
      console.error(err);
      failed++;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('====================================================');
  console.log(`Test Execution Finished in ${duration}s`);
  console.log(`Passed Suites: ${passed}/${suites.length}`);
  console.log(`Failed Suites: ${failed}/${suites.length}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
