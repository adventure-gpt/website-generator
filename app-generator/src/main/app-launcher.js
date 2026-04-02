const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AppLauncher {
  constructor() {
    this.runningApps = new Map(); // projectName -> { process, projectPath }
  }

  /**
   * Launch a generated Electron app for native feature testing.
   * Spawns `npx electron .` inside the project directory.
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
      onEvent({ type: 'error', projectName, message: 'Dependencies not installed. The app will install them automatically.' });
      return null;
    }

    onEvent({ type: 'status', projectName, message: 'Launching app...' });

    const child = spawn('npx', ['electron', '.'], {
      cwd: projectPath,
      shell: true,
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.runningApps.set(projectName, { process: child, projectPath });

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
