const fs = require('fs');
const path = require('path');
const os = require('os');

class ProjectManager {
  constructor() {
    this.workspacePath = null;
    this.activeProject = null;
  }

  init(savedPath) {
    if (savedPath && fs.existsSync(savedPath)) {
      this.workspacePath = savedPath;
    } else {
      this.workspacePath = this.detectWorkspace();
    }
    // Ensure projects directory exists
    const projectsDir = this.getProjectsDir();
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
    }
  }

  detectWorkspace() {
    const home = os.homedir();
    const candidates = [
      path.join(home, 'Documents', 'websites'),
      path.join(home, 'websites'),
    ];
    for (const dir of candidates) {
      if (fs.existsSync(dir)) return dir;
    }
    // Default: create in Documents/websites
    return candidates[0];
  }

  /**
   * Detect an existing installer-created workspace that can be migrated
   */
  detectMigrationSource() {
    const home = os.homedir();
    const candidates = [
      path.join(home, 'Documents', 'websites'),
      path.join(home, 'websites'),
    ];
    for (const dir of candidates) {
      // Look for AGENTS.md — the hallmark of the installer workspace
      if (fs.existsSync(path.join(dir, 'AGENTS.md'))) {
        return dir;
      }
    }
    return null;
  }

  /**
   * Migrate from an existing installer workspace.
   * Copies config files and links the same projects directory.
   */
  migrate(sourcePath) {
    const results = { configs: [], projects: [] };

    // Copy workspace-level config files
    const configFiles = [
      'AGENTS.md', 'CLAUDE.md', '.cursorrules', '.windsurfrules',
      'USER_GUIDE.md', 'Website Generator.code-workspace',
    ];
    const configDirs = ['.github', '.codex'];

    for (const file of configFiles) {
      const src = path.join(sourcePath, file);
      const dest = path.join(this.workspacePath, file);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
        results.configs.push(file);
      }
    }

    for (const dir of configDirs) {
      const src = path.join(sourcePath, dir);
      const dest = path.join(this.workspacePath, dir);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        this.copyDirSync(src, dest);
        results.configs.push(dir + '/');
      }
    }

    // If source has a projects/ dir, migrate projects
    const srcProjects = path.join(sourcePath, 'projects');
    const destProjects = this.getProjectsDir();
    if (fs.existsSync(srcProjects)) {
      const entries = fs.readdirSync(srcProjects, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== '.gitkeep') {
          const srcDir = path.join(srcProjects, entry.name);
          const destDir = path.join(destProjects, entry.name);
          if (!fs.existsSync(destDir)) {
            this.copyDirSync(srcDir, destDir);
            results.projects.push(entry.name);
          }
        }
      }
    }

    return results;
  }

  copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          this.copyDirSync(srcPath, destPath);
        }
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  setWorkspacePath(p) {
    this.workspacePath = p;
    const projectsDir = this.getProjectsDir();
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
    }
  }

  getWorkspacePath() {
    return this.workspacePath;
  }

  getProjectsDir() {
    return path.join(this.workspacePath, 'projects');
  }

  listProjects() {
    const dir = this.getProjectsDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '.gitkeep')
      .map((d) => {
        const projectPath = path.join(dir, d.name);
        const hasPkg = fs.existsSync(path.join(projectPath, 'package.json'));
        return { name: d.name, path: projectPath, hasPackageJson: hasPkg };
      })
      .sort((a, b) => {
        // Sort by directory creation time (oldest first)
        try {
          const aStat = fs.statSync(a.path);
          const bStat = fs.statSync(b.path);
          return aStat.birthtimeMs - bStat.birthtimeMs;
        } catch {
          return a.name.localeCompare(b.name);
        }
      });
  }

  createProject(name) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) throw new Error('Invalid project name');
    const dir = path.join(this.getProjectsDir(), slug);
    if (fs.existsSync(dir)) throw new Error(`Project "${slug}" already exists`);
    fs.mkdirSync(dir, { recursive: true });

    // Copy instruction templates (AGENTS.md, CLAUDE.md) into the project
    this._copyTemplates(dir);

    this.activeProject = slug;
    return { name: slug, path: dir };
  }

  setUserProfile(profile) {
    this._userProfile = profile;
  }

  _copyTemplates(projectDir) {
    // Templates are bundled in the app's resources or in the installer/templates dir
    const possibleTemplateDirs = [
      path.join(__dirname, '..', '..', '..', 'installer', 'templates'), // dev
      path.join(process.resourcesPath || '', 'templates'),              // packaged
      path.join(__dirname, '..', 'templates'),                          // alt packaged
    ];

    let templateDir = null;
    for (const d of possibleTemplateDirs) {
      if (fs.existsSync(path.join(d, 'AGENTS.md'))) {
        templateDir = d;
        break;
      }
    }
    if (!templateDir) return; // No templates found — skip silently

    const profile = this._userProfile || {};
    const userName = profile.userName || os.userInfo().username || 'User';
    const pronouns = profile.userPronouns || 'they';
    const pronounMap = {
      he:   { subject: 'He', object: 'him', possessive: 'his' },
      she:  { subject: 'She', object: 'her', possessive: 'her' },
      they: { subject: 'They', object: 'them', possessive: 'their' },
    };
    const p = pronounMap[pronouns] || pronounMap.they;
    const replacements = {
      '{{USER_NAME}}': userName,
      '{{ADMIN_NAME}}': 'the developer',
      '{{USER_PRONOUN_SUBJECT}}': p.subject,
      '{{USER_PRONOUN_OBJECT}}': p.object,
      '{{USER_POSSESSIVE}}': p.possessive,
    };

    const templateFiles = ['AGENTS.md', 'CLAUDE.md'];
    for (const file of templateFiles) {
      const dest = path.join(projectDir, file);
      const src = path.join(templateDir, file);
      if (!fs.existsSync(src)) continue;

      // Check if we should overwrite: compare template versions
      if (fs.existsSync(dest)) {
        const srcVersion = this._getTemplateVersion(src);
        const destVersion = this._getTemplateVersion(dest);
        if (srcVersion <= destVersion) continue; // Already up to date
      }

      let content = fs.readFileSync(src, 'utf8');
      for (const [placeholder, value] of Object.entries(replacements)) {
        content = content.split(placeholder).join(value);
      }
      fs.writeFileSync(dest, content, 'utf8');
    }
  }

  deleteProject(name) {
    const dir = path.join(this.getProjectsDir(), name);
    if (!fs.existsSync(dir)) throw new Error(`Project "${name}" not found`);
    fs.rmSync(dir, { recursive: true });
    if (this.activeProject === name) this.activeProject = null;
  }

  getProjectByName(name) {
    if (!name) return null;
    const dir = path.join(this.getProjectsDir(), name);
    if (!fs.existsSync(dir)) return null;
    return { name, path: dir };
  }

  getActiveProject() {
    if (!this.activeProject) return null;
    const dir = path.join(this.getProjectsDir(), this.activeProject);
    if (!fs.existsSync(dir)) {
      this.activeProject = null;
      return null;
    }
    return { name: this.activeProject, path: dir };
  }

  setActiveProject(name) {
    this.activeProject = name;
    // Ensure instruction templates exist in the project
    const project = this.getActiveProject();
    if (project) this._ensureTemplates(project.path);
    return project;
  }

  _getTemplateVersion(filePath) {
    try {
      const first = fs.readFileSync(filePath, 'utf8').substring(0, 100);
      const match = first.match(/template-version:\s*(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } catch { return 0; }
  }

  _ensureTemplates(projectDir) {
    const templateFiles = ['AGENTS.md', 'CLAUDE.md'];
    const missing = templateFiles.filter(f => !fs.existsSync(path.join(projectDir, f)));
    if (missing.length === 0) return;
    this._copyTemplates(projectDir);
  }

  // ── Per-Project Settings ───────────────────────────────────

  /**
   * Default project settings. Each project can override these.
   */
  static defaultProjectSettings() {
    return {
      devCommand: '',        // e.g. "npm run dev" — empty means auto-detect
      buildCommand: '',      // e.g. "npm run build"
      devTimeout: 120,       // seconds to wait for dev server
      deployProjectName: '', // Cloudflare Pages project name override
      customDomain: '',      // Custom domain for deployment
      framework: '',         // Detected/overridden framework (vite, next, cra, etc.)
      backend: '',           // '' = use global default; 'claude' or 'codex'
      claudeModel: '',       // '' = use global default
      codexModel: '',        // '' = use global default
    };
  }

  /**
   * Get per-project settings, merged with defaults.
   */
  getProjectSettings(name) {
    const project = this.getProjectByName(name);
    if (!project) return ProjectManager.defaultProjectSettings();

    const settingsFile = path.join(project.path, '.webgen', 'settings.json');
    try {
      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      return { ...ProjectManager.defaultProjectSettings(), ...saved };
    } catch {
      return ProjectManager.defaultProjectSettings();
    }
  }

  /**
   * Save per-project settings (merges with existing).
   */
  setProjectSettings(name, settings) {
    const project = this.getProjectByName(name);
    if (!project) throw new Error(`Project "${name}" not found`);

    const webgenDir = path.join(project.path, '.webgen');
    if (!fs.existsSync(webgenDir)) {
      fs.mkdirSync(webgenDir, { recursive: true });
    }

    const settingsFile = path.join(webgenDir, 'settings.json');
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch { /* start fresh */ }

    const merged = { ...existing, ...settings };
    fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2));
    return { ...ProjectManager.defaultProjectSettings(), ...merged };
  }
}

module.exports = ProjectManager;
