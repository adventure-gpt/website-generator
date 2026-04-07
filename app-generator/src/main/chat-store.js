const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Persists chat messages per-project and imports from Claude Code CLI sessions.
 */
class ChatStore {
  constructor() {
    this.claudeProjectsDir = null;
  }

  /**
   * Returns the chat file path for a project.
   */
  chatPath(projectDir) {
    const webgenDir = path.join(projectDir, '.appgen');
    if (!fs.existsSync(webgenDir)) {
      fs.mkdirSync(webgenDir, { recursive: true });
    }
    return path.join(webgenDir, 'chat.json');
  }

  /**
   * Load saved chat messages for a project.
   */
  loadMessages(projectDir) {
    const file = this.chatPath(projectDir);
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  }

  /**
   * Save chat messages for a project.
   */
  saveMessages(projectDir, messages) {
    const file = this.chatPath(projectDir);
    fs.writeFileSync(file, JSON.stringify(messages, null, 2));
  }

  /**
   * Load legacy forks file (for migration from old format).
   */
  loadForksLegacy(projectDir) {
    const appgenDir = path.join(projectDir, '.appgen');
    const file = path.join(appgenDir, 'forks.json');
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return data.forkPoints || {};
    } catch {
      return {};
    }
  }

  /**
   * Create a timestamped backup of the chat file before migration.
   */
  backupChat(projectDir) {
    const file = this.chatPath(projectDir);
    if (!fs.existsSync(file)) return;
    const ts = Date.now();
    try {
      fs.copyFileSync(file, file + '.backup-' + ts);
      // Also backup forks if present
      const appgenDir = path.join(projectDir, '.appgen');
      const forksFile = path.join(appgenDir, 'forks.json');
      if (fs.existsSync(forksFile)) {
        fs.copyFileSync(forksFile, forksFile + '.backup-' + ts);
      }
    } catch { /* best effort */ }
  }

  // ── Claude Code CLI Import ──────────────────────────────────

  /**
   * Detect Claude Code CLI project directories that contain session JSONL files.
   * Returns array of { claudeDir, sessionFiles, workspacePath }.
   */
  detectClaudeSessions() {
    const home = os.homedir();
    const claudeDir = path.join(home, '.claude', 'projects');
    if (!fs.existsSync(claudeDir)) return [];

    const results = [];
    const entries = fs.readdirSync(claudeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(claudeDir, entry.name);
      const jsonlFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
      if (jsonlFiles.length === 0) continue;

      // Decode the directory name back to a filesystem path
      // Format: C--Users-brobb-Documents-websites -> C:\Users\brobb\Documents\websites
      const workspacePath = this.decodeClaudeDirName(entry.name);

      results.push({
        claudeDir: dir,
        dirName: entry.name,
        workspacePath,
        sessionFiles: jsonlFiles,
        sessionCount: jsonlFiles.length,
      });
    }

    return results;
  }

  /**
   * Encode a filesystem path to the Claude CLI directory name format.
   * e.g., "C:\Users\brobb\Documents\websites" -> "C--Users-brobb-Documents-websites"
   * This is the reverse of Claude's encoding and is lossless in this direction.
   */
  encodePathToDirName(filepath) {
    const normalized = filepath.replace(/\\/g, '/');
    const withDrive = normalized.replace(/^([a-zA-Z]):\//, '$1--');
    return withDrive.replace(/\//g, '-');
  }

  /**
   * Decode a Claude CLI directory name to a filesystem path (best-effort).
   * Note: This is lossy for paths containing hyphens.
   */
  decodeClaudeDirName(name) {
    let decoded = name.replace(/^([a-zA-Z])--/, '$1:/');
    decoded = decoded.replace(/-/g, '/');
    return decoded;
  }

  /**
   * Import chat history from Claude Code CLI JSONL sessions for a specific workspace.
   *
   * Claude Code stores messages linearly. User messages typically have the workspace root
   * as cwd, while assistant/tool messages have project-specific cwds. We track the
   * "current project" based on assistant cwds and associate user messages with that project.
   *
   * @param {string} claudeDir - Path to the Claude CLI project directory
   * @param {string[]} sessionFiles - JSONL filenames to import
   * @returns {{ [projectName: string]: Array<{role, content, timestamp}> }}
   */
  importClaudeSessions(claudeDir, sessionFiles) {
    const projectMessages = {};

    for (const file of sessionFiles) {
      const filePath = path.join(claudeDir, file);
      let data;
      try {
        data = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      // First pass: collect all messages in order, tracking which project is "active"
      const allMessages = [];
      let currentProject = null;

      const lines = data.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }

        // Track the current project from any message's cwd
        const cwd = (obj.cwd || '').replace(/\\/g, '/');
        const projectsMatch = cwd.match(/\/projects\/([^/]+)/i);
        if (projectsMatch) {
          currentProject = projectsMatch[1].toLowerCase();
        }

        // Only import user and assistant messages
        if (obj.type !== 'user' && obj.type !== 'assistant') continue;

        // Skip meta/system messages
        if (obj.isMeta) continue;

        // Skip compaction/summary messages
        if (obj.isCompactSummary) continue;
        if (obj.isVisibleInTranscriptOnly) continue;

        // Extract message text
        const msg = obj.message || {};
        let text = '';
        let tools = [];

        if (obj.type === 'user') {
          const content = msg.content;
          if (Array.isArray(content)) {
            // Extract text blocks from arrays (user prompts mixed with tool_result)
            const textBlocks = content
              .filter((b) => b.type === 'text' && b.text)
              .map((b) => b.text);
            if (textBlocks.length === 0) continue;
            text = textBlocks.join('\n');
          } else if (typeof content === 'string') {
            text = content;
          } else {
            continue;
          }
          // Skip command messages and system tags
          if (text.startsWith('<command-name>')) continue;
          if (text.startsWith('<task-notification')) continue;
          // Skip compaction summary messages that slipped through
          if (text.startsWith('This session is being continued from a previous conversation')) continue;
          if (text.startsWith('Continue the conversation from where')) continue;
          // Strip IDE context tags but keep the actual user text
          text = text
            .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
            .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
            .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '')
            .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
            .replace(/<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g, '')
            .replace(/<[\w_]+>[\s\S]*?<\/antml:[\w_]+>/g, '')
            .replace(/<[^>]+>/g, '')
            .trim();
          // Skip "Request interrupted" and other non-messages
          if (text === '[Request interrupted by user]') continue;
          // Skip if the remaining text is just whitespace or too short after stripping
          if (!text || text.length < 3) continue;
          // Skip messages that are just compaction artifacts
          if (/^(Summary|Note|Result of calling|Called the):/i.test(text) && text.length > 2000) continue;
        } else if (obj.type === 'assistant') {
          const content = msg.content;
          if (Array.isArray(content)) {
            const texts = content
              .filter((b) => b.type === 'text' && b.text)
              .map((b) => b.text);
            text = texts.join('\n');
            // Extract tool usage info
            tools = content
              .filter((b) => b.type === 'tool_use')
              .map((b) => ({ name: b.name, id: b.id }));
          } else if (typeof content === 'string') {
            text = content;
          }
        }

        if (!currentProject) continue;

        // Tool-only assistant messages: attach tools to the last assistant entry
        if (obj.type === 'assistant' && tools.length > 0 && (!text || text.length < 3)) {
          for (let i = allMessages.length - 1; i >= 0; i--) {
            if (allMessages[i].role === 'assistant' && allMessages[i].project === currentProject) {
              if (!allMessages[i].tools) allMessages[i].tools = [];
              allMessages[i].tools.push(...tools);
              break;
            }
          }
          continue;
        }

        if (!text || text.length < 3) continue;

        const entry = {
          project: currentProject,
          role: obj.type === 'user' ? 'user' : 'assistant',
          content: text,
          timestamp: obj.timestamp ? new Date(obj.timestamp).getTime() : Date.now(),
          source: 'claude-code-import',
        };
        if (tools.length > 0) entry.tools = tools;
        allMessages.push(entry);
      }

      // Group by project
      for (const m of allMessages) {
        if (!projectMessages[m.project]) {
          projectMessages[m.project] = [];
        }
        var entry = {
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          source: m.source,
        };
        if (m.tools && m.tools.length > 0) entry.tools = m.tools;
        projectMessages[m.project].push(entry);
      }
    }

    // Sort each project's messages by timestamp
    for (const name of Object.keys(projectMessages)) {
      projectMessages[name].sort((a, b) => a.timestamp - b.timestamp);
    }

    return projectMessages;
  }

  /**
   * Import and save Claude Code chat history into the appropriate project directories.
   * Returns import stats.
   */
  importAndSave(claudeDir, sessionFiles, projectsDir) {
    const imported = this.importClaudeSessions(claudeDir, sessionFiles);
    const stats = { projects: [], totalMessages: 0 };

    for (const [projectName, messages] of Object.entries(imported)) {
      const projectDir = path.join(projectsDir, projectName);
      if (!fs.existsSync(projectDir)) continue; // Only import for existing projects

      // Merge with existing messages (don't duplicate) using composite key
      const existing = this.loadMessages(projectDir);
      const existingKeys = new Set(existing.map((m) => m.role + ':' + m.timestamp + ':' + (m.content || '').slice(0, 40)));
      const newMessages = messages.filter((m) => !existingKeys.has(m.role + ':' + m.timestamp + ':' + (m.content || '').slice(0, 40)));

      if (newMessages.length === 0) continue;

      const merged = [...existing, ...newMessages].sort((a, b) => a.timestamp - b.timestamp);
      this.saveMessages(projectDir, merged);
      stats.projects.push({ name: projectName, imported: newMessages.length, total: merged.length });
      stats.totalMessages += newMessages.length;
    }

    return stats;
  }

  /**
   * Scan for available Claude Code sessions that match a workspace path.
   * Returns info about what can be imported.
   */
  getImportableChats(workspacePath) {
    const sessions = this.detectClaudeSessions();
    // Encode workspace path to Claude dir name format for reliable comparison
    // (decoding is lossy for paths with hyphens, but encoding is deterministic)
    const encodedTarget = this.encodePathToDirName(workspacePath).toLowerCase();

    const matches = [];
    for (const session of sessions) {
      const dirNameLower = session.dirName.toLowerCase();
      const isExact = encodedTarget === dirNameLower;
      const isChild = dirNameLower.startsWith(encodedTarget + '-');
      if (isExact || isChild) {
        // Preview what would be imported
        const preview = this.importClaudeSessions(session.claudeDir, session.sessionFiles);
        const projectNames = Object.keys(preview);
        const totalMsgs = Object.values(preview).reduce((sum, arr) => sum + arr.length, 0);
        matches.push({
          claudeDir: session.claudeDir,
          sessionFiles: session.sessionFiles,
          workspacePath: session.workspacePath,
          projects: projectNames,
          messageCount: totalMsgs,
        });
      }
    }

    return matches;
  }
  /**
   * Check if a specific project has importable chat history from Claude Code.
   * Returns { available: boolean, messageCount: number, sources: [] } for a single project.
   */
  getProjectImportInfo(workspacePath, projectName) {
    const sessions = this.detectClaudeSessions();
    const encodedTarget = this.encodePathToDirName(workspacePath).toLowerCase();
    const result = { available: false, messageCount: 0, sources: [] };

    for (const session of sessions) {
      const dirNameLower = session.dirName.toLowerCase();
      const isExact = encodedTarget === dirNameLower;
      const isChild = dirNameLower.startsWith(encodedTarget + '-');
      if (!isExact && !isChild) continue;

      const imported = this.importClaudeSessions(session.claudeDir, session.sessionFiles);
      const projectMessages = imported[projectName.toLowerCase()];
      if (projectMessages && projectMessages.length > 0) {
        result.available = true;
        result.messageCount += projectMessages.length;
        result.sources.push({
          claudeDir: session.claudeDir,
          sessionFiles: session.sessionFiles,
        });
      }
    }

    return result;
  }
}

module.exports = ChatStore;
