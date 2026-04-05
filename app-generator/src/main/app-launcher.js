const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AppLauncher {
  constructor() {
    this.runningApps = new Map(); // projectName -> { process, projectPath, launchedAt }
  }

  /**
   * Resolve the Electron binary path inside the project's node_modules.
   * Spawning this directly (instead of via `npx electron .`) means the
   * child process IS the actual app — so we get accurate close events
   * instead of the shell wrapper exiting immediately after launch.
   */
  _findElectronBinary(projectPath) {
    const base = path.join(projectPath, 'node_modules', 'electron', 'dist');
    if (!fs.existsSync(base)) return null;
    if (process.platform === 'win32') {
      const p = path.join(base, 'electron.exe');
      return fs.existsSync(p) ? p : null;
    }
    if (process.platform === 'darwin') {
      const p = path.join(base, 'Electron.app', 'Contents', 'MacOS', 'Electron');
      return fs.existsSync(p) ? p : null;
    }
    // Linux
    const p = path.join(base, 'electron');
    return fs.existsSync(p) ? p : null;
  }

  /**
   * Launch a generated Electron app for native feature testing.
   */
  launch(projectPath, projectName, onEvent) {
    // Stop existing instance for this project
    if (this.runningApps.has(projectName)) {
      this.stop(projectName);
    }

    // Verify the project has a package.json with an Electron entry
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

    onEvent({ type: 'status', projectName, message: 'Launching app...' });

    // Prefer spawning the real Electron binary directly so we track the
    // actual app process, not a shell wrapper that exits immediately.
    const electronBin = this._findElectronBinary(projectPath);
    let child;
    let usedDirectBinary = false;

    if (electronBin) {
      try {
        child = spawn(electronBin, ['.'], {
          cwd: projectPath,
          env: { ...process.env, NODE_ENV: 'development' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        usedDirectBinary = true;
      } catch {
        child = null;
      }
    }

    // Fallback: npx wrapper (only if direct binary spawn failed)
    if (!child) {
      child = spawn('npx', ['electron', '.'], {
        cwd: projectPath,
        shell: true,
        env: { ...process.env, NODE_ENV: 'development' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }

    const launchedAt = Date.now();
    this.runningApps.set(projectName, { process: child, projectPath, launchedAt });

    child.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        onEvent({ type: 'stdout', projectName, message: text });
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text && !text.includes('ExperimentalWarning') && !text.includes('Debugger')) {
        onEvent({ type: 'stderr', projectName, message: text });
      }
    });

    child.on('close', (code) => {
      if (this.runningApps.get(projectName)?.process === child) {
        this.runningApps.delete(projectName);
      }
      const elapsed = Date.now() - launchedAt;
      // If the fallback npx wrapper was used, the "close" fires as soon as
      // the wrapper exits — which can be immediate even though the real
      // Electron app is still running in the background. Suppress the
      // spurious close event in that case. Direct-binary launches don't
      // hit this path because the child IS the real process.
      if (!usedDirectBinary && elapsed < 5000 && (code === 0 || code === null)) {
        return; // suppress — wrapper exited cleanly, real app is detached
      }
      onEvent({ type: 'closed', projectName, code });
    });

    child.on('error', (err) => {
      if (this.runningApps.get(projectName)?.process === child) {
        this.runningApps.delete(projectName);
      }
      onEvent({ type: 'error', projectName, message: err.message });
    });

    onEvent({ type: 'launched', projectName });
    return child;
  }

  /**
   * Stop a running app by project name.
   */
  stop(projectName) {
    const entry = this.runningApps.get(projectName);
    if (!entry) return;

    if (process.platform === 'win32' && entry.process.pid) {
      try {
        spawn('taskkill', ['/pid', String(entry.process.pid), '/T', '/F'], {
          shell: true,
          stdio: 'ignore',
        });
      } catch { /* best effort */ }
    } else {
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
