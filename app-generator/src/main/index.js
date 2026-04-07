const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const AIBackend = require('./ai-backend');
const ProjectManager = require('./project-manager');
const DevServer = require('./dev-server');
const Distributor = require('./deploy');
const AppLauncher = require('./app-launcher');
const ChatStore = require('./chat-store');
const { checkSetup, runSetup, checkAuth, runAuthCommand, runLogoutCommand, AI_TOOLS } = require('./setup');

let mainWindow;
const aiBackend = new AIBackend();
const projectManager = new ProjectManager();
const devServer = new DevServer();
const distributor = new Distributor();
const appLauncher = new AppLauncher();
const chatStore = new ChatStore();

/** Safe send — guards against destroyed window */
function safeSend(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// ── Settings persistence ─────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function getSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveSettings(s) {
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
}

// ── Window state persistence ─────────────────────────────────
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStatePath, 'utf8'));
  } catch {
    return { width: 1400, height: 900 };
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const maximized = mainWindow.isMaximized();
  const state = { ...bounds, maximized };
  try {
    const dir = path.dirname(windowStatePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(windowStatePath, JSON.stringify(state));
  } catch { /* best effort */ }
}

// ── Application Menu ─────────────────────────────────────────
function buildAppMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => safeSend('menu:action', 'new-project'),
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => safeSend('menu:action', 'open-settings'),
        },
        { type: 'separator' },
        {
          label: 'Open Workspace Folder',
          click: () => {
            const wp = projectManager.getWorkspacePath();
            if (wp) shell.openPath(wp);
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    // View menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Refresh Preview',
          accelerator: 'CmdOrCtrl+R',
          click: () => safeSend('menu:action', 'refresh-preview'),
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.toggleDevTools();
            }
          },
        },
      ],
    },
    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'About App Generator',
          click: () => safeSend('menu:action', 'open-about'),
        },
        { type: 'separator' },
        {
          label: 'Report an Issue',
          click: () => shell.openExternal('https://github.com'),
        },
        {
          label: 'View Logs',
          click: () => shell.openPath(app.getPath('userData')),
        },
      ],
    },
  ];

  // macOS app menu
  if (isMac) {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'Cmd+,',
          click: () => safeSend('menu:action', 'open-settings'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── Window ───────────────────────────────────────────────────
function createWindow() {
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width || 1400,
    height: windowState.height || 900,
    x: windowState.x,
    y: windowState.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0b',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'win32' ? {
      color: '#0a0a0b',
      symbolColor: '#999',
      height: 36,
    } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (windowState.maximized) {
    mainWindow.maximize();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Save window state on move/resize
  let saveTimeout;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveWindowState, 500);
  };
  mainWindow.on('resize', debouncedSave);
  mainWindow.on('move', debouncedSave);
  mainWindow.on('close', saveWindowState);

  // Prevent the main window from navigating away from the app
  const appFilePath = path.join(__dirname, '..', 'renderer', 'index.html').replace(/\\/g, '/');
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Only allow navigating to the app's own index.html
    if (!url.includes(appFilePath)) {
      event.preventDefault();
    }
  });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.env.WEBGEN_DEBUG) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ── App lifecycle ────────────────────────────────────────────
app.whenReady().then(() => {
  const settings = getSettings();
  projectManager.init(settings.workspacePath);
  projectManager.setUserProfile({
    userName: settings.userName,
    userEmail: settings.userEmail,
    userPronouns: settings.userPronouns,
  });

  if (settings.backend) {
    aiBackend.setBackend(settings.backend);
  }
  if (settings.claudeModel) {
    aiBackend.setClaudeModel(settings.claudeModel);
  }
  if (settings.codexModel) {
    aiBackend.setCodexModel(settings.codexModel);
  }

  buildAppMenu();
  createWindow();

  // ── Auto-updater ──────────────────────────────────────────
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = require('electron-log');
  autoUpdater.logger.transports.file.level = 'info';

  autoUpdater.on('checking-for-update', () => {
    safeSend('updater:event', { type: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    safeSend('updater:event', { type: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    safeSend('updater:event', { type: 'up-to-date' });
  });
  autoUpdater.on('update-downloaded', (info) => {
    safeSend('updater:event', { type: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    safeSend('updater:event', { type: 'error', message: err.message });
  });

  // Check for updates after a short delay (don't block startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  aiBackend.stop();
  devServer.stopAll();
  appLauncher.stopAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  aiBackend.stop();
  devServer.stopAll();
  appLauncher.stopAll();
});

// ── IPC: AI ──────────────────────────────────────────────────
ipcMain.handle('ai:send', (_event, message, projectName) => {
  const project = projectName
    ? projectManager.getProjectByName(projectName)
    : projectManager.getActiveProject();
  if (!project) throw new Error('No active project');

  const pName = project.name;
  const projectSettings = projectManager.getProjectSettings(pName);

  // Build per-project backend config, falling back to global defaults
  const backendConfig = {
    backend: projectSettings.backend || undefined,
    claudeModel: projectSettings.claudeModel || undefined,
    codexModel: projectSettings.codexModel || undefined,
  };

  const chatHistory = chatStore.loadMessages(project.path)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-20);

  aiBackend
    .send(message, project.path, pName, (evt) => {
      safeSend('ai:event', { ...evt, project: pName });
    }, projectSettings, chatHistory, backendConfig)
    .catch((err) => {
      safeSend('ai:event', { type: 'error', text: err.message, project: pName });
      safeSend('ai:event', { type: 'done', code: 1, project: pName });
    });

  return true;
});

ipcMain.handle('ai:stop', (_event, projectName) => {
  const name = projectName || (projectManager.getActiveProject() || {}).name;
  if (name) aiBackend.stopProject(name);
});

ipcMain.handle('ai:is-generating', (_event, projectName) => {
  return aiBackend.isProjectGenerating(projectName);
});

ipcMain.handle('ai:set-backend', (_event, backend) => {
  aiBackend.setBackend(backend);
  const s = getSettings();
  s.backend = backend;
  saveSettings(s);
});

ipcMain.handle('ai:get-backend', () => {
  return aiBackend.getBackend();
});

ipcMain.handle('ai:get-models', () => {
  return {
    claude: AIBackend.getClaudeModels(),
    codex: AIBackend.getCodexModels(),
    selectedClaude: aiBackend.getClaudeModel(),
    selectedCodex: aiBackend.getCodexModel(),
  };
});

ipcMain.handle('ai:set-model', (_event, backend, model) => {
  if (backend === 'claude') {
    aiBackend.setClaudeModel(model);
    const s = getSettings();
    s.claudeModel = model;
    saveSettings(s);
  } else {
    aiBackend.setCodexModel(model);
    const s = getSettings();
    s.codexModel = model;
    saveSettings(s);
  }
});

// ── IPC: Projects ────────────────────────────────────────────
ipcMain.handle('project:list', () => {
  const projects = projectManager.listProjects();
  const settings = getSettings();
  const order = settings.projectOrder || [];
  if (order.length > 0) {
    const orderMap = {};
    for (var i = 0; i < order.length; i++) orderMap[order[i]] = i;
    projects.sort(function (a, b) {
      var ai = orderMap[a.name] !== undefined ? orderMap[a.name] : 9999;
      var bi = orderMap[b.name] !== undefined ? orderMap[b.name] : 9999;
      return ai - bi;
    });
  }
  return projects;
});

ipcMain.handle('project:reorder', (_event, orderedNames) => {
  const settings = getSettings();
  settings.projectOrder = orderedNames;
  saveSettings(settings);
});

ipcMain.handle('project:create', (_event, name) => {
  return projectManager.createProject(name);
});

ipcMain.handle('project:delete', (_event, name) => {
  devServer.stop(name);
  aiBackend.clearHistory(name);
  return projectManager.deleteProject(name);
});

ipcMain.handle('project:get-active', () => {
  return projectManager.getActiveProject();
});

ipcMain.handle('project:set-active', (_event, name) => {
  return projectManager.setActiveProject(name);
});

ipcMain.handle('project:open-folder', (_event, name) => {
  const project = projectManager.getProjectByName(name);
  if (project) shell.openPath(project.path);
});

ipcMain.handle('project:get-settings', (_event, name) => {
  return projectManager.getProjectSettings(name);
});

ipcMain.handle('project:set-settings', (_event, name, settings) => {
  return projectManager.setProjectSettings(name, settings);
});

// ── IPC: Dev Server ──────────────────────────────────────────
ipcMain.handle('devserver:start', async (_event, projectName) => {
  const project = projectName
    ? projectManager.getProjectByName(projectName)
    : projectManager.getActiveProject();
  if (!project) throw new Error('No active project');

  return devServer.start(project.path, project.name, (evt) => {
    safeSend('devserver:event', { ...evt, projectName: project.name });
  });
});

ipcMain.handle('devserver:stop', (_event, projectName) => {
  const project = projectName
    ? projectManager.getProjectByName(projectName)
    : projectManager.getActiveProject();
  if (project) devServer.stop(project.name);
});

ipcMain.handle('devserver:url', (_event, projectName) => {
  const name = projectName || (projectManager.getActiveProject() || {}).name;
  if (!name) return null;
  return devServer.getUrl(name);
});

// ── IPC: Distribute ──────────────────────────────────────────
ipcMain.handle('distribute:build', (_event, projectName) => {
  const project = projectName
    ? projectManager.getProjectByName(projectName)
    : projectManager.getActiveProject();
  if (!project) throw new Error('No active project');

  distributor
    .build(project.path, project.name, (evt) => {
      safeSend('distribute:event', { ...evt, projectName: project.name });
    })
    .catch((err) => {
      safeSend('distribute:event', { type: 'error', message: err.message, projectName: project.name });
    });

  return true;
});

ipcMain.handle('distribute:status', async (_event, projectName) => {
  const name = projectName || (projectManager.getActiveProject() || {}).name;
  if (!name) return null;
  return distributor.getDistributionStatus(name);
});

// ── IPC: App Launcher ───────────────────────────────────────
ipcMain.handle('app:launch', (_event, projectName) => {
  const project = projectName
    ? projectManager.getProjectByName(projectName)
    : projectManager.getActiveProject();
  if (!project) throw new Error('No active project');

  appLauncher.launch(project.path, project.name, (evt) => {
    safeSend('app:event', { ...evt, projectName: project.name });
  });
  return true;
});

ipcMain.handle('app:stop', (_event, projectName) => {
  const name = projectName || (projectManager.getActiveProject() || {}).name;
  if (name) appLauncher.stop(name);
});

ipcMain.handle('app:is-running', (_event, projectName) => {
  return appLauncher.isRunning(projectName);
});

// ── IPC: Chat Persistence ────────────────────────────────────
ipcMain.handle('chat:load', (_event, projectName) => {
  const project = projectManager.getProjectByName(projectName);
  if (!project) return [];
  return chatStore.loadMessages(project.path);
});

ipcMain.handle('chat:save', (_event, projectName, messages) => {
  const project = projectManager.getProjectByName(projectName);
  if (!project) return;
  chatStore.saveMessages(project.path, messages);
});

ipcMain.handle('chat:detect-imports', () => {
  const workspacePath = projectManager.getWorkspacePath();
  return chatStore.getImportableChats(workspacePath);
});

ipcMain.handle('chat:import', (_event, claudeDir, sessionFiles) => {
  const projectsDir = projectManager.getProjectsDir();
  return chatStore.importAndSave(claudeDir, sessionFiles, projectsDir);
});

ipcMain.handle('chat:detect-project-import', (_event, projectName) => {
  const workspacePath = projectManager.getWorkspacePath();
  return chatStore.getProjectImportInfo(workspacePath, projectName);
});

ipcMain.handle('chat:import-project', (_event, projectName) => {
  const workspacePath = projectManager.getWorkspacePath();
  const info = chatStore.getProjectImportInfo(workspacePath, projectName);
  if (!info.available) return { totalMessages: 0 };

  let totalImported = 0;
  for (const source of info.sources) {
    const result = chatStore.importAndSave(source.claudeDir, source.sessionFiles, projectManager.getProjectsDir());
    totalImported += result.totalMessages;
  }
  return { totalMessages: totalImported };
});

ipcMain.handle('chat:load-forks-legacy', (_event, projectName) => {
  const project = projectManager.getProjectByName(projectName);
  if (!project) return {};
  return chatStore.loadForksLegacy(project.path);
});

ipcMain.handle('chat:backup', (_event, projectName) => {
  const project = projectManager.getProjectByName(projectName);
  if (!project) return;
  chatStore.backupChat(project.path);
});

ipcMain.handle('ai:clear-history', (_event, projectName) => {
  aiBackend.clearHistory(projectName);
});

// ── IPC: Settings ────────────────────────────────────────────
ipcMain.handle('settings:get', () => getSettings());

ipcMain.handle('settings:set', (_event, settings) => {
  const current = getSettings();
  const merged = { ...current, ...settings };
  saveSettings(merged);

  // Apply settings changes immediately
  if (settings.backend !== undefined) {
    aiBackend.setBackend(settings.backend);
  }
  if (settings.workspacePath !== undefined) {
    projectManager.setWorkspacePath(settings.workspacePath);
  }
  if (settings.userName !== undefined || settings.userPronouns !== undefined) {
    projectManager.setUserProfile({
      userName: merged.userName,
      userEmail: merged.userEmail,
      userPronouns: merged.userPronouns,
    });
  }

  return merged;
});

ipcMain.handle('workspace:path', () => projectManager.getWorkspacePath());

ipcMain.handle('workspace:set-path', (_event, p) => {
  projectManager.setWorkspacePath(p);
  const s = getSettings();
  s.workspacePath = p;
  saveSettings(s);
});

// ── IPC: Setup / Migration ───────────────────────────────────
ipcMain.handle('setup:check', async () => {
  const toolStatus = await checkSetup();
  const migrationSource = projectManager.detectMigrationSource();
  return { ...toolStatus, migrationSource };
});

ipcMain.handle('setup:run', (_event, options) => {
  runSetup((evt) => {
    safeSend('setup:event', evt);
  }, options).catch((err) => {
    safeSend('setup:event', { type: 'error', message: err.message });
  });
  return true;
});

ipcMain.handle('setup:ai-tools', () => {
  return AI_TOOLS.map((t) => ({ id: t.id, name: t.name }));
});

ipcMain.handle('setup:migrate', (_event, sourcePath) => {
  return projectManager.migrate(sourcePath);
});

// ── IPC: Auth ─────────────────────────────────────────────────
ipcMain.handle('auth:check', async (_event, aiBackends) => {
  return checkAuth(aiBackends);
});

ipcMain.handle('auth:run', (_event, serviceId) => {
  runAuthCommand(serviceId, (evt) => {
    // Intercept open-url events to open browser from main process
    if (evt.type === 'auth-open-url' && evt.url) {
      shell.openExternal(evt.url);
    }
    safeSend('auth:event', evt);
  }).catch((err) => {
    safeSend('auth:event', { type: 'auth-done', service: serviceId, success: false, message: err.message });
  });
  return true;
});

ipcMain.handle('auth:logout', async (_event, serviceId) => {
  return runLogoutCommand(serviceId);
});

// ── IPC: Updater ────────────────────────────────────────────
ipcMain.handle('updater:check', () => {
  return autoUpdater.checkForUpdates().catch(() => null);
});

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

// ── IPC: System ──────────────────────────────────────────────
ipcMain.handle('dialog:select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('dialog:select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
      { name: 'Code', extensions: ['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'md', 'py'] },
    ],
  });
  if (!result.filePaths || result.filePaths.length === 0) return [];

  const files = [];
  for (const fp of result.filePaths) {
    const name = path.basename(fp);
    const ext = path.extname(fp).toLowerCase();
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext);
    if (isImage) {
      const data = fs.readFileSync(fp);
      const mime = ext === '.svg' ? 'image/svg+xml' : `image/${ext.slice(1).replace('jpg', 'jpeg')}`;
      files.push({ name, path: fp, isImage: true, dataUrl: `data:${mime};base64,${data.toString('base64')}` });
    } else {
      try {
        const content = fs.readFileSync(fp, 'utf8');
        files.push({ name, path: fp, isImage: false, content: content.slice(0, 100000) }); // cap at 100KB
      } catch {
        files.push({ name, path: fp, isImage: false, content: '[Binary file — cannot read as text]' });
      }
    }
  }
  return files;
});

ipcMain.handle('attachment:save', (_event, projectName, name, dataUrl) => {
  const project = projectManager.getProjectByName(projectName);
  if (!project) throw new Error('No active project');
  const attachDir = path.join(project.path, '.appgen', 'attachments');
  if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true });

  const safeName = Date.now() + '-' + name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(attachDir, safeName);

  // Strip data URL header and write
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (match) {
    fs.writeFileSync(filePath, Buffer.from(match[1], 'base64'));
  }
  return { name: safeName, path: filePath, relativePath: `.appgen/attachments/${safeName}` };
});

ipcMain.handle('system:platform', () => process.platform);
ipcMain.handle('system:version', () => app.getVersion());
ipcMain.handle('system:user-data-path', () => app.getPath('userData'));

ipcMain.handle('system:open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return shell.openExternal(url);
  }
});

ipcMain.handle('system:open-path', (_event, p) => {
  if (typeof p !== 'string') return;
  const normalized = path.resolve(p);
  const allowed = [app.getPath('userData'), projectManager.getWorkspacePath()].filter(Boolean);
  if (allowed.some((dir) => normalized.startsWith(path.resolve(dir)))) {
    return shell.openPath(normalized);
  }
});
