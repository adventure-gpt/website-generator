const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // AI
  sendMessage: (message, projectName) => ipcRenderer.invoke('ai:send', message, projectName),
  stopGeneration: (projectName) => ipcRenderer.invoke('ai:stop', projectName),
  isGenerating: (projectName) => ipcRenderer.invoke('ai:is-generating', projectName),
  setBackend: (backend) => ipcRenderer.invoke('ai:set-backend', backend),
  getBackend: () => ipcRenderer.invoke('ai:get-backend'),
  getModels: () => ipcRenderer.invoke('ai:get-models'),
  setModel: (backend, model) => ipcRenderer.invoke('ai:set-model', backend, model),

  // Projects
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: (name) => ipcRenderer.invoke('project:create', name),
  deleteProject: (name) => ipcRenderer.invoke('project:delete', name),
  getActiveProject: () => ipcRenderer.invoke('project:get-active'),
  setActiveProject: (name) => ipcRenderer.invoke('project:set-active', name),
  openProjectFolder: (name) => ipcRenderer.invoke('project:open-folder', name),
  reorderProjects: (names) => ipcRenderer.invoke('project:reorder', names),

  // Dev Server
  startDevServer: (projectName) => ipcRenderer.invoke('devserver:start', projectName),
  stopDevServer: (projectName) => ipcRenderer.invoke('devserver:stop', projectName),
  getDevServerUrl: (projectName) => ipcRenderer.invoke('devserver:url', projectName),

  // Distribution (replaces Deploy)
  distribute: (projectName) => ipcRenderer.invoke('distribute:start', projectName),
  getDistributeStatus: (projectName) => ipcRenderer.invoke('distribute:status', projectName),

  // App Launcher
  launchApp: (projectName) => ipcRenderer.invoke('app:launch', projectName),
  stopApp: (projectName) => ipcRenderer.invoke('app:stop', projectName),

  // Chat persistence
  loadChat: (projectName) => ipcRenderer.invoke('chat:load', projectName),
  saveChat: (projectName, messages) => ipcRenderer.invoke('chat:save', projectName, messages),
  appendChat: (projectName, message) => ipcRenderer.invoke('chat:append', projectName, message),
  detectChatImports: () => ipcRenderer.invoke('chat:detect-imports'),
  importChats: (claudeDir, sessionFiles) => ipcRenderer.invoke('chat:import', claudeDir, sessionFiles),
  detectProjectChatImport: (projectName) => ipcRenderer.invoke('chat:detect-project-import', projectName),
  importProjectChats: (projectName) => ipcRenderer.invoke('chat:import-project', projectName),
  loadForks: (projectName) => ipcRenderer.invoke('chat:load-forks', projectName),
  saveForks: (projectName, forks) => ipcRenderer.invoke('chat:save-forks', projectName, forks),
  clearAIHistory: (projectName) => ipcRenderer.invoke('ai:clear-history', projectName),

  // Project settings
  getProjectSettings: (name) => ipcRenderer.invoke('project:get-settings', name),
  setProjectSettings: (name, settings) => ipcRenderer.invoke('project:set-settings', name, settings),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  getWorkspacePath: () => ipcRenderer.invoke('workspace:path'),
  setWorkspacePath: (path) => ipcRenderer.invoke('workspace:set-path', path),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),

  // Setup / Migration
  checkSetup: () => ipcRenderer.invoke('setup:check'),
  runSetup: (options) => ipcRenderer.invoke('setup:run', options),
  getAITools: () => ipcRenderer.invoke('setup:ai-tools'),
  migrateWorkspace: (sourcePath) => ipcRenderer.invoke('setup:migrate', sourcePath),

  // Auth
  checkAuth: (aiBackends) => ipcRenderer.invoke('auth:check', aiBackends),
  runAuth: (serviceId) => ipcRenderer.invoke('auth:run', serviceId),
  logoutAuth: (serviceId) => ipcRenderer.invoke('auth:logout', serviceId),
  onAuthEvent: (callback) => {
    var handler = function (_event, data) { callback(data); };
    ipcRenderer.on('auth:event', handler);
    return function () { ipcRenderer.removeListener('auth:event', handler); };
  },

  // Events
  onAIEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('ai:event', handler);
    return () => ipcRenderer.removeListener('ai:event', handler);
  },
  onDevServerEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('devserver:event', handler);
    return () => ipcRenderer.removeListener('devserver:event', handler);
  },
  onDistributeEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('distribute:event', handler);
    return () => ipcRenderer.removeListener('distribute:event', handler);
  },
  onAppEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('app:event', handler);
    return () => ipcRenderer.removeListener('app:event', handler);
  },
  onSetupEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('setup:event', handler);
    return () => ipcRenderer.removeListener('setup:event', handler);
  },
  onMenuAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },

  // Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterEvent: (callback) => {
    var handler = function (_event, data) { callback(data); };
    ipcRenderer.on('updater:event', handler);
    return function () { ipcRenderer.removeListener('updater:event', handler); };
  },

  // Attachments
  selectFiles: () => ipcRenderer.invoke('dialog:select-files'),
  saveAttachment: (projectName, name, dataUrl) => ipcRenderer.invoke('attachment:save', projectName, name, dataUrl),

  // System
  getPlatform: () => ipcRenderer.invoke('system:platform'),
  getVersion: () => ipcRenderer.invoke('system:version'),
  getUserDataPath: () => ipcRenderer.invoke('system:user-data-path'),
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  openPath: (path) => ipcRenderer.invoke('system:open-path', path),
});
