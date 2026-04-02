const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

class DevServer {
  constructor() {
    this.servers = new Map(); // projectName -> { process, url, generation }
    this._generation = new Map(); // projectName -> counter (guards stale events)
  }

  getProjectSettings(projectPath) {
    const settingsFile = path.join(projectPath, '.appgen', 'settings.json');
    try {
      return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch {
      return {};
    }
  }

  /** Find a free port starting from `start` */
  _findFreePort(start) {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(start, '127.0.0.1', () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
      server.on('error', () => {
        // Port in use — try next
        resolve(this._findFreePort(start + 1));
      });
    });
  }

  async start(projectPath, projectName, onEvent) {
    // Stop existing server for this project
    if (this.servers.has(projectName)) {
      this.stop(projectName);
    }

    // Bump generation counter — stale events from old processes will be ignored
    const gen = (this._generation.get(projectName) || 0) + 1;
    this._generation.set(projectName, gen);

    const guardedEvent = (evt) => {
      if (this._generation.get(projectName) !== gen) return; // stale event
      onEvent(evt);
    };

    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }

    const projectSettings = this.getProjectSettings(projectPath);
    const devCommand = projectSettings.devCommand || null;
    const devTimeout = (projectSettings.devTimeout || 120) * 1000;

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
      guardedEvent({ type: 'status', message: 'Preview loading...' });
      try {
        await this.runInstall(projectPath);
      } catch (err) {
        guardedEvent({ type: 'error', message: `npm install failed: ${err.message}` });
        return null;
      }
    }

    guardedEvent({ type: 'status', message: 'Preview loading...' });

    // Determine command — detect Vite config for the renderer process
    let cmd, args;

    if (devCommand) {
      const parts = devCommand.split(/\s+/);
      cmd = parts[0];
      args = parts.slice(1);
    } else {
      // Check for Vite config in renderer subdirectory or project root
      const rendererViteConfig = path.join(projectPath, 'src', 'renderer', 'vite.config.js');
      const rootViteConfig = path.join(projectPath, 'vite.config.js');
      const hasRendererVite = fs.existsSync(rendererViteConfig);
      const hasRootVite = fs.existsSync(rootViteConfig);

      if (hasRendererVite) {
        // Run Vite specifically for the renderer process
        const vPort = await this._findFreePort(5173);
        cmd = 'npx';
        args = ['vite', '--config', rendererViteConfig, '--port', String(vPort), '--host', '127.0.0.1'];
      } else if (hasRootVite) {
        // Run Vite from the project root
        const vPort = await this._findFreePort(5173);
        cmd = 'npx';
        args = ['vite', '--port', String(vPort), '--host', '127.0.0.1'];
      } else {
        // Fall back to npm scripts
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
    }

    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd: projectPath,
        shell: true,
        env: {
          ...process.env,
          BROWSER: 'none',
          FORCE_COLOR: '0',
        },
      });

      let resolved = false;
      this.servers.set(projectName, { process: child, url: null, generation: gen });

      const handleOutput = (data) => {
        const clean = data.toString().replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        const urlMatch = clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/);
        if (urlMatch && !resolved) {
          const url = urlMatch[0].replace('0.0.0.0', 'localhost').replace('127.0.0.1', 'localhost');
          resolved = true;
          const entry = this.servers.get(projectName);
          if (entry) entry.url = url;
          guardedEvent({ type: 'ready', url });
          resolve(url);
        }
      };

      child.stdout.on('data', handleOutput);
      child.stderr.on('data', handleOutput);

      child.on('close', () => {
        // Only clear state if this is still the current server (not replaced by a new start)
        const entry = this.servers.get(projectName);
        if (entry && entry.generation === gen) {
          this.servers.delete(projectName);
          guardedEvent({ type: 'stopped' });
        }
        if (!resolved) { resolved = true; resolve(null); }
      });

      child.on('error', (err) => {
        const entry = this.servers.get(projectName);
        if (entry && entry.generation === gen) {
          this.servers.delete(projectName);
          guardedEvent({ type: 'error', message: err.message });
        }
        if (!resolved) { resolved = true; resolve(null); }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            if (process.platform === 'win32' && child.pid) {
              spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
            } else {
              child.kill('SIGTERM');
            }
          } catch { /* best effort */ }
          this.servers.delete(projectName);
          guardedEvent({ type: 'error', message: `Dev server did not start within ${devTimeout / 1000}s.` });
          resolve(null);
        }
      }, devTimeout);
    });
  }

  runInstall(projectPath) {
    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['install', '--legacy-peer-deps'], {
        cwd: projectPath, shell: true, env: { ...process.env },
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
