const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class Deploy {
  constructor() {
    this._activeBuilds = new Map(); // projectName -> child process
  }

  /**
   * Build the Electron app for distribution using electron-builder.
   * Detects the current platform and builds accordingly.
   */
  build(projectPath, projectName, onEvent) {
    return new Promise((resolve, reject) => {
      // Stop any existing build for this project
      if (this._activeBuilds.has(projectName)) {
        this._stopBuild(projectName);
      }

      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        onEvent({ type: 'error', projectName, message: 'No package.json found in project directory.' });
        return resolve(1);
      }

      // Detect platform target flags
      const platform = os.platform();
      const platformArgs = [];
      if (platform === 'win32') {
        platformArgs.push('--win');
      } else if (platform === 'darwin') {
        platformArgs.push('--mac');
      } else {
        platformArgs.push('--linux');
      }

      onEvent({ type: 'status', projectName, message: 'Starting build...' });

      const args = ['electron-builder', ...platformArgs];
      const child = spawn('npx', args, {
        cwd: projectPath,
        shell: true,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this._activeBuilds.set(projectName, child);

      let lastProgress = 0;

      child.stdout.on('data', (data) => {
        const text = data.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Try to parse progress from electron-builder output
          const percentMatch = trimmed.match(/(\d+)%/);
          if (percentMatch) {
            const pct = parseInt(percentMatch[1], 10);
            if (pct > lastProgress) {
              lastProgress = pct;
              onEvent({ type: 'progress', projectName, percent: pct, message: trimmed });
            }
          } else {
            onEvent({ type: 'status', projectName, message: trimmed });
          }
        }
      });

      child.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text && !text.includes('ExperimentalWarning')) {
          onEvent({ type: 'status', projectName, message: text });
        }
      });

      child.on('close', (code) => {
        if (this._activeBuilds.get(projectName) === child) {
          this._activeBuilds.delete(projectName);
        }
        if (code === 0) {
          // Find built artifacts in dist/
          const distDir = path.join(projectPath, 'dist');
          const artifacts = this._findArtifacts(distDir);
          onEvent({ type: 'success', projectName, message: 'Build complete!', artifacts });
          resolve(0);
        } else {
          onEvent({ type: 'error', projectName, message: `Build failed with exit code ${code}` });
          resolve(code);
        }
      });

      child.on('error', (err) => {
        if (this._activeBuilds.get(projectName) === child) {
          this._activeBuilds.delete(projectName);
        }
        onEvent({ type: 'error', projectName, message: err.message });
        resolve(1);
      });
    });
  }

  /**
   * Publish built artifacts as a GitHub release.
   * Uses `gh release create` with artifacts from the dist/ directory.
   */
  publish(projectPath, projectName, version, onEvent) {
    return new Promise((resolve, reject) => {
      const distDir = path.join(projectPath, 'dist');
      if (!fs.existsSync(distDir)) {
        onEvent({ type: 'error', projectName, message: 'No dist/ directory found. Build the app first.' });
        return resolve(1);
      }

      const artifacts = this._findArtifacts(distDir);
      if (artifacts.length === 0) {
        onEvent({ type: 'error', projectName, message: 'No distributable artifacts found in dist/. Build the app first.' });
        return resolve(1);
      }

      const tag = version.startsWith('v') ? version : `v${version}`;

      onEvent({ type: 'status', projectName, message: `Creating GitHub release ${tag}...` });

      // Build the gh release create command with all artifacts
      const args = ['release', 'create', tag, '--title', `${projectName} ${tag}`, '--generate-notes'];
      for (const artifact of artifacts) {
        args.push(artifact);
      }

      const child = spawn('gh', args, {
        cwd: projectPath,
        shell: true,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          const releaseUrl = stdout.trim();
          onEvent({ type: 'success', projectName, message: `Release ${tag} published!`, url: releaseUrl });
          resolve(0);
        } else {
          onEvent({ type: 'error', projectName, message: `Failed to create release: ${stderr.trim() || `exit code ${code}`}` });
          resolve(code);
        }
      });

      child.on('error', (err) => {
        onEvent({ type: 'error', projectName, message: `gh CLI error: ${err.message}` });
        resolve(1);
      });
    });
  }

  /**
   * Check for existing GitHub releases for a project.
   */
  getDistributionStatus(projectName) {
    return new Promise((resolve) => {
      execFile('gh', ['release', 'list', '--limit', '5'], {
        shell: true,
        timeout: 15000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }, (err, stdout, stderr) => {
        if (err) {
          resolve({ hasReleases: false, releases: [], error: err.message });
          return;
        }

        const lines = stdout.trim().split('\n').filter(l => l.trim());
        const releases = lines.map(line => {
          const parts = line.split('\t');
          return {
            tag: parts[0] || '',
            status: parts[1] || '',
            title: parts[2] || '',
            date: parts[3] || '',
          };
        });

        resolve({ hasReleases: releases.length > 0, releases });
      });
    });
  }

  /**
   * Find distributable artifacts in the dist/ directory.
   * Looks for installers, packages, and archives.
   */
  _findArtifacts(distDir) {
    if (!fs.existsSync(distDir)) return [];

    const artifacts = [];
    const extensions = ['.exe', '.msi', '.dmg', '.pkg', '.AppImage', '.deb', '.rpm', '.snap', '.zip', '.tar.gz', '.nupkg'];

    const scanDir = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            // Don't recurse too deep
            if (dir === distDir) {
              scanDir(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            const name = entry.name.toLowerCase();
            if (extensions.some(e => name.endsWith(e.toLowerCase()))) {
              artifacts.push(fullPath);
            }
          }
        }
      } catch { /* skip unreadable dirs */ }
    };

    scanDir(distDir);
    return artifacts;
  }

  /**
   * Stop an active build process.
   */
  _stopBuild(projectName) {
    const proc = this._activeBuilds.get(projectName);
    if (!proc) return;

    if (process.platform === 'win32' && proc.pid) {
      try {
        spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
      } catch { /* best effort */ }
    } else {
      try {
        proc.kill('SIGTERM');
      } catch { /* best effort */ }
    }

    this._activeBuilds.delete(projectName);
  }

  /**
   * Stop all active builds.
   */
  stopAll() {
    for (const name of [...this._activeBuilds.keys()]) {
      this._stopBuild(name);
    }
  }
}

module.exports = Deploy;
