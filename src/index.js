const paths = require('./paths');
const configManager = require('./configManager');
const themeManager = require('./themeManager');
const localizationManager = require('./localizationManager');
const processManager = require('./processManager');
const backupManager = require('./backupManager');
const patcher = require('./patcher');
const devModeManager = require('./devModeManager');
const { startInteractiveMenu } = require('./interactive');
const { createCli } = require('./cli');

module.exports = {
  paths,
  configManager,
  themeManager,
  localizationManager,
  processManager,
  backupManager,
  patcher,
  devModeManager,
  startInteractiveMenu,
  createCli,
};
