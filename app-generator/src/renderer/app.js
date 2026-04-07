/* ═══════════════════════════════════════════════════════════════
   App Generator — Renderer (browser-only, no Node.js APIs)
   ═════════════════���═════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────
var state = {
  projects: [],
  activeProject: null,
  backend: 'claude',
  projectState: {},  // projectName → per-project state
};

var chatManager = null;  // ChatStateManager instance, initialized in enterMainApp()
var ChatState = window.ChatState;
var ChatRenderer = window.ChatRenderer;

var chatCallbacks = {
  onEdit: function (nodeId, oldText) {
    if (!state.activeProject) return;
    var store = chatManager.getOrCreate(state.activeProject);
    if (store.turnState.isGenerating()) return;

    // Find the message element in DOM
    var msgEl = document.querySelector('[data-msg-id="' + nodeId + '"]');
    if (!msgEl) return;

    var bubble = msgEl.querySelector('.message-bubble');
    if (!bubble) return;

    // Expand bubble to max width while editing
    msgEl.classList.add('editing');

    // Replace bubble content with a textarea
    var textarea = el('textarea', { className: 'edit-textarea' });
    textarea.value = oldText;

    // Attachment preview area for edit mode
    var editAttachments = [];
    var editAttachPreview = el('div', { className: 'edit-attach-preview' });

    // Carry over existing attachments from the original message node
    var node = store.tree.getNode(nodeId);
    if (node && node.content) {
      for (var ei = 0; ei < node.content.length; ei++) {
        var block = node.content[ei];
        if (block.type === 'attachment') {
          editAttachments.push({
            type: block.attachType || 'file',
            name: block.name || 'file',
            dataUrl: block.dataUrl || null,
            content: block.content || null,
          });
        }
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
      msgEl.classList.remove('editing');
      // Re-render full chat to restore the bubble
      ChatRenderer.renderFullChat(store.tree, store.turnState, state.activeProject, chatCallbacks);
    });

    saveBtn.addEventListener('click', function () {
      var newText = textarea.value.trim();
      if (!newText && editAttachments.length === 0) return;

      msgEl.classList.remove('editing');

      var projectName = state.activeProject;

      // Build content blocks for the new (edited) message
      var contentBlocks = [];
      for (var ai = 0; ai < editAttachments.length; ai++) {
        var att = editAttachments[ai];
        contentBlocks.push({
          type: 'attachment',
          attachType: att.type || 'file',
          name: att.name || 'file',
          dataUrl: att.dataUrl || null,
          content: att.content || null,
        });
      }
      if (newText) contentBlocks.push(ChatState.textBlock(newText));

      // Create a sibling branch with the edited content
      store.tree.editMessage(nodeId, contentBlocks);
      window.api.clearAIHistory(projectName);

      // Build prompt for the backend
      var promptParts = [];
      for (var pi = 0; pi < editAttachments.length; pi++) {
        var patt = editAttachments[pi];
        if (patt.type === 'image' && patt.dataUrl) {
          promptParts.push('[Attached image: ' + (patt.name || 'image') + ']');
        } else if (patt.type === 'file' && patt.content) {
          promptParts.push('[Attached file: ' + patt.name + ']\n```\n' + patt.content + '\n```');
        }
      }
      if (newText) promptParts.push(newText);
      var editPrompt = promptParts.join('\n\n');

      // Transition turn state and render (message node already created by editMessage)
      store.turnState.transition('user_send');
      chatManager.saveToDisk(projectName);
      ChatRenderer.renderFullChat(store.tree, store.turnState, projectName, chatCallbacks);

      // Clear input
      pendingAttachments = [];
      renderAttachmentPreview();
      $('#chat-input').value = '';
      restoreProjectUI(store.turnState);

      // Send directly to backend — don't go through sendMessage() which would create a duplicate node
      getPS(projectName)._lastEventTime = Date.now();
      window.api.sendMessage(editPrompt, projectName);
    });
  },

  onSwitchBranch: function (parentId, childIndex) {
    if (!state.activeProject) return;
    var store = chatManager.getOrCreate(state.activeProject);
    if (store.turnState.isGenerating()) return;

    store.tree.switchBranch(parentId, childIndex);
    window.api.clearAIHistory(state.activeProject);
    chatManager.saveToDisk(state.activeProject);
    ChatRenderer.renderFullChat(store.tree, store.turnState, state.activeProject, chatCallbacks);
  },

  onChipClick: function (chipText) {
    $('#chat-input').value = chipText;
    $('#send-btn').disabled = false;
    sendMessage();
  },
};

function getPS(projectName) {
  if (!state.projectState[projectName]) {
    state.projectState[projectName] = {
      devServerUrl: null,
      devServerStarting: false,
      deployedUrl: null,
    };
  }
  return state.projectState[projectName];
}

var _nullPS = {
  devServerUrl: null,
  devServerStarting: false,
  deployedUrl: null,
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
      var logEl = $('#setup-log');
      if (logEl) { logEl.classList.remove('hidden'); logEl.textContent = ''; }
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
        } else if (evt.type === 'error' || evt.type === 'warning') {
          if (logEl) {
            var line = document.createElement('div');
            line.className = evt.type === 'error' ? 'setup-log-error' : 'setup-log-warn';
            line.textContent = evt.message;
            logEl.appendChild(line);
            logEl.scrollTop = logEl.scrollHeight;
          }
        } else if (evt.type === 'log') {
          if (logEl) {
            var text = evt.message.replace(/\n+$/, '');
            if (text) {
              var span = document.createElement('div');
              span.className = 'setup-log-line';
              span.textContent = text;
              logEl.appendChild(span);
              while (logEl.childNodes.length > 100) logEl.removeChild(logEl.firstChild);
              logEl.scrollTop = logEl.scrollHeight;
            }
          }
        } else if (evt.type === 'done') {
          installBtn.classList.add('hidden');
          if (logEl && logEl.childNodes.length === 0) logEl.classList.add('hidden');
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

  // Initialize chat state manager
  if (!chatManager) chatManager = new ChatState.ChatStateManager();

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
  $('#settings-btn').addEventListener('click', openSettings);
  $('#project-settings-btn').addEventListener('click', openProjectSettings);
  $('#attach-btn').addEventListener('click', attachFiles);
  $('#launch-app-btn').addEventListener('click', launchApp);

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
    var store = chatManager.getOrCreate(evtProject);
    var ps = getPS(evtProject);

    // Reset safety timer on every event
    ps._lastEventTime = Date.now();

    switch (event.type) {
      case 'text': {
        store.turnState.transition('text');
        var streamNode = store.tree.getStreamingNode();
        if (!streamNode) {
          var parentId = store.tree.getActiveLeafId();
          streamNode = store.tree.addMessage(parentId, 'assistant', [], 'streaming');
        }
        store.tree.appendTextDelta(streamNode.id, event.text);
        if (isActive) ChatRenderer.renderDelta(streamNode.id, store.tree, store.turnState, chatCallbacks);
        break;
      }
      case 'codex_message': {
        store.turnState.transition('text');
        var cn = store.tree.getStreamingNode();
        if (!cn) {
          var cpid = store.tree.getActiveLeafId();
          cn = store.tree.addMessage(cpid, 'assistant', [], 'streaming');
        }
        store.tree.appendTextDelta(cn.id, event.text);
        if (isActive) ChatRenderer.renderDelta(cn.id, store.tree, store.turnState, chatCallbacks);
        break;
      }
      case 'tool':
      case 'tool_use': {
        store.turnState.transition('tool_use');
        var sn = store.tree.getStreamingNode();
        if (!sn) {
          var pid = store.tree.getActiveLeafId();
          sn = store.tree.addMessage(pid, 'assistant', [], 'streaming');
        }
        store.tree.appendContentBlock(sn.id, ChatState.toolBlock(event.name || 'tool', event.text || event.input || ''));
        if (isActive) ChatRenderer.renderDelta(sn.id, store.tree, store.turnState, chatCallbacks);
        break;
      }
      case 'done': {
        store.turnState.transition('done');
        var dn = store.tree.getStreamingNode();
        if (dn) {
          if (event.cost) dn.metadata.cost_usd = event.cost;
          if (event.duration) dn.metadata.duration_ms = event.duration;
          store.tree.finalizeNode(dn.id);
        }
        chatManager.saveToDisk(evtProject);
        if (!isActive) { ps.hasNewActivity = true; }
        if (isActive) {
          ChatRenderer.renderFullChat(store.tree, store.turnState, evtProject, chatCallbacks);
          restoreProjectUI(store.turnState);
          // Auto-launch the app after AI finishes
          window.api.launchApp(evtProject);
        }
        // Process queue
        if (store.messageQueue.length > 0) {
          var next = store.messageQueue.shift();
          store.turnState.transition('user_send');
          window.api.sendMessage(next, evtProject);
        }
        break;
      }
      case 'error': {
        store.turnState.transition('error');
        var en = store.tree.getStreamingNode();
        if (en) {
          store.tree.appendContentBlock(en.id, ChatState.errorBlock(event.text || 'Unknown error'));
          store.tree.finalizeNode(en.id, 'error');
        }
        chatManager.saveToDisk(evtProject);
        if (!isActive) ps.hasNewActivity = true;
        if (isActive) {
          ChatRenderer.renderFullChat(store.tree, store.turnState, evtProject, chatCallbacks);
          restoreProjectUI(store.turnState);
        }
        break;
      }
      case 'result': {
        var rn = store.tree.getStreamingNode();
        if (rn) {
          if (event.cost) rn.metadata.cost_usd = event.cost;
          if (event.duration) rn.metadata.duration_ms = event.duration;
        }
        break;
      }
      case 'status': {
        var stNode = store.tree.getStreamingNode();
        if (stNode) {
          store.tree.appendContentBlock(stNode.id, ChatState.statusBlock(event.text || ''));
          if (isActive) ChatRenderer.renderDelta(stNode.id, store.tree, store.turnState, chatCallbacks);
        }
        break;
      }
      case 'rate_limit': {
        showRateLimitBanner(evtProject, event.resetInfo);
        return;
      }
    }

    if (isActive) ChatRenderer.scrollToBottom();
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

  // ── App launch/close events ──
  if (window.api.onAppEvent) {
    window.api.onAppEvent(function (evt) {
      if (evt.type === 'launched') {
        addStatusMessage('App launched successfully');
      } else if (evt.type === 'closed') {
        addStatusMessage('App process closed');
      } else if (evt.type === 'error') {
        addStatusMessage('App launch failed: ' + (evt.message || 'Unknown error'));
      }
    });
  }

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
    } else if (chatManager && chatManager.getOrCreate(project.name).turnState.isGenerating()) {
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
  state.activeProject = name;
  await window.api.setActiveProject(name);

  var ps = getPS(name);
  ps.hasNewActivity = false;

  $('#empty-state').classList.add('hidden');
  $('#project-view').classList.remove('hidden');

  try { await window.api.getProjectSettings(name); } catch (e) { /* no settings yet */ }

  // Load chat from disk (handles migration from old format automatically)
  await chatManager.loadFromDisk(name);
  var store = chatManager.getOrCreate(name);

  // Scan recent messages for distribution URLs
  var path = store.tree.getActivePath();
  for (var ri = Math.max(0, path.length - 15); ri < path.length; ri++) {
    var node = path[ri];
    if (node.role === 'assistant') {
      var text = ChatState.getTextContent(node.content);
      if (text) {
        if (!ps.deployedUrl) {
          var ghMatch = text.match(/https:\/\/github\.com\/[^\s),]+\/releases[^\s),]*/i);
          if (ghMatch) ps.deployedUrl = ghMatch[0].replace(/[.,!;:]+$/, '');
        }
        if (!ps.landingUrl) {
          var pgMatch = text.match(/https:\/\/[a-z0-9][-a-z0-9]*\.pages\.dev/i);
          if (pgMatch) ps.landingUrl = pgMatch[0].replace(/[.,!;:]+$/, '');
        }
      }
    }
  }

  ChatRenderer.renderFullChat(store.tree, store.turnState, name, chatCallbacks);
  restoreProjectUI(store.turnState);
  renderProjectList();
  checkDevServer();
  updateDistributeButton(ps.deployedUrl || null);

  $('#chat-input').focus();
}

/** Restore all UI elements to match the given turn state */
function restoreProjectUI(turnState) {
  var input = $('#chat-input');
  var sendBtn = $('#send-btn');
  var stopBtn = $('#stop-btn');
  var deployBtn = $('#deploy-btn');
  var isGen = turnState && turnState.isGenerating ? turnState.isGenerating() : false;

  if (isGen) {
    input.disabled = false;
    stopBtn.classList.remove('hidden');
    deployBtn.disabled = true;
  } else {
    input.disabled = false;
    stopBtn.classList.add('hidden');
    deployBtn.disabled = false;
  }
  sendBtn.disabled = !input.value.trim();

  // Restore deploy link
  updateDistributeButton(ps.deployedUrl || null);

  // Show Open Site button if landing URL exists
  var openBtn = document.getElementById('open-site-btn');
  if (ps.landingUrl && openBtn) {
    openBtn.classList.remove('hidden');
    openBtn.onclick = function () { window.api.openExternal(ps.landingUrl); };
  } else if (openBtn) {
    openBtn.classList.add('hidden');
  }
}

async function deleteProject(name) {
  if (!confirm('Delete project "' + name + '"? This cannot be undone.')) return;
  try {
    await window.api.deleteProject(name);
    chatManager.remove(name);
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

  var project = state.activeProject;
  var store = chatManager.getOrCreate(project);

  // Queue message if currently generating
  if (store.turnState.isGenerating()) {
    store.messageQueue.push(text);
    addStatusMessage('Queued — will send after current response');
    input.value = '';
    input.style.height = '';
    return;
  }

  // Build the prompt text — include file contents
  var promptParts = [];
  var contentBlocks = [];

  if (hasAttachments) {
    for (var i = 0; i < pendingAttachments.length; i++) {
      var att = pendingAttachments[i];
      if (att.type === 'image') {
        try {
          var saved = await window.api.saveAttachment(project, att.name, att.dataUrl);
          promptParts.push('[Attached image: ' + saved.relativePath + ']');
          contentBlocks.push({ type: 'attachment', attachType: 'image', name: att.name, dataUrl: att.dataUrl });
        } catch (e) {
          promptParts.push('[Failed to save image: ' + att.name + ']');
        }
      } else if (att.type === 'file') {
        promptParts.push('[Attached file: ' + att.name + ']\n```\n' + att.content + '\n```');
        contentBlocks.push({ type: 'attachment', attachType: 'file', name: att.name });
      }
    }
  }
  if (text) promptParts.push(text);
  var fullPrompt = promptParts.join('\n\n');

  // Add text block
  contentBlocks.push(ChatState.textBlock(text || ('Attached ' + pendingAttachments.length + ' file(s)')));

  // Create user message node in tree
  var parentId = store.tree.getActiveLeafId();
  store.tree.addMessage(parentId, 'user', contentBlocks, 'complete');

  // Transition turn state
  store.turnState.transition('user_send');

  // Save and render
  chatManager.saveToDisk(project);
  ChatRenderer.renderFullChat(store.tree, store.turnState, project, chatCallbacks);

  // Clear input and attachments
  input.value = '';
  input.style.height = '';
  pendingAttachments = [];
  renderAttachmentPreview();
  $('#send-btn').disabled = true;

  var ps = getPS(project);
  ps._lastEventTime = Date.now();
  restoreProjectUI(store.turnState);

  // Safety timeout: 5 min for app generator
  var sendProject = project;
  var safetyTimer = setInterval(function () {
    var st = chatManager.getOrCreate(sendProject);
    if (!st.turnState.isGenerating()) { clearInterval(safetyTimer); return; }
    if (Date.now() - (getPS(sendProject)._lastEventTime || 0) > 300000) {
      clearInterval(safetyTimer);
      st.turnState.transition('stop');
      var streamNode = st.tree.getStreamingNode();
      if (streamNode) st.tree.finalizeNode(streamNode.id);
      chatManager.saveToDisk(sendProject);
      if (state.activeProject === sendProject) {
        ChatRenderer.renderFullChat(st.tree, st.turnState, sendProject, chatCallbacks);
        restoreProjectUI(st.turnState);
      }
      renderProjectList();
    }
  }, 10000);

  try {
    await window.api.sendMessage(fullPrompt, sendProject);
  } catch (err) {
    clearInterval(safetyTimer);
    addStatusMessage('Failed to send: ' + err.message);
    store.turnState.transition('stop');
    restoreProjectUI(store.turnState);
  }
}

async function stopGeneration() {
  if (!state.activeProject) return;
  var store = chatManager.getOrCreate(state.activeProject);
  store.turnState.transition('stop');
  await window.api.stopGeneration(state.activeProject);
  var streamNode = store.tree.getStreamingNode();
  if (streamNode) store.tree.finalizeNode(streamNode.id);
  chatManager.saveToDisk(state.activeProject);
  ChatRenderer.renderFullChat(store.tree, store.turnState, state.activeProject, chatCallbacks);
  restoreProjectUI(store.turnState);
  renderProjectList();
}

function addStatusMessage(text) {
  if (state.activeProject) {
    var store = chatManager.getOrCreate(state.activeProject);
    var parentId = store.tree.getActiveLeafId();
    store.tree.addMessage(parentId, 'status', [ChatState.statusBlock(text)], 'complete');
    ChatRenderer.renderFullChat(store.tree, store.turnState, state.activeProject, chatCallbacks);
  }
  ChatRenderer.scrollToBottom();
}

// ── Dev Server ─────────────────────────────────────���─────────
async function checkDevServer() {
  // No preview panel in App Generator — the AI launches the app directly
  return;

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
    empty.innerHTML = '<p>Your app UI will appear here</p><p class="subtle">The live preview starts after the AI creates your app</p>';
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

// ── Launch App ──────────────────────────────────────────────
function launchApp() {
  if (!state.activeProject) return;
  window.api.launchApp(state.activeProject);
}

function togglePreviewPanel() {
  var body = document.getElementById('preview-body');
  var handle = document.getElementById('resize-handle');
  var btn = document.getElementById('toggle-preview-btn');
  if (!body) return;
  if (body.classList.contains('hidden')) {
    body.classList.remove('hidden');
    if (handle) handle.classList.remove('hidden');
    if (btn) btn.textContent = 'Hide Preview';
  } else {
    body.classList.add('hidden');
    if (handle) handle.classList.add('hidden');
    if (btn) btn.textContent = 'Preview Site';
  }
}

function updateDistributeButton(url) {
  var btn = $('#deploy-btn');
  var liveLink = $('#deploy-live-link');
  aps().deployedUrl = url;

  if (url) {
    btn.textContent = 'Redistribute';
    btn.title = 'Build installer & publish to GitHub';
    if (liveLink) {
      liveLink.classList.remove('hidden');
      liveLink.textContent = 'Latest release';
      liveLink.title = 'Open GitHub release page';
      liveLink.onclick = function (e) {
        e.preventDefault();
        window.api.openExternal(url);
      };
    }
  } else {
    btn.textContent = 'Distribute';
    btn.title = 'Build installer & publish to GitHub';
    if (liveLink) {
      liveLink.classList.add('hidden');
    }
  }
}

/** Scan text for distribution URLs and show in preview */
function detectDeployUrl(text) {
  if (!text) return;

  // Detect GitHub release URL
  var ghReleaseMatch = text.match(/https:\/\/github\.com\/[^\s),]+\/releases[^\s),]*/i);
  if (ghReleaseMatch) {
    var ghUrl = ghReleaseMatch[0].replace(/[.,!;:]+$/, '');
    aps().deployedUrl = ghUrl;
    updateDistributeButton(ghUrl);
  }

  // Detect Cloudflare Pages / landing page URL
  var pagesMatch = text.match(/https:\/\/[a-z0-9][-a-z0-9]*\.pages\.dev/i);
  var siteMatch = text.match(/download page[:\s]+(https:\/\/[^\s,)]+)/i) ||
                  text.match(/landing page[:\s]+(https:\/\/[^\s,)]+)/i) ||
                  text.match(/live at[:\s]+(https:\/\/[^\s,)]+)/i);
  var siteUrl = (siteMatch && siteMatch[1]) || (pagesMatch && pagesMatch[0]);
  if (siteUrl) {
    siteUrl = siteUrl.replace(/[.,!;:]+$/, '');
    aps().landingUrl = siteUrl;
    // Show Open Site button
    var openBtn = document.getElementById('open-site-btn');
    if (openBtn) {
      openBtn.classList.remove('hidden');
      openBtn.onclick = function () { window.api.openExternal(siteUrl); };
    }
  }
}

function deploy() {
  if (!state.activeProject) return;
  if (chatManager && chatManager.getOrCreate(state.activeProject).turnState.isGenerating()) return;
  // Send deploy as a chat message so the AI handles it
  var input = $('#chat-input');
  input.value = 'Distribute this app. You must do ALL of these: 1) Make sure the app has auto-update capability via electron-updater. 2) Bump the version number in package.json (increment the patch version from whatever it currently is). 3) Build the Windows installer with electron-builder. 4) Create a GitHub repo (if it does not exist), push the code, tag with the new version, and create a GitHub Release with the installer attached. 5) Create .github/workflows/build.yml that auto-builds for Windows, macOS, and Linux when a tag is pushed, then push it. 6) Build a professional download/landing page and deploy it to Cloudflare Pages. Give me the download page URL and GitHub release URL when done.';
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
}

async function openProjectSettings() {
  if (!state.activeProject) return;

  var settings = await window.api.getProjectSettings(state.activeProject);
  $('#ps-dev-command').value = settings.devCommand || '';
  $('#ps-build-command').value = settings.buildCommand || '';
  $('#ps-dev-timeout').value = settings.devTimeout || 120;
  $('#ps-framework').value = settings.framework || '';
  $('#ps-target-platform').value = settings.targetPlatform || 'all';

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

  $('#project-settings-title').textContent = 'Project Settings — ' + state.activeProject;
  $('#project-settings-modal').classList.remove('hidden');
}

function closeProjectSettings() {
  $('#project-settings-modal').classList.add('hidden');
}

async function saveProjectSettings() {
  if (!state.activeProject) return;

  var newSettings = {
    devCommand: $('#ps-dev-command').value.trim(),
    buildCommand: $('#ps-build-command').value.trim(),
    devTimeout: parseInt($('#ps-dev-timeout').value, 10) || 120,
    framework: $('#ps-framework').value.trim(),
    targetPlatform: $('#ps-target-platform').value,
    backend: $('#ps-backend').value,
    claudeModel: $('#ps-claude-model').value,
    codexModel: $('#ps-codex-model').value,
  };

  await window.api.setProjectSettings(state.activeProject, newSettings);

  closeProjectSettings();
  addStatusMessage('Project settings saved');
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

// ── Markdown Renderer (moved to chat-renderer.js) ───────────
// Legacy stub — kept only for non-chat code that might call renderMarkdown.
// The real implementation is in ChatRenderer.renderMarkdown.
function renderMarkdown(text) {
  return ChatRenderer.renderMarkdown(text);
}

function scrollToBottom() {
  ChatRenderer.scrollToBottom();
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
