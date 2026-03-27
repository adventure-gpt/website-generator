const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installer', {
  // Platform info
  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),

  // Tool management
  installTools: (toolList, userName, userEmail, chosenEditor) =>
    ipcRenderer.invoke('install-tools', toolList, userName, userEmail, chosenEditor),
  checkTool: (toolName) => ipcRenderer.invoke('check-tool', toolName),

  // Auth
  runAuth: (service) => ipcRenderer.invoke('run-auth', service),
  checkAuth: (service) => ipcRenderer.invoke('check-auth', service),

  // Claude Code
  installClaude: () => ipcRenderer.invoke('install-claude'),
  launchClaude: (workspacePath) => ipcRenderer.invoke('launch-claude', workspacePath),

  // Config generation
  generateConfigs: (installDir, values) => ipcRenderer.invoke('generate-configs', installDir, values),

  // Workspace
  openWorkspace: (editor, wsFilePath) => ipcRenderer.invoke('open-workspace', editor, wsFilePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  selectDirectory: (defaultPath) => ipcRenderer.invoke('select-directory', defaultPath),

  // Homebrew (macOS)
  installHomebrew: () => ipcRenderer.invoke('install-homebrew'),

  // Events from main process
  onProgress: (callback) => {
    ipcRenderer.on('progress', (_e, data) => callback(data));
  },
  onCommandLog: (callback) => {
    ipcRenderer.on('command-log', (_e, data) => callback(data));
  },
});
