const { spawn, execSync } = require('child_process');
const { detectOS, findLinuxTerminal, getTerminalLaunchArgs } = require('./platform');

// Open a visible terminal and run an auth command so the CLI can open a browser
function launchAuthInTerminal(command) {
  const osType = detectOS();

  if (osType === 'macos') {
    // Use osascript to open Terminal.app with the command
    spawn('osascript', ['-e', `tell application "Terminal" to do script "${command}"`], {
      stdio: 'ignore',
      detached: true,
    }).unref();
    return;
  }

  if (osType === 'linux') {
    const terminal = findLinuxTerminal();
    const args = getTerminalLaunchArgs(terminal, command);
    spawn(terminal, args, { stdio: 'ignore', detached: true }).unref();
    return;
  }

  // Windows fallback (for dry-run testing)
  spawn('cmd', ['/c', `start cmd /c "${command}"`], {
    stdio: 'ignore',
    shell: true,
    detached: true,
  }).unref();
}

function launchGitHubAuth() {
  launchAuthInTerminal('gh auth login --web --git-protocol https');
}

function launchCloudflareAuth() {
  launchAuthInTerminal('wrangler login');
}

function launchClaudeInWorkspace(workspacePath) {
  const osType = detectOS();

  if (osType === 'macos') {
    spawn('osascript', ['-e', `tell application "Terminal" to do script "cd '${workspacePath}' && claude"`], {
      stdio: 'ignore',
      detached: true,
    }).unref();
    return;
  }

  if (osType === 'linux') {
    const terminal = findLinuxTerminal();
    const args = getTerminalLaunchArgs(terminal, `cd '${workspacePath}' && claude`);
    spawn(terminal, args, { stdio: 'ignore', detached: true }).unref();
    return;
  }

  // Windows
  spawn('cmd', ['/c', `start cmd /c "cd /d "${workspacePath}" && claude"`], {
    stdio: 'ignore',
    shell: true,
    detached: true,
  }).unref();
}

module.exports = { launchGitHubAuth, launchCloudflareAuth, launchClaudeInWorkspace };
