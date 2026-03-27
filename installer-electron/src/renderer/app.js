// ============================================================
// Website Generator - Electron Installer (Renderer)
// Wizard state machine and DOM manipulation
// ============================================================

const STEP_NAMES = ['Setup', 'Choose AI', 'Choose Editor', 'Accounts', 'Install Tools', 'GitHub', 'Cloudflare', 'AI Setup', 'All Done!'];
const TOTAL_STEPS = STEP_NAMES.length; // 0-8

let state = {
  step: 0,
  chosenAI: 'codex',
  chosenEditor: 'VS Code',
  userName: '',
  userEmail: '',
  adminName: '',
  pronouns: 'she',
  isForSelf: true,
  installDir: '',
  toolsDone: false,
  platformInfo: null,
};

// ---- DOM helpers ----
function el(id) { return document.getElementById(id); }

function createEl(tag, className, textContent) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (textContent) e.textContent = textContent;
  return e;
}

// ---- Init ----
(async function init() {
  state.platformInfo = await window.installer.getPlatformInfo();
  state.installDir = state.platformInfo.defaultInstallDir;

  el('installDir').value = state.installDir;

  if (state.platformInfo.isDryRun) {
    el('dry-run-banner').style.display = 'block';
    const appEl = document.querySelector('.app');
    appEl.style.marginTop = '28px';
    appEl.classList.add('with-banner');
    el('log-panel').style.display = 'block';
  }

  buildSidebar();
  setupEventListeners();
  showStep(0);
})();

// ---- Sidebar ----
function buildSidebar() {
  const container = el('sidebar-steps');
  container.textContent = '';
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const step = createEl('div', 'sidebar-step');
    step.id = `sidebar-step-${i}`;

    const circle = createEl('div', 'step-circle', i === 0 ? '*' : String(i));
    circle.id = `circle-${i}`;

    const label = createEl('span', 'step-label', STEP_NAMES[i]);
    label.id = `label-${i}`;

    step.appendChild(circle);
    step.appendChild(label);
    container.appendChild(step);
  }
}

function updateSidebar(current) {
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const circle = el(`circle-${i}`);
    const label = el(`label-${i}`);
    if (i < current) {
      circle.className = 'step-circle done';
      circle.textContent = '\u2713';
      label.className = 'step-label';
    } else if (i === current) {
      circle.className = 'step-circle active';
      circle.textContent = i === 0 ? '*' : String(i);
      label.className = 'step-label active';
    } else {
      circle.className = 'step-circle';
      circle.textContent = i === 0 ? '*' : String(i);
      label.className = 'step-label';
    }
  }
  el('sidebar-user').textContent = state.userName || '';
  el('sidebar-email').textContent = state.userEmail || '';
}

// ---- Navigation ----
function showStep(s) {
  state.step = s;

  for (let i = 0; i < TOTAL_STEPS; i++) {
    const page = el(`page-${i}`);
    if (page) page.style.display = i === s ? 'block' : 'none';
  }

  el('btn-back').style.visibility = s > 0 ? 'visible' : 'hidden';

  const btnNext = el('btn-next');
  btnNext.disabled = false;

  switch (s) {
    case 0: case 1: case 2: case 3: case 5: case 6:
      btnNext.textContent = 'Next'; break;
    case 4:
      btnNext.textContent = state.toolsDone ? 'Next' : 'Install Everything'; break;
    case 7:
      if (state.chosenAI === 'claude') { btnNext.disabled = true; btnNext.textContent = 'Installing...'; }
      else { btnNext.textContent = 'Next'; }
      break;
    case 8:
      btnNext.textContent = 'Open My Workspace';
      el('btn-back').style.visibility = 'hidden';
      break;
  }

  updateSidebar(s);
  onStepEnter(s);
}

function onStepEnter(s) {
  switch (s) {
    case 2: updateEditorPage(); break;
    case 3: updateAccountsPage(); break;
    case 4: updateToolsPage(); break;
    case 5: checkGitHubAuth(); break;
    case 6: checkCloudflareAuth(); break;
    case 7: updateAISetupPage(); break;
    case 8: updateDonePage(); break;
  }
}

// ---- Event Listeners ----
function setupEventListeners() {
  el('btn-next').addEventListener('click', onNext);
  el('btn-back').addEventListener('click', () => { if (state.step > 0) showStep(state.step - 1); });

  // Setup type toggle
  document.querySelectorAll('input[name="setupType"]').forEach(input => {
    input.addEventListener('change', () => {
      state.isForSelf = input.value === 'self';
      el('admin-card').style.display = state.isForSelf ? 'none' : 'block';
    });
  });

  // Browse directory
  el('btn-browse').addEventListener('click', async () => {
    const dir = await window.installer.selectDirectory(state.installDir);
    if (dir) { state.installDir = dir; el('installDir').value = dir; }
  });

  // AI card selection
  document.querySelectorAll('.card-selectable[data-ai]').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.card-selectable[data-ai]').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      card.querySelector('.card-radio').checked = true;
      state.chosenAI = card.dataset.ai;
    });
  });
  document.querySelector('.card-selectable[data-ai="codex"]').classList.add('selected');

  // Editor card selection
  document.querySelectorAll('.card-selectable[data-editor]').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.card-selectable[data-editor]').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      card.querySelector('.card-radio').checked = true;
      state.chosenEditor = card.dataset.editor;
    });
  });
  document.querySelector('.card-selectable[data-editor="VS Code"]').classList.add('selected');

  // Account links
  document.querySelectorAll('.link[data-url]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.installer.openExternal(link.dataset.url);
    });
  });

  // Auth buttons
  el('btn-gh').addEventListener('click', () => runAuth('github'));
  el('btn-cf').addEventListener('click', () => runAuth('cloudflare'));

  // Homebrew install
  const brewBtn = el('btn-homebrew');
  if (brewBtn) brewBtn.addEventListener('click', async () => { await window.installer.installHomebrew(); });

  // Log panel toggle
  const logToggle = el('log-toggle');
  if (logToggle) logToggle.addEventListener('click', () => {
    const body = el('log-body');
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  });

  // Progress events from main process
  window.installer.onProgress(handleProgress);
  window.installer.onCommandLog(handleLog);
}

// ---- Step 0: Validate user info ----
function validateUserInfo() {
  const name = el('userName').value.trim();
  const email = el('userEmail').value.trim();
  if (!name) { alert('Please enter a first name.'); return false; }
  if (!email || !email.includes('@')) { alert('Please enter a valid email address.'); return false; }
  if (!state.isForSelf) {
    const admin = el('adminName').value.trim();
    if (!admin) { alert('Please enter your name (the helper).'); return false; }
    state.adminName = admin;
  }
  state.userName = name;
  state.userEmail = email;
  state.adminName = state.isForSelf ? name : el('adminName').value.trim();
  state.pronouns = document.querySelector('input[name="pronouns"]:checked').value;
  state.installDir = el('installDir').value;
  return true;
}

// ---- Next button handler ----
async function onNext() {
  switch (state.step) {
    case 0:
      if (!validateUserInfo()) return;
      const pronounMap = {
        she: { subject: 'She', object: 'her', possessive: 'her' },
        he: { subject: 'He', object: 'him', possessive: 'his' },
        they: { subject: 'They', object: 'them', possessive: 'their' },
      };
      const p = pronounMap[state.pronouns];
      await window.installer.generateConfigs(state.installDir, {
        userName: state.userName,
        userEmail: state.userEmail,
        adminName: state.adminName,
        pronounSubject: p.subject,
        pronounObject: p.object,
        pronounPossessive: p.possessive,
        editorName: 'your editor',
        installDir: state.installDir,
      });
      showStep(1);
      break;
    case 1: showStep(2); break;
    case 2: showStep(3); break;
    case 3: showStep(4); break;
    case 4:
      if (state.toolsDone) { showStep(5); }
      else { installAllTools(); }
      break;
    case 5: showStep(6); break;
    case 6: showStep(7); break;
    case 7: showStep(8); break;
    case 8:
      const sep = state.installDir.includes('\\') ? '\\' : '/';
      const wsFile = state.installDir + sep + 'Website Generator.code-workspace';
      await window.installer.openWorkspace(state.chosenEditor, wsFile);
      window.close();
      break;
  }
}

// ---- Step 2: Editor page ----
function updateEditorPage() {
  const subtitle = el('editor-subtitle');
  if (state.chosenAI === 'cursor') {
    subtitle.textContent = "Since you chose Cursor as your AI, it comes with its own editor. You can still use VS Code if you prefer.";
    document.querySelector('.card-selectable[data-editor="Cursor"]').click();
  } else {
    subtitle.textContent = "This is the app where you'll talk to the AI and see your projects. VS Code is recommended for most people.";
  }
}

// ---- Step 3: Accounts page ----
function updateAccountsPage() {
  const title = el('ai-acct-title');
  const desc = el('ai-acct-desc');
  const link = el('ai-acct-link');

  switch (state.chosenAI) {
    case 'codex':
      title.textContent = '3. ChatGPT Pro Subscription';
      desc.textContent = 'Codex needs a ChatGPT Pro account ($20/month). Sign up or upgrade your existing ChatGPT account.';
      link.textContent = 'Click here to go to chatgpt.com';
      link.dataset.url = 'https://chatgpt.com/';
      break;
    case 'claude':
      title.textContent = '3. Claude Account';
      desc.textContent = 'Claude Code works with a Claude Max subscription ($20/month) or pay-per-use API credits. Either works.';
      link.textContent = 'Click here to go to claude.ai';
      link.dataset.url = 'https://claude.ai/';
      break;
    case 'cursor':
      title.textContent = '3. Cursor Account';
      desc.textContent = "Cursor has a free tier to start. Sign up when you first open the app. You can upgrade to Pro later for unlimited AI usage.";
      link.textContent = 'Click here to go to cursor.com';
      link.dataset.url = 'https://cursor.com/';
      break;
  }
  link.onclick = (e) => { e.preventDefault(); window.installer.openExternal(link.dataset.url); };
}

// ---- Step 4: Tools page ----
function updateToolsPage() {
  el('editor-tool-name').textContent = state.chosenEditor;
  if (state.platformInfo.os === 'macos' && !state.platformInfo.homebrewInstalled) {
    el('homebrew-card').style.display = 'block';
  }
}

const TOOL_STATUS_MAP = {
  node: { dot: 'dot-node', status: 'status-node' },
  git: { dot: 'dot-git', status: 'status-git' },
  gh: { dot: 'dot-gh', status: 'status-gh' },
  wrangler: { dot: 'dot-wrangler', status: 'status-wrangler' },
  editor: { dot: 'dot-editor', status: 'status-editor' },
};

async function installAllTools() {
  const btnNext = el('btn-next');
  const btnBack = el('btn-back');
  btnNext.disabled = true; btnNext.textContent = 'Installing...';
  btnBack.style.visibility = 'hidden';

  const editorKey = state.chosenEditor === 'Cursor' ? 'cursor' : 'vscode';
  const toolList = [
    { key: 'node', label: 'Node.js' },
    { key: 'git', label: 'Git' },
    { key: 'gh', label: 'GitHub CLI' },
    { key: 'wrangler', label: 'Wrangler' },
    { key: editorKey, label: state.chosenEditor },
  ];

  await window.installer.installTools(toolList, state.userName, state.userEmail, state.chosenEditor);
  state.toolsDone = true;
}

function handleProgress(data) {
  if (data.tool === 'done') {
    el('install-bar').style.width = '100%';
    el('install-status').textContent = 'All done!';
    el('btn-next').disabled = false;
    el('btn-next').textContent = 'Next';
    el('btn-back').style.visibility = 'visible';
    return;
  }

  let uiKey = data.tool;
  if (data.tool === 'vscode' || data.tool === 'cursor') uiKey = 'editor';
  if (data.tool === 'gitconfig') uiKey = null;

  const statusColors = { checking: 'warn', installing: 'warn', installed: 'success', failed: 'danger', configuring: 'warn' };
  const statusTexts = { checking: 'Checking...', installing: 'Installing...', installed: 'Installed', failed: 'Failed', configuring: 'Configuring...' };

  if (uiKey && TOOL_STATUS_MAP[uiKey]) {
    const dot = el(TOOL_STATUS_MAP[uiKey].dot);
    const status = el(TOOL_STATUS_MAP[uiKey].status);
    dot.className = 'dot ' + (statusColors[data.status] || '');
    status.textContent = statusTexts[data.status] || data.status;
    status.style.color = 'var(--' + (statusColors[data.status] || 'text3') + ')';
  }

  if (data.progress !== undefined) {
    el('install-bar').style.width = (data.progress * 100) + '%';
    el('install-status').textContent = data.label ? (statusTexts[data.status] || '') + ' ' + data.label + '...' : '';
  }

  // Claude Code install progress (step 7)
  if (data.tool === 'claude' && state.step === 7) {
    const dot = el('ai-setup-dot');
    const status = el('ai-setup-status');
    const bar = el('ai-setup-bar');
    dot.className = 'dot ' + (statusColors[data.status] || '');

    if (data.status === 'checking') {
      status.textContent = 'Checking if Claude Code is installed...';
      bar.style.width = '10%';
    } else if (data.status === 'installing') {
      status.textContent = 'Installing Claude Code (this may take a minute)...';
      bar.style.width = '30%';
    } else if (data.status === 'installed') {
      status.textContent = 'Claude Code installed!';
      status.style.color = 'var(--success)';
      bar.style.width = '60%';
      launchClaudeAfterInstall();
    } else if (data.status === 'failed') {
      status.textContent = data.error || 'Install failed';
      status.style.color = 'var(--danger)';
      el('btn-next').disabled = false;
      el('btn-next').textContent = 'Next';
    }
  }
}

async function launchClaudeAfterInstall() {
  const status = el('ai-setup-status');
  const bar = el('ai-setup-bar');
  const dot = el('ai-setup-dot');

  status.textContent = 'Opening Claude Code - sign in with your browser...';
  bar.style.width = '80%';

  await window.installer.launchClaude(state.installDir);

  setTimeout(() => {
    bar.style.width = '100%';
    status.textContent = 'Claude Code is open! Sign in with your browser, then come back and click Next.';
    status.style.color = 'var(--success)';
    dot.className = 'dot success';
    el('btn-next').disabled = false;
    el('btn-next').textContent = 'Next';
  }, 2000);
}

// ---- Step 5 & 6: Auth ----
async function checkGitHubAuth() {
  const result = await window.installer.checkAuth('github');
  if (result.authenticated) setAuthConnected('gh');
}

async function checkCloudflareAuth() {
  const result = await window.installer.checkAuth('cloudflare');
  if (result.authenticated) setAuthConnected('cf');
}

async function runAuth(service) {
  const prefix = service === 'github' ? 'gh' : 'cf';
  const btn = el('btn-' + prefix);
  const dot = el(prefix + '-dot');
  const text = el(prefix + '-text');

  btn.disabled = true; btn.textContent = 'Waiting...';
  dot.className = 'dot warn';
  text.textContent = 'Check your browser...';
  text.className = 'auth-text';

  await window.installer.runAuth(service);

  // Poll for auth completion
  let attempts = 0;
  const poll = setInterval(async () => {
    attempts++;
    const result = await window.installer.checkAuth(service);
    if (result.authenticated) {
      clearInterval(poll);
      setAuthConnected(prefix);
    } else if (attempts > 40) {
      clearInterval(poll);
      dot.className = 'dot danger';
      text.textContent = 'Not connected yet - try again';
      text.className = 'auth-text danger';
      btn.disabled = false; btn.textContent = 'Retry';
    }
  }, 3000);
}

function setAuthConnected(prefix) {
  el(prefix + '-dot').className = 'dot success';
  const text = el(prefix + '-text');
  text.textContent = 'Connected!';
  text.className = 'auth-text success';
  const btn = el('btn-' + prefix);
  btn.textContent = 'Connected'; btn.disabled = true;
  el(prefix + '-card').classList.add('card-success');
}

// ---- Step 7: AI Setup ----
function updateAISetupPage() {
  const stepsContainer = el('ai-setup-steps');
  const progressCard = el('ai-setup-progress');
  const title = el('ai-setup-title');
  const subtitle = el('ai-setup-subtitle');
  const tip = el('ai-setup-tip');

  stepsContainer.textContent = '';
  progressCard.style.display = 'none';

  switch (state.chosenAI) {
    case 'codex':
      title.textContent = 'Set Up Codex';
      subtitle.textContent = 'Almost done! Just install the Codex extension in your editor and sign in.';
      addStepItems(stepsContainer, [
        'Open ' + state.chosenEditor,
        "Go to the Extensions panel (click the puzzle piece icon on the left, or press Ctrl+Shift+X)",
        "Search for 'Codex' and install the official OpenAI extension",
        "Click 'Sign In' in the Codex panel and log in with your ChatGPT account",
        "That's it! The Codex chat panel appears in the sidebar",
      ]);
      tip.textContent = "When Codex asks for a permission level, choose 'Agent (Full Access)' so it can build and deploy without asking you for every little thing.";
      break;

    case 'claude':
      title.textContent = 'Setting Up Claude Code';
      subtitle.textContent = 'Sit tight - installing Claude Code and opening it for you automatically.';
      addStepItems(stepsContainer, [
        'Installing Claude Code on your computer',
        'Opening Claude Code - a window will pop up',
        'Sign in with your browser when it asks (just click Authorize)',
        "Come back here and click Next when you're signed in",
      ]);
      progressCard.style.display = 'block';
      tip.textContent = 'You can also use Claude Code inside VS Code with the Claude Code extension. Search for it in the Extensions panel after setup.';
      installClaudeCode();
      break;

    case 'cursor':
      title.textContent = 'Set Up Cursor';
      subtitle.textContent = "Almost done! Cursor has AI built right in. Just sign in.";
      addStepItems(stepsContainer, [
        'Open Cursor (it should already be installed from the previous step)',
        'When it asks you to sign in, create a Cursor account or log in',
        'Open your workspace: File, then Open Folder, then pick your websites folder',
        "The AI chat panel is already in the sidebar - start chatting!",
      ]);
      tip.textContent = "Cursor's free tier gives you limited AI usage. If you run out, you can upgrade to Pro for unlimited usage, or switch to a different AI tool. Your workspace works with all of them.";
      break;
  }
}

function addStepItems(container, steps) {
  steps.forEach((text, i) => {
    const div = createEl('div', 'step-item');
    const num = createEl('div', 'step-num', String(i + 1));
    const span = createEl('span', null, text);
    div.appendChild(num);
    div.appendChild(span);
    container.appendChild(div);
  });
}

async function installClaudeCode() {
  await window.installer.installClaude();
}

// ---- Step 8: Done ----
function updateDonePage() {
  el('done-subtitle').textContent = 'Everything is set up for ' + state.userName + '. Time to build some websites!';
  const osType = state.platformInfo.os;
  if (osType === 'macos' || osType === 'linux') {
    el('done-s1').textContent = 'Open the "Website Generator" workspace from your install folder';
  } else {
    el('done-s1').textContent = 'Double-click "Website Generator" on your desktop';
  }
}

// ---- Dry-run log ----
function handleLog(entry) {
  const logBody = el('log-body');
  if (!logBody) return;
  const div = createEl('div', 'log-entry');
  const prefix = entry.dryRun ? '[DRY RUN] ' : '';
  div.textContent = prefix + entry.cmd;
  logBody.appendChild(div);
  logBody.scrollTop = logBody.scrollHeight;
}
