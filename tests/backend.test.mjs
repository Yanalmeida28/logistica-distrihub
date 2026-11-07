import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApi} from '../backend/api.mjs';
import {databaseConfig} from '../backend/config.mjs';
const config={enabled:true,url:'http://127.0.0.1:54321',key:'sb_publishable_test_only_not_real'};
async function server(api,action){const s=http.createServer(async(req,res)=>{if(!await api(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>s.listen(0,'127.0.0.1',r));try{await action('http://127.0.0.1:'+s.address().port);}finally{await new Promise(r=>s.close(r));}}
const headers={Host:'127.0.0.1:4180',Origin:'http://127.0.0.1:4180','Content-Type':'application/json'};
// Raw HTTP permits an explicit Host when the test server uses an ephemeral port.
const localFetch=(url,options={})=>new Promise((resolve,reject)=>{const req=http.request(url,{method:options.method??'GET',headers:options.headers},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});req.on('error',reject);req.end(options.body);});
test('configuracao desligada por padrao e recusa URL externa/ERP/chave privilegiada',()=>{
  assert.equal(databaseConfig({}).enabled,false);
  for(const url of ['https://kcxefjgchxhvcfppglvp.supabase.co','https://other.supabase.co','http://127.0.0.1.evil.test:54321','http://user:pass@127.0.0.1:54321'])assert.equal(databaseConfig({LOGISTICS_DATABASE_MODE:'local',LOGISTICS_SUPABASE_URL:url,LOGISTICS_PUBLISHABLE_KEY:config.key}).enabled,false);
  assert(databaseConfig({LOGISTICS_DATABASE_MODE:'local',LOGISTICS_SUPABASE_URL:config.url,LOGISTICS_PUBLISHABLE_KEY:config.key}).enabled);
  assert.equal(databaseConfig({LOGISTICS_DATABASE_MODE:'local',LOGISTICS_SUPABASE_URL:config.url,LOGISTICS_PUBLISHABLE_KEY:'sb_secret_test'}).enabled,false);
});
test('homologacao aceita exclusivamente o projeto novo e chave publica moderna',()=>{
  const env={LOGISTICS_DATABASE_MODE:'homologation',LOGISTICS_PROJECT_REF:'cbbvmtinbgsmehthlhgn',LOGISTICS_SUPABASE_URL:'https://cbbvmtinbgsmehthlhgn.supabase.co',LOGISTICS_PUBLISHABLE_KEY:config.key};
  assert.equal(databaseConfig(env).mode,'homologation');
  for(const patch of [{LOGISTICS_PROJECT_REF:'kcxefjgchxhvcfppglvp'},{LOGISTICS_SUPABASE_URL:'https://kcxefjgchxhvcfppglvp.supabase.co'},{LOGISTICS_SUPABASE_URL:'https://other.supabase.co'},{LOGISTICS_SUPABASE_URL:'http://cbbvmtinbgsmehthlhgn.supabase.co'},{LOGISTICS_PUBLISHABLE_KEY:'sb_secret_not_allowed'}])assert.equal(databaseConfig({...env,...patch}).enabled,false);
});
test('sem configuracao nao cria cliente nem chama Auth; status nao expoe chave',async()=>{
  let called=false;await server(createApi({config:{enabled:false,reason:'not_configured'},clientFactory:()=>{called=true;throw Error();}}),async base=>{
    const status=await localFetch(base+'/api/status',{headers});assert.deepEqual(await status.json(),{configured:false,mode:'disabled',reason:'not_configured'});
    const login=await localFetch(base+'/api/login',{method:'POST',headers,body:'{}'});assert.equal(login.status,503);assert.equal(called,false);
  });
});
test('origem ausente/estranha, Host e metodos invalidos sao recusados',async()=>{
  await server(createApi({config}),async base=>{
    for(const origin of ['', 'https://evil.test'])assert.equal((await localFetch(base+'/api/login',{method:'POST',headers:{...headers,Origin:origin},body:'{}'})).status,403);
    assert.equal((await localFetch(base+'/api/status',{headers:{Host:'evil.test'}})).status,421);
    assert.equal((await localFetch(base+'/api/status',{method:'DELETE',headers})).status,405);
    assert.equal((await localFetch(base+'/api/workspace',{headers})).status,401);
  });
});
test('contrato HTTP de sessao: cookie HttpOnly, senha preservada, nenhum token no corpo e getUser obrigatorio',async()=>{
  let password,valid=true,calls=0;
  // Unit transport double only. Real Auth/JWT integration remains pending.
  const client={auth:{signInWithPassword:async input=>{password=input.password;return {data:{user:{id:'u'},session:{expires_at:Math.floor(Date.now()/1000)+3600,access_token:'never_return_token',refresh_token:'never_return_refresh'}}};},getUser:async()=>{calls++;return valid?{data:{user:{id:'u'}}}:{error:{message:'revoked'}};},signOut:async()=>({})}};
  await server(createApi({config,clientFactory:()=>client}),async base=>{
    const login=await localFetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',password:' spaces retained '})});assert.equal(login.status,200);assert.equal(password,' spaces retained ');
    assert.deepEqual(await login.json(),{authenticated:true});const cookie=login.headers.get('set-cookie');assert(cookie.includes('HttpOnly'));assert(cookie.includes('SameSite=Strict'));assert(cookie.includes('Path=/api'));
    const authorized={...headers,Cookie:cookie.split(';')[0]};
    valid=false;const response=await localFetch(base+'/api/workspace',{headers:authorized});assert.equal(response.status,401);assert.equal(calls,1);
    assert.equal((await localFetch(base+'/api/company',{method:'POST',headers:authorized,body:'{}'})).status,401);
  });
});
test('tentativas de login limitadas e erro nao revela detalhes do provider',async()=>{
  await server(createApi({config,clientFactory:()=>({auth:{signInWithPassword:async()=>({error:{message:'SECRET PROVIDER DETAIL'}})}})}),async base=>{
    for(let i=0;i<5;i++){const r=await localFetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',password:'fake'})});assert.equal(r.status,401);assert(!(await r.text()).includes('SECRET'));}
    assert.equal((await localFetch(base+'/api/login',{method:'POST',headers,body:'{}'})).status,429);
  });
});
test('cadastro nao repassa papel, usuario ou ativo fornecidos pelo navegador; erro RLS nao e exposto',async()=>{
  let inserted,table;
  const client={auth:{signInWithPassword:async()=>({data:{user:{id:'u'},session:{expires_at:Math.floor(Date.now()/1000)+3600}}}),getUser:async()=>({data:{user:{id:'u'}}})},from:name=>{table=name;return {insert:record=>{inserted=record;return {select:()=>({single:async()=>({error:{message:'SECRET SQL RLS DETAIL'}})})};}};}};
  await server(createApi({config,clientFactory:()=>client}),async base=>{
    const login=await localFetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',password:'fake'})});
    const authorized={...headers,Cookie:login.headers.get('set-cookie').split(';')[0]};
    const r=await localFetch(base+'/api/records',{method:'POST',headers:authorized,body:JSON.stringify({kind:'customers',company_id:'00000000-0000-4000-8000-000000000001',branch_id:null,name:'Cliente',role:'owner',active:false,user_id:'attacker'})});
    assert.equal(r.status,403);assert(!(await r.text()).includes('SECRET'));assert.equal(table,'log_customers');assert.deepEqual(Object.keys(inserted).sort(),['branch_id','company_id','name']);
    assert.equal((await localFetch(base+'/api/records',{method:'POST',headers:authorized,body:JSON.stringify({kind:'log_memberships',company_id:'00000000-0000-4000-8000-000000000001',role:'owner'})})).status,400);
  });
});
