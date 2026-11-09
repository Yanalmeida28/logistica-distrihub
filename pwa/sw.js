// Network-only PWA. Never persist authenticated pages, API responses or operations.
const offlinePage='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DistriHub Logística · Sem conexão</title><body><main><h1>Você está sem conexão</h1><p>Conecte-se à internet para acessar o DistriHub Logística e consultar informações atualizadas.</p><p>Se uma confirmação foi interrompida, confira o resultado no sistema antes de repetir.</p><a href="/operacao/">Tentar novamente</a></main></body></html>';

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||event.request.mode!=='navigate'||url.origin!==self.location.origin||!url.pathname.startsWith('/operacao/'))return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>new Response(offlinePage,{
    status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'"},
  })));
});
