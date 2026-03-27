const fs = require('fs');
const path = require('path');

function getTemplatesDir() {
  // In development: templates/ next to package.json
  // In packaged app: inside app.asar
  const devPath = path.join(__dirname, '..', '..', 'templates');
  if (fs.existsSync(devPath)) return devPath;

  // Packaged app
  const pkgPath = path.join(process.resourcesPath, 'app', 'templates');
  if (fs.existsSync(pkgPath)) return pkgPath;

  return devPath; // fall back
}

function replaceTemplate(srcPath, destPath, values) {
  if (!fs.existsSync(srcPath)) return;

  let content = fs.readFileSync(srcPath, 'utf8');
  content = content.replace(/\{\{USER_NAME\}\}/g, values.userName || 'User');
  content = content.replace(/\{\{USER_EMAIL\}\}/g, values.userEmail || '');
  content = content.replace(/\{\{ADMIN_NAME\}\}/g, values.adminName || values.userName || 'User');
  content = content.replace(/\{\{USER_PRONOUN_SUBJECT\}\}/g, values.pronounSubject || 'They');
  content = content.replace(/\{\{USER_PRONOUN_OBJECT\}\}/g, values.pronounObject || 'them');
  content = content.replace(/\{\{USER_POSSESSIVE\}\}/g, values.pronounPossessive || 'their');
  content = content.replace(/\{\{EDITOR_NAME\}\}/g, values.editorName || 'your editor');
  content = content.replace(/\{\{WORKSPACE_PATH\}\}/g, values.installDir || '');

  const destDir = path.dirname(destPath);
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(destPath, content, 'utf8');
}

function generateAllConfigs(installDir, values) {
  const tplDir = getTemplatesDir();

  // Create projects directory
  const projectsDir = path.join(installDir, 'projects');
  fs.mkdirSync(projectsDir, { recursive: true });
  fs.writeFileSync(path.join(projectsDir, '.gitkeep'), '', 'utf8');

  // Template files with placeholder replacement
  const templateMappings = [
    ['AGENTS.md', 'AGENTS.md'],
    ['USER_GUIDE.md', 'USER_GUIDE.md'],
    ['CLAUDE.md', 'CLAUDE.md'],
    ['.cursorrules', '.cursorrules'],
    [path.join('.github', 'copilot-instructions.md'), path.join('.github', 'copilot-instructions.md')],
  ];

  for (const [src, dest] of templateMappings) {
    replaceTemplate(
      path.join(tplDir, src),
      path.join(installDir, dest),
      values
    );
  }

  // Windsurf: copy cursorrules with header swap
  const cursorSrc = path.join(tplDir, '.cursorrules');
  const windsurfDest = path.join(installDir, '.windsurfrules');
  if (fs.existsSync(cursorSrc)) {
    let content = fs.readFileSync(cursorSrc, 'utf8');
    // Apply placeholder replacement
    content = content.replace(/\{\{USER_NAME\}\}/g, values.userName || 'User');
    content = content.replace(/\{\{USER_EMAIL\}\}/g, values.userEmail || '');
    content = content.replace(/\{\{ADMIN_NAME\}\}/g, values.adminName || values.userName || 'User');
    content = content.replace(/\{\{USER_PRONOUN_SUBJECT\}\}/g, values.pronounSubject || 'They');
    content = content.replace(/\{\{USER_PRONOUN_OBJECT\}\}/g, values.pronounObject || 'them');
    content = content.replace(/\{\{USER_POSSESSIVE\}\}/g, values.pronounPossessive || 'their');
    content = content.replace(/\{\{EDITOR_NAME\}\}/g, values.editorName || 'your editor');
    content = content.replace(/\{\{WORKSPACE_PATH\}\}/g, values.installDir || '');
    // Header swap
    content = content.replace(/Cursor Rules/g, 'Windsurf Rules');
    content = content.replace(/Cursor-specific/g, 'Windsurf-specific');
    fs.writeFileSync(windsurfDest, content, 'utf8');
  }

  // Direct copies (no placeholder replacement)
  const codexSrc = path.join(tplDir, '.codex', 'config.toml');
  const codexDest = path.join(installDir, '.codex', 'config.toml');
  if (fs.existsSync(codexSrc)) {
    fs.mkdirSync(path.dirname(codexDest), { recursive: true });
    fs.copyFileSync(codexSrc, codexDest);
  }

  const wsSrc = path.join(tplDir, 'workspace.code-workspace');
  const wsDest = path.join(installDir, 'Website Generator.code-workspace');
  if (fs.existsSync(wsSrc)) {
    fs.copyFileSync(wsSrc, wsDest);
  }

  return true;
}

module.exports = { generateAllConfigs, getTemplatesDir };
