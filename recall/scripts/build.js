import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/study.js': ['study.js', 'text/javascript; charset=utf-8'], '/sources.js': ['sources.js', 'text/javascript; charset=utf-8'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
const assets = {};
for (const [path, [file, type]] of Object.entries(files)) assets[path] = { body: await readFile(new URL(`public/${file}`, root), 'utf8'), type };
const api = (await readFile(new URL('server/api.js', root), 'utf8')).replaceAll('export ', '');
await mkdir(new URL('dist/server/', root), { recursive: true });
await writeFile(new URL('dist/server/index.js', root), `${api}\nconst assets = ${JSON.stringify(assets)};\nexport default { async fetch(request) { const path = new URL(request.url).pathname; if (path.startsWith('/api/')) return handleApi(request); const asset = assets[path]; if (!asset || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', {status:404}); return new Response(request.method === 'HEAD' ? null : asset.body, {headers:{...securityHeaders, 'Content-Type':asset.type, 'Cache-Control':'no-cache'}}); } };\n`);
console.log('Built Recall Worker with embedded assets at dist/server/index.js');
