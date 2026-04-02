# App Generator — Project Context

This is the "App Generator" desktop app — an Electron application that lets non-technical users build desktop apps by chatting with AI. It is the sibling of the Website Generator.

## What This App Does
- Chat interface where users describe desktop apps in plain English
- AI backends: Claude Code CLI and OpenAI Codex CLI (spawned as child processes)
- No live preview — the AI launches the generated Electron app directly for testing
- Distribute button: builds installer (electron-builder), publishes to GitHub Releases, creates landing page on Cloudflare Pages
- GitHub Actions CI for cross-platform builds (Windows, macOS, Linux)
- Built-in setup wizard for installing tools and authenticating services
- Multi-project support with concurrent AI sessions
- Auto-updater via electron-updater + GitHub Releases

## Architecture
- `src/main/index.js` — Main process: IPC handlers, window management, auto-updater
- `src/main/ai-backend.js` — Spawns Claude/Codex CLI processes, parses streaming output, Electron-specific system prompt
- `src/main/dev-server.js` — Simplified from website-generator (Vite only, no wrangler)
- `src/main/deploy.js` — Distributor: electron-builder + GitHub Releases
- `src/main/app-launcher.js` — Spawns generated Electron apps for testing (npx electron .)
- `src/main/setup.js` — Tool installation (Node, Git, gh, wrangler, Claude, Codex) and auth
- `src/main/project-manager.js` — Workspace at Documents/desktop-apps, project CRUD
- `src/main/chat-store.js` — Chat persistence to .appgen/chat.json per project
- `src/main/preload.js` — Context bridge with distribute/launch APIs
- `src/renderer/app.js` — Full UI: chat, streaming, data-first state, no preview panel
- `src/renderer/index.html` — App shell with chat, action buttons (Launch, Distribute, Open Site, Settings)
- `src/renderer/styles.css` — Dark theme with emerald accent (#10b981)
- `templates/AGENTS.md` — Electron dev instructions copied into each generated project
- `templates/CLAUDE.md` — Condensed version

## Key Differences from Website Generator
- No preview iframe — desktop apps can't be iframed. AI launches the app via app-launcher.js
- No wrangler in dev-server.js — no D1, no Cloudflare functions
- Distribution = electron-builder + GitHub Releases + landing page (not Cloudflare Pages deploy)
- GitHub Actions workflow template for cross-platform builds
- System prompt tells AI to never run `electron .` or dev servers (both hang)
- Action buttons in chat area instead of separate preview panel
- Emerald green accent instead of indigo
- Workspace at Documents/desktop-apps instead of Documents/websites

## Distribution
- Not yet published to GitHub (adventure-gpt/app-generator repo doesn't exist yet)
- Installer built locally at dist/App-Generator-Setup.exe

## Communication Rules for the AI
When modifying this project, speak in plain English. This is a developer tool but the person asking you to modify it is the developer — they understand code. You can be technical when discussing this project's internals.
