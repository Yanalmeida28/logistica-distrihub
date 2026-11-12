import http from 'node:http';
import fs from 'node:fs/promises';
import {createApi} from './backend/api.mjs';
import {hostingSettings} from './backend/hosting.mjs';
const hosting=hostingSettings();
const api=createApi({publicOrigin:hosting.publicOrigin});
const files = new Map([
  ['/manifest.webmanifest', ['pwa/manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/pwa/icon-192.png', ['pwa/icon-192.png', 'image/png']],
  ['/pwa/icon-512.png', ['pwa/icon-512.png', 'image/png']],
  ['/pwa/apple-touch-icon.png', ['pwa/apple-touch-icon.png', 'image/png']],
  ['/pwa/install.mjs', ['pwa/install.mjs', 'text/javascript; charset=utf-8']],
  ['/operacao/sw.js', ['pwa/sw.js', 'text/javascript; charset=utf-8']],
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/app', ['app/index.html', 'text/html; charset=utf-8']],
  ['/app/', ['app/index.html', 'text/html; charset=utf-8']],
  ['/operacao', ['operation/index.html', 'text/html; charset=utf-8']],
  ['/operacao/', ['operation/index.html', 'text/html; charset=utf-8']],
  ['/vendor/jspdf.umd.min.js', ['node_modules/jspdf/dist/jspdf.umd.min.js', 'text/javascript; charset=utf-8']],
  ['/operation/view-tools.mjs', ['operation/view-tools.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/order-pdf.mjs', ['operation/order-pdf.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/customers.mjs', ['operation/customers.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/pickup-addresses.mjs', ['operation/pickup-addresses.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/admin-area.mjs', ['operation/admin-area.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/management.mjs', ['operation/management.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/access.mjs', ['operation/access.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/overview.mjs', ['operation/overview.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/navigation.mjs', ['operation/navigation.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/main.mjs', ['operation/main.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/commercial.mjs', ['operation/commercial.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/team.mjs', ['operation/team.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/pending.mjs', ['operation/pending.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/freight.mjs', ['operation/freight.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/freight-search.mjs', ['operation/freight-search.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/task-data.mjs', ['operation/task-data.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/collections.mjs', ['operation/collections.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/relations.mjs', ['operation/relations.mjs', 'text/javascript; charset=utf-8']],
  ['/operation/internal-chat.mjs', ['operation/internal-chat.mjs', 'text/javascript; charset=utf-8']],
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
  const pathname=new URL(request.url,'http://127.0.0.1').pathname;
  if(['/app','/app/','/app/index.html'].includes(pathname)){response.writeHead(302,{Location:'/operacao/','Cache-Control':'no-store'});response.end();return;}
  if(pathname.startsWith('/app/')&&pathname!=='/app/styles.css'){response.writeHead(404);response.end('Not found');return;}
  const file = files.get(pathname);
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const content = await fs.readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, {'Content-Type':file[1], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer'});
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(500); response.end('Preview unavailable'); }
});
server.requestTimeout=15000;
server.headersTimeout=10000;
server.listen(hosting.port, hosting.host, () => console.log(hosting.publicOrigin?'Logistica: servidor iniciado.':`Preview local: http://127.0.0.1:${hosting.port}`));
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Porta 4180 ocupada.' : 'Preview indisponivel.'); process.exitCode=1; });
