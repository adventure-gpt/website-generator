# Website Generator — Project Context

This is the "Website Generator" desktop app — an Electron application that lets non-technical users build websites by chatting with AI.

## What This App Does
- Chat interface where users describe websites in plain English
- AI backends: Claude Code CLI and OpenAI Codex CLI (spawned as child processes)
- Live preview panel showing the website via iframe (Vite dev server or wrangler pages dev)
- One-click deploy to Cloudflare Pages
- Built-in setup wizard for installing tools and authenticating services
- Multi-project support with concurrent AI sessions
- Auto-updater via electron-updater + GitHub Releases

## Architecture
- `src/main/index.js` — Main process: IPC handlers, window management, auto-updater
- `src/main/ai-backend.js` — Spawns Claude/Codex CLI processes, parses streaming output, system prompt injection
- `src/main/dev-server.js` — Auto-detects and starts Vite or wrangler dev servers per project, dynamic port allocation, D1 schema auto-apply
- `src/main/deploy.js` — Cloudflare Pages deployment
- `src/main/setup.js` — Tool installation (Node, Git, gh, wrangler, Claude, Codex) and auth checks
- `src/main/project-manager.js` — Workspace at Documents/websites, project CRUD, template versioning
- `src/main/chat-store.js` — Chat persistence to .webgen/chat.json per project
- `src/main/preload.js` — Context bridge (renderer <-> main IPC)
- `src/renderer/app.js` — Full UI: chat, streaming, data-first state management, settings modals
- `src/renderer/index.html` — App shell with setup wizard, chat, preview panel, settings modals
- `src/renderer/styles.css` — Dark theme with indigo accent (#6366f1)

## Key Design Decisions
- Data-first state: `state.messages[]` is the single source of truth, DOM re-renders from it
- Per-project state via `getPS(projectName)` — concurrent projects don't interfere
- Live messages (`_live` flag) for streaming — finalized on `done` event
- AI system prompt injected before every message with environment context and communication rules
- Templates (AGENTS.md/CLAUDE.md) auto-copied into user projects with version tracking
- Dev server auto-detects wrangler projects (wrangler.toml + functions/) vs plain Vite

## Distribution
- Published to GitHub: adventure-gpt/website-generator
- Download: https://github.com/adventure-gpt/website-generator/releases/latest/download/Website-Generator-Setup.exe
- Auto-updates via electron-updater checking GitHub Releases

## Communication Rules for the AI
When modifying this project, speak in plain English. This is a developer tool but the person asking you to modify it is the developer — they understand code. You can be technical when discussing this project's internals.
