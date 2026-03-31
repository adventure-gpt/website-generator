/* ═══════════════════════════════════════════════════════════════
   Website Generator — Renderer (browser-only, no Node.js APIs)
   ═════════════════���═════════════════════════════════════════════ */

// ── State ─────────────────���──────────────────────────────────
var state = {
  projects: [],
  activeProject: null,
  messages: {},
  backend: 'claude',
  projectState: {},  // projectName → per-project state
};

function getPS(projectName) {
  if (!state.projectState[projectName]) {
    state.projectState[projectName] = {
      isGenerating: false,
      currentStream: null,  // DOM refs only — data is in state.messages
      devServerUrl: null,
      devServerStarting: false,
      deployedUrl: null,
      customDomain: null,
      messageQueue: [],
    };
  }
  return state.projectState[projectName];
}

/** Get or create the live assistant message for a project. Returns the message object in state.messages[]. */
function getLiveMsg(projectName) {
  if (!state.messages[projectName]) state.messages[projectName] = [];
  var msgs = state.messages[projectName];
  var last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
  if (last && last._live) return last;
  // Create new live message
  var msg = { role: 'assistant', content: '', tools: [], timestamp: Date.now(), _live: true };
  msgs.push(msg);
  return msg;
}

/** Finalize the live message — remove _live flag, save to disk */
function finalizeLiveMsg(projectName) {
  if (!state.messages[projectName]) return;
  var msgs = state.messages[projectName];
  for (var i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]._live) {
      delete msgs[i]._live;
      // Remove empty live messages
      if (!msgs[i].content && msgs[i].tools.length === 0) {
        msgs.splice(i, 1);
      } else if (msgs[i].tools.length === 0) {
        delete msgs[i].tools;
      }
      break;
    }
  }
  window.api.saveChat(projectName, msgs);
}

/** Start a new live message (finalizes the current one if it has content) */
function newLiveMsg(projectName) {
  if (!state.messages[projectName]) state.messages[projectName] = [];
  var msgs = state.messages[projectName];
  var last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
  if (last && last._live) {
    if (last.content || last.tools.length > 0) {
      delete last._live;
      if (last.tools.length === 0) delete last.tools;
    } else {
      // Empty live msg — reuse it
      return last;
    }
  }
  var msg = { role: 'assistant', content: '', tools: [], timestamp: Date.now(), _live: true };
  msgs.push(msg);
  return msg;
}

var _nullPS = {
  isGenerating: false,
  currentStream: null,
  devServerUrl: null,
  devServerStarting: false,
  deployedUrl: null,
  customDomain: null,
  messageQueue: [],
};

function aps() {
  return state.activeProject ? getPS(state.activeProject) : _nullPS;
}

// ── DOM helpers ──────────��───────────────────────────────────
var $ = function (sel) { return document.querySelector(sel); };
var $$ = function (sel) { return document.querySelectorAll(sel); };

function svgIcon(width, height, viewBox, parts) {
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (var p of parts) {
    var tag = p.tag || 'path';
    var elem = document.createElementNS(ns, tag);
    for (var k of Object.keys(p)) {
      if (k !== 'tag') elem.setAttribute(k, p[k]);
    }
    svg.appendChild(elem);
  }
  return svg;
}

function copyIcon() {
  return svgIcon(14, 14, '0 0 24 24', [
    { tag: 'rect', x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' },
    { tag: 'path', d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }
  ]);
}

function editIcon() {
  return svgIcon(14, 14, '0 0 24 24', [
    { tag: 'path', d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' },
    { tag: 'path', d: 'M15 5l4 4' }
  ]);
}

function checkIcon() {
  return svgIcon(14, 14, '0 0 24 24', [
    { tag: 'polyline', points: '20 6 9 17 4 12' }
  ]);
}

function el(tag, attrs, children) {
  var node = document.createElement(tag);
  if (attrs) {
    for (var k of Object.keys(attrs)) {
      var v = attrs[k];
      if (k === 'className') node.className = v;
      else if (k === 'textContent') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        node.setAttribute(k, v);
      }
    }
  }
  if (children) {
    for (var child of children) {
      if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else if (child) node.appendChild(child);
    }
  }
  return node;
}

// ── Initialization ───────────────���───────────────────────────
async function init() {
  try {
    var setupStatus = await window.api.checkSetup();
    var settings = await window.api.getSettings();
    var needsMigration = setupStatus.migrationSource && !settings.migrationDone;
    var needsAuth = !settings.authSetupSeen;
    if (!setupStatus.allInstalled || needsMigration || needsAuth) {
      showSetupScreen(setupStatus);
    } else {
      await enterMainApp();
    }
  } catch (err) {
    console.error('Setup check failed:', err);
    await enterMainApp().catch(function (e) {
      console.error('enterMainApp also failed:', e);
      $('#setup-screen').classList.add('hidden');
      $('#main-screen').classList.remove('hidden');
    });
  }
}

var _setupListenersReady = false;

async function showSetupScreen(status) {
  $('#setup-screen').classList.remove('hidden');
  $('#main-screen').classList.add('hidden');

  // Show profile section and pre-fill from saved settings
  var profileEl = $('#setup-profile');
  if (profileEl) {
    profileEl.classList.remove('hidden');
    var savedSettings = await window.api.getSettings();
    if (savedSettings.userName) $('#setup-user-name').value = savedSettings.userName;
    if (savedSettings.userEmail) $('#setup-user-email').value = savedSettings.userEmail;
    if (savedSettings.userPronouns) $('#setup-user-pronouns').value = savedSettings.userPronouns;
  }

  var toolsEl = $('#setup-tools');
  toolsEl.textContent = '';

  // Core tools
  for (var tool of status.tools) {
    var statusClass = tool.installed ? 'installed' : 'missing';
    var statusLabel = tool.installed ? 'Installed' : 'Missing';
    var safeId = 'setup-status-' + tool.name.replace(/\s+/g, '-').toLowerCase();
    var row = el('div', { className: 'setup-tool-row' }, [
      el('span', { className: 'setup-tool-name', textContent: tool.name }),
      el('span', { className: 'setup-tool-status ' + statusClass, textContent: statusLabel, id: safeId }),
    ]);
    toolsEl.appendChild(row);
  }

  // AI tools
  if (status.aiTools) {
    for (var ai of status.aiTools) {
      var aiStatusClass = ai.installed ? 'installed' : 'missing';
      var aiStatusLabel = ai.installed ? 'Installed' : 'Not installed';
      var aiSafeId = 'setup-status-' + ai.name.replace(/\s+/g, '-').toLowerCase();
      var aiRow = el('div', { className: 'setup-tool-row', id: 'setup-ai-row-' + ai.id }, [
        el('span', { className: 'setup-tool-name', textContent: ai.name }),
        el('span', { className: 'setup-tool-status ' + aiStatusClass, textContent: aiStatusLabel, id: aiSafeId }),
      ]);
      toolsEl.appendChild(aiRow);
      // Pre-check the checkbox if this AI tool is already installed
      var checkbox = document.getElementById('ai-choice-' + ai.id);
      if (checkbox && ai.installed) checkbox.checked = true;
    }
  }

  // Show AI choice section
  var aiChoiceEl = $('#setup-ai-choice');
  if (aiChoiceEl) aiChoiceEl.classList.remove('hidden');

  var hasMissing = status.tools.some(function (t) { return !t.installed; })
    || !status.aiTools || !status.aiTools.some(function (t) { return t.installed; });

  // ── Auth section — reactive to AI backend selection ──
  function getSelectedAI() {
    var backends = [];
    if ($('#ai-choice-claude') && $('#ai-choice-claude').checked) backends.push('claude');
    if ($('#ai-choice-codex') && $('#ai-choice-codex').checked) backends.push('codex');
    return backends.length > 0 ? backends : ['claude'];
  }
  renderAuthSection(getSelectedAI());
  // Re-render auth when AI selection changes
  var aiClaude = $('#ai-choice-claude');
  var aiCodex = $('#ai-choice-codex');
  if (aiClaude) aiClaude.addEventListener('change', function () { renderAuthSection(getSelectedAI()); });
  if (aiCodex) aiCodex.addEventListener('change', function () { renderAuthSection(getSelectedAI()); });

  $('#setup-migration').classList.remove('hidden');
  var migrationInput = $('#migration-path-input');
  if (status.migrationSource) {
    migrationInput.value = status.migrationSource;
    $('#migration-detected').textContent = 'Found an existing workspace. You can import from it or browse to a different folder.';
  } else {
    $('#migration-detected').textContent = 'If you have an existing workspace, select its folder to import projects and config.';
  }

  if (!_setupListenersReady) {
    _setupListenersReady = true;

    $('#migration-browse-btn').addEventListener('click', async function () {
      var selected = await window.api.selectDirectory();
      if (selected) migrationInput.value = selected;
    });
    $('#migrate-btn').addEventListener('click', async function () {
      var sourcePath = migrationInput.value;
      if (!sourcePath) return;
      $('#migrate-btn').disabled = true;
      $('#migrate-btn').textContent = 'Importing...';
      try {
        var results = await window.api.migrateWorkspace(sourcePath);
        var count = results.configs.length + results.projects.length;
        if (count > 0) {
          var items = results.configs.concat(results.projects);
          $('#migration-detected').textContent = 'Imported ' + count + ' item(s): ' + items.join(', ');
        } else {
          $('#migration-detected').textContent = 'No new items to import from that folder.';
        }
        $('#migrate-btn').classList.add('hidden');
        $('#migration-browse-btn').classList.add('hidden');
        $('#skip-migrate-btn').textContent = 'Continue';
        window.api.setSettings({ migrationDone: true });
      } catch (err) {
        $('#migration-detected').textContent = 'Import failed: ' + err.message;
        $('#migrate-btn').disabled = false;
        $('#migrate-btn').textContent = 'Import projects & config';
      }
    });
    $('#skip-migrate-btn').addEventListener('click', function () {
      $('#setup-migration').classList.add('hidden');
      window.api.setSettings({ migrationDone: true });
    });

    detectChatImports();

    $('#import-chats-btn').addEventListener('click', async function () {
      var btn = $('#import-chats-btn');
      btn.disabled = true;
      btn.textContent = 'Importing chats...';
      try {
        var imports = await window.api.detectChatImports();
        var totalImported = 0;
        for (var ci = 0; ci < imports.length; ci++) {
          var imp = imports[ci];
          var result = await window.api.importChats(imp.claudeDir, imp.sessionFiles);
          totalImported += result.totalMessages;
        }
        $('#chat-import-result').textContent = totalImported > 0
          ? 'Imported ' + totalImported + ' messages across your projects.'
          : 'No new messages to import (already up to date).';
        btn.classList.add('hidden');
      } catch (err) {
        $('#chat-import-result').textContent = 'Import failed: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'Import chat history';
      }
    });
  }

  if (hasMissing) {
    var installBtn = $('#setup-install-btn');
    installBtn.classList.remove('hidden');
    var _cleanupSetupEvent = null;
    installBtn.onclick = async function () {
      installBtn.disabled = true;
      installBtn.textContent = 'Installing...';

      if (_cleanupSetupEvent) _cleanupSetupEvent();
      _cleanupSetupEvent = window.api.onSetupEvent(function (evt) {
        if (evt.type === 'progress') {
          installBtn.textContent = evt.message;
        } else if (evt.type === 'installed') {
          var toolName = evt.message.replace(' installed', '');
          var id = 'setup-status-' + toolName.replace(/\s+/g, '-').toLowerCase();
          var statusEl = document.getElementById(id);
          if (statusEl) {
            statusEl.textContent = 'Installed';
            statusEl.className = 'setup-tool-status installed';
          }
        } else if (evt.type === 'done') {
          installBtn.classList.add('hidden');
          updateGetStartedBtn();
        }
      });

      await window.api.runSetup({ aiBackends: getSelectedAI() });
    };
  }

  // "Get Started" is always present but disabled until everything is ready
  var continueBtn = $('#setup-continue-btn');
  continueBtn.classList.remove('hidden');
  continueBtn.disabled = true;
  continueBtn.textContent = 'Complete setup to continue';
  updateGetStartedBtn();

  continueBtn.onclick = function () {
    if (continueBtn.disabled) return;
    var profileSettings = {
      authSetupSeen: true,
      aiBackends: getSelectedAI(),
      userName: ($('#setup-user-name') || {}).value || '',
      userEmail: ($('#setup-user-email') || {}).value || '',
      userPronouns: ($('#setup-user-pronouns') || {}).value || 'they',
    };
    window.api.setSettings(profileSettings);
    enterMainApp();
  };
}

/** Enable "Get Started" only when all required auth is done and no tools are missing */
async function updateGetStartedBtn() {
  var btn = $('#setup-continue-btn');
  if (!btn) return;
  // Check if install button is still visible (tools still installing/missing)
  var installBtn = $('#setup-install-btn');
  if (installBtn && !installBtn.classList.contains('hidden')) {
    btn.disabled = true;
    btn.textContent = 'Install tools first';
    return;
  }
  // Check all auth badges
  var allAuth = true;
  var badges = document.querySelectorAll('.auth-status-badge');
  for (var i = 0; i < badges.length; i++) {
    if (!badges[i].classList.contains('authenticated')) {
      allAuth = false;
      break;
    }
  }
  if (allAuth && badges.length > 0) {
    btn.disabled = false;
    btn.textContent = 'Get Started';
  } else {
    btn.disabled = true;
    btn.textContent = 'Connect all accounts to continue';
  }
}

// ── Auth Section ──────────────────────────────────────────────
var _authCleanup = null;

async function renderAuthSection(aiBackends) {
  var authEl = $('#setup-auth');
  if (!authEl) return;

  var authStatus;
  try {
    authStatus = await window.api.checkAuth(aiBackends || ['claude']);
  } catch (err) {
    console.error('Auth check failed:', err);
    return;
  }

  authEl.textContent = '';

  var header = el('div', { className: 'setup-auth-header', textContent: 'Accounts & Authentication' });
  authEl.appendChild(header);

  var hint = el('div', { className: 'setup-auth-hint', textContent: 'Connect your accounts to enable AI generation, deployment, and version control.' });
  authEl.appendChild(hint);

  // Build signup URL/label map from meta
  var signupUrls = {};
  var signupLabels = {};
  if (authStatus.meta) {
    for (var mi = 0; mi < authStatus.meta.length; mi++) {
      var m = authStatus.meta[mi];
      signupUrls[m.id] = m.signupUrl;
      signupLabels[m.id] = m.signupLabel;
    }
  }

  for (var si = 0; si < authStatus.services.length; si++) {
    var svc = authStatus.services[si];
    var row = el('div', { className: 'auth-service-row', id: 'auth-row-' + svc.id });

    var nameSpan = el('span', { className: 'auth-service-name', textContent: svc.name });
    row.appendChild(nameSpan);

    var actionsDiv = el('div', { className: 'auth-service-actions' });

    if (svc.authenticated) {
      var badge = el('span', { className: 'auth-status-badge authenticated', textContent: 'Authenticated', id: 'auth-badge-' + svc.id });
      actionsDiv.appendChild(badge);
      // Disconnect button
      var disconnectBtn = el('button', {
        className: 'auth-disconnect-btn',
        textContent: 'Disconnect',
        id: 'auth-disconnect-' + svc.id,
      });
      (function (serviceId, dcBtn, backends) {
        dcBtn.addEventListener('click', async function () {
          dcBtn.disabled = true;
          dcBtn.textContent = 'Disconnecting...';
          await window.api.logoutAuth(serviceId);
          renderAuthSection(backends);
        });
      })(svc.id, disconnectBtn, aiBackends);
      actionsDiv.appendChild(disconnectBtn);
    } else {
      if (signupUrls[svc.id]) {
        var signupLink = el('span', {
          className: 'auth-signup-link',
          textContent: 'Sign up',
          title: 'Open ' + (signupLabels[svc.id] || ''),
        });
        (function (url) {
          signupLink.addEventListener('click', function () {
            window.api.openExternal(url);
          });
        })(signupUrls[svc.id]);
        actionsDiv.appendChild(signupLink);
      }

      var connectBtn = el('button', {
        className: 'auth-connect-btn',
        textContent: 'Connect',
        id: 'auth-connect-' + svc.id,
      });
      (function (serviceId, btn) {
        btn.addEventListener('click', function () {
          startAuthFlow(serviceId);
        });
      })(svc.id, connectBtn);
      actionsDiv.appendChild(connectBtn);

      var badge2 = el('span', { className: 'auth-status-badge not-configured', textContent: 'Not configured', id: 'auth-badge-' + svc.id });
      actionsDiv.appendChild(badge2);
    }

    row.appendChild(actionsDiv);
    authEl.appendChild(row);
  }

  authEl.classList.remove('hidden');
  updateGetStartedBtn();

  // Store current backends for re-render
  _lastAIBackends = aiBackends;

  // Set up the auth event listener (once)
  if (!_authCleanup) {
    _authCleanup = window.api.onAuthEvent(function (evt) {
      if (evt.type === 'auth-log') {
        // For GitHub: detect the one-time code and show it in the UI
        if (evt.service === 'github' && evt.message) {
          var codeMatch = evt.message.match(/code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i);
          if (codeMatch) {
            var codeEl = document.getElementById('auth-code-' + evt.service);
            if (codeEl) {
              codeEl.textContent = 'Your code: ' + codeMatch[1];
              codeEl.classList.remove('hidden');
            }
          }
        }
      } else if (evt.type === 'auth-done') {
        // Re-render the whole auth section to get accurate state
        renderAuthSection(_lastAIBackends);
      }
    });
  }
}

var _lastAIBackends = ['claude'];

function startAuthFlow(serviceId) {
  var btn = document.getElementById('auth-connect-' + serviceId);
  var badgeEl = document.getElementById('auth-badge-' + serviceId);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Connecting...';
  }
  if (badgeEl) {
    badgeEl.textContent = 'Opening browser...';
    badgeEl.className = 'auth-status-badge connecting';
  }
  // Add a code display area for services that use one-time codes
  var rowEl = document.getElementById('auth-row-' + serviceId);
  if (rowEl && !document.getElementById('auth-code-' + serviceId)) {
    var codeSpan = el('div', { className: 'auth-code-display hidden', id: 'auth-code-' + serviceId });
    rowEl.appendChild(codeSpan);
  }
  window.api.runAuth(serviceId);
}

var _listenersReady = false;

async function enterMainApp() {
  $('#setup-screen').classList.add('hidden');
  $('#main-screen').classList.remove('hidden');

  var settings = await window.api.getSettings();
  state.backend = settings.backend || 'claude';
  updateBackendLabel();

  await refreshProjects();

  if (!_listenersReady) {
    _listenersReady = true;
    setupEventListeners();
    setupAPIListeners();
    setupMenuListener();
    setupSettingsModal();
    setupAboutModal();
    setupProjectSettingsModal();
  }

  // Auto-import chats if we haven't yet and there are projects
  if (!settings.chatsImported && state.projects.length > 0) {
    try {
      var imports = await window.api.detectChatImports();
      if (imports.length > 0) {
        var totalImported = 0;
        for (var ai = 0; ai < imports.length; ai++) {
          var result = await window.api.importChats(imports[ai].claudeDir, imports[ai].sessionFiles);
          totalImported += result.totalMessages;
        }
        if (totalImported > 0) {
          addStatusMessage('Imported ' + totalImported + ' chat messages from Claude Code history');
        }
      }
      window.api.setSettings({ chatsImported: true });
    } catch (e) {
      console.error('Auto-import failed:', e);
    }
  }
}

function updateBackendLabel() {
  var label = $('#sidebar-backend-label');
  if (label) {
    label.textContent = state.backend === 'claude' ? 'Claude Code' : 'Codex CLI';
  }
}

// ── Event Listeners ───────────────────────────────────���──────
function setupEventListeners() {
  $('#new-project-btn').addEventListener('click', showNewProjectInput);
  $('#new-project-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') createProject();
    if (e.key === 'Escape') hideNewProjectInput();
  });
  $('#new-project-name').addEventListener('blur', function () {
    setTimeout(hideNewProjectInput, 150);
  });

  var chatInput = $('#chat-input');
  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  chatInput.addEventListener('input', function () {
    autoResizeTextarea(chatInput);
    $('#send-btn').disabled = !chatInput.value.trim() && pendingAttachments.length === 0;
  });

  $('#send-btn').addEventListener('click', sendMessage);
  $('#stop-btn').addEventListener('click', stopGeneration);
  $('#deploy-btn').addEventListener('click', deploy);
  $('#refresh-preview-btn').addEventListener('click', refreshPreview);
  $('#settings-btn').addEventListener('click', openSettings);
  $('#project-settings-btn').addEventListener('click', openProjectSettings);
  $('#attach-btn').addEventListener('click', attachFiles);

  // Image paste support
  chatInput.addEventListener('paste', handlePaste);

  // Drag-and-drop files onto chat
  var chatPanel = document.querySelector('.chat-panel');
  chatPanel.addEventListener('dragover', function (e) {
    e.preventDefault();
    chatPanel.classList.add('drag-over');
  });
  chatPanel.addEventListener('dragleave', function () {
    chatPanel.classList.remove('drag-over');
  });
  chatPanel.addEventListener('drop', function (e) {
    e.preventDefault();
    chatPanel.classList.remove('drag-over');
    handleDroppedFiles(e.dataTransfer);
  });

  var chips = $$('.chip[data-prompt]');
  for (var i = 0; i < chips.length; i++) {
    chips[i].addEventListener('click', function () {
      var prompt = this.getAttribute('data-prompt');
      $('#chat-input').value = prompt;
      $('#send-btn').disabled = false;
      sendMessage();
    });
  }

  setupResize();

  // Global keyboard shortcuts
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault();
      showNewProjectInput();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      openSettings();
    }
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

function setupMenuListener() {
  window.api.onMenuAction(function (action) {
    switch (action) {
      case 'new-project':
        showNewProjectInput();
        break;
      case 'open-settings':
        openSettings();
        break;
      case 'open-about':
        openAbout();
        break;
      case 'refresh-preview':
        refreshPreview();
        break;
    }
  });
}

function setupAPIListeners() {
  window.api.onAIEvent(function (event) {
    var evtProject = event.project;
    if (!evtProject) return;
    var isActive = (evtProject === state.activeProject);
    var ps = getPS(evtProject);

    // ═══ STEP 1: Always update DATA regardless of which project is active ═══
    switch (event.type) {
      case 'text': {
        var live = getLiveMsg(evtProject);
        live.content += event.text;
        live.timestamp = Date.now();
        break;
      }
      case 'codex_message': {
        // Append to current live message — keep everything in one turn
        var cm = getLiveMsg(evtProject);
        if (cm.content) cm.content += '\n\n---\n\n';
        cm.content += event.text;
        cm.timestamp = Date.now();
        break;
      }
      case 'tool':
      case 'tool_use': {
        var tl = getLiveMsg(evtProject);
        tl.tools.push({ name: event.name || 'tool', detail: event.text || event.input || '' });
        break;
      }
      case 'done': {
        finalizeLiveMsg(evtProject);
        ps.isGenerating = false;
        if (!isActive) ps.hasNewActivity = true;
        // Process queue
        if (ps.messageQueue.length > 0) {
          var nextMsg = ps.messageQueue.shift();
          ps.isGenerating = true;
          window.api.sendMessage(nextMsg, evtProject);
        }
        break;
      }
      case 'error': {
        var errLive = getLiveMsg(evtProject);
        errLive.content += (errLive.content ? '\n\n' : '') + 'Error: ' + (event.text || 'Unknown error');
        finalizeLiveMsg(evtProject);
        ps.isGenerating = false;
        if (!isActive) ps.hasNewActivity = true;
        break;
      }
      case 'result': {
        // Result marks end of a Claude turn — finalize current message, start fresh for next turn
        var rl = getLiveMsg(evtProject);
        if (rl.content || (rl.tools && rl.tools.length > 0)) {
          newLiveMsg(evtProject);
        }
        break;
      }
      case 'status': {
        var sl = getLiveMsg(evtProject);
        sl.tools.push({ name: 'system', detail: event.text || '' });
        break;
      }
      case 'rate_limit': {
        // Don't put rate limit text into the chat — show a banner instead
        showRateLimitBanner(evtProject, event.resetInfo);
        return; // Skip rendering — nothing changed in data
      }
    }

    // ═══ STEP 2: Update DOM — always re-render from data (single source of truth) ═══
    if (!isActive) {
      renderProjectList();
      return;
    }

    // Always clear DOM stream refs before re-rendering (data is source of truth)
    ps.currentStream = null;

    if (event.type === 'done') {
      renderMessages();
      restoreProjectUI(ps);
      // Only check dev server if we don't already have one running
      if (!ps.devServerUrl) checkDevServer();
    } else {
      renderMessages();
    }
    scrollToBottom();
    renderProjectList();
  });

  window.api.onDevServerEvent(function (event) {
    // Route to correct project state regardless of which is active
    var pn = event.projectName || state.activeProject;
    var targetPS = pn ? getPS(pn) : aps();
    var isActive = (pn === state.activeProject);

    switch (event.type) {
      case 'ready':
        targetPS.devServerUrl = event.url;
        targetPS.devServerStarting = false;
        if (isActive) showPreview(event.url);
        break;
      case 'stopped':
        // Only clear if no new server has already started (generation guard in dev-server.js handles this)
        if (targetPS.devServerUrl) {
          targetPS.devServerUrl = null;
          if (isActive) hidePreview(pn);
        }
        break;
      case 'status':
        break;
      case 'error':
        targetPS.devServerStarting = false;
        if (isActive) updatePreviewStatus(null);
        break;
    }
  });

  // ── Auto-updater notifications ──
  window.api.onUpdaterEvent(function (evt) {
    console.log('Updater event:', evt.type, evt.version || evt.message || '');
    if (evt.type === 'downloaded') {
      showUpdateBanner(evt.version);
    } else if (evt.type === 'error') {
      console.error('Updater error:', evt.message);
    }
  });

}

function showRateLimitBanner(projectName, resetInfo) {
  var existing = document.getElementById('rate-limit-banner');
  if (existing) existing.remove();

  var msg = 'Rate limit reached';
  if (resetInfo) msg += ' \u2014 resets at ' + resetInfo;

  var banner = el('div', { id: 'rate-limit-banner', className: 'rate-limit-banner' });
  banner.appendChild(el('span', { textContent: msg }));
  var dismissBtn = el('button', { className: 'rate-limit-dismiss', textContent: '\u2715' });
  dismissBtn.addEventListener('click', function () { banner.remove(); });
  banner.appendChild(dismissBtn);
  document.body.appendChild(banner);

  // Auto-dismiss after 30 seconds
  setTimeout(function () { if (banner.parentNode) banner.remove(); }, 30000);
}

function showUpdateBanner(version) {
  if (document.getElementById('update-banner')) return;
  var banner = el('div', { id: 'update-banner', className: 'update-banner' }, [
    el('span', { textContent: 'Update v' + version + ' ready — ' }),
    el('button', { className: 'update-btn', textContent: 'Restart to update' }),
  ]);
  banner.querySelector('.update-btn').addEventListener('click', function () {
    window.api.installUpdate();
  });
  document.body.appendChild(banner);
}

// ── Projects ────���────────────────────────────���───────────────
async function refreshProjects() {
  state.projects = await window.api.listProjects();
  renderProjectList();
}

function renderProjectList() {
  var listEl = $('#project-list');
  listEl.textContent = '';

  for (var i = 0; i < state.projects.length; i++) {
    var project = state.projects[i];
    var isActive = state.activeProject === project.name;
    var ps = getPS(project.name);
    var cls = 'project-item';
    if (isActive) {
      cls += ' active';
    } else if (ps.isGenerating) {
      cls += ' bg-generating';
    } else if (ps.hasNewActivity) {
      cls += ' has-activity';
    }

    var actionsDiv = el('div', { className: 'project-actions' });

    // Open folder button
    var folderBtn = el('button', { className: 'project-action-btn', title: 'Open folder', textContent: '\uD83D\uDCC1' });
    (function (name) {
      folderBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        window.api.openProjectFolder(name);
      });
    })(project.name);
    actionsDiv.appendChild(folderBtn);

    // Delete button
    var deleteBtn = el('button', { className: 'project-action-btn delete', title: 'Delete project', textContent: '\u00d7' });
    (function (name) {
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteProject(name);
      });
    })(project.name);
    actionsDiv.appendChild(deleteBtn);

    var item = el('div', { className: cls, draggable: true }, [
      el('span', { className: 'project-dot' }),
      el('span', { className: 'project-name', textContent: project.name }),
      actionsDiv,
    ]);
    item.dataset.project = project.name;
    (function (name) {
      item.addEventListener('click', function () { selectProject(name); });
    })(project.name);

    // Drag and drop
    item.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', this.dataset.project);
      this.classList.add('dragging');
    });
    item.addEventListener('dragend', function () {
      this.classList.remove('dragging');
    });
    item.addEventListener('dragover', function (e) {
      e.preventDefault();
      this.classList.add('drag-over');
    });
    item.addEventListener('dragleave', function () {
      this.classList.remove('drag-over');
    });
    item.addEventListener('drop', function (e) {
      e.preventDefault();
      this.classList.remove('drag-over');
      var fromName = e.dataTransfer.getData('text/plain');
      var toName = this.dataset.project;
      if (fromName && toName && fromName !== toName) {
        reorderProject(fromName, toName);
      }
    });

    listEl.appendChild(item);
  }
}

function reorderProject(fromName, toName) {
  var names = state.projects.map(function (p) { return p.name; });
  var fromIdx = names.indexOf(fromName);
  var toIdx = names.indexOf(toName);
  if (fromIdx === -1 || toIdx === -1) return;
  names.splice(fromIdx, 1);
  names.splice(toIdx, 0, fromName);
  // Reorder state.projects to match
  var projectMap = {};
  for (var i = 0; i < state.projects.length; i++) projectMap[state.projects[i].name] = state.projects[i];
  state.projects = names.map(function (n) { return projectMap[n]; });
  window.api.reorderProjects(names);
  renderProjectList();
}

function showNewProjectInput() {
  var inputWrap = $('#new-project-input');
  var input = $('#new-project-name');
  inputWrap.classList.remove('hidden');
  input.value = '';
  input.focus();
}

function hideNewProjectInput() {
  $('#new-project-input').classList.add('hidden');
}

async function createProject() {
  var input = $('#new-project-name');
  var name = input.value.trim();
  if (!name) return;

  try {
    await window.api.createProject(name);
    hideNewProjectInput();
    await refreshProjects();
    var project = await window.api.getActiveProject();
    if (project) selectProject(project.name);
  } catch (err) {
    input.style.borderColor = '#ef4444';
    setTimeout(function () { input.style.borderColor = ''; }, 1500);
  }
}

async function selectProject(name) {
  // Detach DOM refs from old project (data is already in state.messages via live msgs)
  if (state.activeProject && aps().currentStream) {
    aps().currentStream = null;
  }

  state.activeProject = name;
  await window.api.setActiveProject(name);

  var ps = aps();
  ps.hasNewActivity = false; // Clear "unseen" indicator

  $('#empty-state').classList.add('hidden');
  $('#project-view').classList.remove('hidden');

  // Load per-project settings (custom domain, etc.)
  try {
    var projSettings = await window.api.getProjectSettings(name);
    if (projSettings.customDomain) {
      ps.customDomain = projSettings.customDomain;
    }
  } catch (e) { /* no settings yet */ }

  // Load from disk only on first visit — in-memory is authoritative after that
  if (!state.messages[name]) {
    try {
      var saved = await window.api.loadChat(name);
      state.messages[name] = saved || [];
    } catch (e) {
      state.messages[name] = [];
    }
  }

  // Scan recent messages for deploy URLs before rendering
  if (!ps.deployedUrl) {
    var recent = (state.messages[name] || []).slice(-10);
    for (var ri = 0; ri < recent.length; ri++) {
      if (recent[ri].role === 'assistant' && recent[ri].content) {
        var urlMatch = recent[ri].content.match(/https:\/\/[a-z0-9][-a-z0-9]*\.pages\.dev/i);
        if (urlMatch) ps.deployedUrl = urlMatch[0].replace(/[.,!;:]+$/, '');
      }
    }
  }

  renderMessages();
  restoreProjectUI(ps);
  renderProjectList();
  checkDevServer();
  updateDeployButton(aps().deployedUrl || null);

  $('#chat-input').focus();
}

/** Restore all UI elements to match the given project's state */
function restoreProjectUI(ps) {
  var input = $('#chat-input');
  var sendBtn = $('#send-btn');
  var stopBtn = $('#stop-btn');
  var deployBtn = $('#deploy-btn');

  if (ps.isGenerating) {
    input.disabled = false;
    stopBtn.classList.remove('hidden');
    deployBtn.disabled = true;
    // Live message in state.messages already renders with dots via createLiveBubble
  } else {
    input.disabled = false;
    stopBtn.classList.add('hidden');
    deployBtn.disabled = false;
  }
  sendBtn.disabled = !input.value.trim();

  // Restore deploy link
  updateDeployButton(ps.deployedUrl || null);

  // Restore preview
  if (ps.devServerUrl) {
    showPreview(ps.devServerUrl);
  } else if (ps.devServerStarting) {
    updatePreviewStatus('loading');
  } else {
    hidePreview();
  }
}

async function deleteProject(name) {
  if (!confirm('Delete project "' + name + '"? This cannot be undone.')) return;
  try {
    await window.api.deleteProject(name);
    delete state.messages[name];
    delete state.projectState[name];
    if (state.activeProject === name) {
      state.activeProject = null;
      $('#empty-state').classList.remove('hidden');
      $('#project-view').classList.add('hidden');
    }
    await refreshProjects();
  } catch (err) {
    addStatusMessage('Failed to delete: ' + err.message);
  }
}

// ── Chat Messages ────────────────────────────────────────────

/**
 * Detect compaction/system messages that should not be shown as user messages.
 */
function isCompactionMessage(text) {
  if (!text) return false;
  if (text.startsWith('This session is being continued from a previous conversation')) return true;
  if (text.startsWith('Continue the conversation from where')) return true;
  if (/^(Summary|Note|Result of calling|Called the Read tool|Called the Write tool|Called the Edit tool|Called the Glob tool|Called the Grep tool|Called the Bash tool)/.test(text) && text.length > 2000) return true;
  // System reminder blocks that got through as user text
  if (text.startsWith('Note:') && text.includes('was read before the last conversation was summarized')) return true;
  if (text.startsWith('Called the') && text.includes('tool with the following input')) return true;
  return false;
}

function renderMessages() {
  var container = $('#chat-messages');
  container.textContent = '';

  var rawMessages = state.messages[state.activeProject] || [];
  var isGen = state.activeProject && getPS(state.activeProject).isGenerating;

  // Build a filtered view for rendering (don't mutate the source array)
  var messages = [];
  var lastLiveIndex = -1;

  // Find the last _live message index
  for (var fi = rawMessages.length - 1; fi >= 0; fi--) {
    if (rawMessages[fi]._live) { lastLiveIndex = fi; break; }
  }

  for (var ri = 0; ri < rawMessages.length; ri++) {
    var m = rawMessages[ri];
    var hasContent = m.content && m.content.trim();
    var hasTools = m.tools && m.tools.length > 0;

    // Skip empty non-live assistant messages
    if (m.role === 'assistant' && !hasContent && !hasTools && !m._live) continue;

    // If not generating, treat _live as regular messages
    if (!isGen && m._live) {
      if (!hasContent && !hasTools) continue; // skip empty
      messages.push(m); // render as normal (createAssistantBubble handles it)
      continue;
    }

    // If generating, only show the LAST _live message as live
    if (m._live && ri !== lastLiveIndex) {
      if (hasContent || hasTools) messages.push(m); // show as normal
      continue;
    }

    messages.push(m);
  }

  if (messages.length === 0) {
    container.appendChild(createWelcome());
    // Check for importable chat history for this project
    checkProjectImport();
    return;
  }

  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    // Filter out compaction/system artifacts that may have been imported
    if (msg.role === 'user' && msg.content && isCompactionMessage(msg.content)) continue;
    if (msg.role === 'user') {
      container.appendChild(createUserBubble(msg.content, msg, i));
    } else if (msg.role === 'assistant' && msg._live) {
      // Live message — render with streaming indicators
      container.appendChild(createLiveBubble(msg));
    } else if (msg.role === 'assistant') {
      container.appendChild(createAssistantBubble(msg.content, msg));
    } else if (msg.role === 'status') {
      container.appendChild(createStatusBubble(msg.content));
    }
  }

  scrollToBottom();
}

async function checkProjectImport() {
  if (!state.activeProject) return;
  var projectName = state.activeProject;
  try {
    var info = await window.api.detectProjectChatImport(projectName);
    if (state.activeProject !== projectName) return; // user switched
    if (!info || !info.available) return;

    var welcome = document.getElementById('chat-welcome');
    if (!welcome) return;

    // Check if import prompt already exists
    if (welcome.querySelector('.chat-import-prompt')) return;

    var importDiv = el('div', { className: 'chat-import-prompt' });
    importDiv.appendChild(el('p', { textContent: 'Found ' + info.messageCount + ' messages from Claude Code for this project' }));
    var importBtn = el('button', { className: 'btn btn-primary btn-sm', textContent: 'Import chat history' });
    importBtn.addEventListener('click', async function () {
      importBtn.disabled = true;
      importBtn.textContent = 'Importing...';
      try {
        var result = await window.api.importProjectChats(projectName);
        if (result.totalMessages > 0) {
          // Reload messages from disk
          var saved = await window.api.loadChat(projectName);
          state.messages[projectName] = saved || [];
          if (state.activeProject === projectName) {
            renderMessages();
            addStatusMessage('Imported ' + result.totalMessages + ' messages from Claude Code');
          }
        } else {
          importBtn.textContent = 'Already imported';
        }
      } catch (err) {
        importBtn.textContent = 'Import failed';
        console.error('Project import error:', err);
      }
    });
    importDiv.appendChild(importBtn);
    welcome.appendChild(importDiv);
  } catch (e) {
    // No imports available — that's fine
  }
}

function createWelcome() {
  var div = el('div', { className: 'chat-welcome', id: 'chat-welcome' }, [
    el('h3', { textContent: 'What would you like to build?' }),
    el('p', { textContent: 'Describe a website in plain English and the AI will build it for you.' }),
  ]);
  var chipsEl = el('div', { className: 'prompt-chips' });
  var examples = [
    { label: 'Recipe organizer', prompt: 'A recipe organizer where I can save recipes by category and generate a grocery list' },
    { label: 'Portfolio site', prompt: 'A personal portfolio website with an about page, project gallery, and contact form' },
    { label: 'Todo app', prompt: 'A to-do list app with due dates, priority levels, and a done archive' },
    { label: 'Workout tracker', prompt: 'A workout tracker that logs exercises with sets, reps, and weight, and shows progress charts' },
  ];
  for (var i = 0; i < examples.length; i++) {
    (function (ex) {
      var chip = el('button', { className: 'chip', textContent: ex.label });
      chip.addEventListener('click', function () {
        $('#chat-input').value = ex.prompt;
        $('#send-btn').disabled = false;
        sendMessage();
      });
      chipsEl.appendChild(chip);
    })(examples[i]);
  }
  div.appendChild(chipsEl);
  return div;
}

function createUserBubble(text, msg, msgIndex) {
  var bubble = el('div', { className: 'message-bubble' });
  // Render user text with URLs clickable too
  renderInline(text, bubble);

  var actions = createMessageActions(text);

  // Edit button for user messages
  if (typeof msgIndex === 'number') {
    var editBtn = el('button', { className: 'message-action-btn', title: 'Edit & resend' });
    editBtn.appendChild(editIcon());
    editBtn.addEventListener('click', function () {
      startEditMessage(wrapper, bubble, text, msgIndex);
    });
    actions.insertBefore(editBtn, actions.firstChild);
  }

  var wrapper = el('div', { className: 'message message-user' }, [actions, bubble]);

  // Attachments
  if (msg && msg.attachments && msg.attachments.length > 0) {
    var attachEl = el('div', { className: 'message-attachments' });
    for (var i = 0; i < msg.attachments.length; i++) {
      var att = msg.attachments[i];
      if (att.type === 'image' && att.dataUrl) {
        var img = el('img', { src: att.dataUrl, className: 'message-image', title: att.name });
        attachEl.appendChild(img);
      } else {
        attachEl.appendChild(el('span', { className: 'message-file-badge', textContent: att.name }));
      }
    }
    wrapper.insertBefore(attachEl, bubble);
  }

  // Timestamp
  if (msg && msg.timestamp) {
    wrapper.appendChild(createTimestamp(msg.timestamp));
  }

  return wrapper;
}

function createAssistantBubble(text, msg) {
  var wrapper = el('div', { className: 'message message-assistant' });

  // Only show text bubble if there's actual content
  var hasText = text && text.trim();
  if (hasText) {
    var bubble = el('div', { className: 'message-bubble' });
    bubble.appendChild(renderMarkdown(text));
    var actions = createMessageActions(text);
    var row = el('div', { className: 'message-row' }, [bubble, actions]);
    wrapper.appendChild(row);
  }

  // Show tool usage from imported messages
  if (msg && msg.tools && msg.tools.length > 0) {
    var toolsSummary = el('summary', { className: 'activity-summary' }, [
      el('span', { className: 'activity-spinner done' }),
      el('span', { className: 'activity-label', textContent: msg.tools.length + ' tool' + (msg.tools.length > 1 ? 's' : '') + ' used' }),
    ]);
    var toolsList = el('ul', { className: 'activity-list' });
    for (var i = 0; i < msg.tools.length; i++) {
      toolsList.appendChild(el('li', { className: 'activity-entry' }, [
        el('span', { className: 'activity-dot' }),
        el('span', { className: 'activity-name', textContent: msg.tools[i].name }),
      ]));
    }
    var toolsBlock = el('details', { className: 'activity-block' }, [toolsSummary, toolsList]);
    // Insert tools before the text row (if it exists), or just append
    if (wrapper.firstChild) {
      wrapper.insertBefore(toolsBlock, wrapper.firstChild);
    } else {
      wrapper.appendChild(toolsBlock);
    }
  }

  // Timestamp
  if (msg && msg.timestamp) {
    wrapper.appendChild(createTimestamp(msg.timestamp));
  }

  return wrapper;
}

/** Render a live (in-progress) assistant message with tools and thinking indicator */
function createLiveBubble(msg) {
  var wrapper = el('div', { className: 'message message-assistant streaming' });

  // Show tool usage if any
  if (msg.tools && msg.tools.length > 0) {
    var toolsSummary = el('summary', { className: 'activity-summary' }, [
      el('span', { className: 'activity-spinner' }),
      el('span', { className: 'activity-label', textContent: 'Working... (' + msg.tools.length + ' step' + (msg.tools.length > 1 ? 's' : '') + ')' }),
    ]);
    var toolsList = el('ul', { className: 'activity-list' });
    for (var ti = 0; ti < msg.tools.length; ti++) {
      var dotClass = (ti === msg.tools.length - 1) ? 'activity-dot spinning' : 'activity-dot done';
      toolsList.appendChild(el('li', { className: 'activity-entry' }, [
        el('span', { className: dotClass }),
        el('span', { className: 'activity-name', textContent: msg.tools[ti].name }),
      ]));
    }
    var toolsBlock = el('details', { className: 'activity-block', open: true }, [toolsSummary, toolsList]);
    wrapper.appendChild(toolsBlock);
  }

  // Content or thinking dots
  var bubble = el('div', { className: 'message-bubble' });
  if (msg.content) {
    bubble.appendChild(renderMarkdown(msg.content));
  }
  // Always show thinking dots on live messages
  bubble.appendChild(el('div', { className: 'thinking-indicator' }, [
    el('span', { className: 'thinking-dot' }),
    el('span', { className: 'thinking-dot' }),
    el('span', { className: 'thinking-dot' }),
  ]));

  var row = el('div', { className: 'message-row' }, [bubble]);
  wrapper.appendChild(row);
  return wrapper;
}

function createStatusBubble(text) {
  return el('div', { className: 'message message-status' }, [
    el('span', { textContent: text }),
  ]);
}

function createMessageActions(text) {
  var actions = el('div', { className: 'message-actions' });
  var copyBtn = el('button', { className: 'message-action-btn', title: 'Copy message' });
  copyBtn.appendChild(copyIcon());
  copyBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(text).then(function () {
      while (copyBtn.firstChild) copyBtn.removeChild(copyBtn.firstChild);
      copyBtn.appendChild(checkIcon());
      setTimeout(function () {
        while (copyBtn.firstChild) copyBtn.removeChild(copyBtn.firstChild);
        copyBtn.appendChild(copyIcon());
      }, 1500);
    });
  });
  actions.appendChild(copyBtn);
  return actions;
}

function createTimestamp(ts) {
  var date = new Date(ts);
  var now = new Date();
  var label;
  if (date.toDateString() === now.toDateString()) {
    label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    label = date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return el('span', { className: 'message-timestamp', textContent: label });
}

// ── Edit Message ─────────────────────────────────────────────
function startEditMessage(wrapper, bubble, originalText, msgIndex) {
  if (aps().isGenerating) return;

  // Expand bubble to max width while editing
  wrapper.classList.add('editing');

  // Replace bubble content with a textarea
  var textarea = el('textarea', { className: 'edit-textarea' });
  textarea.value = originalText;

  // Attachment preview area for edit mode
  var editAttachments = [];
  var editAttachPreview = el('div', { className: 'edit-attach-preview' });

  // Carry over existing attachments from the original message
  var messages = state.messages[state.activeProject] || [];
  var originalMsg = messages[msgIndex];
  if (originalMsg && originalMsg.attachments) {
    for (var ei = 0; ei < originalMsg.attachments.length; ei++) {
      editAttachments.push(originalMsg.attachments[ei]);
    }
  }

  function renderEditAttachments() {
    editAttachPreview.textContent = '';
    for (var i = 0; i < editAttachments.length; i++) {
      (function (idx) {
        var att = editAttachments[idx];
        var tag = el('span', { className: 'edit-attach-tag' });
        if (att.type === 'image' && att.dataUrl) {
          var thumb = el('img', { src: att.dataUrl, className: 'edit-attach-thumb' });
          tag.appendChild(thumb);
        }
        tag.appendChild(el('span', { textContent: att.name || 'image' }));
        var removeBtn = el('button', { className: 'edit-attach-remove', textContent: '\u00d7' });
        removeBtn.addEventListener('click', function () {
          editAttachments.splice(idx, 1);
          renderEditAttachments();
        });
        tag.appendChild(removeBtn);
        editAttachPreview.appendChild(tag);
      })(i);
    }
  }
  renderEditAttachments();

  var attachBtn = el('button', { className: 'btn btn-ghost btn-sm', textContent: '+ Image' });
  attachBtn.addEventListener('click', async function () {
    var files = await window.api.selectFiles();
    if (!files) return;
    for (var fi = 0; fi < files.length; fi++) {
      var f = files[fi];
      if (f.dataUrl) {
        editAttachments.push({ type: 'image', name: f.name, dataUrl: f.dataUrl });
      }
    }
    renderEditAttachments();
  });

  var saveBtn = el('button', { className: 'btn btn-primary btn-sm', textContent: 'Save & Resend' });
  var cancelBtn = el('button', { className: 'btn btn-ghost btn-sm', textContent: 'Cancel' });
  var btnRow = el('div', { className: 'edit-actions' }, [attachBtn, cancelBtn, saveBtn]);

  bubble.textContent = '';
  bubble.appendChild(textarea);
  bubble.appendChild(editAttachPreview);
  bubble.appendChild(btnRow);
  textarea.focus();
  textarea.style.height = textarea.scrollHeight + 'px';

  textarea.addEventListener('input', function () {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });

  // Handle paste images into edit textarea
  textarea.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var pi = 0; pi < items.length; pi++) {
      if (items[pi].type.indexOf('image') !== -1) {
        e.preventDefault();
        var blob = items[pi].getAsFile();
        var reader = new FileReader();
        reader.onload = function (ev) {
          editAttachments.push({ type: 'image', name: 'pasted-image.png', dataUrl: ev.target.result });
          renderEditAttachments();
        };
        reader.readAsDataURL(blob);
        return;
      }
    }
  });

  cancelBtn.addEventListener('click', function () {
    wrapper.classList.remove('editing');
    bubble.textContent = '';
    renderInline(originalText, bubble);
  });

  saveBtn.addEventListener('click', function () {
    var newText = textarea.value.trim();
    if (!newText && editAttachments.length === 0) return;

    wrapper.classList.remove('editing');

    // Truncate messages: remove this message and everything after it
    var msgs = state.messages[state.activeProject] || [];
    state.messages[state.activeProject] = msgs.slice(0, msgIndex);
    window.api.saveChat(state.activeProject, state.messages[state.activeProject]);

    // Set up pending attachments from edit
    pendingAttachments = editAttachments.slice();
    renderAttachmentPreview();

    // Re-render and send
    renderMessages();
    $('#chat-input').value = newText || '';
    sendMessage();
  });
}

// ── Streaming ────────────────────────────────────────────────
function startAssistantMessage() {
  var container = $('#chat-messages');

  var welcome = document.getElementById('chat-welcome');
  if (welcome) welcome.remove();

  var contentEl = el('span', { className: 'message-content' });
  var thinkingEl = el('div', { className: 'thinking-indicator' }, [
    el('span', { className: 'thinking-dot' }),
    el('span', { className: 'thinking-dot' }),
    el('span', { className: 'thinking-dot' }),
  ]);
  var bubble = el('div', { className: 'message-bubble' }, [thinkingEl, contentEl]);
  var msgEl = el('div', { className: 'message message-assistant streaming' }, [bubble]);

  container.appendChild(msgEl);
  aps().currentStream = {
    element: msgEl,
    contentEl: contentEl,
    fullText: '',
    tools: [],            // Collected tool usages for persistence
    activityEl: null,    // The <details> activity container
    activityList: null,   // The <ul> inside it
    activityCount: 0,
    lastToolName: null,
  };
  scrollToBottom();
}

function appendStreamChunk(text) {
  if (!aps().currentStream) startAssistantMessage();
  aps().currentStream.fullText += text;
  aps().currentStream.contentEl.textContent = aps().currentStream.fullText;
  scrollToBottom();
}

/**
 * Add a tool activity entry to the collapsible "Working..." section.
 * Creates the section if needed, appends entries, and updates the summary count.
 */
function addToolActivity(toolName, detail) {
  if (!aps().currentStream) startAssistantMessage();
  var stream = aps().currentStream;
  var container = $('#chat-messages');

  // Create the activity container if it doesn't exist
  if (!stream.activityEl) {
    var summaryEl = el('summary', { className: 'activity-summary' }, [
      el('span', { className: 'activity-spinner' }),
      el('span', { className: 'activity-label', textContent: 'Working...' }),
    ]);
    var listEl = el('ul', { className: 'activity-list' });
    var details = el('details', { className: 'activity-block' }, [summaryEl, listEl]);
    // Insert before the assistant message bubble
    container.insertBefore(details, stream.element);
    stream.activityEl = details;
    stream.activityList = listEl;
    stream.activityCount = 0;
  }

  // Track tool for persistence
  stream.tools.push({ name: toolName, detail: detail || '' });

  // Add the entry
  stream.activityCount++;
  var label = toolName === 'system' ? (detail || 'Processing...') : toolName;
  if (detail && toolName !== 'system') {
    label = toolName;
  }
  // Mark previous last entry's dot as done (checkmark)
  var prevEntries = stream.activityList.querySelectorAll('.activity-entry');
  if (prevEntries.length > 0) {
    var prevDot = prevEntries[prevEntries.length - 1].querySelector('.activity-dot');
    if (prevDot) { prevDot.classList.remove('spinning'); prevDot.classList.add('done'); }
  }
  var entry = el('li', { className: 'activity-entry' }, [
    el('span', { className: 'activity-dot spinning' }),
    el('span', { className: 'activity-name', textContent: label }),
  ]);
  stream.activityList.appendChild(entry);

  // Update the summary label
  var summaryLabel = stream.activityEl.querySelector('.activity-label');
  if (summaryLabel) {
    summaryLabel.textContent = 'Working... (' + stream.activityCount + ' step' + (stream.activityCount > 1 ? 's' : '') + ')';
  }
  stream.lastToolName = toolName;

  scrollToBottom();
}

/**
 * Show cost/duration metadata after stream completes.
 */
function addResultMeta(cost, duration) {
  if (cost == null && duration == null) return;
  var parts = [];
  if (cost != null) parts.push('$' + cost.toFixed(4));
  if (duration != null) parts.push((duration / 1000).toFixed(1) + 's');
  if (parts.length === 0) return;

  var container = $('#chat-messages');
  var meta = el('div', { className: 'message message-meta' }, [
    el('span', { textContent: parts.join(' · ') }),
  ]);
  container.appendChild(meta);
  scrollToBottom();
}

/**
 * Finalize the current message bubble (render markdown, save) without ending generation.
 * Used between multi-step codex responses so each message appears as its own bubble.
 */
function finalizeCurrentBubble() {
  if (!aps().currentStream || !aps().currentStream.fullText) return;

  var fullText = aps().currentStream.fullText;
  var element = aps().currentStream.element;

  var bubble = element.querySelector('.message-bubble');
  if (bubble) {
    bubble.textContent = '';
    bubble.appendChild(renderMarkdown(fullText));
  }
  element.classList.remove('streaming');

  // Data already in state.messages via live msg — just clear DOM stream
  aps().currentStream = null;
  scrollToBottom();
}

function finishStream() {
  // Data already saved by event handler (finalizeLiveMsg) — just update DOM
  aps().isGenerating = false;
  aps().currentStream = null;

  // Re-render from data to show finalized state (tools with checkmarks, no dots)
  renderMessages();

  // Restore UI controls
  $('#stop-btn').classList.add('hidden');
  $('#deploy-btn').disabled = false;
  $('#chat-input').disabled = false;
  $('#send-btn').disabled = !$('#chat-input').value.trim();

  // Detect deploy URLs from recent messages
  if (state.activeProject && state.messages[state.activeProject]) {
    var recent = state.messages[state.activeProject].slice(-5);
    for (var ri = 0; ri < recent.length; ri++) {
      if (recent[ri].role === 'assistant') detectDeployUrl(recent[ri].content);
    }
  }

  scrollToBottom();
  $('#chat-input').focus();

  // Process queued messages
  if (aps().messageQueue.length > 0) {
    var nextMsg = aps().messageQueue.shift();
    $('#chat-input').value = nextMsg;
    sendMessage();
  }
}

// ── Attachments ──────────────────────────────────────────────
var pendingAttachments = [];

function handlePaste(e) {
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;

  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      e.preventDefault();
      var blob = items[i].getAsFile();
      if (!blob) continue;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var dataUrl = ev.target.result;
        var name = 'paste-' + Date.now() + '.png';
        addPendingAttachment({ type: 'image', name: name, dataUrl: dataUrl });
      };
      reader.readAsDataURL(blob);
      return; // only handle one image per paste
    }
  }
}

function handleDroppedFiles(dataTransfer) {
  if (!dataTransfer || !dataTransfer.files) return;
  for (var i = 0; i < dataTransfer.files.length; i++) {
    var file = dataTransfer.files[i];
    var isImage = file.type.startsWith('image/');
    var reader = new FileReader();
    (function (f, img) {
      if (img) {
        reader.onload = function (ev) {
          addPendingAttachment({ type: 'image', name: f.name, dataUrl: ev.target.result });
        };
        reader.readAsDataURL(f);
      } else {
        reader.onload = function (ev) {
          addPendingAttachment({ type: 'file', name: f.name, content: ev.target.result.slice(0, 100000) });
        };
        reader.readAsText(f);
      }
    })(file, isImage);
  }
}

async function attachFiles() {
  var files = await window.api.selectFiles();
  if (!files || files.length === 0) return;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f.isImage) {
      addPendingAttachment({ type: 'image', name: f.name, dataUrl: f.dataUrl });
    } else {
      addPendingAttachment({ type: 'file', name: f.name, content: f.content });
    }
  }
}

function addPendingAttachment(att) {
  pendingAttachments.push(att);
  renderAttachmentPreview();
  $('#send-btn').disabled = false;
}

function renderAttachmentPreview() {
  var container = $('#attachment-preview');
  container.textContent = '';
  if (pendingAttachments.length === 0) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  for (var i = 0; i < pendingAttachments.length; i++) {
    (function (idx) {
      var att = pendingAttachments[idx];
      var item = el('div', { className: 'attachment-item' });

      if (att.type === 'image' && att.dataUrl) {
        var thumb = el('img', { src: att.dataUrl, className: 'attachment-thumb' });
        item.appendChild(thumb);
      }
      item.appendChild(el('span', { className: 'attachment-name', textContent: att.name }));

      var removeBtn = el('button', { className: 'attachment-remove', textContent: '\u00d7', title: 'Remove' });
      removeBtn.addEventListener('click', function () {
        pendingAttachments.splice(idx, 1);
        renderAttachmentPreview();
        if (pendingAttachments.length === 0 && !$('#chat-input').value.trim()) {
          $('#send-btn').disabled = true;
        }
      });
      item.appendChild(removeBtn);
      container.appendChild(item);
    })(i);
  }
}

// ── Send / Stop ──────────────────────────────────────────────
async function sendMessage() {
  var input = $('#chat-input');
  var text = input.value.trim();
  var hasAttachments = pendingAttachments.length > 0;
  if ((!text && !hasAttachments) || !state.activeProject) return;

  // Queue message if currently generating
  if (aps().isGenerating) {
    var queuedText = text;
    aps().messageQueue.push(queuedText);
    // Show queued message in chat immediately
    var container = $('#chat-messages');
    var queuedMsg = { role: 'user', content: queuedText, timestamp: Date.now() };
    container.appendChild(createUserBubble(queuedText, queuedMsg));
    if (!state.messages[state.activeProject]) state.messages[state.activeProject] = [];
    state.messages[state.activeProject].push(queuedMsg);
    window.api.saveChat(state.activeProject, state.messages[state.activeProject]);
    addStatusMessage('Queued — will send after current response');
    input.value = '';
    input.style.height = '';
    scrollToBottom();
    return;
  }

  var container = $('#chat-messages');
  var welcome = document.getElementById('chat-welcome');
  if (welcome) welcome.remove();

  // Build the prompt text — include file contents
  var promptParts = [];
  var messageAttachments = [];

  if (hasAttachments) {
    for (var i = 0; i < pendingAttachments.length; i++) {
      var att = pendingAttachments[i];
      if (att.type === 'image') {
        // Save image to project and reference it
        try {
          var saved = await window.api.saveAttachment(state.activeProject, att.name, att.dataUrl);
          promptParts.push('[Attached image: ' + saved.relativePath + ']');
          messageAttachments.push({ type: 'image', name: att.name, dataUrl: att.dataUrl, path: saved.relativePath });
        } catch (e) {
          promptParts.push('[Failed to save image: ' + att.name + ']');
        }
      } else if (att.type === 'file') {
        promptParts.push('[Attached file: ' + att.name + ']\n```\n' + att.content + '\n```');
        messageAttachments.push({ type: 'file', name: att.name });
      }
    }
  }
  if (text) promptParts.push(text);
  var fullPrompt = promptParts.join('\n\n');

  // Show in chat
  var userMsg = { role: 'user', content: text || ('Attached ' + pendingAttachments.length + ' file(s)'), timestamp: Date.now() };
  if (messageAttachments.length > 0) userMsg.attachments = messageAttachments;
  container.appendChild(createUserBubble(userMsg.content, userMsg));

  if (!state.messages[state.activeProject]) state.messages[state.activeProject] = [];
  state.messages[state.activeProject].push(userMsg);
  window.api.saveChat(state.activeProject, state.messages[state.activeProject]);

  // Clear input and attachments
  input.value = '';
  input.style.height = '';
  pendingAttachments = [];
  renderAttachmentPreview();
  $('#send-btn').disabled = true;

  aps().isGenerating = true;
  aps()._lastEventTime = Date.now();
  input.disabled = false; // Keep input enabled for queueing
  $('#stop-btn').classList.remove('hidden');
  $('#deploy-btn').disabled = true;

  // Create a live message in data so dots show immediately via renderMessages
  var sendProject = state.activeProject;
  getLiveMsg(sendProject);
  renderMessages();
  scrollToBottom();

  // Safety timeout: if no events received for 3 minutes, auto-stop
  var safetyTimer = setInterval(function () {
    var ps = getPS(sendProject);
    if (!ps.isGenerating) { clearInterval(safetyTimer); return; }
    if (Date.now() - (ps._lastEventTime || 0) > 180000) {
      clearInterval(safetyTimer);
      ps.isGenerating = false;
      finalizeLiveMsg(sendProject);
      if (state.activeProject === sendProject) {
        renderMessages();
        restoreProjectUI(ps);
      }
      renderProjectList();
    }
  }, 10000);

  try {
    await window.api.sendMessage(fullPrompt, sendProject);
  } catch (err) {
    clearInterval(safetyTimer);
    addStatusMessage('Failed to send: ' + err.message);
    aps().isGenerating = false;
    input.disabled = false;
    $('#stop-btn').classList.add('hidden');
  }
}

async function stopGeneration() {
  var ps = aps();
  ps.isGenerating = false; // Mark immediately so incoming 'done' event doesn't re-process queue
  ps.currentStream = null;
  await window.api.stopGeneration(state.activeProject);
  finalizeLiveMsg(state.activeProject);
  renderMessages();
  restoreProjectUI(ps);
  renderProjectList();
}

function addStatusMessage(text) {
  var container = $('#chat-messages');
  container.appendChild(createStatusBubble(text));
  if (state.activeProject) {
    if (!state.messages[state.activeProject]) state.messages[state.activeProject] = [];
    state.messages[state.activeProject].push({ role: 'status', content: text, timestamp: Date.now() });
  }
  scrollToBottom();
}

// ── Dev Server ─────────────────────────────────────���─────────
async function checkDevServer() {
  if (!state.activeProject) return;
  var targetProject = state.activeProject;
  var targetPS = getPS(targetProject);
  if (targetPS.devServerStarting) return;

  try {
    // Check if already running
    var url = await window.api.getDevServerUrl(targetProject);
    if (state.activeProject !== targetProject) return;

    if (url) {
      targetPS.devServerUrl = url;
      showPreview(url);
      return;
    }

    // Need to start — now show loading
    targetPS.devServerStarting = true;
    if (state.activeProject === targetProject) updatePreviewStatus('loading');

    var newUrl = await window.api.startDevServer(targetProject);
    if (state.activeProject !== targetProject) return;

    if (newUrl) {
      targetPS.devServerUrl = newUrl;
      if (state.activeProject === targetProject) showPreview(newUrl);
    } else if (state.activeProject === targetProject) {
      updatePreviewStatus(null); // Clear loading if server returned null
    }
  } catch (e) {
    if (state.activeProject === targetProject) updatePreviewStatus(null);
  } finally {
    targetPS.devServerStarting = false;
  }
}

function showPreview(url) {
  var iframe = $('#preview-iframe');
  var empty = $('#preview-empty');
  // Normalize URLs for comparison (browser adds trailing slash)
  var currentSrc = (iframe.src || '').replace(/\/+$/, '');
  var newSrc = (url || '').replace(/\/+$/, '');
  if (currentSrc !== newSrc) {
    iframe.src = url;
  }
  iframe.classList.remove('hidden');
  empty.classList.add('hidden');
  updatePreviewStatus('loaded');
}

function hidePreview(projectName) {
  var iframe = $('#preview-iframe');
  var empty = $('#preview-empty');
  iframe.classList.add('hidden');
  iframe.src = '';
  empty.classList.remove('hidden');
  // Clear the specific project's URL, not whatever is active right now
  var ps = projectName ? getPS(projectName) : aps();
  ps.devServerUrl = null;
  updatePreviewStatus(null);
  renderProjectList();
}

function updatePreviewStatus(status) {
  var empty = $('#preview-empty');
  if (status === 'loading') {
    empty.classList.remove('hidden');
    empty.innerHTML = '<p>Preview loading\u2026</p>';
    $('#preview-iframe').classList.add('hidden');
  } else if (status === 'loaded') {
    empty.classList.add('hidden');
  } else {
    empty.classList.remove('hidden');
    empty.innerHTML = '<p>Your website will appear here</p><p class="subtle">The live preview starts after the AI creates your project</p>';
  }
}

function refreshPreview() {
  var iframe = $('#preview-iframe');
  if (iframe.src && !iframe.classList.contains('hidden')) {
    try {
      iframe.contentWindow.location.reload();
    } catch (e) {
      iframe.src = iframe.src;
    }
  }
}

// ── Deploy ──────────���────────────────────────────────────────

function updateDeployButton(url) {
  var btn = $('#deploy-btn');
  var liveLink = $('#deploy-live-link');
  aps().deployedUrl = url;

  // Determine what to display: prefer custom domain, fall back to pages.dev URL
  var displayUrl = null;
  var openUrl = null;
  if (aps().customDomain) {
    displayUrl = aps().customDomain;
    openUrl = 'https://' + aps().customDomain.replace(/^https?:\/\//, '');
  } else if (url) {
    displayUrl = url.replace('https://', '');
    openUrl = url;
  }

  if (url || aps().customDomain) {
    btn.textContent = 'Redeploy';
    btn.title = 'Redeploy to Cloudflare Pages';
    if (liveLink && displayUrl) {
      liveLink.classList.remove('hidden');
      liveLink.textContent = displayUrl;
      liveLink.title = aps().customDomain
        ? 'Custom domain — click to open'
        : 'Click to open — set a custom domain in Project Settings';
      liveLink.onclick = function (e) {
        e.preventDefault();
        window.api.openExternal(openUrl);
      };
    }
  } else {
    btn.textContent = 'Deploy';
    btn.title = 'Deploy to Cloudflare Pages';
    if (liveLink) {
      liveLink.classList.add('hidden');
    }
  }
}

/**
 * Scan text for deployed URLs (pages.dev, custom domains) and update the deploy status bar.
 */
/** Scan text for deploy URLs and update the top-bar live link */
function detectDeployUrl(text) {
  if (!text) return;
  var pagesMatch = text.match(/https:\/\/[a-z0-9][-a-z0-9]*\.pages\.dev/i);
  var liveAtMatch = text.match(/live at\s+(https:\/\/[^\s,)]+)/i);
  var url = (liveAtMatch && liveAtMatch[1]) || (pagesMatch && pagesMatch[0]);
  if (url) {
    url = url.replace(/[.,!;:]+$/, '');
    aps().deployedUrl = url;
    updateDeployButton(url);
  }
}

function deploy() {
  if (!state.activeProject) return;
  if (aps().isGenerating) return;
  // Send deploy as a chat message so the AI handles it
  var input = $('#chat-input');
  input.value = 'Deploy this project to Cloudflare Pages and give me the live URL.';
  sendMessage();
}

// ── Settings Modal ──────────��────────────────────────────────

function setupSettingsModal() {
  $('#settings-close-btn').addEventListener('click', closeSettings);
  $('#settings-cancel-btn').addEventListener('click', closeSettings);
  $('#settings-save-btn').addEventListener('click', saveSettingsFromModal);
  $('#settings-workspace-browse').addEventListener('click', async function () {
    var selected = await window.api.selectDirectory();
    if (selected) {
      $('#settings-workspace').value = selected;
    }
  });
  $('#settings-import-chats').addEventListener('click', async function () {
    var btn = $('#settings-import-chats');
    btn.disabled = true;
    btn.textContent = 'Importing...';
    try {
      var imports = await window.api.detectChatImports();
      var totalImported = 0;
      for (var ci = 0; ci < imports.length; ci++) {
        var result = await window.api.importChats(imports[ci].claudeDir, imports[ci].sessionFiles);
        totalImported += result.totalMessages;
      }
      $('#settings-import-status').textContent = totalImported > 0
        ? 'Imported ' + totalImported + ' messages'
        : 'No new messages to import';
      btn.textContent = 'Import from Claude Code';
      btn.disabled = false;
    } catch (err) {
      $('#settings-import-status').textContent = 'Import failed: ' + err.message;
      btn.textContent = 'Import from Claude Code';
      btn.disabled = false;
    }
  });

  // Re-run setup
  $('#settings-rerun-setup').addEventListener('click', async function () {
    closeSettings();
    await window.api.setSettings({ authSetupSeen: false });
    var setupStatus = await window.api.checkSetup();
    showSetupScreen(setupStatus);
  });

  // Close on overlay click
  $('#settings-modal').addEventListener('click', function (e) {
    if (e.target === this) closeSettings();
  });
}

async function openSettings() {
  var settings = await window.api.getSettings();
  var workspacePath = await window.api.getWorkspacePath();
  var modelInfo = await window.api.getModels();

  $('#settings-workspace').value = workspacePath || '';
  $('#settings-backend').value = settings.backend || 'claude';
  $('#settings-cf-account').value = settings.cloudflareAccountId || '';
  $('#settings-import-status').textContent = '';

  // Populate model dropdowns
  var claudeSelect = $('#settings-claude-model');
  var codexSelect = $('#settings-codex-model');
  claudeSelect.textContent = '';
  codexSelect.textContent = '';
  for (var ci = 0; ci < modelInfo.claude.length; ci++) {
    var opt = el('option', { value: modelInfo.claude[ci].id, textContent: modelInfo.claude[ci].label });
    claudeSelect.appendChild(opt);
  }
  for (var xi = 0; xi < modelInfo.codex.length; xi++) {
    var opt2 = el('option', { value: modelInfo.codex[xi].id, textContent: modelInfo.codex[xi].label });
    codexSelect.appendChild(opt2);
  }
  claudeSelect.value = modelInfo.selectedClaude;
  codexSelect.value = modelInfo.selectedCodex;

  // Show version
  try {
    var version = await window.api.getVersion();
    var versionEl = document.getElementById('settings-version');
    if (versionEl) versionEl.textContent = 'v' + version;
  } catch (e) {}

  $('#settings-modal').classList.remove('hidden');
}

function closeSettings() {
  $('#settings-modal').classList.add('hidden');
}

async function saveSettingsFromModal() {
  var newSettings = {
    backend: $('#settings-backend').value,
    cloudflareAccountId: $('#settings-cf-account').value.trim() || null,
  };

  // Check if workspace changed
  var newWorkspace = $('#settings-workspace').value;
  var currentWorkspace = await window.api.getWorkspacePath();
  if (newWorkspace && newWorkspace !== currentWorkspace) {
    newSettings.workspacePath = newWorkspace;
  }

  await window.api.setSettings(newSettings);

  // Save model selections
  var claudeModel = $('#settings-claude-model').value;
  var codexModel = $('#settings-codex-model').value;
  await window.api.setModel('claude', claudeModel);
  await window.api.setModel('codex', codexModel);

  // Update local state
  state.backend = newSettings.backend;
  updateBackendLabel();

  closeSettings();

  // Refresh projects if workspace changed
  if (newSettings.workspacePath) {
    await refreshProjects();
  }
}

// ── About Modal ──��───────────────────────────────────────────

function setupAboutModal() {
  $('#about-close-btn').addEventListener('click', closeAbout);
  $('#about-open-data').addEventListener('click', async function () {
    var dataPath = await window.api.getUserDataPath();
    window.api.openPath(dataPath);
  });
  $('#about-modal').addEventListener('click', function (e) {
    if (e.target === this) closeAbout();
  });
}

async function openAbout() {
  try {
    var version = await window.api.getVersion();
    $('#about-version').textContent = 'v' + version;
  } catch (e) {
    $('#about-version').textContent = '';
  }
  $('#about-modal').classList.remove('hidden');
}

function closeAbout() {
  $('#about-modal').classList.add('hidden');
}

function closeAllModals() {
  closeSettings();
  closeAbout();
  closeProjectSettings();
}

// ── Project Settings Modal ───────────────────────────────────

function setupProjectSettingsModal() {
  $('#project-settings-close-btn').addEventListener('click', closeProjectSettings);
  $('#project-settings-cancel-btn').addEventListener('click', closeProjectSettings);
  $('#project-settings-save-btn').addEventListener('click', saveProjectSettings);
  $('#project-settings-modal').addEventListener('click', function (e) {
    if (e.target === this) closeProjectSettings();
  });

  // Domain clear button
  $('#ps-domain-clear').addEventListener('click', function () {
    $('#ps-custom-domain').value = '';
    updateDomainGuide();
  });

  // Domain input live preview
  $('#ps-custom-domain').addEventListener('input', updateDomainGuide);

  // Registrar links
  var registrarLinks = document.querySelectorAll('#ps-domain-guide .settings-link[data-url]');
  for (var i = 0; i < registrarLinks.length; i++) {
    (function (link) {
      link.addEventListener('click', function () {
        window.api.openExternal(link.getAttribute('data-url'));
      });
    })(registrarLinks[i]);
  }

  // CF dashboard link in domain guide
  $('#ps-open-cf-dash').addEventListener('click', function () {
    window.api.openExternal('https://dash.cloudflare.com/?to=/:account/pages');
  });
}

/**
 * Updates the domain guide to reflect the current domain & project name.
 */
function updateDomainGuide() {
  var domain = ($('#ps-custom-domain').value || '').trim();
  var deployName = ($('#ps-deploy-name').value || '').trim() || state.activeProject || 'your-project';

  // Update DNS target records
  var dnsTarget = $('#ps-dns-target');
  var dnsTargetWww = $('#ps-dns-target-www');
  if (dnsTarget) dnsTarget.textContent = deployName;
  if (dnsTargetWww) dnsTargetWww.textContent = deployName;

  // Update CF project label
  var cfLabel = $('#ps-cf-project-label');
  if (cfLabel) cfLabel.textContent = deployName;

  // Update domain preview label
  var preview = $('#ps-domain-preview-label');
  if (preview) {
    if (domain) {
      preview.textContent = domain;
    } else {
      preview.textContent = deployName + '.pages.dev';
    }
  }
}

async function openProjectSettings() {
  if (!state.activeProject) return;

  var settings = await window.api.getProjectSettings(state.activeProject);
  $('#ps-dev-command').value = settings.devCommand || '';
  $('#ps-build-command').value = settings.buildCommand || '';
  $('#ps-dev-timeout').value = settings.devTimeout || 120;
  $('#ps-framework').value = settings.framework || '';
  $('#ps-deploy-name').value = settings.deployProjectName || '';
  $('#ps-custom-domain').value = settings.customDomain || '';

  // Populate AI backend/model dropdowns
  var modelInfo = await window.api.getModels();
  var psClaude = $('#ps-claude-model');
  var psCodex = $('#ps-codex-model');
  psClaude.textContent = '';
  psCodex.textContent = '';
  psClaude.appendChild(el('option', { value: '', textContent: 'Use global default' }));
  psCodex.appendChild(el('option', { value: '', textContent: 'Use global default' }));
  for (var pci = 0; pci < modelInfo.claude.length; pci++) {
    psClaude.appendChild(el('option', { value: modelInfo.claude[pci].id, textContent: modelInfo.claude[pci].label }));
  }
  for (var pxi = 0; pxi < modelInfo.codex.length; pxi++) {
    psCodex.appendChild(el('option', { value: modelInfo.codex[pxi].id, textContent: modelInfo.codex[pxi].label }));
  }
  $('#ps-backend').value = settings.backend || '';
  psClaude.value = settings.claudeModel || '';
  psCodex.value = settings.codexModel || '';

  // Also update on deploy name change
  $('#ps-deploy-name').oninput = updateDomainGuide;

  updateDomainGuide();

  $('#project-settings-title').textContent = 'Project Settings — ' + state.activeProject;
  $('#project-settings-modal').classList.remove('hidden');
}

function closeProjectSettings() {
  $('#project-settings-modal').classList.add('hidden');
}

async function saveProjectSettings() {
  if (!state.activeProject) return;

  var domain = $('#ps-custom-domain').value.trim()
    .replace(/^https?:\/\//, '')  // strip protocol if pasted
    .replace(/\/+$/, '');         // strip trailing slashes

  var newSettings = {
    devCommand: $('#ps-dev-command').value.trim(),
    buildCommand: $('#ps-build-command').value.trim(),
    devTimeout: parseInt($('#ps-dev-timeout').value, 10) || 120,
    framework: $('#ps-framework').value.trim(),
    deployProjectName: $('#ps-deploy-name').value.trim(),
    customDomain: domain,
    backend: $('#ps-backend').value,
    claudeModel: $('#ps-claude-model').value,
    codexModel: $('#ps-codex-model').value,
  };

  await window.api.setProjectSettings(state.activeProject, newSettings);

  // Update state and refresh all deploy UI
  aps().customDomain = domain || null;
  updateDeployButton(aps().deployedUrl);
  // Refresh the deploy status bar if deployed
  if (aps().deployedUrl) {
    updateDeployButton(aps().deployedUrl || null);
  }

  closeProjectSettings();
  if (domain) {
    addStatusMessage('Domain set to ' + domain + ' — configure DNS to finish setup');
  } else {
    addStatusMessage('Project settings saved');
  }
}

// ── Resize Handle ───────────────��────────────────────────────
function setupResize() {
  var handle = $('#resize-handle');
  if (!handle) return;

  handle.addEventListener('mousedown', function () {
    var chatPanel = document.querySelector('.chat-panel');
    var contentEl = document.querySelector('.content');
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    // Block iframe from stealing mouse events during drag
    var iframe = document.getElementById('preview-iframe');
    if (iframe) iframe.style.pointerEvents = 'none';

    function onMove(moveEvent) {
      var contentRect = contentEl.getBoundingClientRect();
      var newWidth = moveEvent.clientX - contentRect.left;
      var minW = 320;
      var maxW = contentRect.width - 280;
      if (newWidth >= minW && newWidth <= maxW) {
        chatPanel.style.flex = 'none';
        chatPanel.style.width = newWidth + 'px';
      }
    }

    function onUp() {
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (iframe) iframe.style.pointerEvents = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Reset to flex layout on window resize so messages reflow
  window.addEventListener('resize', function () {
    var chatPanel = document.querySelector('.chat-panel');
    if (chatPanel && chatPanel.style.width) {
      chatPanel.style.flex = '';
      chatPanel.style.width = '';
    }
  });
}

// ── Markdown Renderer ────────────────────────────────────────
function renderMarkdown(text) {
  // Close any unclosed code fences to prevent mangled output
  var fenceCount = (text.match(/^```/gm) || []).length;
  if (fenceCount % 2 !== 0) text += '\n```';

  var fragment = document.createDocumentFragment();
  var codeBlockRe = /```(\w*)\n([\s\S]*?)```/g;
  var lastIndex = 0;
  var match;

  while ((match = codeBlockRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      renderTextBlock(text.slice(lastIndex, match.index), fragment);
    }
    var langClass = match[1] ? 'language-' + match[1] : '';
    var codeText = match[2];
    var codeEl = el('code', { className: langClass, textContent: codeText });
    var copyBtn = el('button', { className: 'code-copy-btn', textContent: 'Copy' });
    (function (text, btn) {
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = 'Copied!';
          setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
        });
      });
    })(codeText, copyBtn);
    var pre = el('pre', {}, [copyBtn, codeEl]);
    fragment.appendChild(pre);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    renderTextBlock(text.slice(lastIndex), fragment);
  }

  if (!fragment.hasChildNodes()) {
    fragment.appendChild(document.createTextNode(text));
  }

  return fragment;
}

function renderTextBlock(text, fragment) {
  var paragraphs = text.split(/\n\n+/);
  for (var i = 0; i < paragraphs.length; i++) {
    var trimmed = paragraphs[i].trim();
    if (!trimmed) continue;

    var headerMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      var level = headerMatch[1].length;
      var tag = 'h' + (level + 1);
      var header = el(tag);
      renderInline(headerMatch[2], header);
      fragment.appendChild(header);
      continue;
    }

    var lines = trimmed.split('\n');

    // Unordered list: lines starting with - or *
    if (lines.every(function (l) { return /^\s*[-*]\s/.test(l) || !l.trim(); })) {
      var ul = el('ul');
      for (var j = 0; j < lines.length; j++) {
        var lineText = lines[j].replace(/^\s*[-*]\s+/, '').trim();
        if (!lineText) continue;
        var li = el('li');
        renderInline(lineText, li);
        ul.appendChild(li);
      }
      fragment.appendChild(ul);
      continue;
    }

    // Ordered list: lines starting with 1. 2. etc.
    if (lines.some(function (l) { return /^\s*\d+[.)]\s/.test(l); })) {
      var ol = el('ol');
      for (var oj = 0; oj < lines.length; oj++) {
        var olText = lines[oj].replace(/^\s*\d+[.)]\s+/, '').trim();
        if (!olText) continue;
        var oli = el('li');
        renderInline(olText, oli);
        ol.appendChild(oli);
      }
      fragment.appendChild(ol);
      continue;
    }

    // Regular paragraph — preserve single line breaks as <br>
    var p = el('p');
    for (var lk = 0; lk < lines.length; lk++) {
      if (lk > 0) p.appendChild(document.createElement('br'));
      renderInline(lines[lk], p);
    }
    fragment.appendChild(p);
  }
}

function renderInline(text, parent) {
  // Match bold, inline code, and URLs
  var re = /(\*\*(.+?)\*\*|`([^`]+)`|(https?:\/\/[^\s<>\])"']+))/g;
  var lastIdx = 0;
  var m;

  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parent.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
    }
    if (m[2]) {
      parent.appendChild(el('strong', { textContent: m[2] }));
    } else if (m[3]) {
      parent.appendChild(el('code', { textContent: m[3] }));
    } else if (m[4]) {
      // URL — strip trailing punctuation that's likely not part of the URL
      var url = m[4].replace(/[.,;:!?)]+$/, '');
      var trailingChars = m[4].slice(url.length);
      var link = el('a', {
        href: '#',
        className: 'chat-link',
        textContent: url,
        title: url,
      });
      (function (u) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          window.api.openExternal(u);
        });
      })(url);
      parent.appendChild(link);
      if (trailingChars) parent.appendChild(document.createTextNode(trailingChars));
    }
    lastIdx = m.index + m[0].length;
  }

  if (lastIdx < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIdx)));
  }
}

// ── Chat Import Detection ───────��────────────────────────────
async function detectChatImports() {
  try {
    var imports = await window.api.detectChatImports();
    if (imports.length > 0) {
      var totalMsgs = 0;
      var projectNames = [];
      for (var i = 0; i < imports.length; i++) {
        totalMsgs += imports[i].messageCount;
        for (var j = 0; j < imports[i].projects.length; j++) {
          if (projectNames.indexOf(imports[i].projects[j]) === -1) {
            projectNames.push(imports[i].projects[j]);
          }
        }
      }
      if (totalMsgs > 0) {
        $('#chat-import-section').classList.remove('hidden');
        $('#chat-import-info').textContent = 'Found ' + totalMsgs + ' messages from Claude Code across ' + projectNames.length + ' project(s): ' + projectNames.join(', ');
      }
    }
  } catch (e) {
    // No Claude Code sessions found — that's fine
  }
}

// ── Textarea Auto-Resize ────────��────────────────────────────
function autoResizeTextarea(textarea) {
  textarea.style.height = '';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// ── Scroll ─────────────��─────────────────────────────────────
function scrollToBottom() {
  var container = $('#chat-messages');
  requestAnimationFrame(function () {
    container.scrollTop = container.scrollHeight;
  });
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
