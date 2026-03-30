const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

class DevServer {
  constructor() {
    this.servers = new Map(); // projectName -> { process, url, generation }
    this._cloudflareAccountId = null;
    this._generation = new Map(); // projectName -> counter (guards stale events)
  }

  setCloudflareAccountId(id) { this._cloudflareAccountId = id; }

  getProjectSettings(projectPath) {
    const settingsFile = path.join(projectPath, '.webgen', 'settings.json');
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

    // Auto-fix wrangler projects before starting
    const hasWrangler = fs.existsSync(path.join(projectPath, 'wrangler.toml'));
    if (hasWrangler) {
      const wranglerTomlPath = path.join(projectPath, 'wrangler.toml');
      let tomlContent = fs.readFileSync(wranglerTomlPath, 'utf8');

      // REMOVE pages_build_output_dir for dev mode — it conflicts with -- proxy mode
      // (wrangler says "Specify either a directory OR a proxy command, not both")
      // The AI may have added it for deploy, but it breaks dev. We'll strip it temporarily.
      if (tomlContent.includes('pages_build_output_dir')) {
        const devToml = tomlContent.replace(/^pages_build_output_dir\s*=.*$/m, '');
        fs.writeFileSync(wranglerTomlPath, devToml, 'utf8');
        // Store original so we can restore after dev server stops
        this._originalToml = this._originalToml || {};
        this._originalToml[projectName] = tomlContent;
        this._tomlPaths = this._tomlPaths || {};
        this._tomlPaths[projectName] = wranglerTomlPath;
      }

      // Auto-apply D1 schema if schema.sql exists
      const schemaPath = path.join(projectPath, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        try {
          const dbMatch = tomlContent.match(/database_name\s*=\s*"([^"]+)"/);
          if (dbMatch) {
            const { execFileSync } = require('child_process');
            execFileSync('npx', ['wrangler', 'd1', 'execute', dbMatch[1], '--local', '--file=schema.sql'], {
              cwd: projectPath, shell: true, timeout: 15000, stdio: 'pipe',
              env: { ...process.env, ...(this._cloudflareAccountId ? { CLOUDFLARE_ACCOUNT_ID: this._cloudflareAccountId } : {}) },
            });
          }
        } catch { /* schema may already be applied */ }
      }
    }

    guardedEvent({ type: 'status', message: 'Preview loading...' });

    // Determine command and ports — use dynamic ports to avoid conflicts
    let cmd, args;
    let wranglerPort = null; // non-null means wait for this port's URL

    if (devCommand) {
      const parts = devCommand.split(/\s+/);
      cmd = parts[0];
      args = parts.slice(1);
    } else {
      const hasFunctions = fs.existsSync(path.join(projectPath, 'functions'));

      if (hasWrangler && hasFunctions) {
        // Find two free ports for wrangler and vite
        const wPort = await this._findFreePort(8788);
        const vPort = await this._findFreePort(5173);
        wranglerPort = String(wPort);
        cmd = 'npx';
        args = ['wrangler', 'pages', 'dev', '--compatibility-date=2025-01-01',
                '--port', String(wPort), '--proxy', String(vPort),
                '--', 'npx', 'vite', '--port', String(vPort), '--host', '127.0.0.1'];
      } else {
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
          ...(this._cloudflareAccountId ? { CLOUDFLARE_ACCOUNT_ID: this._cloudflareAccountId } : {}),
        },
      });

      let resolved = false;
      this.servers.set(projectName, { process: child, url: null, generation: gen });

      const handleOutput = (data) => {
        const clean = data.toString().replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        const urlMatch = clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/);
        if (urlMatch && !resolved) {
          const url = urlMatch[0].replace('0.0.0.0', 'localhost').replace('127.0.0.1', 'localhost');
          // For wrangler: skip the inner vite URL, wait for the wrangler proxy URL
          if (wranglerPort && !url.includes(':' + wranglerPort)) return;
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
    // Restore original wrangler.toml if we modified it for dev mode
    if (this._originalToml && this._originalToml[projectName]) {
      try {
        const projectPath = entry ? path.dirname(path.dirname(entry.url || '')) : null;
        // Find project path from servers map or stored path
        if (this._tomlPaths && this._tomlPaths[projectName]) {
          fs.writeFileSync(this._tomlPaths[projectName], this._originalToml[projectName], 'utf8');
        }
      } catch { /* best effort */ }
      delete this._originalToml[projectName];
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
