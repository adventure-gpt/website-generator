# Website Generator

A one-click Windows installer that sets up a complete AI-powered web development environment for people who have never written a line of code. Describe a website in plain English, and an AI builds it — fully deployed, live on the internet, installable on your phone.

## What It Does

Website Generator installs everything a non-technical person needs to build and deploy professional websites using AI. The entire setup is guided with a visual wizard — no terminal, no configuration files, no technical knowledge required.

**The end result:** A workspace on your computer where you open a chat, describe what you want ("I want a recipe organizer with categories and a grocery list"), and an AI builds, deploys, and hosts the entire thing for you automatically.

## Who It's For

- People with zero programming experience who want to make websites
- Parents, friends, or partners of developers who want creative independence
- Small business owners who want custom web apps without hiring a developer
- Anyone curious about AI-assisted development but intimidated by the setup

## How It Works

1. **Download and run** `WebsiteGenerator-Setup.exe` (single file, ~2 MB)
2. **Answer a few questions** — your name, email, pronouns, and whether you're setting it up for yourself or someone else
3. **Pick your AI** — Claude Code, Codex, or Cursor (the wizard explains each one, including pricing)
4. **Pick your editor** — VS Code or Cursor
5. **Sit back** — the installer automatically installs Node.js, Git, GitHub CLI, Cloudflare CLI, and your chosen editor
6. **Connect your accounts** — guided browser-based sign-in for GitHub and Cloudflare (just click Authorize)
7. **Set up your AI** — Claude Code installs and launches automatically; other platforms get step-by-step instructions
8. **Done** — a desktop shortcut opens your workspace, ready to build

Total time: about 10 minutes. You go from nothing to a fully configured development environment.

## What Gets Installed

| Tool | Purpose |
|------|---------|
| Node.js | Runs the build tools and web servers |
| Git | Tracks changes to your projects |
| GitHub CLI | Connects to GitHub for code hosting |
| Cloudflare Wrangler | Deploys your websites to the internet for free |
| VS Code or Cursor | The editor where you talk to the AI |
| Claude Code, Codex, or Cursor AI | The AI that builds your websites |

Everything is installed via [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/) (Windows Package Manager) and npm — no sketchy downloads.

## What Gets Built

The installer creates a workspace folder (default: `Documents\websites`) containing:

- **Pre-configured AI instructions** — the AI already knows the tech stack, coding standards, deployment process, and how to talk to you in plain English
- **Config files for every major AI platform** — Claude Code, Codex, Cursor, GitHub Copilot, and Windsurf (you can switch anytime)
- **A VS Code workspace file** — double-click the desktop shortcut and everything opens perfectly
- **A plain-English user guide** — explains how to ask for websites, deploy them, and manage projects
- **A projects folder** — each website you build lives in its own subfolder

## The Tech Stack (What the AI Builds With)

Every website the AI creates uses a modern, professional stack:

- **Vite + React** — fast, modern web framework
- **Tailwind CSS v4** — beautiful styling without writing CSS
- **Cloudflare Pages** — free hosting with global CDN, custom domains, HTTPS
- **Cloudflare D1** — free SQLite database for storing data
- **PWA (Progressive Web App)** — every site is installable on phones and works offline
- **User accounts** — every project includes email/password authentication out of the box

Websites deploy to Cloudflare's free tier. No hosting bills, no server management.

## Supported AI Platforms

| Platform | Type | Pricing |
|----------|------|---------|
| **Claude Code** (Anthropic) | Command-line AI that works alongside your editor | $20/month (Claude Max) or pay-per-use API |
| **Codex** (OpenAI) | VS Code extension with full agent capabilities | $20/month (ChatGPT Pro) |
| **Cursor** | Editor with built-in AI chat and code generation | Free tier available, Pro for unlimited |

The workspace is pre-configured for all platforms simultaneously. Switch between them anytime without reconfiguring.

## Personalization

The installer collects your name, email, and preferred pronouns to personalize the AI's behavior. The AI addresses you by name, uses your pronouns naturally, and signs commits with your email. If someone else set up the workspace for you, the AI knows their name too — so if it ever gets truly stuck, it can suggest asking your helper for support (this is extremely rare).

## System Requirements

- **OS:** Windows 10 or 11
- **Disk:** ~500 MB for all tools
- **Internet:** Required for installation and AI usage
- **Accounts needed:** GitHub (free), Cloudflare (free), and your chosen AI platform
- **Admin rights:** Not required — installs to user directories

## Re-Running Setup

A "Re-run Setup Wizard" shortcut is added to the Start Menu during installation. Use it to reinstall tools, reconnect accounts, or switch AI platforms anytime.

## Project Structure

```
websites/                        <- Your workspace (install location)
  Website Generator.code-workspace  <- Double-click to open everything
  AGENTS.md                      <- AI instructions (primary)
  CLAUDE.md                      <- Claude Code config
  .cursorrules                   <- Cursor config
  .windsurfrules                 <- Windsurf config
  .github/copilot-instructions.md <- GitHub Copilot config
  .codex/config.toml             <- Codex config
  USER_GUIDE.md                  <- Plain-English guide for you
  projects/                      <- Your websites go here
    my-recipe-app/
    my-portfolio/
    ...
```

## Building the Installer From Source

Requires [Inno Setup 6+](https://jrsoftware.org/isdownload.php).

```powershell
cd installer
powershell -ExecutionPolicy Bypass -File build.ps1
# Output: installer/output/WebsiteGenerator-Setup.exe
```

The build script auto-installs Inno Setup via winget if it's missing, and generates the app icon programmatically.

## License

MIT
