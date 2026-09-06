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
      const myPid = process.pid;
      const myPpid = process.ppid;
      const running = [];
      const seenPids = new Set([myPid, myPpid]);

      try {
        const stdout = execSync('pgrep -i antigravity || pgrep -f "Antigravity.app|antigravity" || true', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const pids = stdout.trim().split(/\s+/).filter(Boolean);
        for (const pidStr of pids) {
          const pid = parseInt(pidStr, 10);
          if (pid && !seenPids.has(pid)) {
            try {
              const cmd = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
              if (cmd.includes('antigravity2-toolkit') || cmd.includes('ag-toolkit') || cmd.includes('test_runner')) {
                continue;
              }
            } catch (_) {}
            seenPids.add(pid);
            running.push({ name: 'antigravity', pid });
          }
        }
      } catch (_) {}

      try {
        const stdout = execSync('pgrep -i language_server || true', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const pids = stdout.trim().split(/\s+/).filter(Boolean);
        for (const pidStr of pids) {
          const pid = parseInt(pidStr, 10);
          if (pid && !seenPids.has(pid)) {
            seenPids.add(pid);
            running.push({ name: 'language_server', pid });
          }
        }
      } catch (_) {}

      return running;
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
    // 1. Initial SIGTERM to identified processes
    const procs = getRunningProcesses();
    for (const proc of procs) {
      try {
        process.kill(proc.pid, 'SIGTERM');
      } catch (_) {}
    }
    // Pattern termination for both main app and helper processes without short-circuiting
    try {
      execSync('pkill -TERM -f -i "antigravity" || true', { stdio: 'ignore' });
    } catch (_) {}
    try {
      execSync('pkill -TERM -f -i "language_server" || true', { stdio: 'ignore' });
    } catch (_) {}

    // Grace period for graceful exit
    const termDeadline = Date.now() + Math.min(1500, timeoutMs / 2);
    while (Date.now() < termDeadline) {
      sleepSync(100);
      if (!isAntigravityRunning()) {
        return true;
      }
    }

    // 2. Escalate to SIGKILL if processes remain
    if (isAntigravityRunning()) {
      const remaining = getRunningProcesses();
      for (const proc of remaining) {
        try {
          process.kill(proc.pid, 'SIGKILL');
        } catch (_) {}
      }
      try {
        execSync('pkill -9 -f -i "antigravity" || true', { stdio: 'ignore' });
      } catch (_) {}
      try {
        execSync('pkill -9 -f -i "language_server" || true', { stdio: 'ignore' });
      } catch (_) {}
    }
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
  const sudoUser = process.env.SUDO_USER;
  const isElevatedUnix = process.platform !== 'win32' && sudoUser && typeof process.getuid === 'function' && process.getuid() === 0;

  if (isMac) {
    const installDir = paths.detectInstallationDir(manualDir);
    if (installDir && installDir.endsWith('.app')) {
      const spawnCmd = isElevatedUnix ? 'sudo' : 'open';
      const spawnArgs = isElevatedUnix
        ? ['-u', sudoUser, 'open', '-a', installDir]
        : ['-a', installDir];
      const child = spawn(spawnCmd, spawnArgs, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return child.pid || 0;
    }
  }

  if (!fs.existsSync(exePath)) {
    throw new Error(`Antigravity executable not found at: ${exePath}`);
  }

  if (isElevatedUnix) {
    const child = spawn('sudo', ['-u', sudoUser, exePath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return child.pid || 0;
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
