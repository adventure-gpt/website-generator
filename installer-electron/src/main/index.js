const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { detectOS, detectPackageManager, getDefaultInstallDir, commandExists } = require('./platform');
const installer = require('./installer');
const auth = require('./auth');
const templates = require('./templates');

const isDryRun = process.argv.includes('--dry-run') || app.commandLine.hasSwitch('dry-run');
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 820,
    resizable: true,
    minWidth: 800,
    minHeight: 600,
    title: 'Website Generator - Setup',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  installer.init(mainWindow, isDryRun);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ---- IPC Handlers ----

ipcMain.handle('get-platform-info', () => ({
  os: detectOS(),
  packageManager: detectPackageManager(),
  isDryRun,
  defaultInstallDir: getDefaultInstallDir(),
  homebrewInstalled: detectOS() === 'macos' ? commandExists('brew') : true,
}));

ipcMain.handle('install-tools', async (_e, toolList, userName, userEmail, chosenEditor) => {
  await installer.installAllTools(toolList, userName, userEmail, chosenEditor);
  return { success: true };
});

ipcMain.handle('check-tool', (_e, toolName) => {
  return installer.checkTool(toolName);
});

ipcMain.handle('run-auth', (_e, service) => {
  if (isDryRun) {
    const cmd = service === 'github' ? 'gh auth login --web --git-protocol https' : 'wrangler login';
    mainWindow.webContents.send('command-log', { cmd, dryRun: true, time: new Date().toISOString() });
    return { launched: true };
  }
  if (service === 'github') auth.launchGitHubAuth();
  else if (service === 'cloudflare') auth.launchCloudflareAuth();
  return { launched: true };
});

ipcMain.handle('check-auth', async (_e, service) => {
  return installer.checkAuth(service);
});

ipcMain.handle('install-claude', async () => {
  return installer.installClaude();
});

ipcMain.handle('launch-claude', (_e, workspacePath) => {
  if (isDryRun) {
    mainWindow.webContents.send('command-log', {
      cmd: `claude (in ${workspacePath})`,
      dryRun: true,
      time: new Date().toISOString(),
    });
    return { launched: true };
  }
  auth.launchClaudeInWorkspace(workspacePath);
  return { launched: true };
});

ipcMain.handle('generate-configs', (_e, installDir, values) => {
  if (isDryRun) {
    mainWindow.webContents.send('command-log', {
      cmd: `Generate configs in ${installDir}`,
      dryRun: true,
      time: new Date().toISOString(),
    });
    return { success: true };
  }
  try {
    templates.generateAllConfigs(installDir, values);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-workspace', (_e, editor, wsFilePath) => {
  if (isDryRun) {
    mainWindow.webContents.send('command-log', {
      cmd: `Open ${wsFilePath} in ${editor}`,
      dryRun: true,
      time: new Date().toISOString(),
    });
    return;
  }
  const cmd = editor === 'Cursor' ? 'cursor' : 'code';
  if (commandExists(cmd)) {
    require('child_process').spawn(cmd, [wsFilePath], { detached: true, stdio: 'ignore' }).unref();
  } else {
    shell.openPath(wsFilePath);
  }
});

ipcMain.handle('open-external', (_e, url) => {
  shell.openExternal(url);
});

ipcMain.handle('select-directory', async (_e, defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose install location',
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('install-homebrew', async () => {
  if (isDryRun) {
    mainWindow.webContents.send('command-log', {
      cmd: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
      dryRun: true,
      time: new Date().toISOString(),
    });
    return { success: true };
  }
  auth.launchAuthInTerminal('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"');
  return { launched: true };
});
