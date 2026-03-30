const { spawn } = require('child_process');

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

  setCloudflareAccountId(id) { this._cloudflareAccountId = id; }
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

    if (effectiveBackend === 'codex') {
      const sysPrompt = `You are a website builder agent inside the "Website Generator" desktop app. Your job is to create, modify, and improve web projects. You have full filesystem access to the project directory. Always write code directly — do not just describe changes. Use modern web frameworks (Vite, React, etc.) and create production-quality code. When creating a new project, scaffold it fully with package.json, install dependencies, and ensure it runs with "npm run dev". IMPORTANT: Always use "npm install --legacy-peer-deps" instead of plain "npm install" to avoid peer dependency conflicts. CRITICAL: NEVER start dev servers yourself — do NOT run "wrangler pages dev", "npm run dev", "npm start", or any long-running server command. The desktop app starts the dev server automatically. Running one yourself will hang forever because the process never exits. Read AGENTS.md in the project directory for full instructions.`;
      contextPrompt = sysPrompt + '\n\n' + contextPrompt;
    }

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
      if (projectSettings.framework) settingsLines.push(`Framework: ${projectSettings.framework}`);
      if (projectSettings.customDomain) settingsLines.push(`Custom domain: ${projectSettings.customDomain}`);
      if (projectSettings.deployProjectName) settingsLines.push(`Deploy project name: ${projectSettings.deployProjectName}`);

      if (settingsLines.length > 0) {
        parts.push(`Project settings (.webgen/settings.json):\n${settingsLines.join('\n')}\nYou can update these settings by writing to .webgen/settings.json in the project root.`);
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
      if (this._cloudflareAccountId) {
        env.CLOUDFLARE_ACCOUNT_ID = this._cloudflareAccountId;
      }
      const child = spawn('claude', args, { cwd, shell: true, stdio: ['pipe', 'pipe', 'pipe'], env });
      this.activeProcesses.set(projectName, child);

      // Send prompt via stdin (safe for any content)
      child.stdin.write(prompt);
      child.stdin.end();

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
      // Pass Cloudflare account ID so wrangler doesn't prompt in non-interactive mode
      const env = { ...process.env };
      if (this._cloudflareAccountId) {
        env.CLOUDFLARE_ACCOUNT_ID = this._cloudflareAccountId;
      }
      const child = spawn('codex', args, { cwd, shell: true, stdio: ['pipe', 'pipe', 'pipe'], env });
      this.activeProcesses.set(projectName, child);

      child.stdin.write(prompt);
      child.stdin.end();

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
    // Only match the actual rate limit banner text from Claude/Codex CLIs
    return /you've hit your limit/i.test(text) ||
      /usage limit|plan limit/i.test(text);
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
