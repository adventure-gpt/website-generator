const { execFile, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Self-setup: checks for and installs all required tools on first run.
 */

const PLATFORM = os.platform(); // 'win32', 'darwin', 'linux'

// Ensure Homebrew paths and ~/.local/bin are in PATH on macOS
if (PLATFORM === 'darwin') {
  const localBin = path.join(os.homedir(), '.local', 'bin');
  const extra = [localBin, '/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin'];
  const current = process.env.PATH || '';
  const missing = extra.filter(p => !current.split(':').includes(p));
  if (missing.length) process.env.PATH = missing.join(':') + ':' + current;
}

// Cached brew health status (null = not checked yet)
let _brewHealthy = null;

async function checkBrewHealth() {
  if (PLATFORM !== 'darwin') return false;
  if (_brewHealthy !== null) return _brewHealthy;
  return new Promise((resolve) => {
    execFile('brew', ['--version'], { shell: true, timeout: 10000 }, (err) => {
      _brewHealthy = !err;
      resolve(_brewHealthy);
    });
  });
}

async function macFallbackInstallNode(onEvent) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const localDir = path.join(os.homedir(), '.local');
  fs.mkdirSync(localDir, { recursive: true });
  onEvent({ type: 'log', message: 'Homebrew unavailable — downloading Node.js directly...\n' });
  let nodeVersion = 'v22.14.0';
  try {
    const verData = await captureCmd('curl', ['-fsSL', 'https://resolve-node.now.sh/lts'], 10000);
    const ver = verData.trim();
    if (ver.match(/^v\d+\.\d+\.\d+$/)) nodeVersion = ver;
  } catch { /* use fallback version */ }
  const tarUrl = `https://nodejs.org/dist/${nodeVersion}/node-${nodeVersion}-darwin-${arch}.tar.gz`;
  onEvent({ type: 'log', message: `Downloading Node.js ${nodeVersion} for ${arch}...\n` });
  await runCommand('curl', ['-fsSL', tarUrl, '-o', path.join(os.tmpdir(), 'node.tar.gz')], onEvent, 120000);
  onEvent({ type: 'log', message: 'Extracting Node.js...\n' });
  await runCommand('tar', ['xzf', path.join(os.tmpdir(), 'node.tar.gz'), '-C', localDir, '--strip-components=1'], onEvent, 30000);
  const nodeBin = path.join(localDir, 'bin', 'node');
  if (!fs.existsSync(nodeBin)) throw new Error('Node.js download failed');
  const binDir = path.join(localDir, 'bin');
  if (!process.env.PATH.split(':').includes(binDir)) {
    process.env.PATH = binDir + ':' + process.env.PATH;
  }
}

async function macFallbackInstallGh(onEvent) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const localBin = path.join(os.homedir(), '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  onEvent({ type: 'log', message: 'Homebrew unavailable — downloading GitHub CLI directly...\n' });
  let ghVersion = '2.65.0';
  try {
    const releaseData = await captureCmd('curl', ['-fsSL', 'https://api.github.com/repos/cli/cli/releases/latest'], 10000);
    const match = releaseData.match(/"tag_name"\s*:\s*"v([^"]+)"/);
    if (match) ghVersion = match[1];
  } catch { /* use fallback version */ }
  const zipUrl = `https://github.com/cli/cli/releases/download/v${ghVersion}/gh_${ghVersion}_macOS_${arch}.zip`;
  const zipPath = path.join(os.tmpdir(), 'gh.zip');
  const extractDir = path.join(os.tmpdir(), 'gh-extract');
  onEvent({ type: 'log', message: `Downloading GitHub CLI v${ghVersion}...\n` });
  await runCommand('curl', ['-fsSL', '-o', zipPath, '-L', zipUrl], onEvent, 120000);
  fs.mkdirSync(extractDir, { recursive: true });
  await runCommand('unzip', ['-o', zipPath, '-d', extractDir], onEvent, 30000);
  const entries = fs.readdirSync(extractDir);
  const ghDir = entries.find(e => e.startsWith('gh_'));
  if (!ghDir) throw new Error('GitHub CLI download failed');
  const ghBin = path.join(extractDir, ghDir, 'bin', 'gh');
  fs.copyFileSync(ghBin, path.join(localBin, 'gh'));
  fs.chmodSync(path.join(localBin, 'gh'), 0o755);
}

function captureCmd(cmd, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { shell: true, timeout: timeout || 10000, encoding: 'utf8' }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

function commandExists(cmd) {
  return new Promise((resolve) => {
    const which = PLATFORM === 'win32' ? 'where' : 'which';
    execFile(which, [cmd], { stdio: 'pipe' }, (err) => {
      resolve(!err);
    });
  });
}

// ── Core tools (always required) ────────────────────────────
const CORE_TOOLS = [
  {
    name: 'Node.js',
    check: () => commandExists('node'),
    install: {
      win32: ['winget', 'install', '-e', '--id', 'OpenJS.NodeJS', '--accept-source-agreements', '--accept-package-agreements'],
      darwin: ['brew', 'install', 'node'],
      linux: null,
    },
  },
  {
    name: 'Git',
    check: () => commandExists('git'),
    install: {
      win32: ['winget', 'install', '-e', '--id', 'Git.Git', '--accept-source-agreements', '--accept-package-agreements'],
      darwin: ['brew', 'install', 'git'],
      linux: null,
    },
  },
  {
    name: 'GitHub CLI',
    check: () => commandExists('gh'),
    install: {
      win32: ['winget', 'install', '-e', '--id', 'GitHub.cli', '--accept-source-agreements', '--accept-package-agreements'],
      darwin: ['brew', 'install', 'gh'],
      linux: null,
    },
  },
  {
    name: 'Cloudflare Wrangler',
    check: () => commandExists('wrangler'),
    npmPackage: 'wrangler',
    install: {
      win32: ['npm', 'install', '-g', 'wrangler'],
      darwin: ['npm', 'install', '-g', 'wrangler'],
      linux: ['npm', 'install', '-g', 'wrangler'],
    },
  },
];

// ── AI backend tools (user chooses which to install) ────────
const AI_TOOLS = [
  {
    id: 'claude',
    name: 'Claude Code',
    check: () => commandExists('claude'),
    npmPackage: '@anthropic-ai/claude-code',
    install: {
      win32: ['npm', 'install', '-g', '@anthropic-ai/claude-code'],
      darwin: ['npm', 'install', '-g', '@anthropic-ai/claude-code'],
      linux: ['npm', 'install', '-g', '@anthropic-ai/claude-code'],
    },
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    check: () => commandExists('codex'),
    npmPackage: '@openai/codex',
    install: {
      win32: ['npm', 'install', '-g', '@openai/codex'],
      darwin: ['npm', 'install', '-g', '@openai/codex'],
      linux: ['npm', 'install', '-g', '@openai/codex'],
    },
  },
];

async function detectLinuxPackageManager() {
  if (await commandExists('apt')) return 'apt';
  if (await commandExists('dnf')) return 'dnf';
  if (await commandExists('pacman')) return 'pacman';
  return 'apt';
}

async function getLinuxInstallCmd(toolName) {
  const pm = await detectLinuxPackageManager();
  const cmds = {
    'Node.js': { apt: ['sudo', 'apt', 'install', '-y', 'nodejs', 'npm'], dnf: ['sudo', 'dnf', 'install', '-y', 'nodejs', 'npm'], pacman: ['sudo', 'pacman', '-S', '--noconfirm', 'nodejs', 'npm'] },
    'Git': { apt: ['sudo', 'apt', 'install', '-y', 'git'], dnf: ['sudo', 'dnf', 'install', '-y', 'git'], pacman: ['sudo', 'pacman', '-S', '--noconfirm', 'git'] },
    'GitHub CLI': { apt: ['sudo', 'apt', 'install', '-y', 'gh'], dnf: ['sudo', 'dnf', 'install', '-y', 'gh'], pacman: ['sudo', 'pacman', '-S', '--noconfirm', 'github-cli'] },
  };
  return cmds[toolName]?.[pm] || null;
}

/**
 * Check which tools are installed and which are missing.
 * Returns core tools + AI tools separately.
 */
async function checkSetup() {
  const coreChecks = CORE_TOOLS.map(async (tool) => ({
    name: tool.name,
    installed: await tool.check(),
  }));
  const aiChecks = AI_TOOLS.map(async (tool) => ({
    id: tool.id,
    name: tool.name,
    installed: await tool.check(),
  }));

  const coreResolved = await Promise.all(coreChecks);
  const aiResolved = await Promise.all(aiChecks);

  return {
    allInstalled: coreResolved.every((r) => r.installed) && aiResolved.some((r) => r.installed),
    tools: coreResolved,
    aiTools: aiResolved,
    platform: PLATFORM,
  };
}

/**
 * On Windows, get the npm global modules directory.
 */
function getNpmGlobalDir() {
  try {
    const prefix = require('child_process').execFileSync(
      'npm', ['config', 'get', 'prefix'],
      { encoding: 'utf8', timeout: 5000, shell: true }
    ).trim();
    return path.join(prefix, 'node_modules');
  } catch {
    // Fallback to common Windows location
    return path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules');
  }
}

/**
 * Before installing an npm global package, clean up any existing installation
 * to avoid EBUSY errors from locked files (common on Windows with search indexer).
 */
function preCleanNpmPackage(packageName) {
  if (PLATFORM !== 'win32') return;
  const globalDir = getNpmGlobalDir();
  // The directory name is the package name (or scoped: @scope/name → @scope/name)
  const pkgDir = path.join(globalDir, packageName);
  if (!fs.existsSync(pkgDir)) return;

  try {
    fs.rmSync(pkgDir, { recursive: true, force: true });
  } catch {
    // If delete fails (EBUSY), rename the directory out of the way
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const trashName = path.join(globalDir, `.old-${packageName.replace(/[/@]/g, '_')}-${randomSuffix}`);
    try {
      fs.renameSync(pkgDir, trashName);
    } catch {
      // Last resort: ignore — npm install may still succeed or fail with a clear message
    }
  }

  // Also clean up any partial npm temp directories for this package
  try {
    const entries = fs.readdirSync(globalDir);
    for (const entry of entries) {
      if (entry.startsWith(`.${packageName.replace(/[/@]/g, '')}-`) || entry.startsWith(`.old-`)) {
        try {
          fs.rmSync(path.join(globalDir, entry), { recursive: true, force: true });
        } catch { /* best effort */ }
      }
    }
  } catch { /* best effort */ }
}

/**
 * Install all missing tools. Calls onEvent with progress updates.
 * @param {Function} onEvent - event callback
 * @param {Object} options - { aiBackends: ['claude'] | ['codex'] | ['claude','codex'] }
 */
async function runSetup(onEvent, options) {
  const selectedAI = (options && options.aiBackends) || ['claude'];

  // Build full tool list: core + selected AI backends
  const selectedAITools = AI_TOOLS.filter((t) => selectedAI.includes(t.id));
  const allTools = [...CORE_TOOLS, ...selectedAITools];

  // Check what's missing
  const checks = await Promise.all(allTools.map(async (tool) => ({
    name: tool.name,
    installed: await tool.check(),
  })));
  const missing = checks.filter((t) => !t.installed);

  if (missing.length === 0) {
    onEvent({ type: 'done', message: 'All tools already installed' });
    return;
  }

  // On macOS, check if Homebrew is functional before trying to use it
  const brewOk = PLATFORM === 'darwin' ? await checkBrewHealth() : false;
  if (PLATFORM === 'darwin' && !brewOk) {
    onEvent({ type: 'log', message: 'Homebrew is not available or broken — using direct downloads instead.\n' });
  }

  onEvent({ type: 'status', message: `Installing ${missing.length} tool(s)...` });

  for (let i = 0; i < missing.length; i++) {
    const tool = allTools.find((t) => t.name === missing[i].name);
    onEvent({
      type: 'progress',
      message: `Installing ${tool.name}...`,
      current: i + 1,
      total: missing.length,
    });

    // macOS fallback: if brew is broken, use direct downloads for core tools
    if (PLATFORM === 'darwin' && !brewOk && tool.install.darwin && tool.install.darwin[0] === 'brew') {
      try {
        if (tool.name === 'Node.js') {
          await macFallbackInstallNode(onEvent);
          onEvent({ type: 'installed', message: `${tool.name} installed` });
          continue;
        } else if (tool.name === 'GitHub CLI') {
          await macFallbackInstallGh(onEvent);
          onEvent({ type: 'installed', message: `${tool.name} installed` });
          continue;
        } else if (tool.name === 'Git') {
          onEvent({ type: 'log', message: 'Checking for Xcode Command Line Tools git...\n' });
          if (fs.existsSync('/usr/bin/git')) {
            onEvent({ type: 'installed', message: `${tool.name} installed` });
            continue;
          }
          try {
            await runCommand('xcode-select', ['--install'], onEvent, 10000);
          } catch { /* dialog may have opened */ }
          onEvent({ type: 'warning', message: 'A dialog may have appeared to install developer tools. Please complete it, then re-run setup.' });
          continue;
        }
        onEvent({ type: 'warning', message: `Cannot auto-install ${tool.name} — Homebrew is not working` });
        continue;
      } catch (err) {
        onEvent({ type: 'error', message: `Failed to install ${tool.name}: ${err.message}` });
        continue;
      }
    }

    let cmd = tool.install[PLATFORM];

    // Linux: resolve per package manager
    if (PLATFORM === 'linux' && !cmd) {
      cmd = await getLinuxInstallCmd(tool.name);
    }

    if (!cmd) {
      onEvent({ type: 'warning', message: `Cannot auto-install ${tool.name} on this platform` });
      continue;
    }

    try {
      // Pre-clean npm global packages to avoid EBUSY on Windows
      if (tool.npmPackage && cmd[0] === 'npm') {
        preCleanNpmPackage(tool.npmPackage);
      }
      await runCommand(cmd[0], cmd.slice(1), onEvent);
      // Refresh PATH after winget installs so npm/node/git are immediately visible
      if (cmd[0] === 'winget') refreshPathWindows();
      onEvent({ type: 'installed', message: `${tool.name} installed` });
    } catch (err) {
      // On Windows, npm EBUSY: retry with --force as fallback
      if (PLATFORM === 'win32' && tool.npmPackage && cmd[0] === 'npm' && err.message.includes('EBUSY')) {
        onEvent({ type: 'log', message: `Retrying ${tool.name} install with --force...\n` });
        try {
          const forceCmd = ['npm', 'install', '-g', '--force', tool.npmPackage];
          await runCommand(forceCmd[0], forceCmd.slice(1), onEvent);
          onEvent({ type: 'installed', message: `${tool.name} installed` });
          continue;
        } catch (retryErr) {
          onEvent({ type: 'error', message: `${tool.name}: Files are locked by Windows. Please restart your computer and re-open the app to complete installation.` });
          continue;
        }
      }
      onEvent({ type: 'error', message: `Failed to install ${tool.name}: ${err.message}` });
    }
  }

  // Re-check after installation (refresh PATH first so new tools are visible)
  refreshPathWindows();
  const recheck = await Promise.all(allTools.map(async (tool) => ({
    name: tool.name,
    installed: await tool.check(),
  })));
  const stillMissing = recheck.filter((t) => !t.installed).map((t) => t.name);

  if (stillMissing.length === 0) {
    onEvent({ type: 'done', message: 'All tools installed successfully' });
  } else {
    onEvent({ type: 'done', message: `Setup complete. Still missing: ${stillMissing.join(', ')}` });
  }
}

function runCommand(cmd, args, onEvent, timeoutMs) {
  const timeout = timeoutMs || 180000; // default 3 minutes
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderrBuf = '';
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        try { child.kill('SIGTERM'); } catch { /* best effort */ }
        reject(new Error(`Timed out after ${Math.round(timeout / 1000)}s`));
      }
    }, timeout);
    child.stdout.on('data', (d) => onEvent({ type: 'log', message: d.toString() }));
    child.stderr.on('data', (d) => {
      const text = d.toString();
      stderrBuf += text;
      onEvent({ type: 'log', message: text });
    });
    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        const errMsg = stderrBuf.includes('EBUSY') ? 'EBUSY: file locked by Windows'
          : `exit code ${code}`;
        reject(new Error(errMsg));
      }
    });
    child.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * On Windows, refresh process.env.PATH from the registry so that
 * tools installed by winget (Node.js, Git, etc.) are immediately
 * visible to subsequent child_process.spawn calls without restarting.
 */
function refreshPathWindows() {
  if (PLATFORM !== 'win32') return;
  try {
    const machinePathRaw = require('child_process').execFileSync(
      'reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', '/v', 'Path'],
      { encoding: 'utf8', timeout: 5000 }
    );
    const userPathRaw = require('child_process').execFileSync(
      'reg', ['query', 'HKCU\\Environment', '/v', 'Path'],
      { encoding: 'utf8', timeout: 5000 }
    );
    const extract = (raw) => {
      const match = raw.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
      return match ? match[1].trim() : '';
    };
    const machinePath = extract(machinePathRaw);
    const userPath = extract(userPathRaw);
    if (machinePath || userPath) {
      process.env.PATH = [userPath, machinePath, process.env.PATH].filter(Boolean).join(';');
    }
  } catch { /* best effort */ }
}

// ── Authentication checks ────────────────────────────────────

const AUTH_SERVICES = [
  {
    id: 'claude',
    name: 'Claude Code',
    category: 'ai',
    signupUrl: 'https://console.anthropic.com',
    signupLabel: 'Anthropic Console',
  },
  {
    id: 'codex',
    name: 'Codex CLI (OpenAI)',
    category: 'ai',
    signupUrl: 'https://platform.openai.com/signup',
    signupLabel: 'OpenAI Platform',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    category: 'core',
    signupUrl: 'https://dash.cloudflare.com/sign-up',
    signupLabel: 'Cloudflare Dashboard',
  },
  {
    id: 'github',
    name: 'GitHub CLI',
    category: 'core',
    signupUrl: 'https://github.com/join',
    signupLabel: 'GitHub',
  },
];

function checkAuthClaude() {
  return new Promise((resolve) => {
    // Check environment variable first
    if (process.env.ANTHROPIC_API_KEY) return resolve(true);
    // Check credentials file (older Claude Code)
    const credFile = path.join(os.homedir(), '.claude', '.credentials.json');
    if (fs.existsSync(credFile)) {
      try {
        const creds = JSON.parse(fs.readFileSync(credFile, 'utf8'));
        if (creds.oauthAccount || creds.apiKey || creds.claudeAiOauth) return resolve(true);
      } catch { /* fall through */ }
    }
    // Check auth.json (older Claude Code)
    const authFile = path.join(os.homedir(), '.claude', 'auth.json');
    if (fs.existsSync(authFile)) {
      try {
        const auth = JSON.parse(fs.readFileSync(authFile, 'utf8'));
        if (Object.keys(auth).length > 0) return resolve(true);
      } catch { /* fall through */ }
    }
    // Check via CLI (current Claude Code uses OAuth without local auth files)
    execFile('claude', ['auth', 'status'], { shell: true, timeout: 10000, encoding: 'utf8' }, (err, stdout) => {
      if (err) return resolve(false);
      try {
        const status = JSON.parse(stdout);
        resolve(!!status.loggedIn);
      } catch {
        resolve(stdout.toLowerCase().includes('logged') || stdout.toLowerCase().includes('authenticated'));
      }
    });
  });
}

function checkAuthCodex() {
  return new Promise((resolve) => {
    // Codex CLI uses OPENAI_API_KEY env var or ~/.codex/auth.json
    if (process.env.OPENAI_API_KEY) return resolve(true);
    const authFile = path.join(os.homedir(), '.codex', 'auth.json');
    if (fs.existsSync(authFile)) {
      try {
        const auth = JSON.parse(fs.readFileSync(authFile, 'utf8'));
        resolve(!!auth.OPENAI_API_KEY || !!auth.tokens || !!auth.apiKey);
        return;
      } catch { /* fall through */ }
    }
    resolve(false);
  });
}

function checkAuthCloudflare() {
  return new Promise((resolve) => {
    execFile('wrangler', ['whoami'], { shell: true, timeout: 10000 }, (err, stdout) => {
      if (err) return resolve(false);
      var output = (stdout || '').toLowerCase();
      resolve(!output.includes('not authenticated') && !output.includes('no oauth token'));
    });
  });
}

function checkAuthGitHub() {
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'status'], { shell: true, timeout: 10000 }, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Check authentication status.
 * @param {string[]} [aiBackends] - which AI backends to check ('claude','codex'). Omit for all.
 */
async function checkAuth(aiBackends) {
  var checks = [
    checkAuthCloudflare().then(function (ok) { return { id: 'cloudflare', name: 'Cloudflare', authenticated: ok }; }),
    checkAuthGitHub().then(function (ok) { return { id: 'github', name: 'GitHub CLI', authenticated: ok }; }),
  ];
  // Only check auth for selected AI backends
  var ais = aiBackends || ['claude', 'codex'];
  if (ais.includes('claude')) {
    checks.push(checkAuthClaude().then(function (ok) { return { id: 'claude', name: 'Claude Code', authenticated: ok }; }));
  }
  if (ais.includes('codex')) {
    checks.push(checkAuthCodex().then(function (ok) { return { id: 'codex', name: 'Codex CLI (OpenAI)', authenticated: ok }; }));
  }
  var results = await Promise.all(checks);
  return {
    services: results,
    allAuthenticated: results.every(function (r) { return r.authenticated; }),
    meta: AUTH_SERVICES,
  };
}

function runAuthCommand(serviceId, onEvent) {
  var cmd, args;
  switch (serviceId) {
    case 'claude':
      // Claude Code uses interactive OAuth — must run in a real terminal
      if (PLATFORM === 'win32') {
        cmd = 'cmd';
        args = ['/c', 'start', 'cmd', '/k', 'claude'];
      } else if (PLATFORM === 'darwin') {
        let claudePath = 'claude';
        try {
          claudePath = require('child_process').execFileSync('which', ['claude'], { encoding: 'utf8' }).trim() || 'claude';
        } catch { /* fall back to bare name */ }
        const scriptPath = path.join(os.tmpdir(), 'claude-auth.sh');
        fs.writeFileSync(scriptPath, `#!/bin/bash\n"${claudePath}"\n`, { mode: 0o755 });
        cmd = 'open';
        args = ['-a', 'Terminal', scriptPath];
      } else {
        cmd = 'x-terminal-emulator';
        args = ['-e', 'claude'];
      }
      // Since we open a separate terminal, we can't track completion — poll instead
      onEvent({ type: 'auth-log', service: 'claude', message: 'A terminal window has been opened. Follow the prompts to sign in to Claude Code, then close the terminal when done.' });
      return new Promise((resolve) => {
        var child = spawn(cmd, args, { shell: true, detached: true, stdio: 'ignore' });
        child.unref();
        // Poll for credentials file to appear
        var attempts = 0;
        var interval = setInterval(async function () {
          attempts++;
          var ok = await checkAuthClaude();
          if (ok) {
            clearInterval(interval);
            onEvent({ type: 'auth-done', service: 'claude', success: true });
            resolve();
          } else if (attempts > 120) { // 2 minutes
            clearInterval(interval);
            onEvent({ type: 'auth-done', service: 'claude', success: false, message: 'Timed out waiting for authentication' });
            resolve();
          }
        }, 1000);
      });
    case 'codex':
      cmd = 'codex';
      args = ['login'];
      break;
    case 'cloudflare':
      cmd = 'wrangler';
      args = ['login'];
      break;
    case 'github':
      cmd = 'gh';
      args = ['auth', 'login', '--web', '-p', 'https', '--skip-ssh-key'];
      break;
    default:
      onEvent({ type: 'error', service: serviceId, message: 'Unknown service: ' + serviceId });
      return Promise.reject(new Error('Unknown service: ' + serviceId));
  }

  return new Promise((resolve, reject) => {
    var child = spawn(cmd, args, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    var browserOpened = false;

    function handleOutput(text) {
      onEvent({ type: 'auth-log', service: serviceId, message: text });
      // For GitHub: detect one-time code, open browser ourselves, and send Enter
      if (serviceId === 'github' && !browserOpened) {
        var codeMatch = text.match(/code[:\s]+([A-Z0-9]{4}-[A-Z0-9]{4})/i);
        if (codeMatch) {
          browserOpened = true;
          // Tell renderer to open the browser (via event)
          onEvent({ type: 'auth-open-url', service: serviceId, url: 'https://github.com/login/device' });
          // Also send Enter to advance gh past its prompt
          setTimeout(function () {
            try { child.stdin.write('\n'); } catch (e) { /* ignore */ }
          }, 300);
        }
      }
    }

    child.stdout.on('data', function (d) { handleOutput(d.toString()); });
    child.stderr.on('data', function (d) { handleOutput(d.toString()); });
    child.on('close', function (code) {
      if (code === 0) {
        onEvent({ type: 'auth-done', service: serviceId, success: true });
        resolve();
      } else {
        onEvent({ type: 'auth-done', service: serviceId, success: false, message: 'Process exited with code ' + code });
        resolve();
      }
    });
    child.on('error', function (err) {
      onEvent({ type: 'auth-done', service: serviceId, success: false, message: err.message });
      resolve();
    });
  });
}

/**
 * Sign out of a service.
 */
function runLogoutCommand(serviceId) {
  return new Promise((resolve) => {
    var cmd, args;
    switch (serviceId) {
      case 'claude':
        // Delete credentials file
        try {
          const credFile = path.join(os.homedir(), '.claude', '.credentials.json');
          if (fs.existsSync(credFile)) fs.unlinkSync(credFile);
        } catch { /* ignore */ }
        return resolve(true);
      case 'codex':
        cmd = 'codex';
        args = ['logout'];
        break;
      case 'cloudflare':
        cmd = 'wrangler';
        args = ['logout'];
        break;
      case 'github':
        cmd = 'gh';
        args = ['auth', 'logout', '--hostname', 'github.com'];
        break;
      default:
        return resolve(false);
    }
    var child = spawn(cmd, args, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    // gh auth logout prompts "are you sure?" — send Y
    child.stdin.write('Y\n');
    child.on('close', function () { resolve(true); });
    child.on('error', function () { resolve(false); });
  });
}

module.exports = { checkSetup, runSetup, checkAuth, runAuthCommand, runLogoutCommand, AUTH_SERVICES, AI_TOOLS };
