# ============================================================
# Website Generator — Post-Install (Silent)
# Generates ALL config files from templates. Runs hidden.
# ============================================================

param(
    [string]$InstallDir,
    [string]$TemplateDir,
    [string]$UserName,
    [string]$UserEmail,
    [string]$AdminName,
    [string]$PronounSubject,
    [string]$PronounObject,
    [string]$PronounPossessive
)

$ErrorActionPreference = "Stop"

# Create projects directory
New-Item -ItemType Directory -Path (Join-Path $InstallDir "projects") -Force | Out-Null
"" | Set-Content (Join-Path $InstallDir "projects\.gitkeep") -Encoding UTF8

# Template replacement
function Replace-Template($src, $dest) {
    if (-not (Test-Path $src)) { return }
    $content = Get-Content $src -Raw -Encoding UTF8
    $content = $content -replace '\{\{USER_NAME\}\}', $UserName
    $content = $content -replace '\{\{USER_EMAIL\}\}', $UserEmail
    $content = $content -replace '\{\{ADMIN_NAME\}\}', $AdminName
    $content = $content -replace '\{\{USER_PRONOUN_SUBJECT\}\}', $PronounSubject
    $content = $content -replace '\{\{USER_PRONOUN_OBJECT\}\}', $PronounObject
    $content = $content -replace '\{\{USER_POSSESSIVE\}\}', $PronounPossessive
    $content = $content -replace '\{\{EDITOR_NAME\}\}', 'your editor'
    $content = $content -replace '\{\{WORKSPACE_PATH\}\}', $InstallDir
    $parent = Split-Path $dest -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $content | Set-Content $dest -Encoding UTF8 -NoNewline
}

# Generate ALL config files (every platform supported)
Replace-Template (Join-Path $TemplateDir "AGENTS.md") (Join-Path $InstallDir "AGENTS.md")
Replace-Template (Join-Path $TemplateDir "USER_GUIDE.md") (Join-Path $InstallDir "USER_GUIDE.md")
Replace-Template (Join-Path $TemplateDir "CLAUDE.md") (Join-Path $InstallDir "CLAUDE.md")
Replace-Template (Join-Path $TemplateDir ".cursorrules") (Join-Path $InstallDir ".cursorrules")
Replace-Template (Join-Path $TemplateDir ".github\copilot-instructions.md") (Join-Path $InstallDir ".github\copilot-instructions.md")

# Windsurf (reuse cursor template with header swap)
Replace-Template (Join-Path $TemplateDir ".cursorrules") (Join-Path $InstallDir ".windsurfrules")
$ws = Join-Path $InstallDir ".windsurfrules"
if (Test-Path $ws) {
    (Get-Content $ws -Raw) -replace 'Cursor Rules','Windsurf Rules' -replace 'Cursor-specific','Windsurf-specific' |
        Set-Content $ws -Encoding UTF8 -NoNewline
}

# Codex
New-Item -ItemType Directory -Path (Join-Path $InstallDir ".codex") -Force | Out-Null
Copy-Item (Join-Path $TemplateDir ".codex\config.toml") (Join-Path $InstallDir ".codex\config.toml") -Force

# VS Code workspace file
Copy-Item (Join-Path $TemplateDir "workspace.code-workspace") (Join-Path $InstallDir "Website Generator.code-workspace") -Force
