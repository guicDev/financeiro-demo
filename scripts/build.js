'use strict';
const fs = require('node:fs');
const path = require('node:path');
const files = require('./files.json');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
function prune(dir, prefix = '') { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const relative = prefix + item.name, full = path.join(dir, item.name); if (item.isSymbolicLink()) throw Error('Links simbólicos não são permitidos no build.'); if (item.isDirectory()) { prune(full, relative + '/'); if (!fs.readdirSync(full).length) fs.rmdirSync(full); } else if (!files.includes(relative)) fs.unlinkSync(full); } }
prune(output);
for (const file of files) { const source = path.join(root, 'public', file), target = path.join(output, file); if (!fs.statSync(source).isFile()) throw Error(`Arquivo inválido: ${file}`); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target); }
console.log(`Build: ${files.length} arquivos públicos permitidos.`);
