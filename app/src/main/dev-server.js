const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class DevServer {
  constructor() {
    this.servers = new Map(); // projectName -> { process, url }
  }

  /**
   * Read per-project settings from .webgen/settings.json
   */
  getProjectSettings(projectPath) {
    const settingsFile = path.join(projectPath, '.webgen', 'settings.json');
    try {
      return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch {
      return {};
    }
  }

  async start(projectPath, projectName, onEvent) {
    // Stop existing server for this project
    if (this.servers.has(projectName)) {
      this.stop(projectName);
    }

    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      // Not an error — project just hasn't been scaffolded yet
      return null;
    }

    const projectSettings = this.getProjectSettings(projectPath);
    const devCommand = projectSettings.devCommand || null;
    const devTimeout = (projectSettings.devTimeout || 120) * 1000; // default 120s

    // Read package.json to check for dev script (unless custom command given)
    if (!devCommand) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (!pkg.scripts?.dev && !pkg.scripts?.start) {
          return null;
        }
      } catch {
        return null;
      }
    }

    // Install dependencies if needed
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      onEvent({ type: 'status', message: 'Preview loading...' });
      try {
        await this.runInstall(projectPath);
        } catch (err) {
        onEvent({ type: 'error', message: `npm install failed: ${err.message}` });
        return null;
      }
    }

    onEvent({ type: 'status', message: 'Preview loading...' });

    return new Promise((resolve) => {
      // Determine the command to run
      let cmd, args;
      if (devCommand) {
        // Custom command: split into command + args
        const parts = devCommand.split(/\s+/);
        cmd = parts[0];
        args = parts.slice(1);
      } else {
        // Auto-detect: prefer `dev` script, fall back to `start`
        try {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          const script = pkg.scripts?.dev ? 'dev' : 'start';
          cmd = 'npm';
          args = ['run', script];
        } catch {
          cmd = 'npm';
          args = ['run', 'dev'];
        }
      }

      const child = spawn(cmd, args, {
        cwd: projectPath,
        shell: true,
        env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0' },
      });

      let resolved = false;
      this.servers.set(projectName, { process: child, url: null });

      const handleOutput = (data) => {
        const output = data.toString();
        // Strip ANSI escape codes for URL matching
        const clean = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        // Broad URL detection — works for Vite, Next.js, CRA, Webpack, etc.
        const urlMatch = clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/);
        if (urlMatch && !resolved) {
          resolved = true;
          // Normalize 0.0.0.0 to localhost for iframe
          const url = urlMatch[0].replace('0.0.0.0', 'localhost').replace('127.0.0.1', 'localhost');
          const entry = this.servers.get(projectName);
          if (entry) entry.url = url;
          onEvent({ type: 'ready', url });
          resolve(url);
        }
        // Silence all intermediate output — user only sees "Preview loading..." and "Preview loaded"
      };

      child.stdout.on('data', handleOutput);
      child.stderr.on('data', handleOutput);

      child.on('close', () => {
        this.servers.delete(projectName);
        onEvent({ type: 'stopped' });
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });

      child.on('error', (err) => {
        this.servers.delete(projectName);
        onEvent({ type: 'error', message: err.message });
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });

      // Timeout: configurable per project (default 120s)
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Kill the timed-out process to avoid orphans
          try {
            if (process.platform === 'win32' && child.pid) {
              require('child_process').spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
            } else {
              child.kill('SIGTERM');
            }
          } catch { /* best effort */ }
          delete this.servers[projectName];
          onEvent({ type: 'error', message: `Dev server did not start within ${devTimeout / 1000}s. Check project settings or increase devTimeout.` });
          resolve(null);
        }
      }, devTimeout);
    });
  }

  runInstall(projectPath) {
    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['install'], {
        cwd: projectPath,
        shell: true,
        env: { ...process.env },
      });
      let stderr = '';
      child.stderr.on('data', (data) => { stderr += data.toString(); });
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit code ${code}: ${stderr.slice(-200)}`))));
      child.on('error', reject);
    });
  }

  stop(projectName) {
    const entry = this.servers.get(projectName);
    if (entry) {
      // On Windows, kill the process tree (npm spawns child processes)
      if (process.platform === 'win32' && entry.process.pid) {
        try {
          spawn('taskkill', ['/pid', String(entry.process.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
        } catch { /* best effort */ }
      } else {
        entry.process.kill();
      }
      this.servers.delete(projectName);
    }
  }

  getUrl(projectName) {
    return this.servers.get(projectName)?.url || null;
  }

  stopAll() {
    for (const name of [...this.servers.keys()]) {
      this.stop(name);
    }
  }
}

module.exports = DevServer;
