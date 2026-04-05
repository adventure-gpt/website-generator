const { spawn } = require('child_process');

// Ensure Homebrew paths and ~/.local/bin are in PATH on macOS
if (process.platform === 'darwin') {
  const os = require('os');
  const path = require('path');
  const localBin = path.join(os.homedir(), '.local', 'bin');
  const extra = [localBin, '/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin'];
  const current = process.env.PATH || '';
  const missing = extra.filter(p => !current.split(':').includes(p));
  if (missing.length) process.env.PATH = missing.join(':') + ':' + current;
}

const CLAUDE_MODELS = [
  { id: 'opus', label: 'Claude Opus 4.6 (Most powerful)', pricing: '$15 / $75 per 1M tokens' },
  { id: 'sonnet', label: 'Claude Sonnet 4.6 (Fast + capable)', pricing: '$3 / $15 per 1M tokens' },
  { id: 'haiku', label: 'Claude Haiku 4.5 (Lightweight)', pricing: '$0.80 / $4 per 1M tokens' },
  { id: 'opusplan', label: 'Opus + Sonnet hybrid (Auto-switches)', pricing: 'Varies by task' },
];

const CODEX_MODELS = [
  { id: 'gpt-5.4', label: 'GPT-5.4 (Most powerful)', pricing: '$10 / $40 per 1M tokens' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex (Best for coding)', pricing: '$2.50 / $10 per 1M tokens' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini (Faster, lower cost)', pricing: '$0.40 / $1.60 per 1M tokens' },
  { id: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark (Near-instant)', pricing: '$0.15 / $0.60 per 1M tokens' },
];

class AIBackend {
  constructor() {
    this.backend = 'claude';
    this.claudeModel = 'opus';
    this.codexModel = 'gpt-5.4';
    this.activeProcesses = new Map(); // projectName → child process
    this.conversationHistory = new Map();
    this.sessionStarted = new Set(); // Projects that have an active Claude session
  }

  /**
   * Returns a user-friendly error message when a CLI tool can't be found.
   */
  friendlySpawnError(err, toolName) {
    if (err.code === 'ENOENT' || (err.message && err.message.includes('ENOENT'))) {
      return `${toolName} is not installed or not in your PATH. Go to the setup screen to install it, or install it manually.`;
    }
    return err.message;
  }

  setBackend(backend) {
    this.backend = backend;
  }

  getBackend() {
    return this.backend;
  }

  setClaudeModel(model) { this.claudeModel = model; }
  getClaudeModel() { return this.claudeModel; }
  setCodexModel(model) { this.codexModel = model; }
  getCodexModel() { return this.codexModel; }
  static getClaudeModels() { return CLAUDE_MODELS; }
  static getCodexModels() { return CODEX_MODELS; }

  async send(message, projectPath, projectName, onEvent, projectSettings, chatHistory, backendConfig) {
    // Stop any existing process for THIS project only (not others)
    if (this.activeProcesses.has(projectName)) {
      this.stopProject(projectName);
    }

    // Resolve effective backend/model — per-project overrides global defaults
    const effectiveBackend = (backendConfig && backendConfig.backend) || this.backend;
    const effectiveModel = effectiveBackend === 'claude'
      ? ((backendConfig && backendConfig.claudeModel) || this.claudeModel)
      : ((backendConfig && backendConfig.codexModel) || this.codexModel);

    let history = this.conversationHistory.get(projectName) || [];
    if (history.length === 0 && chatHistory && chatHistory.length > 0) {
      history = chatHistory.map(m => ({ role: m.role, content: (m.content || '').substring(0, 500) }));
    }
    history.push({ role: 'user', content: message });
    this.conversationHistory.set(projectName, history);

    let contextPrompt = this.buildPrompt(history, projectSettings);

    // System instructions — placed FIRST so the AI sees them before anything else
    const systemRules = `=== YOUR ENVIRONMENT — APP GENERATOR DESKTOP APP ===

You are running inside the "App Generator" desktop app — an Electron application with a chat panel (where you talk to the user) and a sidebar (where they switch between projects). There is NO preview panel — desktop apps can't be iframed, so when you finish writing code, the app launches the generated Electron app in its own window for the user to test. Never tell the user to "check the preview" or describe a preview panel — it doesn't exist.

You are building ELECTRON DESKTOP APPS, not websites.

CONVERSATION FLOW — BUILD IN PHASES, NOT ALL AT ONCE:

Phase 1 — UNDERSTAND (before writing any code). You MUST ask ALL of these across 2-3 messages:
- Features: What should the app do? What tools/features?
- Vibe/style: What look and feel? Colors? Dark mode?
- Monetization (MANDATORY): "Are you planning to charge for this or keep it free?" (free, one-time purchase, subscription, ads, in-app purchases)
- Open/closed source (MANDATORY): "Should the code be open source (public) or private?" Connect to monetization: "Since you want to charge, you might want to keep the code private."
- License (MANDATORY): "What license? MIT is simplest — or I can explain the options." If private and monetized, suggest "All rights reserved" or no license.
- Spread these naturally across a couple messages. Dont dump everything at once.
- Example flow: Message 1: "Sounds fun! What kind of tools? What vibe?" → User answers → Message 2: "Nice! Are you planning to charge for this? And should the code be open source or private?" → User answers → Message 3: "Got it! Last thing — what license? MIT is the most common, but since you want to charge I might suggest keeping it private with all rights reserved. Sound good?" → Build.
- If they gave a very detailed spec, you can combine questions. But NEVER skip monetization, source privacy, or licensing.

IF THEY WANT TO CHARGE MONEY — you MUST cover ALL of these topics before building. They can defer the SETUP of any item to later, but they must HEAR about each one first. Go through them one at a time:

1. Payment processing — explain Stripe specifically: what it is, how fees work (2.9% + 30c per transaction, no monthly fee, payouts to bank). They can set it up now or later, but they need to know about it.

2. Terms of Service and Privacy Policy — explain these are legally important for any paid product. You will draft them since you know what the app does. Ask about refund policy (yes/no, timeframe). They can review later but need to know this is coming.

3. Ongoing maintenance — be honest: paying customers expect bug fixes, updates, and a working product. Ask how much time they plan to invest long-term. This isnt gatekeeping, its planning.

4. Marketing — building it is the easy part. How will people find it? Do they have a plan? Side project or serious business? Offer to help with a landing page and download site.

5. Customer support — paying customers will contact them when things break. They need at minimum a support email. Offer to set one up.

The user saying "lets set that up later" for ONE topic does NOT mean skip the rest. Each topic is independent. Cover all five even if they defer the actual setup of some. They need the full picture before you start building.

IF ANY FEATURE REQUIRES A PAID EXTERNAL SERVICE:
- Explain what it does and what it costs with real numbers
- Walk them through signing up and build the integration

DO NOT START BUILDING until all Phase 1 topics are resolved. If the user wants to charge money, you MUST walk through payment setup, TOS, and the reality of selling software BEFORE writing any code. The user should feel fully informed and prepared before you start building.

Phase 2 — BUILD:
- Only proceed here after Phase 1 is complete.
- Build what they described. Say "Building that now..." then work silently.
- When done: "Done! [description]. Take a look!"

Phase 3 — ITERATE:
- Normal back and forth. Fix things, add features, adjust style.

Phase 4 — DISTRIBUTE (when they click Distribute or ask to share/publish):
- Build installer, publish to GitHub, create landing page.
- Respect the open/closed source and license choices from Phase 1.

WHAT YOU MUST DO:
- Write code. Create files. Build the project. Commit with git.
- Structure projects as Electron apps: main process (src/main/), renderer process (src/renderer/), preload scripts.
- When you are done writing code, just say so. The app will automatically launch the Electron app for the user to test.
- If the user reports something broken, fix the CODE silently and say "Fixed! The app should restart now."

LAUNCHING THE APP TO TEST:
- You MAY launch the Electron app to verify it works — but you MUST run it in the background and NEVER wait for it to exit.
- GUI processes like Electron, Vite dev servers, and "npm run dev" only exit when the window closes, which means waiting for them will hang your turn forever.
- If you launch the app, do it as a backgrounded/detached process and immediately continue to your next step. Do not read the output. Do not wait for it.
- The App Generator also auto-launches the app for the user after your turn ends, so launching it yourself is optional — only do it if you need to actively verify something during your turn.
- For compile/syntax verification only, prefer "npm run build" (exits on its own) over launching the app.

WHAT YOU MUST NEVER DO:
- Block on long-running GUI processes. Running "npm run dev", "vite", "npm start", or "npx electron ." in the foreground will hang your tool call forever. Background them or skip them.
- Run interactive auth commands (gh auth login, wrangler login, claude login) — these require browser interaction and will hang. Auth is handled by the app's setup wizard. If a command fails due to auth, tell the user to re-run setup from Settings.
- Everything else (electron-builder, gh release, gh repo, wrangler pages deploy, npm run build, backgrounded dev/launch commands, etc.) is fine to run.

DISTRIBUTION — WHEN THE USER ASKS TO DISTRIBUTE, YOU MUST DO ALL THREE:
1. Build the installer: run "npm run build" then "npx electron-builder --win" (or appropriate platform)
2. Publish to GitHub: "gh repo create" (if needed), push code, "gh release create" with the installer from dist/
3. Build a download/landing page: Check if a landing page already exists (look for a landing/ directory or a separate site project). If one exists, MODIFY it — do NOT replace it. The user may have spent significant time customizing their site. Only create a new landing page if none exists. Deploy via "npx wrangler pages deploy landing/ --project-name [name]-app"
ALL THREE STEPS ARE MANDATORY. Do not skip the landing page.

AFTER DISTRIBUTING — CI MONITORING:
After pushing the GitHub Actions workflow and tags, you MUST check if the CI builds succeeded:
1. Wait 30 seconds, then run: gh run list --repo [owner]/[repo] --limit 1
2. If the run is still in progress, wait another 30 seconds and check again (up to 5 times)
3. If the run failed, run: gh run view [run-id] --repo [owner]/[repo] --log-failed
4. Read the error, fix the workflow or code, commit, push a new tag, and check again
5. Tell the user the status: "Your app is building for all platforms..." or "All platforms are ready!"
Do NOT just push and walk away. You must verify the builds succeed.

=== MANDATORY COMMUNICATION RULES — APPLIES TO EVERY SINGLE MESSAGE YOU SEND ===

You are talking to a NON-TECHNICAL person. This rule applies to EVERY message — first message, follow-up messages, intermediate progress updates, ALL of them. As you work through multiple steps, do NOT get progressively more technical.

FORBIDDEN WORDS/PHRASES (never say these in ANY message):
- Any file name, function name, variable name, or code concept
- Port numbers, error messages, stack traces
- Database, table, schema, migration, endpoint, API, proxy, config
- "Let me check...", "Let me fix...", "Now I need to...", "Let me also...", "Now let me build/deploy/commit"
- Package names like bcryptjs, credentials, fetch, wrangler

HOW TO COMMUNICATE:
- Building something: "Building that now..." → (SILENCE while working — send NO intermediate messages) → "Done! [plain English description]. Take a look!"
- Fixing a bug: "Working on fixing that..." → (SILENCE) → "Fixed! Try again."
- Distributing: (SILENCE) → "Your app is ready to distribute!"
- Multiple steps needed: Say NOTHING between start and finish. Only speak when you have a result the user cares about.

THE MOST COMMON MISTAKE: Sending messages like "Now let me also check the..." or "I found the issue — the X wasn't configured for Y" or "Let me set up the Z binding." These are ALL violations. The user does not care about your process. Work silently.

=== OTHER RULES ===

- NPM: Always use "npm install --legacy-peer-deps".
- DEBUGGING: Understand the problem BEFORE changing code. Read the error. Read the code. Think. Do NOT guess. If your first fix doesn't work, REVERT it before trying something else.
- GIT: Always run "git init && git add -A && git commit" after creating or modifying a project.

=== Read AGENTS.md in the project directory for full technical instructions on the tech stack, Electron architecture, IPC, etc. ===

`;
    contextPrompt = systemRules + contextPrompt;

    const sendFn = effectiveBackend === 'claude'
      ? this.sendClaude.bind(this)
      : this.sendCodex.bind(this);

    try {
      const code = await sendFn(contextPrompt, projectPath, projectName, onEvent, effectiveModel);
      return code;
    } catch (err) {
      onEvent({ type: 'error', text: err.message });
      return 1;
    }
  }

  buildPrompt(history, projectSettings) {
    const parts = [];

    // Inject project settings context so the AI knows the config
    if (projectSettings) {
      const settingsLines = [];
      if (projectSettings.devCommand) settingsLines.push(`Dev command: ${projectSettings.devCommand}`);
      if (projectSettings.buildCommand) settingsLines.push(`Build command: ${projectSettings.buildCommand}`);
      if (projectSettings.electronTarget) settingsLines.push(`Electron target: ${projectSettings.electronTarget}`);

      if (settingsLines.length > 0) {
        parts.push(`Project settings (.appgen/settings.json):\n${settingsLines.join('\n')}\nYou can update these settings by writing to .appgen/settings.json in the project root.`);
      }
    }

    if (history.length <= 1) {
      const msg = history[0].content;
      return parts.length > 0 ? `${parts.join('\n')}\n\n${msg}` : msg;
    }

    const recent = history.slice(-10);
    const current = recent.pop();

    if (recent.length > 0) {
      const context = recent
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 500)}`)
        .join('\n\n');
      parts.push(`Previous conversation context:\n---\n${context}\n---`);
    }

    parts.push(`Current request: ${current.content}`);
    return parts.join('\n\n');
  }

  sendClaude(prompt, cwd, projectName, onEvent, model) {
    return new Promise((resolve, reject) => {
      const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', model || this.claudeModel, '--dangerously-skip-permissions'];
      // Continue existing session for multi-turn conversation with full tool context
      if (this.sessionStarted.has(projectName)) {
        args.push('--continue');
      }
      const env = { ...process.env };
      const child = spawn('claude', args, { cwd, shell: true, stdio: ['pipe', 'pipe', 'pipe'], env });
      this.activeProcesses.set(projectName, child);

      // Send prompt via stdin — handle backpressure for large prompts
      var ok = child.stdin.write(prompt);
      if (!ok) {
        child.stdin.once('drain', () => child.stdin.end());
      } else {
        child.stdin.end();
      }

      let buffer = '';
      let fullText = '';

      child.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          // Detect rate limit messages (plain text, not JSON)
          if (this._isRateLimit(line)) {
            onEvent({ type: 'rate_limit', text: line.trim(), resetInfo: this._parseResetTime(line) });
            continue;
          }
          const parsed = this.parseClaudeEvent(line);
          if (parsed) {
            if (parsed.type === 'text') fullText += parsed.text;
            onEvent(parsed);
          }
        }
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        if (this._isRateLimit(text)) {
          onEvent({ type: 'rate_limit', text: text.trim(), resetInfo: this._parseResetTime(text) });
          return;
        }
        if (!text.includes('ExperimentalWarning') && !text.includes('Debugger')) {
          onEvent({ type: 'status', text: text.trim() });
        }
      });

      child.on('close', (code) => {
        if (this.activeProcesses.get(projectName) === child) {
          this.activeProcesses.delete(projectName);
        }
        if (buffer.trim()) {
          const parsed = this.parseClaudeEvent(buffer);
          if (parsed) {
            if (parsed.type === 'text') fullText += parsed.text;
            onEvent(parsed);
          }
        }
        if (fullText) {
          const hist = this.conversationHistory.get(projectName);
          if (hist) hist.push({ role: 'assistant', content: fullText });
        }
        if (code === 0) {
          this.sessionStarted.add(projectName);
        }
        onEvent({ type: 'done', code });
        resolve(code);
      });

      child.on('error', (err) => {
        if (this.activeProcesses.get(projectName) === child) {
          this.activeProcesses.delete(projectName);
        }
        reject(new Error(this.friendlySpawnError(err, 'Claude Code')));
      });
    });
  }

  parseClaudeEvent(line) {
    try {
      const obj = JSON.parse(line);

      // Anthropic streaming API: content_block_delta
      if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta') {
        return { type: 'text', text: obj.delta.text };
      }
      if (obj.type === 'content_block_start' && obj.content_block?.type === 'tool_use') {
        return { type: 'tool_use', name: obj.content_block.name };
      }

      // Claude Code event format: assistant with message.content array
      if (obj.type === 'assistant') {
        const content = obj.message?.content || obj.content;
        if (Array.isArray(content)) {
          const texts = content.filter((b) => b.type === 'text').map((b) => b.text);
          const tools = content.filter((b) => b.type === 'tool_use');
          if (tools.length > 0) {
            // Emit each tool use individually
            const events = [];
            for (const tool of tools) {
              events.push({ type: 'tool_use', name: tool.name });
            }
            // Return last tool, but first emit text if any
            if (texts.length > 0) return { type: 'text', text: texts.join('') };
            return events[events.length - 1];
          }
          if (texts.length > 0) return { type: 'text', text: texts.join('') };
        }
        if (typeof content === 'string') return { type: 'text', text: content };
      }

      // API errors (overloaded, rate limit, server errors, etc.)
      if (obj.type === 'error' && obj.error) {
        const errType = obj.error.type || '';
        const errMsg = obj.error.message || 'Unknown error';
        if (errType === 'overloaded_error' || errMsg.includes('Overloaded')) {
          return { type: 'rate_limit', text: 'Service is busy right now. Please try again in a moment.' };
        }
        if (errType === 'rate_limit_error' || errMsg.includes('rate limit')) {
          return { type: 'rate_limit', text: errMsg, resetInfo: this._parseResetTime(errMsg) };
        }
        if (errType === 'api_error' || errMsg.includes('Internal server error')) {
          return { type: 'rate_limit', text: 'Service encountered an error. Please try again in a moment.' };
        }
        return null; // Suppress other API errors from showing as text
      }

      // System/status events from Claude Code stream
      if (obj.type === 'system') {
        const msg = obj.message || obj.text || '';
        if (msg) return { type: 'status', text: msg };
      }

      // Result event
      if (obj.type === 'result') {
        return { type: 'result', text: obj.result || obj.text || '', cost: obj.cost_usd, duration: obj.duration_ms };
      }

      // Simple role-based
      if (obj.role === 'assistant' && typeof obj.content === 'string') {
        return { type: 'text', text: obj.content };
      }

      // Fallback text extraction
      if (typeof obj.text === 'string') return { type: 'text', text: obj.text };
      if (typeof obj.content === 'string') return { type: 'text', text: obj.content };

      return null;
    } catch {
      return line.trim() ? { type: 'text', text: line } : null;
    }
  }

  sendCodex(prompt, cwd, projectName, onEvent, model) {
    return new Promise((resolve, reject) => {
      // Codex exec: non-interactive, full write access, JSONL output, strongest model
      // Pass '-' so codex reads the prompt from stdin (avoids shell arg parsing issues)
      const args = [
        'exec',
        '--dangerously-bypass-approvals-and-sandbox',
        '--json',
        '-m', model || this.codexModel,
        '--skip-git-repo-check',
        '-',
      ];
      const env = { ...process.env };
      const child = spawn('codex', args, { cwd, shell: true, stdio: ['pipe', 'pipe', 'pipe'], env });
      this.activeProcesses.set(projectName, child);

      // Handle backpressure for large prompts
      var ok2 = child.stdin.write(prompt);
      if (!ok2) {
        child.stdin.once('drain', () => child.stdin.end());
      } else {
        child.stdin.end();
      }

      let fullText = '';
      let stdoutBuf = '';

      child.stdout.on('data', (data) => {
        stdoutBuf += data.toString();
        // Parse JSONL events line by line
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop(); // keep incomplete line in buffer
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            // Codex JSONL format:
            //   {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
            //   {"type":"item.completed","item":{"type":"tool_call","name":"...","arguments":"..."}}
            //   {"type":"item.completed","item":{"type":"tool_output","output":"..."}}
            if (evt.type === 'item.completed' && evt.item) {
              if (evt.item.type === 'agent_message' && evt.item.text) {
                fullText += evt.item.text;
                onEvent({ type: 'codex_message', text: evt.item.text });
              } else if (evt.item.type === 'tool_call') {
                onEvent({ type: 'tool', name: evt.item.name || 'tool', input: evt.item.arguments || '' });
              }
            }
          } catch {
            // Not JSON — treat as plain text output
            if (line.trim()) {
              fullText += line + '\n';
              onEvent({ type: 'text', text: line + '\n' });
            }
          }
        }
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        if (this._isRateLimit(text)) {
          onEvent({ type: 'rate_limit', text: text.trim(), resetInfo: this._parseResetTime(text) });
          return;
        }
        if (!text.includes('Warning') && !text.includes('ExperimentalWarning')) {
          onEvent({ type: 'status', text: text.trim() });
        }
      });

      child.on('close', (code) => {
        // Flush remaining buffer
        if (stdoutBuf.trim()) {
          try {
            const evt = JSON.parse(stdoutBuf);
            if (evt.type === 'item.completed' && evt.item && evt.item.text) {
              fullText += evt.item.text;
              onEvent({ type: 'text', text: evt.item.text });
            }
          } catch {
            fullText += stdoutBuf;
            onEvent({ type: 'text', text: stdoutBuf });
          }
        }
        if (this.activeProcesses.get(projectName) === child) {
          this.activeProcesses.delete(projectName);
        }
        if (fullText) {
          const hist = this.conversationHistory.get(projectName);
          if (hist) hist.push({ role: 'assistant', content: fullText });
        }
        onEvent({ type: 'done', code });
        resolve(code);
      });

      child.on('error', (err) => {
        if (this.activeProcesses.get(projectName) === child) {
          this.activeProcesses.delete(projectName);
        }
        reject(new Error(this.friendlySpawnError(err, 'Codex CLI')));
      });
    });
  }

  _isRateLimit(text) {
    if (!text) return false;
    return /you've hit your limit/i.test(text) ||
      /usage limit|plan limit/i.test(text) ||
      /overloaded/i.test(text) ||
      /API Error:\s*(429|500|502|503|529)/i.test(text) ||
      /internal server error/i.test(text);
  }

  _parseResetTime(text) {
    // Try to extract reset time like "resets 10pm (America/New_York)"
    var match = text.match(/resets?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if (match) return match[1];
    // Try "retry after X seconds"
    var retryMatch = text.match(/retry\s+after\s+(\d+)\s*s/i);
    if (retryMatch) return retryMatch[1] + 's';
    return null;
  }

  stopProject(projectName) {
    const proc = this.activeProcesses.get(projectName);
    if (!proc) return;
    if (process.platform === 'win32' && proc.pid) {
      try {
        spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
      } catch { /* best effort */ }
    } else {
      proc.kill('SIGTERM');
    }
    this.activeProcesses.delete(projectName);
  }

  stop() {
    // Stop ALL active processes
    for (const [name] of this.activeProcesses) {
      this.stopProject(name);
    }
  }

  isProjectGenerating(projectName) {
    return this.activeProcesses.has(projectName);
  }


  clearHistory(projectName) {
    this.conversationHistory.delete(projectName);
    this.sessionStarted.delete(projectName);
  }
}

module.exports = AIBackend;
