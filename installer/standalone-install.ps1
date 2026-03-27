# ============================================================
# Website Generator — Standalone Console Installer
# A full interactive installer that works without Inno Setup.
# Double-click install.bat or run this directly.
# ============================================================

$ErrorActionPreference = "Continue"
$ScriptRoot = Split-Path $MyInvocation.MyCommand.Path -Parent

# ---- Helper Functions ----

function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  ====================================================" -ForegroundColor Magenta
    Write-Host "     Website Generator — Setup Wizard" -ForegroundColor White
    Write-Host "  ====================================================" -ForegroundColor Magenta
    Write-Host ""
}

function Write-Step($num, $total, $msg) {
    Write-Host ""
    Write-Host "  Step $num of $total — $msg" -ForegroundColor Cyan
    Write-Host "  $('─' * 50)" -ForegroundColor DarkGray
}

function Write-OK($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Write-Info($msg) {
    Write-Host "  $msg" -ForegroundColor White
}

function Write-Warn($msg) {
    Write-Host "  [!] $msg" -ForegroundColor Yellow
}

function Write-Err($msg) {
    Write-Host "  [X] $msg" -ForegroundColor Red
}

function Read-Input($prompt, $default) {
    if ($default) {
        Write-Host "  $prompt [$default]: " -ForegroundColor White -NoNewline
    } else {
        Write-Host "  $prompt`: " -ForegroundColor White -NoNewline
    }
    $val = Read-Host
    if ([string]::IsNullOrWhiteSpace($val) -and $default) { return $default }
    return $val.Trim()
}

function Read-Choice($prompt, $options) {
    Write-Host ""
    for ($i = 0; $i -lt $options.Count; $i++) {
        Write-Host "    [$($i + 1)] $($options[$i])" -ForegroundColor White
    }
    Write-Host ""
    $choice = Read-Input $prompt
    $idx = [int]$choice - 1
    if ($idx -ge 0 -and $idx -lt $options.Count) { return $idx }
    return 0
}

function Read-MultiChoice($prompt, $options, $defaults) {
    Write-Host ""
    for ($i = 0; $i -lt $options.Count; $i++) {
        $mark = if ($defaults[$i]) { "[X]" } else { "[ ]" }
        Write-Host "    $($i + 1). $mark $($options[$i])" -ForegroundColor White
    }
    Write-Host ""
    Write-Info "Enter numbers separated by commas (e.g., 1,2,4)"
    Write-Info "Or press Enter to keep defaults"
    $input = Read-Input $prompt
    if ([string]::IsNullOrWhiteSpace($input)) {
        return $defaults
    }
    $result = @($false) * $options.Count
    $nums = $input -split '[,\s]+'
    foreach ($n in $nums) {
        $idx = [int]$n - 1
        if ($idx -ge 0 -and $idx -lt $options.Count) {
            $result[$idx] = $true
        }
    }
    return $result
}

function Test-Cmd($cmd) {
    try { $null = Get-Command $cmd -ErrorAction Stop; return $true }
    catch { return $false }
}

function Replace-Template($src, $dest, $vars) {
    if (-not (Test-Path $src)) { return }
    $content = Get-Content $src -Raw -Encoding UTF8
    foreach ($key in $vars.Keys) {
        $content = $content -replace [regex]::Escape("{{$key}}"), $vars[$key]
    }
    $parentDir = Split-Path $dest -Parent
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    $content | Set-Content $dest -Encoding UTF8 -NoNewline
}

# ============================================================
# WIZARD START
# ============================================================

$totalSteps = 8

# ---- Step 1: Welcome & Setup Type ----
Write-Banner
Write-Step 1 $totalSteps "Who is this for?"

Write-Info "This installer sets up a workspace where someone can"
Write-Info "describe websites in plain English and an AI builds them."
Write-Host ""

$setupTypeIdx = Read-Choice "Who will use this?" @(
    "I'm setting this up for myself",
    "I'm setting this up for someone else (friend, family, etc.)"
)
$isForSelf = ($setupTypeIdx -eq 0)

# ---- Step 2: User Information ----
Write-Banner
Write-Step 2 $totalSteps "User Information"

if ($isForSelf) {
    Write-Info "Tell us about yourself."
} else {
    Write-Info "Tell us about the person who will use this workspace."
}
Write-Host ""

$userName = ""
while ([string]::IsNullOrWhiteSpace($userName)) {
    $userName = Read-Input "First name"
    if ([string]::IsNullOrWhiteSpace($userName)) {
        Write-Warn "Name is required."
    }
}

$userEmail = ""
while ([string]::IsNullOrWhiteSpace($userEmail) -or $userEmail -notmatch '@') {
    $userEmail = Read-Input "Email address"
    if ($userEmail -notmatch '@') {
        Write-Warn "Please enter a valid email address."
    }
}

# Pronouns
Write-Host ""
$pronounIdx = Read-Choice "Preferred pronouns" @(
    "She / Her",
    "He / Him",
    "They / Them"
)

switch ($pronounIdx) {
    0 { $pronounSubject = "She"; $pronounObject = "her"; $pronounPossessive = "her" }
    1 { $pronounSubject = "He"; $pronounObject = "him"; $pronounPossessive = "his" }
    2 { $pronounSubject = "They"; $pronounObject = "them"; $pronounPossessive = "their" }
}

# Admin name
$adminName = $userName
if (-not $isForSelf) {
    Write-Host ""
    Write-Info "Since you're setting this up for someone else,"
    Write-Info "the AI will suggest they contact you as a last resort."
    $adminName = Read-Input "Your name (the helper)"
}

# ---- Step 3: Agent Platforms ----
Write-Banner
Write-Step 3 $totalSteps "AI Agent Platforms"

Write-Info "Select which AI coding tools will be used."
Write-Info "The installer creates configuration files for each one."

$agentOptions = @(
    "Claude Code (Anthropic) — CLI + VS Code",
    "Codex (OpenAI) — VS Code extension or desktop app",
    "Cursor — AI-native code editor",
    "GitHub Copilot — VS Code extension",
    "Windsurf (Codeium) — AI-native code editor"
)
$agentDefaults = @($true, $true, $false, $false, $false)
$agentSelections = Read-MultiChoice "Your choices" $agentOptions $agentDefaults

# Ensure at least one selected
$anySelected = $false
foreach ($s in $agentSelections) { if ($s) { $anySelected = $true; break } }
if (-not $anySelected) {
    Write-Warn "Selecting Claude Code as default."
    $agentSelections[0] = $true
}

# ---- Step 4: Code Editor ----
Write-Banner
Write-Step 4 $totalSteps "Code Editor"

Write-Info "Which editor will be the primary workspace?"

$editorIdx = Read-Choice "Choose editor" @(
    "VS Code (recommended — works with all agents)",
    "Cursor (has built-in AI)",
    "Windsurf (has built-in AI)"
)

$editorName = switch ($editorIdx) {
    0 { "VS Code" }
    1 { "Cursor" }
    2 { "Windsurf" }
}

# ---- Step 5: Install Location ----
Write-Banner
Write-Step 5 $totalSteps "Install Location"

$defaultDir = Join-Path $env:USERPROFILE "Documents\websites"
Write-Info "Where should the workspace be created?"
Write-Host ""
$installDir = Read-Input "Install path" $defaultDir

# ---- Step 6: Review & Confirm ----
Write-Banner
Write-Step 6 $totalSteps "Review"

Write-Host ""
Write-Info "  User:       $userName ($userEmail)"
Write-Info "  Pronouns:   $pronounSubject / $pronounObject / $pronounPossessive"
if (-not $isForSelf) {
    Write-Info "  Set up by:  $adminName"
}
Write-Host ""
Write-Info "  AI Platforms:"
$agentNames = @("Claude Code", "Codex", "Cursor", "GitHub Copilot", "Windsurf")
$selectedAgentStr = ""
for ($i = 0; $i -lt $agentSelections.Count; $i++) {
    if ($agentSelections[$i]) {
        Write-Host "    - $($agentNames[$i])" -ForegroundColor Cyan
        if ($selectedAgentStr) { $selectedAgentStr += "," }
        $selectedAgentStr += @("claude","codex","cursor","copilot","windsurf")[$i]
    }
}
Write-Host ""
Write-Info "  Editor:     $editorName"
Write-Info "  Location:   $installDir"
Write-Host ""

$confirm = Read-Input "Proceed with installation? (Y/n)" "Y"
if ($confirm -notmatch '^[Yy]') {
    Write-Warn "Installation cancelled."
    exit 0
}

# ---- Step 7: Create Workspace ----
Write-Banner
Write-Step 7 $totalSteps "Creating Workspace"

# Create directories
Write-Info "Creating directory structure..."
New-Item -ItemType Directory -Path (Join-Path $installDir "projects") -Force | Out-Null
"" | Set-Content (Join-Path $installDir "projects\.gitkeep") -Encoding UTF8

# Template variables
$vars = @{
    "USER_NAME"              = $userName
    "USER_EMAIL"             = $userEmail
    "ADMIN_NAME"             = $adminName
    "USER_PRONOUN_SUBJECT"   = $pronounSubject
    "USER_PRONOUN_OBJECT"    = $pronounObject
    "USER_POSSESSIVE"        = $pronounPossessive
    "EDITOR_NAME"            = $editorName
    "WORKSPACE_PATH"         = $installDir
}

$templateDir = Join-Path $ScriptRoot "templates"

# Always generate AGENTS.md and USER_GUIDE.md
Replace-Template (Join-Path $templateDir "AGENTS.md") (Join-Path $installDir "AGENTS.md") $vars
Write-OK "AGENTS.md"

Replace-Template (Join-Path $templateDir "USER_GUIDE.md") (Join-Path $installDir "USER_GUIDE.md") $vars
Write-OK "USER_GUIDE.md"

# Agent-specific files
if ($agentSelections[0]) {  # Claude Code
    Replace-Template (Join-Path $templateDir "CLAUDE.md") (Join-Path $installDir "CLAUDE.md") $vars
    Write-OK "CLAUDE.md (Claude Code)"
}

if ($agentSelections[1]) {  # Codex
    $codexDir = Join-Path $installDir ".codex"
    New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
    Copy-Item (Join-Path $templateDir ".codex\config.toml") (Join-Path $codexDir "config.toml") -Force
    Write-OK ".codex/config.toml (Codex)"
}

if ($agentSelections[2]) {  # Cursor
    Replace-Template (Join-Path $templateDir ".cursorrules") (Join-Path $installDir ".cursorrules") $vars
    Write-OK ".cursorrules (Cursor)"
}

if ($agentSelections[3]) {  # Copilot
    Replace-Template (Join-Path $templateDir ".github\copilot-instructions.md") (Join-Path $installDir ".github\copilot-instructions.md") $vars
    Write-OK ".github/copilot-instructions.md (Copilot)"
}

if ($agentSelections[4]) {  # Windsurf
    Replace-Template (Join-Path $templateDir ".windsurfrules") (Join-Path $installDir ".windsurfrules") $vars
    Write-OK ".windsurfrules (Windsurf)"
}

# VS Code workspace file
$wsSource = Join-Path $templateDir "workspace.code-workspace"
$wsDest = Join-Path $installDir "Website Generator.code-workspace"
if (Test-Path $wsSource) {
    Copy-Item $wsSource $wsDest -Force
    Write-OK "Website Generator.code-workspace"
}

# Desktop shortcut to workspace
$desktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop", "Website Generator.lnk")
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $shortcut = $WshShell.CreateShortcut($desktopPath)
    $shortcut.TargetPath = $wsDest
    switch ($editorName) {
        "VS Code" {
            $codePath = (Get-Command code -ErrorAction SilentlyContinue).Source
            if ($codePath) {
                $shortcut.TargetPath = $codePath
                $shortcut.Arguments = "`"$wsDest`""
            }
        }
        "Cursor" {
            $cursorPath = (Get-Command cursor -ErrorAction SilentlyContinue).Source
            if ($cursorPath) {
                $shortcut.TargetPath = $cursorPath
                $shortcut.Arguments = "`"$wsDest`""
            }
        }
    }
    $shortcut.WorkingDirectory = $installDir
    $shortcut.Description = "Open your website building workspace"
    $shortcut.Save()
    Write-OK "Desktop shortcut created"
} catch {
    Write-Warn "Could not create desktop shortcut. You can open the workspace file manually."
}

Write-Host ""
Write-OK "Workspace created at: $installDir"

# ---- Step 8: Install Developer Tools ----
Write-Banner
Write-Step 8 $totalSteps "Installing Developer Tools"

Write-Info "Now installing the tools your website builder needs."
Write-Info "This may take a few minutes..."
Write-Host ""

# Node.js
Write-Info "Checking Node.js..."
if (Test-Cmd "node") {
    $nodeVer = node -v 2>&1
    Write-OK "Node.js $nodeVer already installed"
} else {
    Write-Info "Installing Node.js LTS..."
    winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements -h 2>&1 | Out-Null
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (Test-Cmd "node") { Write-OK "Node.js installed" }
    else { Write-Err "Node.js install failed — install from https://nodejs.org/" }
}

# Git
Write-Info "Checking Git..."
if (Test-Cmd "git") {
    Write-OK "Git already installed"
} else {
    Write-Info "Installing Git..."
    winget install --id Git.Git --accept-source-agreements --accept-package-agreements -h 2>&1 | Out-Null
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (Test-Cmd "git") { Write-OK "Git installed" }
    else { Write-Err "Git install failed — install from https://git-scm.com/" }
}

# GitHub CLI
Write-Info "Checking GitHub CLI..."
if (Test-Cmd "gh") {
    Write-OK "GitHub CLI already installed"
} else {
    Write-Info "Installing GitHub CLI..."
    winget install --id GitHub.cli --accept-source-agreements --accept-package-agreements -h 2>&1 | Out-Null
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (Test-Cmd "gh") { Write-OK "GitHub CLI installed" }
    else { Write-Err "GitHub CLI install failed — run: winget install GitHub.cli" }
}

# Wrangler
Write-Info "Checking Wrangler (Cloudflare CLI)..."
if (Test-Cmd "wrangler") {
    Write-OK "Wrangler already installed"
} else {
    if (Test-Cmd "npm") {
        Write-Info "Installing Wrangler..."
        npm install -g wrangler 2>&1 | Out-Null
        if (Test-Cmd "wrangler") { Write-OK "Wrangler installed" }
        else { Write-Err "Wrangler install failed — run: npm install -g wrangler" }
    } else {
        Write-Err "npm not available. Install Node.js first, then: npm install -g wrangler"
    }
}

# Editor
Write-Info "Checking $editorName..."
switch ($editorName) {
    "VS Code" {
        if (Test-Cmd "code") {
            Write-OK "VS Code already installed"
        } else {
            Write-Info "Installing VS Code..."
            winget install --id Microsoft.VisualStudioCode --accept-source-agreements --accept-package-agreements -h 2>&1 | Out-Null
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            if (Test-Cmd "code") { Write-OK "VS Code installed" }
            else { Write-Err "VS Code install failed — install from https://code.visualstudio.com/" }
        }
    }
    "Cursor" {
        if (Test-Cmd "cursor") { Write-OK "Cursor already installed" }
        else { Write-Warn "Install Cursor from https://cursor.com/" }
    }
    "Windsurf" {
        Write-Warn "Install Windsurf from https://windsurf.com/ if not already installed"
    }
}

# Git config
Write-Host ""
Write-Info "Configuring Git identity..."
if (Test-Cmd "git") {
    git config --global user.name "$userName"
    git config --global user.email "$userEmail"
    git config --global init.defaultBranch main
    Write-OK "Git configured: $userName <$userEmail>"
} else {
    Write-Warn "Git not found — configure manually later"
}

# ---- Authentication ----
Write-Host ""
Write-Host "  ────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Account Authentication" -ForegroundColor Cyan
Write-Host "  ────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
Write-Info "You'll need accounts on GitHub and Cloudflare."
Write-Info "If you don't have them yet, create them first:"
Write-Host ""
Write-Host "    GitHub:     https://github.com/signup" -ForegroundColor Gray
Write-Host "    Cloudflare: https://dash.cloudflare.com/sign-up" -ForegroundColor Gray
Write-Host ""

$doAuth = Read-Input "Authenticate now? (Y/n)" "Y"

if ($doAuth -match '^[Yy]') {
    # GitHub
    if (Test-Cmd "gh") {
        $ghStatus = gh auth status 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-OK "Already authenticated with GitHub"
        } else {
            Write-Host ""
            Write-Info "A browser window will open for GitHub login."
            Write-Info "Log in and click 'Authorize' when prompted."
            Write-Host ""
            $ready = Read-Input "Press Enter to open browser..."
            gh auth login --web --git-protocol https
            if ($LASTEXITCODE -eq 0) { Write-OK "GitHub authenticated!" }
            else { Write-Warn "GitHub auth incomplete — run 'gh auth login' later" }
        }
    } else {
        Write-Warn "GitHub CLI not installed — authenticate later with: gh auth login"
    }

    # Cloudflare
    if (Test-Cmd "wrangler") {
        $wranRes = wrangler whoami 2>&1
        if ($wranRes -match "logged in") {
            Write-OK "Already authenticated with Cloudflare"
        } else {
            Write-Host ""
            Write-Info "A browser window will open for Cloudflare login."
            Write-Info "Log in and authorize when prompted."
            Write-Host ""
            $ready = Read-Input "Press Enter to open browser..."
            wrangler login
            if ($LASTEXITCODE -eq 0) { Write-OK "Cloudflare authenticated!" }
            else { Write-Warn "Cloudflare auth incomplete — run 'wrangler login' later" }
        }
    } else {
        Write-Warn "Wrangler not installed — authenticate later with: wrangler login"
    }
} else {
    Write-Info "Skipped. Run these commands later to authenticate:"
    Write-Host "    gh auth login" -ForegroundColor Gray
    Write-Host "    wrangler login" -ForegroundColor Gray
}

# ---- Codex agent setup ----
if ($agentSelections[1]) {
    Write-Host ""
    Write-Info "For Codex (OpenAI), you'll also need:"
    Write-Host "    - ChatGPT Pro subscription (https://chatgpt.com/)" -ForegroundColor Gray
    Write-Host "    - Install the Codex extension in VS Code" -ForegroundColor Gray
    Write-Host "    - Sign in with your ChatGPT account" -ForegroundColor Gray
}

# ---- Claude Code setup ----
if ($agentSelections[0]) {
    Write-Host ""
    Write-Info "For Claude Code, you'll also need:"
    Write-Host "    - Anthropic API key or Claude Pro subscription" -ForegroundColor Gray
    Write-Host "    - Install: npm install -g @anthropic-ai/claude-code" -ForegroundColor Gray
}

# ============================================================
# DONE
# ============================================================

Write-Host ""
Write-Host ""
Write-Host "  ====================================================" -ForegroundColor Green
Write-Host "     Setup Complete!" -ForegroundColor Green
Write-Host "  ====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Your workspace is ready at:" -ForegroundColor White
Write-Host "    $installDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To get started:" -ForegroundColor White
Write-Host "    1. Double-click 'Website Generator' on your desktop" -ForegroundColor White
Write-Host "    2. Open the AI chat panel in $editorName" -ForegroundColor White
Write-Host "    3. Tell it what you want to build!" -ForegroundColor White
Write-Host ""
Write-Host "  Example: 'Make me a recipe organizer. Call it recipe-book.'" -ForegroundColor Gray
Write-Host ""
Write-Host "  Read USER_GUIDE.md in your workspace for more tips." -ForegroundColor Gray
Write-Host ""
Write-Host "  Press Enter to close..." -ForegroundColor DarkGray
Read-Host
