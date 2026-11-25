'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const files = ['index.html', 'assets/base.css', 'assets/demo.css', 'assets/model.js', 'assets/app.js'];
fs.mkdirSync(output, { recursive: true });
function prune(directory, prefix = '') {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix + item.name;
    const full = path.join(directory, item.name);
    if (item.isDirectory()) { prune(full, relative + '/'); if (fs.readdirSync(full).length === 0) fs.rmdirSync(full); }
    else if (!files.includes(relative)) fs.unlinkSync(full);
  }
}
prune(output);
for (const file of files) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
}
console.log(`Build concluído: ${files.length} arquivos públicos em dist.`);
