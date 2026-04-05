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

    // Spawn the generated app as a FULLY DETACHED process. This is critical:
    // 1. The child runs completely independently of the parent (App Generator)
    // 2. We unref() it so the parent can quit without killing the child
    // 3. We don't listen for 'close' events because on Windows, spawning a GUI
    //    process from another GUI process can produce spurious immediate exit
    //    events even when the real app is running fine. We only surface spawn
    //    errors (which fire before the process starts).
    // 4. We still track the PID so stop() can kill it if the user clicks stop.
    const electronBin = this._findElectronBinary(projectPath);
    let child;

    if (electronBin) {
      try {
        child = spawn(electronBin, ['.'], {
          cwd: projectPath,
          env: { ...process.env, NODE_ENV: 'development' },
          detached: true,
          stdio: 'ignore',
        });
      } catch {
        child = null;
      }
    }

    // Fallback: npx wrapper if direct binary not found
    if (!child) {
      try {
        child = spawn('npx', ['electron', '.'], {
          cwd: projectPath,
          shell: true,
          env: { ...process.env, NODE_ENV: 'development' },
          detached: true,
          stdio: 'ignore',
        });
      } catch (err) {
        onEvent({ type: 'error', projectName, message: 'Failed to spawn: ' + err.message });
        return null;
      }
    }

    // Let the child run independently — parent can exit without killing it.
    if (child.unref) child.unref();

    // Only track error events (spawn failures). Do NOT listen for 'close' —
    // with detached + stdio:'ignore', close events are unreliable on Windows
    // and can fire spuriously even when the real app is running.
    child.on('error', (err) => {
      if (this.runningApps.get(projectName)?.process === child) {
        this.runningApps.delete(projectName);
      }
      onEvent({ type: 'error', projectName, message: err.message });
    });

    const launchedAt = Date.now();
    this.runningApps.set(projectName, { process: child, projectPath, launchedAt, pid: child.pid });

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
