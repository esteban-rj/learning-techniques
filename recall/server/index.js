import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { handleApi, securityHeaders } from './api.js';
const publicRoot = new URL('../public/', import.meta.url);
const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/study.js': ['study.js', 'text/javascript; charset=utf-8'], '/sources.js': ['sources.js', 'text/javascript; charset=utf-8'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const controller = new AbortController();
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      const request = new Request(url, { method: req.method, headers: req.headers, signal: controller.signal, ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: req, duplex: 'half' } : {}) });
      const result = await handleApi(request);
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(await result.text());
      return;
    }
    const asset = assets[url.pathname];
    if (!asset || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
    const content = await readFile(new URL(asset[0], publicRoot));
    res.writeHead(200, { ...securityHeaders, 'Content-Type': asset[1], 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(500); res.end('Unable to complete the request.'); }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Recall is ready at http://localhost:${port}`));
