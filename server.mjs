import http from 'node:http';
import fs from 'node:fs/promises';
import {createApi} from './backend/api.mjs';
const api=createApi();
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/app', ['app/index.html', 'text/html; charset=utf-8']],
  ['/app/', ['app/index.html', 'text/html; charset=utf-8']],
  ['/operacao', ['operation/index.html', 'text/html; charset=utf-8']],
  ['/operacao/', ['operation/index.html', 'text/html; charset=utf-8']],
  ['/operation/main.mjs', ['operation/main.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/styles.css', ['operation/styles.css', 'text/css; charset=utf-8']],
  ['/app/index.html', ['app/index.html', 'text/html; charset=utf-8']],
  ['/app/styles.css', ['app/styles.css', 'text/css; charset=utf-8']],
  ['/app/main.mjs', ['app/main.mjs', 'text/javascript; charset=utf-8']],
  ['/app/portal.mjs', ['app/portal.mjs', 'text/javascript; charset=utf-8']],
  ['/app/portal-domain.mjs', ['app/portal-domain.mjs', 'text/javascript; charset=utf-8']],
  ['/app/domain.mjs', ['app/domain.mjs', 'text/javascript; charset=utf-8']],
  ['/app/demo.mjs', ['app/demo.mjs', 'text/javascript; charset=utf-8']],
  ['/app/team.mjs', ['app/team.mjs', 'text/javascript; charset=utf-8']],
  ['/app/quotes.mjs', ['app/quotes.mjs', 'text/javascript; charset=utf-8']],
  ['/app/quotes-domain.mjs', ['app/quotes-domain.mjs', 'text/javascript; charset=utf-8']],
  ['/app/saas.mjs', ['app/saas.mjs', 'text/javascript; charset=utf-8']],
  ['/app/chat.mjs', ['app/chat.mjs', 'text/javascript; charset=utf-8']],
  ['/app/chat-domain.mjs', ['app/chat-domain.mjs', 'text/javascript; charset=utf-8']],
  ['/app/finance.mjs', ['app/finance.mjs', 'text/javascript; charset=utf-8']],
  ['/app/finance-domain.mjs', ['app/finance-domain.mjs', 'text/javascript; charset=utf-8']],
  ['/app/expense.mjs', ['app/expense.mjs', 'text/javascript; charset=utf-8']],
  ['/app/expense-domain.mjs', ['app/expense-domain.mjs', 'text/javascript; charset=utf-8']],
  ['/app/dispatch.mjs', ['app/dispatch.mjs', 'text/javascript; charset=utf-8']],
  ['/app/dispatch-domain.mjs', ['app/dispatch-domain.mjs', 'text/javascript; charset=utf-8']],
]);
const server = http.createServer(async (request, response) => {
  try { if(await api(request,response))return; }
  catch { response.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end('{"error":"Serviço local indisponível."}');return; }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, {Allow:'GET, HEAD'}); response.end(); return; }
  const file = files.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const content = await fs.readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, {'Content-Type':file[1], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer'});
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(500); response.end('Preview unavailable'); }
});
server.requestTimeout=15000;
server.headersTimeout=10000;
server.listen(4180, '127.0.0.1', () => console.log('Preview local: http://127.0.0.1:4180'));
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Porta 4180 ocupada.' : 'Preview indisponivel.'); process.exitCode=1; });
