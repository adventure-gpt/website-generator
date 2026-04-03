# Mac Testing Guide — Website Generator & App Generator

## Context for the Claude Agent on This Mac

You are helping Bryan test two Electron desktop apps on macOS. Bryan built these on Windows and is now testing Mac compatibility for the first time. Both apps are in this repo:

- **Website Generator** (root of repo) — AI-powered website builder
- **App Generator** (`app-generator/` subdirectory) — AI-powered desktop app builder

Bryan is NOT a programmer. He describes problems in plain English. Your job is to diagnose and fix any Mac-specific issues, then document everything you find.

## Architecture Quick Reference

Both apps follow the same architecture:
- **Electron** desktop app with **context isolation** (no nodeIntegration)
- `src/main/index.js` — Main process (IPC handlers, window management, auto-updater, menus)
- `src/main/preload.js` — Context bridge (exposes safe APIs to renderer)
- `src/main/ai-backend.js` — Spawns Claude CLI or Codex CLI as child processes
- `src/main/setup.js` — First-run setup wizard (installs Node, Git, GitHub CLI, Cloudflare CLI, authenticates Claude/Codex)
- `src/main/dev-server.js` — Manages local dev servers for preview
- `src/main/deploy.js` — Website Generator: Cloudflare Pages deployment. App Generator: electron-builder + GitHub Releases
- `src/renderer/app.js` — Full UI (vanilla JS, no React in the app itself)
- `src/renderer/index.html` — App shell
- `src/renderer/styles.css` — Styles
- `assets/icon.png` — App icon (512x512 PNG)

### Key Dependencies
- `electron` ^35.0.0
- `electron-updater` ^6.8.3
- `electron-log` ^5.4.3
- No native modules (no better-sqlite3, no node-gyp needed)

### Build System
- `electron-builder` for packaging
- Config lives in BOTH `package.json` (`"build"` field) AND `electron-builder.yml` — the `package.json` build field takes precedence when both exist
- Website Generator package.json build config: has `files` filter, `icon`, `publish` to GitHub
- App Generator package.json build config: has `icon`, `publish` to GitHub

### Mac-Specific Code Already in Place
- `process.platform === 'darwin'` checks for menu, window close behavior, tool installation
- macOS app menu with About/Services/Hide/Quit (src/main/index.js ~lines 160-183)
- `titleBarStyle: 'hidden'` with NO titleBarOverlay on Mac (overlay is Windows-only)
- App stays in dock when window closes (`app.quit()` skipped on darwin)
- Setup installs tools via Homebrew: `brew install node`, `brew install git`, `brew install gh`
- Claude auth opens Terminal.app: `open -a Terminal --args claude`

### electron-builder.yml Mac Configs
**Website Generator:**
```yaml
mac:
  target:
    - dmg
  icon: assets/icon.png
  category: public.app-category.developer-tools
```
- No architecture specified (defaults to current machine)
- No code signing or entitlements
- No hardened runtime

**App Generator:**
```yaml
mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  icon: assets/icon.png
  category: public.app-category.developer-tools
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
dmg:
  sign: false
```
- Builds for both Intel and Apple Silicon
- Hardened runtime enabled
- Entitlements grant JIT, unsigned memory, dyld vars, network, file I/O
- DMG signing disabled (no Apple Developer cert)

## Likely Issues to Watch For

### 1. Gatekeeper / Unsigned App Blocking
The apps are NOT code-signed with an Apple Developer certificate. macOS will likely block them.

**Symptoms:** "App is damaged and can't be opened" or "App can't be opened because it is from an unidentified developer"

**Fix options:**
- Right-click → Open (bypasses Gatekeeper for that session)
- `xattr -cr /path/to/App\ Generator.app` (removes quarantine attribute)
- System Settings → Privacy & Security → "Open Anyway"
- `sudo spctl --master-disable` (disables Gatekeeper entirely — not recommended)

### 2. Homebrew Not Installed
Setup wizard tries `brew install` for Node, Git, and GitHub CLI. If Homebrew isn't installed, setup will fail.

**Fix:** Install Homebrew first: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

On Apple Silicon Macs, Homebrew installs to `/opt/homebrew/` not `/usr/local/`. The PATH may need updating.

### 3. Apple Silicon (arm64) vs Intel (x64)
- Website Generator's electron-builder.yml doesn't specify architecture — it will build for the current machine's arch only
- App Generator specifies both x64 and arm64
- If testing on Apple Silicon, the Website Generator DMG from GitHub Releases (built on GitHub Actions with `macos-latest`) should be arm64

### 4. Window Title Bar / Dragging
- macOS uses native traffic lights (close/minimize/maximize) with `titleBarStyle: 'hidden'`
- The app has `-webkit-app-region: drag` on the header for window dragging
- If the header isn't draggable or traffic lights are mispositioned, it's a CSS issue in `src/renderer/styles.css`

### 5. Claude CLI / Codex CLI Auth on Mac
- Setup spawns: `open -a Terminal --args claude` for Claude auth
- This opens a new Terminal window — the user needs to complete auth there
- If Claude CLI isn't installed globally, this will fail
- Claude CLI install: `npm install -g @anthropic-ai/claude-code` or via the installer from anthropic.com

### 6. Child Process Spawning (AI Backend)
- `ai-backend.js` spawns `claude` or `codex` as child processes
- On Mac, the PATH in Electron's main process may not include Homebrew paths (`/opt/homebrew/bin`)
- If Claude/Codex CLI isn't found, check that the binary is in a PATH that Electron inherits
- Fix: The setup.js `_findTool()` function searches common paths. Check it includes `/opt/homebrew/bin/`

### 7. File Paths
- macOS uses forward slashes (same as the code expects since it's cross-platform Node.js)
- `app.getPath('userData')` returns `~/Library/Application Support/website-generator/` (or `app-generator/`)
- Template files bundled via `extraResources` go to `Contents/Resources/templates/` inside the .app bundle

### 8. Dev Server / Port Binding
- `dev-server.js` binds to localhost ports for preview
- macOS may prompt for firewall permission: "Do you want the application to accept incoming network connections?"
- This is normal — accept it

### 9. Auto-Updater
- electron-updater checks GitHub Releases for new versions
- The `latest-mac.yml` file in releases tells the updater about Mac builds
- If there's no DMG in the release, the updater won't find an update for Mac
- Currently: Website Generator releases may not have DMG files (only built on Windows so far)

### 10. DMG Building on Mac
- Building a DMG requires running on macOS
- To build locally: `npm run build:mac` (both apps have this script)
- App Generator builds for both x64 and arm64 — this will take longer
- Website Generator builds for current arch only

## Testing Checklist

Test these in order for BOTH apps:

### Installation & Launch
- [ ] Download the DMG (or build locally with `npm run build:mac`)
- [ ] Open DMG, drag app to Applications
- [ ] Launch the app — does it open? Any Gatekeeper warnings?
- [ ] Does the window render correctly? Title bar, traffic lights positioned right?
- [ ] Is the window draggable from the header area?
- [ ] Does the app icon show correctly in the Dock?

### Setup Wizard
- [ ] Does the setup wizard appear on first launch?
- [ ] Can it detect/install Node.js? (needs Homebrew)
- [ ] Can it detect/install Git?
- [ ] Can it detect/install GitHub CLI?
- [ ] Can it detect/install Wrangler? (Website Generator only)
- [ ] Can it authenticate Claude CLI? Does Terminal.app open correctly?
- [ ] Does the ANTHROPIC_API_KEY check work?

### Core Functionality
- [ ] Can you start a new project/conversation?
- [ ] Does the AI respond? (Claude or Codex backend)
- [ ] Does the live preview work? (Website Generator)
- [ ] Does the dev server start without firewall issues?
- [ ] Can you deploy a website? (Website Generator)
- [ ] Can you build/distribute an app? (App Generator)

### Window Behavior
- [ ] Close button behavior — does app stay in Dock on Mac?
- [ ] Cmd+Q quits the app
- [ ] Window state persists across restarts (size, position)
- [ ] Minimize/maximize work correctly

### Misc
- [ ] Settings modal opens and saves
- [ ] Theme switching works (Light/Dark/System)
- [ ] Auto-updater — does it check for updates?

## How to Document Issues

When you find an issue, create or append to `MAC_ISSUES.md` in the repo root with this format:

```markdown
## Issue: [Short Title]
- **App:** Website Generator / App Generator / Both
- **Severity:** Blocker / Major / Minor / Cosmetic
- **Platform:** macOS [version], [Intel/Apple Silicon]
- **Steps to reproduce:**
  1. Step one
  2. Step two
- **Expected:** What should happen
- **Actual:** What actually happens
- **Error output:** (paste any console errors, crash logs)
- **Fix applied:** (describe the fix if one was applied)
- **Fix file(s):** (list modified files)
- **Status:** Fixed / Workaround / Needs Windows-side fix
```

Console logs are at:
- Website Generator: `~/Library/Application Support/website-generator/logs/main.log`
- App Generator: `~/Library/Application Support/app-generator/logs/main.log`

Crash reports: `~/Library/Logs/DiagnosticReports/`

## Building Locally on This Mac

```bash
# Navigate to repo
cd /path/to/website-generator

# Install dependencies (ALWAYS use --legacy-peer-deps)
npm install --legacy-peer-deps

# Build for Mac
npm run build:mac

# The DMG will be in dist/

# For App Generator:
cd app-generator
npm install --legacy-peer-deps
npm run build:mac
# DMG in app-generator/dist/
```

## Quick Fixes Reference

**Gatekeeper block:**
```bash
xattr -cr /Applications/Website\ Generator.app
xattr -cr /Applications/App\ Generator.app
```

**Homebrew not in PATH (Apple Silicon):**
```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

**Claude CLI not found by Electron:**
Check `src/main/setup.js` `_findTool()` — ensure `/opt/homebrew/bin` is in the search paths.

**No DMG in GitHub Release:**
Build locally with `npm run build:mac` and test the local build.

## Critical Rules for the Agent
1. **NEVER start dev servers or launch Electron directly** — Bryan will launch the app manually
2. **ALWAYS use `npm install --legacy-peer-deps`**
3. **ALWAYS commit fixes** with `git add -A && git commit -m "mac: description of fix"`
4. **Document EVERY issue** in MAC_ISSUES.md, even if you fix it
5. **Test fixes before committing** where possible (check syntax, run node on the file)
6. **Don't modify Windows-specific behavior** — Mac fixes should be additive/conditional
7. **Keep Bryan informed in plain English** — no technical jargon
