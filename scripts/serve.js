'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const files = new Set(['index.html', 'assets/base.css', 'assets/demo.css', 'assets/model.js', 'assets/app.js']);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
const csp = "default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'";
http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let file;
  try { const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); file = pathname === '/' ? 'index.html' : pathname.slice(1); } catch { res.writeHead(400); return res.end(); }
  if (!files.has(file)) { res.writeHead(404); return res.end('Não encontrado.'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(path.join(root, file)).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Demonstração em http://127.0.0.1:${port}`));
