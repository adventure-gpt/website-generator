const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class Deployer {
  constructor() {
    this._pagesCache = null;
    this._pagesCacheTime = 0;
    this.accountId = null;
  }

  setAccountId(id) {
    this.accountId = id || null;
    // Invalidate cache when account changes
    this._pagesCache = null;
  }

  _env() {
    const env = { ...process.env };
    if (this.accountId) env.CLOUDFLARE_ACCOUNT_ID = this.accountId;
    return env;
  }

  /**
   * Try to auto-detect the Cloudflare account ID from wrangler error output.
   * Returns the first account ID found, or null.
   */
  async autoDetectAccountId() {
    try {
      await this.captureOutput('npx', ['wrangler', 'pages', 'project', 'list']);
      return null; // Succeeded without needing account ID
    } catch (err) {
      // Parse "account_id` ... `<id>`" from the multi-account error
      const match = (err.message || '').match(/`([0-9a-f]{32})`/);
      return match ? match[1] : null;
    }
  }

  /**
   * Check if a project is deployed to Cloudflare Pages.
   * Caches the project list for 60s to avoid hammering the API.
   */
  async getDeployedUrl(projectName, deployProjectName) {
    const slug = projectName.replace(/[^a-z0-9-]/g, '-');
    const now = Date.now();

    if (!this._pagesCache || now - this._pagesCacheTime > 60000) {
      try {
        const output = await this.captureOutput('npx', ['wrangler', 'pages', 'project', 'list']);
        this._pagesCache = new Set();
        for (const line of output.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (/^[┌└├─┐┘┤┬┴┼]+$/.test(trimmed.replace(/[─│┌┐└┘├┤┬┴┼]/g, ''))) continue;

          if (trimmed.startsWith('│')) {
            const cells = trimmed.split('│').map((c) => c.trim()).filter(Boolean);
            if (cells.length > 0 && cells[0] !== 'Name' && cells[0] !== 'name' && cells[0] !== 'Project Name') {
              this._pagesCache.add(cells[0]);
            }
            continue;
          }

          const name = trimmed.split(/\s+/)[0];
          if (name && name !== 'Name' && !name.startsWith('─')) {
            this._pagesCache.add(name);
          }
        }
        this._pagesCacheTime = now;
      } catch {
        return null;
      }
    }

    // Check deploy project name override first, then exact slug, then prefix match
    if (deployProjectName && this._pagesCache.has(deployProjectName)) {
      return 'https://' + deployProjectName + '.pages.dev';
    }
    if (this._pagesCache.has(slug)) {
      return 'https://' + slug + '.pages.dev';
    }
    // Prefix match: find projects that start with slug- (e.g. test-app-cxm for test-app)
    for (const name of this._pagesCache) {
      if (name.startsWith(slug + '-')) {
        return 'https://' + name + '.pages.dev';
      }
    }
    return null;
  }

  captureOutput(cmd, args, timeoutMs) {
    const limit = timeoutMs || 15000;
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { shell: true, env: this._env() });
      let out = '';
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          child.kill();
          reject(new Error('Command timed out'));
        }
      }, limit);
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { out += d.toString(); });
      child.on('close', (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        code === 0 ? resolve(out) : reject(new Error(out));
      });
      child.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async deploy(projectPath, projectName, onEvent) {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      onEvent({ type: 'error', message: 'No package.json found' });
      return;
    }

    // Step 1: Build
    onEvent({ type: 'status', message: 'Building project...' });
    const buildCode = await this.run('npm', ['run', 'build'], projectPath, onEvent);
    if (buildCode !== 0) {
      onEvent({ type: 'error', message: 'Build failed — check the AI chat for errors' });
      return;
    }

    // Step 2: Find output directory
    let distDir = null;
    for (const candidate of ['dist', 'build', 'out', '.output/public']) {
      if (fs.existsSync(path.join(projectPath, candidate))) {
        distDir = candidate;
        break;
      }
    }
    if (!distDir) {
      onEvent({ type: 'error', message: 'No build output found (looked for dist/, build/, out/)' });
      return;
    }

    // Step 3: Deploy to Cloudflare Pages
    const slug = projectName.replace(/[^a-z0-9-]/g, '-');
    onEvent({ type: 'status', message: `Deploying to ${slug}.pages.dev...` });

    const deployCode = await this.run(
      'npx',
      ['wrangler', 'pages', 'deploy', distDir, '--project-name', slug],
      projectPath,
      onEvent,
    );

    if (deployCode === 0) {
      const url = `https://${slug}.pages.dev`;
      // Invalidate cache so next check picks this up
      this._pagesCache = null;
      onEvent({ type: 'success', message: `Live at ${url}`, url });
    } else {
      onEvent({ type: 'error', message: 'Deploy failed — make sure you\'re logged into Cloudflare (run "wrangler login" in a terminal)' });
    }
  }

  run(cmd, args, cwd, onEvent) {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { cwd, shell: true, env: this._env() });
      child.stdout.on('data', (data) => onEvent({ type: 'log', message: data.toString() }));
      child.stderr.on('data', (data) => onEvent({ type: 'log', message: data.toString() }));
      child.on('close', resolve);
      child.on('error', () => resolve(1));
    });
  }
}

module.exports = Deployer;
