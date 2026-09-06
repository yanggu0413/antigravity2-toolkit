const { execSync, spawn } = require('child_process');
const fs = require('fs');
const paths = require('./paths');

/**
 * Manages Antigravity and Language Server process lifecycles across platforms.
 */

function getRunningProcesses() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';

  if (isWindows) {
    try {
      const output = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = output.trim().split('\n');
      const running = [];

      for (const line of lines) {
        const parts = line.split('","').map((p) => p.replace(/"/g, '').trim());
        if (parts.length >= 2) {
          const [imageName, pid] = parts;
          const lower = imageName.toLowerCase();
          if (lower.startsWith('antigravity') || lower.startsWith('language_server')) {
            running.push({
              name: imageName,
              pid: parseInt(pid, 10),
            });
          }
        }
      }
      return running;
    } catch (_) {
      return [];
    }
  }

  if (isMac || isLinux) {
    try {
      const stdout = execSync('pgrep -f -i antigravity', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const pids = stdout.trim().split(/\s+/).filter(Boolean);
      return pids.map((pid) => ({
        name: 'antigravity',
        pid: parseInt(pid, 10),
      }));
    } catch (_) {
      return [];
    }
  }

  return [];
}

function isAntigravityRunning() {
  return getRunningProcesses().length > 0;
}

/**
 * Synchronously waits for the specified milliseconds without spawning child processes.
 */
function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (_) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      // Busy wait fallback
    }
  }
}

/**
 * Terminates all running Antigravity and language_server processes,
 * then polls until OS file handles are completely released.
 */
function killProcesses(timeoutMs = 3000) {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    try {
      execSync('taskkill /F /IM Antigravity.exe /T', { stdio: 'ignore' });
    } catch (_) {}
    try {
      execSync('taskkill /F /IM language_server.exe /T', { stdio: 'ignore' });
    } catch (_) {}
  } else {
    try {
      execSync('pkill -f -i antigravity >/dev/null 2>&1 || true', { stdio: 'ignore' });
    } catch (_) {}
    try {
      execSync('pkill -f -i language_server >/dev/null 2>&1 || true', { stdio: 'ignore' });
    } catch (_) {}
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    sleepSync(100);
    if (!isAntigravityRunning()) {
      return true;
    }
  }

  return !isAntigravityRunning();
}

function launchApp(manualDir = null) {
  const exePath = paths.getExePath(manualDir);
  const isMac = process.platform === 'darwin';

  if (isMac) {
    const installDir = paths.detectInstallationDir(manualDir);
    const child = spawn('open', [installDir], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return child.pid || 0;
  }

  if (!fs.existsSync(exePath)) {
    throw new Error(`Antigravity executable not found at: ${exePath}`);
  }

  const child = spawn(exePath, [], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return child.pid;
}

module.exports = {
  getRunningProcesses,
  isAntigravityRunning,
  killProcesses,
  launchApp,
  sleepSync,
};
