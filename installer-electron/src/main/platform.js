const os = require('os');
const { execFileSync } = require('child_process');

function commandExists(cmd) {
  try {
    if (process.platform === 'win32') {
      execFileSync('where', [cmd], { stdio: 'ignore' });
    } else {
      execFileSync('which', [cmd], { stdio: 'ignore' });
    }
    return true;
  } catch { return false; }
}

function detectOS() {
  const p = process.platform;
  if (p === 'darwin') return 'macos';
  if (p === 'linux') return 'linux';
  if (p === 'win32') return 'windows';
  return 'unknown';
}

function detectPackageManager() {
  const osType = detectOS();
  if (osType === 'macos') return commandExists('brew') ? 'brew' : 'brew-missing';
  if (osType === 'linux') {
    if (commandExists('apt')) return 'apt';
    if (commandExists('dnf')) return 'dnf';
    if (commandExists('pacman')) return 'pacman';
    return 'unknown';
  }
  if (osType === 'windows') return 'winget';
  return 'unknown';
}

// Multi-step install sequences for tools that need repo setup on Linux
const LINUX_REPO_SETUP = {
  gh: {
    apt: [
      ['sudo', ['mkdir', '-p', '-m', '755', '/etc/apt/keyrings']],
      ['bash', ['-c', 'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null']],
      ['sudo', ['chmod', 'go+r', '/etc/apt/keyrings/githubcli-archive-keyring.gpg']],
      ['bash', ['-c', 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null']],
      ['sudo', ['apt', 'update']],
      ['sudo', ['apt', 'install', '-y', 'gh']],
    ],
    dnf: [
      ['sudo', ['dnf', 'install', '-y', 'gh']],
    ],
    pacman: [
      ['sudo', ['pacman', '-S', '--noconfirm', 'github-cli']],
    ],
  },
  vscode: {
    apt: [
      ['bash', ['-c', 'curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | sudo tee /usr/share/keyrings/microsoft-archive-keyring.gpg > /dev/null']],
      ['bash', ['-c', 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-archive-keyring.gpg] https://packages.microsoft.com/repos/vscode stable main" | sudo tee /etc/apt/sources.list.d/vscode.list > /dev/null']],
      ['sudo', ['apt', 'update']],
      ['sudo', ['apt', 'install', '-y', 'code']],
    ],
    dnf: [
      ['bash', ['-c', 'sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc']],
      ['bash', ['-c', 'echo -e "[code]\\nname=Visual Studio Code\\nbaseurl=https://packages.microsoft.com/yumrepos/vscode\\nenabled=1\\ngpgcheck=1\\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc" | sudo tee /etc/yum.repos.d/vscode.repo > /dev/null']],
      ['sudo', ['dnf', 'install', '-y', 'code']],
    ],
    pacman: [
      ['bash', ['-c', 'echo "VS Code: install from AUR (yay -S visual-studio-code-bin) or download from code.visualstudio.com"']],
    ],
  },
};

// Simple install commands by platform and package manager
const TOOL_COMMANDS = {
  macos: {
    brew: {
      node: { cmd: 'brew', args: ['install', 'node'] },
      git: { cmd: 'brew', args: ['install', 'git'] },
      gh: { cmd: 'brew', args: ['install', 'gh'] },
      wrangler: { cmd: 'npm', args: ['install', '-g', 'wrangler'] },
      claude: { cmd: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code'] },
      vscode: { cmd: 'brew', args: ['install', '--cask', 'visual-studio-code'] },
      cursor: { cmd: 'brew', args: ['install', '--cask', 'cursor'] },
    },
  },
  linux: {
    apt: {
      node: { cmd: 'sudo', args: ['apt', 'install', '-y', 'nodejs', 'npm'] },
      git: { cmd: 'sudo', args: ['apt', 'install', '-y', 'git'] },
      gh: 'multi-step',
      wrangler: { cmd: 'npm', args: ['install', '-g', 'wrangler'] },
      claude: { cmd: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code'] },
      vscode: 'multi-step',
      cursor: { cmd: 'bash', args: ['-c', 'echo "Download Cursor from https://cursor.com/download"'] },
    },
    dnf: {
      node: { cmd: 'sudo', args: ['dnf', 'install', '-y', 'nodejs', 'npm'] },
      git: { cmd: 'sudo', args: ['dnf', 'install', '-y', 'git'] },
      gh: 'multi-step',
      wrangler: { cmd: 'npm', args: ['install', '-g', 'wrangler'] },
      claude: { cmd: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code'] },
      vscode: 'multi-step',
      cursor: { cmd: 'bash', args: ['-c', 'echo "Download Cursor from https://cursor.com/download"'] },
    },
    pacman: {
      node: { cmd: 'sudo', args: ['pacman', '-S', '--noconfirm', 'nodejs', 'npm'] },
      git: { cmd: 'sudo', args: ['pacman', '-S', '--noconfirm', 'git'] },
      gh: 'multi-step',
      wrangler: { cmd: 'npm', args: ['install', '-g', 'wrangler'] },
      claude: { cmd: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code'] },
      vscode: 'multi-step',
      cursor: { cmd: 'bash', args: ['-c', 'echo "Download Cursor from https://cursor.com/download"'] },
    },
  },
  windows: {
    winget: {
      node: { cmd: 'winget', args: ['install', '--id', 'OpenJS.NodeJS.LTS', '--accept-source-agreements', '--accept-package-agreements', '-h'] },
      git: { cmd: 'winget', args: ['install', '--id', 'Git.Git', '--accept-source-agreements', '--accept-package-agreements', '-h'] },
      gh: { cmd: 'winget', args: ['install', '--id', 'GitHub.cli', '--accept-source-agreements', '--accept-package-agreements', '-h'] },
      wrangler: { cmd: 'npm', args: ['install', '-g', 'wrangler'] },
      claude: { cmd: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code'] },
      vscode: { cmd: 'winget', args: ['install', '--id', 'Microsoft.VisualStudioCode', '--accept-source-agreements', '--accept-package-agreements', '-h'] },
      cursor: { cmd: 'winget', args: ['install', '--id', 'Anysphere.Cursor', '--accept-source-agreements', '--accept-package-agreements', '-h'] },
    },
  },
};

// Terminal emulators to try on Linux (in order of preference)
const LINUX_TERMINALS = [
  'gnome-terminal', 'konsole', 'xfce4-terminal', 'mate-terminal',
  'lxterminal', 'x-terminal-emulator', 'xterm',
];

function findLinuxTerminal() {
  for (const term of LINUX_TERMINALS) {
    if (commandExists(term)) return term;
  }
  return 'xterm';
}

function getTerminalLaunchArgs(terminal, command) {
  switch (terminal) {
    case 'gnome-terminal': return ['--', 'bash', '-c', `${command}; echo ""; echo "Press Enter to close..."; read`];
    case 'konsole': return ['-e', 'bash', '-c', `${command}; echo ""; echo "Press Enter to close..."; read`];
    case 'xfce4-terminal': return ['-e', `bash -c '${command}; echo ""; echo "Press Enter to close..."; read'`];
    case 'mate-terminal': return ['-e', `bash -c '${command}; echo ""; echo "Press Enter to close..."; read'`];
    case 'lxterminal': return ['-e', `bash -c '${command}; echo ""; echo "Press Enter to close..."; read'`];
    default: return ['-e', 'bash', '-c', `${command}; echo ""; echo "Press Enter to close..."; read`];
  }
}

function getDefaultInstallDir() {
  const osType = detectOS();
  const home = os.homedir();
  if (osType === 'macos') return require('path').join(home, 'Documents', 'websites');
  if (osType === 'linux') return require('path').join(home, 'websites');
  return require('path').join(home, 'Documents', 'websites');
}

module.exports = {
  commandExists,
  detectOS,
  detectPackageManager,
  getDefaultInstallDir,
  findLinuxTerminal,
  getTerminalLaunchArgs,
  TOOL_COMMANDS,
  LINUX_REPO_SETUP,
};
