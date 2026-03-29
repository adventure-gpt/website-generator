# Website Generator — Current State

Website Generator is now a standalone Electron desktop app. It replaces the old VS Code/Cursor workspace installer.

## What Changed

### Old System
- PowerShell/Inno Setup installer that configured a VS Code or Cursor workspace
- User talked to AI through their code editor's chat
- Config files lived in a workspace folder
- Preview and deployment handled manually or through editor AI

### New System
- Standalone Electron desktop app with built-in chat, live preview panel, and deploy button
- No code editor involved — the app is the entire experience
- Built-in setup wizard installs all tooling and walks through account auth
- Collects user profile (name, email, pronouns) during setup to personalize AI communication
- Two AI backends: Claude Code (Anthropic, $20/mo) and Codex CLI (OpenAI, $20/mo)
- Model selection per backend
- Multi-project with concurrent AI sessions
- Message queueing and editing
- Chat history persistence
- Frameless window, thinking indicator, tool activity display
- Deploy URL detected from AI responses and shown in status bar
- AGENTS.md and CLAUDE.md auto-placed into each project with user profile filled in

## Distribution
Single file: `Website Generator Setup 1.0.0.exe` (~85 MB). All developer tooling installed on first launch by the app.

## Requirements
Windows 10/11. Free GitHub + Cloudflare accounts. Claude Code or Codex CLI subscription ($20/mo).
