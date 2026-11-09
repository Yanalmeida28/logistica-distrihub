import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {mountInstaller,installInstructions} from '../pwa/install.mjs';

test('manifest starts in the authenticated operation; PNG icons have the declared sizes',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../pwa/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.name,'DistriHub Logística');assert.equal(manifest.display,'standalone');
  assert.equal(manifest.scope,'/operacao/');assert(manifest.start_url.startsWith(manifest.scope));
  for(const [file,size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]){
    const image=await readFile(new URL('../pwa/'+file,import.meta.url));
    assert.equal(image.subarray(1,4).toString(),'PNG');assert.equal(image.readUInt32BE(16),size);assert.equal(image.readUInt32BE(20),size);
  }
});

function installer({standalone=false,userAgent='Chrome',secure=true}={}){
  const events={},actions={},registered=[];
  const button={hidden:false,disabled:false,addEventListener(name,fn){actions[name]=fn;}};
  const instructions={textContent:''},close={addEventListener(name,fn){actions.close=fn;}};
  const help={open:false,showModal(){this.open=true;},close(){this.open=false;},querySelector(selector){return selector==='[data-pwa-close]'?close:instructions;}};
  const win={isSecureContext:secure,matchMedia:()=>({matches:standalone,addEventListener(){}}),addEventListener(name,fn){events[name]=fn;}};
  const nav={userAgent,serviceWorker:{register:async(...args)=>{registered.push(args);}}};
  const doc={querySelector:selector=>selector==='[data-pwa-install]'?button:help};
  mountInstaller({win,nav,doc});return {events,actions,button,help,instructions,registered};
}
test('native installation uses the browser prompt once and respects cancellation',async()=>{
  const app=installer();let prompted=0,prevented=0;
  app.events.beforeinstallprompt({preventDefault(){prevented++;},prompt:async()=>{prompted++;},userChoice:Promise.resolve({outcome:'dismissed'})});
  await app.actions.click();assert.equal(prompted,1);assert.equal(prevented,1);assert.equal(app.button.hidden,false);assert.equal(app.help.open,false);
  await app.actions.click();assert.equal(prompted,1);assert.equal(app.help.open,true);
});
test('standalone hides install controls and registration is scoped only to operation',async()=>{
  const app=installer({standalone:true});assert.equal(app.button.hidden,true);
  assert.deepEqual(app.registered,[['/operacao/sw.js',{scope:'/operacao/',updateViaCache:'none'}]]);
  assert.equal(installer({secure:false}).registered.length,0);
});
test('iPhone receives manual installation guidance and can close it',async()=>{
  const app=installer({userAgent:'iPhone'});await app.actions.click();
  assert(app.instructions.textContent.includes('Adicionar à Tela de Início'));assert.equal(app.help.open,true);
  app.actions.close();assert.equal(app.help.open,false);
  assert(installInstructions('Android').includes('Chrome'));
});
test('worker never intercepts API, POST, foreign origins or assets; offline navigation has no business cache',async()=>{
  let handler,fail=false,fetches=0;
  const self={location:{origin:'https://logistica.distrihub.com.br'},addEventListener(name,fn){assert.equal(name,'fetch');handler=fn;}};
  vm.runInNewContext(await readFile(new URL('../pwa/sw.js',import.meta.url),'utf8'),{self,URL,Response,
    fetch:async()=>{fetches++;if(fail)throw Error('offline');return new Response('current page');},
    caches:new Proxy({},{get(){throw Error('must never cache');}}),
  });
  const event=(path,method='GET',mode='navigate')=>({request:{url:new URL(path,self.location.origin).href,method,mode},response:null,respondWith(value){this.response=value;}});
  for(const e of [event('/api/workspace'),event('/api/login','POST'),event('/operacao/','POST'),event('/operation/main.mjs','GET','cors'),event('https://other.example/operacao/')]){handler(e);assert.equal(e.response,null);}
  assert.equal(fetches,0);
  const online=event('/operacao/');handler(online);assert.equal(await (await online.response).text(),'current page');
  fail=true;const offline=event('/operacao/');handler(offline);const response=await offline.response;
  assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'no-store');assert((await response.text()).includes('sem conexão'));
});
