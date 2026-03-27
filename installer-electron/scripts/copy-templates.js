const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'installer', 'templates');
const dest = path.join(__dirname, '..', 'templates');

function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, entry.name);
    const dp = path.join(d, entry.name);
    if (entry.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

if (fs.existsSync(src)) {
  copyDir(src, dest);
  console.log('Templates copied to installer-electron/templates/');
} else {
  console.error('Source templates not found at:', src);
  process.exit(1);
}
