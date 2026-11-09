// Real Chrome/DOM with synthetic HTTP responses. Does not validate Auth or backend authorization.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const repo=new URL('../../',import.meta.url),delay=ms=>new Promise(r=>setTimeout(r,ms));
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),company=uid(1),branch=uid(2),member=uid(3);
let role='owner',empty=false,denied=false,calls=[];
const allOrders=['pending','assigned','collected','received'].map((status,i)=>({id:uid(10+i),company_id:company,branch_id:branch,customer_id:uid(5),assignee_id:member,status,version:1,volumes:2,pickup_address:'Rua sintética '+i,destination:'Destino de teste'}));
const files=new Map([['/operacao/','operation/index.html'],['/manifest.webmanifest','pwa/manifest.webmanifest'],['/operacao/sw.js','pwa/sw.js'],['/vendor/jspdf.umd.min.js','node_modules/jspdf/dist/jspdf.umd.min.js']]);
for(const directory of ['operation','app','pwa'])for(const name of fs.readdirSync(new URL(directory+'/',repo)))if(/\.(mjs|css|png)$/.test(name))files.set('/'+directory+'/'+name,directory+'/'+name);
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){
    let input={};for await(const chunk of req){input=JSON.parse(chunk.toString());}calls.push({path:pathname,action:input.action});
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(pathname==='/api/status')return json(200,{configured:true,mode:'homologation'});
    if(pathname==='/api/workspace')return json(200,{user:{email:'synthetic@example.invalid'},companies:[{id:company,name:'Transportadora sintética',active:true}],memberships:role==='none'?[]:[{id:member,company_id:company,role,active:true}],branches:[{id:branch,company_id:company,name:'Matriz',active:true}],customers:[{id:uid(5),company_id:company,branch_id:null,name:'Cliente sintético',active:true}],vehicles:[],limit:500});
    if(pathname==='/api/customers')return json(503,{code:'customer_schema_pending',error:'Synthetic schema pending'});
    if(!['list','incoming'].includes(input.action))return json(400,{error:'Writes prohibited in browser harness'});
    if(pathname==='/api/collections')return denied?json(403,{error:'Synthetic denied'}):json(200,{result:{orders:empty?[]:allOrders,cargos:empty?[]:[{company_id:company,branch_id:branch,order_id:uid(13),status:'received'}],events:[],workers:[]}});
    if(pathname==='/api/team')return json(200,{result:input.action==='incoming'?[]:{members:[],invites:[]}});
    if(pathname==='/api/portal')return json(200,{result:[]});
    return json(200,{result:[]});
  }
  const file=files.get(pathname);if(!file){res.writeHead(404);res.end();return;}
  const type=file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/javascript';
  res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(new URL(file,repo)));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
fs.mkdirSync(new URL('.tmp/',repo),{recursive:true});const profile=fs.mkdtempSync(new URL('.tmp/task-chrome-',repo));
const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try{
  let port;for(let i=0;i<80;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];}catch{}if(port)break;await delay(100);}assert(port,'Chrome debugging unavailable');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let sequence=0;const pending=new Map(),errors=[];
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);const item=pending.get(message.id);if(item){clearTimeout(item.timer);pending.delete(message.id);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
  const waitFor=async expression=>{for(let n=0;n<60;n++){if(await evaluate(expression))return;await delay(100);}throw Error('UI timeout: '+expression);};
  const tab=async id=>{await evaluate('document.querySelector('+JSON.stringify('[data-operation-tab="'+id+'"]')+').click()');await waitFor('document.querySelector("[data-operation-tab][aria-current=page]")?.dataset.operationTab==='+JSON.stringify(id));};
  await send('Runtime.enable');await send('Page.enable');
  for(const width of [1440,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
    for(const currentRole of ['owner','administrative','driver','collector','client','none']){
      role=currentRole;empty=false;denied=false;calls=[];
      await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/operacao/?role='+role});
      const first=role==='client'?'relations':['driver','collector'].includes(role)?'collections':'overview';
      await waitFor('document.querySelector("[data-operation-tab][aria-current=page]")?.dataset.operationTab==='+JSON.stringify(first));
      await delay(150);
      if(['owner','administrative'].includes(role)){
        await waitFor('document.querySelector("[data-overview-order]")');
        await evaluate('document.querySelector("[data-overview-order][data-overview-task=receiving]").click()');
        await waitFor('document.querySelector("[data-operation-tab=receiving]").getAttribute("aria-current")==="page"');
        assert.equal(await evaluate('document.querySelectorAll("[data-order-card]").length'),1);
        assert.equal(await evaluate('document.querySelector("[data-order-card]").dataset.orderCard'),uid(12));
        await evaluate('document.querySelector("[data-collection-back]").click()');await waitFor('!document.querySelector("[data-collection-back]")');
        for(const id of ['collections','receiving','cargos','pending'])await tab(id);
        await tab('collections');
        await evaluate('(()=>{const s=document.querySelector("[data-collection-search]");s.value="'+uid(11)+'";s.dispatchEvent(new Event("input",{bubbles:true}));})()');
        await waitFor('document.querySelectorAll("[data-order-card]").length===1');
        await evaluate('document.querySelector("[data-collection-open]").click()');await waitFor('document.querySelector("[data-collection-back]")');
        await evaluate('document.querySelector("[data-collection-back]").click()');await waitFor('!document.querySelector("[data-collection-back]")');
        assert.equal(await evaluate('document.querySelector("[data-collection-search]").value'),uid(11));
        assert.equal(await evaluate('document.querySelectorAll("[data-order-card]").length'),1);
        await tab('administrative');await evaluate('document.querySelector("[data-admin-go=customers]").click()');
        assert.equal(await evaluate('document.querySelector("[data-admin-view=customers]").hidden'),false);
        await tab('relations');await tab('chat');
      }else if(['driver','collector'].includes(role)){
        await waitFor('document.querySelector("[data-collection-open]")');await evaluate('document.querySelector("[data-collection-open]").click()');await waitFor('document.querySelector("[data-collection-back]")');
        assert.equal(await evaluate('!!document.querySelector("[data-operation-tab=administrative]")'),false);
        await evaluate('document.querySelector("[data-collection-back]").click()');await tab('chat');
      }else if(role==='client'){
        await waitFor('document.querySelector("[data-operation-panel=relations]").textContent.includes("Nenhuma carga liberada")');
        assert(!calls.some(call=>call.path==='/api/collections'));
        assert.equal(await evaluate('!!document.querySelector("[data-operation-tab=administrative]")'),false);
      }else assert.equal(await evaluate('document.querySelector("[data-operation-panel=overview]").textContent.includes("Sem acesso operacional")'),true);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Overflow '+width+' '+role);
      console.log('PASS browser '+width+'px '+role);
    }
    for(const state of ['empty','denied']){
      role='owner';empty=state==='empty';denied=state==='denied';calls=[];
      await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/operacao/?state='+state});
      await waitFor('document.querySelector("[data-operation-tab=receiving]")');await tab('receiving');
      await waitFor('document.querySelector("[data-operation-panel=collections]").textContent.includes('+JSON.stringify(denied?'Sem acesso':'Nenhuma ordem')+')');
      assert.equal(await evaluate('document.querySelectorAll("[data-order-card]").length'),0);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);console.log('PASS browser '+width+'px '+state);
    }
  }
  assert.deepEqual(errors,[]);console.log('PASS no JavaScript exceptions; synthetic HTTP only, no Supabase/Meta or writes.');
}finally{ws?.close();chrome.kill();await new Promise(r=>server.close(r));}
