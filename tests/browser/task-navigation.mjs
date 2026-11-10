// Real Chrome/DOM with synthetic HTTP responses. Does not validate Auth or backend authorization.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const repo=new URL('../../',import.meta.url),delay=ms=>new Promise(r=>setTimeout(r,ms));
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),company=uid(1),branch=uid(2),member=uid(3);
let role='owner',empty=false,denied=false,calls=[],receipts=[],receiptIndex=50;
let pickupRows=[],issues=[];
const allOrders=['pending','assigned','collected','received'].map((status,i)=>({id:uid(10+i),company_id:company,branch_id:branch,customer_id:uid(5),assignee_id:member,status,version:1,volumes:2,pickup_address:'Rua sintética '+i,destination:'Destino de teste'}));
const files=new Map([['/operacao/','operation/index.html'],['/manifest.webmanifest','pwa/manifest.webmanifest'],['/operacao/sw.js','pwa/sw.js'],['/vendor/jspdf.umd.min.js','node_modules/jspdf/dist/jspdf.umd.min.js']]);
for(const directory of ['operation','app','pwa'])for(const name of fs.readdirSync(new URL(directory+'/',repo)))if(/\.(mjs|css|png)$/.test(name))files.set('/'+directory+'/'+name,directory+'/'+name);
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){
    let input={};for await(const chunk of req){input=JSON.parse(chunk.toString());}calls.push({path:pathname,action:input.action,input});
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(pathname==='/api/status')return json(200,{configured:true,mode:'homologation'});
    if(pathname==='/api/workspace')return json(200,{user:{email:'synthetic@example.invalid'},companies:[{id:company,name:'Transportadora sintética',active:true}],memberships:role==='none'?[]:[{id:member,company_id:company,role,active:true}],branches:[{id:branch,company_id:company,name:'Matriz',active:true}],customers:[{id:uid(5),company_id:company,branch_id:null,name:'Cliente sintético',active:true}],vehicles:[],limit:500});
    if(pathname==='/api/customers')return json(200,{records:[{id:uid(5),company_id:company,branch_id:null,name:'Cliente sintético',active:true}]});
    if(pathname==='/api/pickup-addresses'){
      if(input.action==='create'){const record={id:uid(62),company_id:company,branch_id:input.branch_id,customer_id:input.customer_id,label:input.label,address:input.address,active:true};pickupRows.push(record);return json(201,{record});}
      if(input.action==='update'){const record=pickupRows.find(row=>row.id===input.id);Object.assign(record,{label:input.label,address:input.address,active:input.active});return json(200,{record});}
      return json(200,{records:pickupRows});
    }
    if(pathname==='/api/collections'&&input.action==='create')return json(200,{result:{id:uid(70)}});
    if(pathname==='/api/freight'){
      if(denied)return json(403,{error:'Synthetic denied'});
      const rows=empty?[]:receipts.filter(c=>!input.term||[c.id,c.nf_reference,c.cte_reference,'Synthetic customer'].join(' ').toLowerCase().includes(input.term.toLowerCase()));
      if(input.action==='search')return json(200,{result:{rows,total:rows.length,page:input.page,pages:1}});
      const c=receipts.find(c=>c.id===input.id);return c?json(200,{result:{cargo:c,events:[{id:1,source:c.order_id?'collection':'cargo',action:c.order_id?'receive':'receive_direct',note:'Synthetic arrival',actor_id:uid(1),at:new Date().toISOString()}]}}):json(403,{error:'Denied'});
    }
    if(pathname==='/api/cargo-issues'){
      if(denied)return json(403,{error:'Synthetic denied'});
      if(input.action==='create'){const issue={id:uid(300+issues.length),cargo_id:input.cargo_id,kind:input.kind,reason:input.note,status:'open',version:1};issues.push(issue);return json(200,{result:issue});}
      if(input.action==='resolve'){const i=issues.find(i=>i.id===input.id);i.status='resolved';i.version++;return json(200,{result:i});}
      if(input.action==='detail')return json(200,{result:{issues:issues.filter(i=>i.cargo_id===input.cargo_id),events:[]}});
      const rows=empty?[]:receipts.filter(c=>!c.nf_reference||!c.cte_reference).map(c=>({id:'documentation:'+c.id,cargo_id:c.id,kind:'documentation',reason:'Missing NF/CTe',status:'open',next_action:'Complete references'}));rows.push(...issues.filter(i=>i.status==='open'));return json(200,{result:{rows,total:rows.length,page:1,pages:1}});
    }
    if(pathname==='/api/cargos'){
      if(input.action==='create_direct'){const c={id:uid(receiptIndex++),company_id:company,branch_id:input.branch_id,customer_id:input.customer_id,destination:input.destination,volumes:input.volumes,origin:'direct',order_id:null,status:'received',version:1,nf_reference:null,cte_reference:null};receipts.push(c);return json(200,{result:{id:c.id}});}
      if(input.action==='list')return denied?json(403,{error:'Synthetic denied'}):json(200,{result:receipts});
      const c=receipts.find(r=>r.id===input.id);if(!c)return json(403,{error:'Synthetic cargo missing'});
      if(input.action==='advance'){c.status=input.next_status;c.version++;return json(200,{result:{id:c.id}});}
      if(input.action==='references'){c.nf_reference=input.nf_reference;c.cte_reference=input.cte_reference;c.version++;return json(200,{result:{id:c.id}});}
      if(input.action==='detail')return json(200,{result:{cargo:c,events:[{action:'receive_direct',note:'Synthetic arrival',actor_id:uid(1),at:new Date().toISOString()}]}});
    }
    if(pathname==='/api/portal'&&input.action==='manage')return json(200,{result:{grants:[],invites:[]}});
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
    for(const currentRole of ['owner','administrative','manager','driver','collector','client','none']){
      role=currentRole;empty=false;denied=false;calls=[];issues=[];receipts=[{id:uid(90),company_id:company,branch_id:branch,customer_id:uid(5),destination:'Synthetic collected cargo',volumes:2,origin:'collection',order_id:uid(13),status:'received',version:1,nf_reference:null,cte_reference:null}];
      pickupRows=[{id:uid(60),company_id:company,branch_id:branch,customer_id:uid(5),label:'Loja',address:'Rua sintética 100',active:true},{id:uid(61),company_id:company,branch_id:branch,customer_id:uid(5),label:'Depósito',address:'Galpão sintético 200',active:true}];
      await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/operacao/?role='+role});
      const first=role==='client'?'relations':['driver','collector'].includes(role)?'collections':'overview';
      await waitFor('document.querySelector("[data-operation-tab][aria-current=page]")?.dataset.operationTab==='+JSON.stringify(first));
      await delay(150);
      if(['owner','administrative','manager'].includes(role)){
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
        await waitFor('document.querySelector("[data-customer-pickups]")');
        await evaluate('document.querySelector("[data-customer-pickups]").click()');await waitFor('document.querySelector("[data-pickup-new]")');
        await evaluate('document.querySelector("[data-pickup-new]").click()');
        await evaluate('(()=>{const f=document.querySelector("[data-pickup-form]");f.elements.label.value="Galpão novo";f.elements.address.value="Rua sintética 300";f.requestSubmit();})()');
        await waitFor('document.querySelector("[data-pickup-manager]")?.textContent.includes("Galpão novo")&&!document.querySelector("[data-pickup-form]")');
        assert.equal(pickupRows.length,3);
        await evaluate('document.querySelector('+JSON.stringify('[data-pickup-edit="'+uid(60)+'"]')+').click()');
        await evaluate('(()=>{const f=document.querySelector("[data-pickup-form]");f.elements.active.value="false";f.requestSubmit();})()');
        await waitFor('document.querySelector("[data-pickup-close]")&&!document.querySelector("[data-pickup-form]")');assert.equal(pickupRows[0].active,false);
        await evaluate('document.querySelector("[data-pickup-close]").click()');
        await tab('collections');await evaluate('document.querySelector("[data-refresh-collections]").click()');
        await waitFor('(()=>{const s=document.querySelector("[name=pickup_address_id]");return s&&Array.from(s.options).some(o=>o.value==='+JSON.stringify(uid(62))+')&&!Array.from(s.options).some(o=>o.value==='+JSON.stringify(uid(60))+');})()');
        assert.equal(await evaluate('Array.from(document.querySelector("[name=pickup_address_id]").options).some(o=>o.value==='+JSON.stringify(uid(60))+')'),false);
        await evaluate('(()=>{const f=document.querySelector("[data-collection=create]");f.elements.pickup_address_id.value='+JSON.stringify(uid(61))+';f.elements.pickup_address_id.dispatchEvent(new Event("change",{bubbles:true}));})()');
        assert.equal(await evaluate('document.querySelector("[name=pickup_address]").value'),'Galpão sintético 200');
        assert.equal(await evaluate('document.querySelector("[name=pickup_address]").readOnly'),true);
        await evaluate('(()=>{const f=document.querySelector("[data-collection=create]");f.elements.destination.value="Destino sintético";f.elements.volumes.value="2";f.elements.note.value="Coleta no local escolhido";f.requestSubmit();})()');
        await waitFor('document.querySelector("[data-collection=create]").elements.destination.value===""');
        assert.equal(calls.find(c=>c.path==='/api/collections'&&c.action==='create').input.pickup_address_id,uid(61));
        await tab('cargos');await evaluate('document.querySelector("[data-freight-open]").click()');await waitFor('document.querySelector("[data-freight-action=references]")');
        await waitFor('document.querySelector("[data-freight-relations]")?.textContent.includes("Convidar contato")');
        assert(calls.some(c=>c.path==='/api/documents'&&c.action==='list'&&c.input.order_id===uid(13)));
        await evaluate('document.querySelector("[data-freight-back]").click()');await waitFor('document.querySelector("[data-freight-open]")');
        await tab('receiving');
        await evaluate('(()=>{const f=document.querySelector("[data-direct-receipt]");f.closest("details").open=true;for(const [name,value] of Object.entries({volumes:"2",destination:"Synthetic counter cargo",note:"Synthetic arrival"}))f.elements[name].value=value;f.requestSubmit();f.requestSubmit();})()');
        await waitFor('document.querySelector("[data-operation-tab=cargos]").getAttribute("aria-current")==="page"&&document.querySelector("[data-freight-action=references]")');
        assert.equal(calls.filter(c=>c.path==='/api/cargos'&&c.action==='create_direct').length,1);
        assert.equal(await evaluate('document.querySelector("[data-operation-panel=cargos]").textContent.includes("Chegada direta")'),true);
        const directId=receipts.at(-1).id;
        await tab('overview');await evaluate('document.querySelector("[data-overview-refresh]").click()');
        await waitFor('document.querySelector('+JSON.stringify('[data-overview-cargo="'+directId+'"]')+')');
        await evaluate('document.querySelector('+JSON.stringify('[data-overview-cargo="'+directId+'"]')+').click()');
        await waitFor('document.querySelector("[data-freight-action=references]")');
        await waitFor('document.querySelector("[data-freight-action=references] button:not(:disabled)")');
        await evaluate('(()=>{const f=document.querySelector("[data-freight-action=references]");f.elements.nf_reference.value="NF-SYNTHETIC";f.elements.cte_reference.value="CTE-SYNTHETIC";f.elements.note.value="Synthetic later references";f.requestSubmit();})()');
        await waitFor('document.querySelector("[data-freight-action=references]")?.dataset.version==="2"');
        let physicalVersion=2;
        for(const nextStatus of ['shipped','destination','out_for_delivery','delivered']){
          await waitFor('document.querySelector("[data-freight-action=advance] button:not(:disabled)")');
          await evaluate('(()=>{const f=document.querySelector("[data-freight-action=advance]");f.elements.note.value="Synthetic physical confirmation";f.requestSubmit();})()');physicalVersion++;
          await waitFor('document.querySelector("[data-freight-action=references]")?.dataset.version==='+JSON.stringify(String(physicalVersion)));
        }
        assert.equal(await evaluate('document.querySelector("[data-freight-action=advance]")===null'),true);
        await send('Page.reload');
        await waitFor('document.querySelector('+JSON.stringify('[data-overview-cargo="'+directId+'"]')+')');
        await evaluate('document.querySelector('+JSON.stringify('[data-overview-cargo="'+directId+'"]')+').click()');
        await waitFor('document.querySelector("[data-freight-action=references]")?.dataset.version==="6"');

        await evaluate('document.querySelector("[data-freight-back]").click()');
        await waitFor('document.querySelector("[data-freight-open]")');
        await evaluate('(()=>{const f=document.querySelector("[data-freight-filters]");f.elements.term.value="NF-SYNTHETIC";f.requestSubmit();})()');
        await waitFor('document.querySelectorAll("[data-freight-open]").length===1');
        await evaluate('document.querySelector("[data-freight-open]").click()');
        await waitFor('document.querySelector("[data-issue-create]")');
        await evaluate('(()=>{const f=document.querySelector("[data-issue-create]");f.closest("details").open=true;f.elements.note.value="Synthetic damage";f.requestSubmit();f.requestSubmit();})()');
        await waitFor('document.querySelector("[data-issue-resolve]")');assert.equal(issues.length,1);
        await evaluate('(()=>{const f=document.querySelector("[data-issue-resolve]");f.elements.note.value="Synthetic resolution";f.requestSubmit();})()');
        await waitFor('document.querySelector("[data-cargo-issues]")?.textContent.includes("Resolvida")');
        assert.equal(receipts.find(c=>c.id===directId).status,'delivered');
        await evaluate('document.querySelector("[data-freight-back]").click()');
        await waitFor('document.querySelector("[data-freight-search]")');
        assert.equal(await evaluate('document.querySelector("[data-freight-search]").value'),'NF-SYNTHETIC');
        await tab('pending');await waitFor('document.querySelector("[data-pending-cargo]")');
        await evaluate('document.querySelector("[data-pending-cargo]").click()');
        await waitFor('document.querySelector("[data-operation-tab=cargos]").getAttribute("aria-current")==="page"&&document.querySelector("[data-freight-action=references]")');
        assert.equal(await evaluate('document.querySelector("[data-freight-action=references]").elements.nf_reference.value'),'');
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
  assert.deepEqual(errors,[]);console.log('PASS no JavaScript exceptions; synthetic HTTP only; fixture mutations only, no Supabase/Meta.');
}finally{ws?.close();chrome.kill();await new Promise(r=>server.close(r));}
