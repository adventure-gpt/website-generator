const { spawn } = require('child_process');
const { commandExists, detectOS, detectPackageManager, TOOL_COMMANDS, LINUX_REPO_SETUP } = require('./platform');

let isDryRun = false;
let mainWindow = null;
const log = [];

function init(window, dryRun) {
  mainWindow = window;
  isDryRun = dryRun;
}

function sendProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('progress', data);
  }
}

function sendLog(entry) {
  log.push(entry);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('command-log', entry);
  }
}

function runCommand(cmd, args, opts = {}) {
  const fullCmd = `${cmd} ${args.join(' ')}`;

  if (isDryRun) {
    sendLog({ cmd: fullCmd, dryRun: true, time: new Date().toISOString() });
    return Promise.resolve({ stdout: '', stderr: '', code: 0 });
  }

  sendLog({ cmd: fullCmd, dryRun: false, time: new Date().toISOString() });

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, ...opts.env },
      cwd: opts.cwd,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });
    child.on('error', (err) => {
      resolve({ stdout, stderr: err.message, code: 1 });
    });
  });
}

async function runMultiStep(steps) {
  for (const [cmd, args] of steps) {
    const result = await runCommand(cmd, args);
    if (result.code !== 0 && !isDryRun) {
      return result;
    }
  }
  return { stdout: '', stderr: '', code: 0 };
}

function checkTool(tool) {
  if (isDryRun) return false; // In dry run, pretend nothing is installed so we walk through all installs
  return commandExists(tool);
}

async function installTool(toolKey) {
  const osType = detectOS();
  const pm = detectPackageManager();

  // Get the command spec for this tool
  let commands;
  if (osType === 'macos') {
    commands = TOOL_COMMANDS.macos.brew;
  } else if (osType === 'linux') {
    commands = TOOL_COMMANDS.linux[pm];
  } else {
    commands = TOOL_COMMANDS.windows.winget;
  }

  if (!commands) {
    return { success: false, error: `No package manager found for ${osType}` };
  }

  const spec = commands[toolKey];
  if (!spec) {
    return { success: false, error: `Unknown tool: ${toolKey}` };
  }

  // Multi-step installs (Linux repos for gh, vscode)
  if (spec === 'multi-step') {
    const steps = LINUX_REPO_SETUP[toolKey]?.[pm];
    if (!steps) return { success: false, error: `No install steps for ${toolKey} on ${pm}` };
    const result = await runMultiStep(steps);
    return { success: result.code === 0, error: result.stderr };
  }

  // Single command install
  const result = await runCommand(spec.cmd, spec.args);
  return { success: result.code === 0 || isDryRun, error: result.stderr };
}

// Tool detection commands (what binary to check for)
const TOOL_BINARIES = {
  node: 'node',
  git: 'git',
  gh: 'gh',
  wrangler: 'wrangler',
  claude: 'claude',
  vscode: 'code',
  cursor: 'cursor',
};

async function installAllTools(toolList, userName, userEmail, chosenEditor) {
  const total = toolList.length + 1; // +1 for git config
  let done = 0;

  for (const tool of toolList) {
    const binary = TOOL_BINARIES[tool.key] || tool.key;
    const label = tool.label;

    sendProgress({ tool: tool.key, status: 'checking', label, progress: done / total });

    if (checkTool(binary)) {
      sendProgress({ tool: tool.key, status: 'installed', label, progress: done / total });
    } else {
      sendProgress({ tool: tool.key, status: 'installing', label, progress: done / total });
      const result = await installTool(tool.key);
      if (result.success || isDryRun) {
        sendProgress({ tool: tool.key, status: 'installed', label, progress: (done + 1) / total });
      } else {
        sendProgress({ tool: tool.key, status: 'failed', label, error: result.error, progress: (done + 1) / total });
      }
    }
    done++;
  }

  // Git config
  sendProgress({ tool: 'gitconfig', status: 'configuring', label: 'Git', progress: done / total });
  if (checkTool('git') || isDryRun) {
    await runCommand('git', ['config', '--global', 'user.name', userName]);
    await runCommand('git', ['config', '--global', 'user.email', userEmail]);
    await runCommand('git', ['config', '--global', 'init.defaultBranch', 'main']);
  }
  done++;
  sendProgress({ tool: 'done', status: 'complete', progress: 1 });
}

async function checkAuth(service) {
  if (isDryRun) return { authenticated: false };

  if (service === 'github') {
    const result = await runCommand('gh', ['auth', 'status']);
    return { authenticated: result.code === 0 };
  }
  if (service === 'cloudflare') {
    const result = await runCommand('wrangler', ['whoami']);
    const output = result.stdout + ' ' + result.stderr;
    return { authenticated: output.includes('logged in') || output.includes('Logged in') };
  }
  return { authenticated: false };
}

async function installClaude() {
  sendProgress({ tool: 'claude', status: 'checking', label: 'Claude Code' });

  if (checkTool('claude')) {
    sendProgress({ tool: 'claude', status: 'installed', label: 'Claude Code' });
    return { success: true, alreadyInstalled: true };
  }

  if (!checkTool('npm') && !isDryRun) {
    sendProgress({ tool: 'claude', status: 'failed', label: 'Claude Code', error: 'Node.js not found' });
    return { success: false, error: 'Node.js not found - go back and install tools first' };
  }

  sendProgress({ tool: 'claude', status: 'installing', label: 'Claude Code' });
  const result = await runCommand('npm', ['install', '-g', '@anthropic-ai/claude-code']);

  if (result.code === 0 || isDryRun) {
    sendProgress({ tool: 'claude', status: 'installed', label: 'Claude Code' });
    return { success: true };
  }

  sendProgress({ tool: 'claude', status: 'failed', label: 'Claude Code', error: result.stderr });
  return { success: false, error: 'Install failed - run manually: npm install -g @anthropic-ai/claude-code' };
}

function getLog() { return log; }

module.exports = { init, installAllTools, installTool, checkTool, checkAuth, installClaude, runCommand, getLog };
