'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const files = require('./files.json').filter(file => file.endsWith('.js'));
for (const file of [...files.map(file => path.join('public', file)), 'scripts/build.js', 'scripts/serve.js']) { const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status || 1); }
console.log(`Sintaxe verificada: ${files.length + 2} scripts.`);
