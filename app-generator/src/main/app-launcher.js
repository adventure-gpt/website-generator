const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AppLauncher {
  constructor() {
    this.runningApps = new Map(); // projectName -> { process, projectPath, pid }
  }

  /**
   * Resolve the Electron binary path inside the project's node_modules.
   * Tries multiple strategies so we can always spawn the real .exe directly
   * instead of going through a shell wrapper (which opens a console window
   * on Windows and produces spurious close events).
   */
  _findElectronBinary(projectPath) {
    const nm = path.join(projectPath, 'node_modules', 'electron');
    if (!fs.existsSync(nm)) return null;

    // Strategy 1: read electron/path.txt which contains the relative path
    // to the binary inside the electron package. This is the canonical way
    // the `electron` npm package tells consumers where its binary lives.
    try {
      const pathTxt = path.join(nm, 'path.txt');
      if (fs.existsSync(pathTxt)) {
        const rel = fs.readFileSync(pathTxt, 'utf8').trim();
        const abs = path.join(nm, 'dist', rel);
        if (fs.existsSync(abs)) return abs;
      }
    } catch { /* fall through */ }

    // Strategy 2: platform-specific default paths inside dist/
    const dist = path.join(nm, 'dist');
    if (fs.existsSync(dist)) {
      if (process.platform === 'win32') {
        const p = path.join(dist, 'electron.exe');
        if (fs.existsSync(p)) return p;
      } else if (process.platform === 'darwin') {
        const p = path.join(dist, 'Electron.app', 'Contents', 'MacOS', 'Electron');
        if (fs.existsSync(p)) return p;
      } else {
        const p = path.join(dist, 'electron');
        if (fs.existsSync(p)) return p;
      }
    }

    // Strategy 3: .bin shim (Unix only — .cmd files on Windows can't be
    // spawned without shell:true which opens a console window)
    if (process.platform !== 'win32') {
      const p = path.join(projectPath, 'node_modules', '.bin', 'electron');
      if (fs.existsSync(p)) return p;
    }

    return null;
  }

  /**
   * Launch a generated Electron app for native feature testing.
   * Uses a fully detached spawn so the child runs independently of the
   * parent and no spurious close events fire when the parent's event loop
   * is busy.
   */
  launch(projectPath, projectName, onEvent) {
    // Stop existing instance for this project
    if (this.runningApps.has(projectName)) {
      this.stop(projectName);
    }

    // Verify the project has a package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      onEvent({ type: 'error', projectName, message: 'No package.json found in project directory.' });
      return null;
    }

    // Verify node_modules exist
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      onEvent({ type: 'error', projectName, message: 'Dependencies not installed yet.' });
      return null;
    }

    // Find the real Electron binary
    const electronBin = this._findElectronBinary(projectPath);
    if (!electronBin) {
      onEvent({
        type: 'error',
        projectName,
        message: 'Could not find the Electron binary in the project. Try reinstalling dependencies.',
      });
      return null;
    }

    onEvent({ type: 'status', projectName, message: 'Launching app...' });

    // Spawn the Electron binary directly — no shell (avoids console window),
    // no detached (which can prevent GUI windows from appearing on Windows).
    // We pipe stdout/stderr so we can capture crash output, but we never
    // emit 'closed' events to the renderer because on Windows the close
    // event fires spuriously for shell-wrapped processes. Users can see the
    // app window on their screen — they don't need a status message for it.
    let child;
    try {
      child = spawn(electronBin, ['.'], {
        cwd: projectPath,
        env: { ...process.env, NODE_ENV: 'development' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      onEvent({ type: 'error', projectName, message: 'Failed to spawn Electron: ' + err.message });
      return null;
    }

    if (!child || !child.pid) {
      onEvent({ type: 'error', projectName, message: 'Electron process did not start.' });
      return null;
    }

    // Capture stderr for crash diagnostics but don't spam the user
    child.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text && !text.includes('ExperimentalWarning') && !text.includes('Debugger') && !text.includes('DevTools')) {
        onEvent({ type: 'stderr', projectName, message: text });
      }
    });

    // Silently clean up tracking when process exits — no user-facing message.
    child.on('close', () => {
      if (this.runningApps.get(projectName)?.process === child) {
        this.runningApps.delete(projectName);
      }
    });

    child.on('error', (err) => {
      if (this.runningApps.get(projectName)?.process === child) {
        this.runningApps.delete(projectName);
      }
      onEvent({ type: 'error', projectName, message: err.message });
    });

    this.runningApps.set(projectName, { process: child, projectPath, pid: child.pid });
    onEvent({ type: 'launched', projectName, pid: child.pid });
    return child;
  }

  /**
   * Stop a running app by project name.
   */
  stop(projectName) {
    const entry = this.runningApps.get(projectName);
    if (!entry) return;

    if (process.platform === 'win32' && entry.pid) {
      try {
        spawn('taskkill', ['/pid', String(entry.pid), '/T', '/F'], {
          shell: false,
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch { /* best effort */ }
    } else if (entry.process && entry.process.kill) {
      try {
        entry.process.kill('SIGTERM');
      } catch { /* best effort */ }
    }

    this.runningApps.delete(projectName);
  }

  /**
   * Stop all running app instances.
   */
  stopAll() {
    for (const name of [...this.runningApps.keys()]) {
      this.stop(name);
    }
  }

  /**
   * Check if a specific project's app is currently running.
   */
  isRunning(projectName) {
    return this.runningApps.has(projectName);
  }
}

module.exports = AppLauncher;
