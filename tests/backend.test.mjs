import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApi} from '../backend/api.mjs';
import {databaseConfig} from '../backend/config.mjs';
const config={enabled:true,url:'http://127.0.0.1:54321',key:'sb_publishable_test_only_not_real'};
test('freight search and issues require Auth, validate filters and strip forged identity',async()=>{
 const id='00000000-0000-4000-8000-000000000001';let called;
 const client={auth:{signInWithPassword:async()=>({data:{user:{id},session:{expires_at:Math.floor(Date.now()/1000)+3600}}}),getUser:async()=>({data:{user:{id}}})},rpc:async(name,args)=>{called={name,args};return {data:{}};}};
 await server(createApi({config,clientFactory:()=>client}),async base=>{
  const send=(path,payload,h=headers)=>localFetch(base+'/api/'+path,{method:'POST',headers:h,body:JSON.stringify(payload)});
  for(const path of ['freight','cargo-issues'])assert.equal((await send(path,{company_id:id,action:'search'})).status,401);
  const login=await send('login',{email:'test@example.invalid',password:'fake'});const h={...headers,Cookie:login.headers.get('set-cookie').split(';')[0]};
  assert.equal((await send('freight',{company_id:id,action:'search',term:'NF-123',page:6,actor_id:id,role:'owner'},h)).status,200);
  assert.equal(called.name,'log_freight_read');assert.deepEqual(called.args.p_payload,{term:'NF-123',page:6,page_size:20});
  for(const bad of [{page:0},{page:1.5},{status:'fake'},{branch_id:'bad'},{term:'x'.repeat(121)}])assert.equal((await send('freight',{company_id:id,action:'search',...bad},h)).status,400);
  assert.equal((await send('cargo-issues',{company_id:id,action:'create',cargo_id:id,request_id:id,note:'Synthetic damage',kind:'damage',responsibility:'self',responsible_id:'forged',status:'resolved'},h)).status,200);
  assert.equal(called.name,'log_cargo_issues');assert(!('responsible_id' in called.args.p_payload));assert(!('status' in called.args.p_payload));
  assert.equal((await send('cargo-issues',{company_id:id,action:'queue',status:'invented'},h)).status,400);
 });
});
test('direct receipt endpoint authenticates, whitelists payload and accepts missing fiscal references',async()=>{
 const id='00000000-0000-4000-8000-000000000001';let called;
 const client={auth:{signInWithPassword:async()=>({data:{user:{id},session:{expires_at:Math.floor(Date.now()/1000)+3600}}}),getUser:async()=>({data:{user:{id}}})},rpc:async(name,args)=>{called={name,args};return {data:{id}};}};
 await server(createApi({config,clientFactory:()=>client}),async base=>{
  const payload={company_id:id,action:'create_direct',branch_id:id,customer_id:id,destination:'Synthetic destination',volumes:2,note:'Synthetic arrival',request_id:id,created_by:'forged',origin:'collection',status:'delivered'};
  assert.equal((await localFetch(base+'/api/cargos',{method:'POST',headers,body:JSON.stringify(payload)})).status,401);
  const login=await localFetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',password:'fake'})});const authorized={...headers,Cookie:login.headers.get('set-cookie').split(';')[0]};
  assert.equal((await localFetch(base+'/api/cargos',{method:'POST',headers:authorized,body:JSON.stringify(payload)})).status,200);
  assert.equal(called.name,'log_cargos_workspace');assert.equal(called.args.p_payload.nf_reference,null);assert.equal(called.args.p_payload.cte_reference,null);
  for(const field of ['created_by','origin','status','company_id'])assert(!(field in called.args.p_payload));
  assert.equal((await localFetch(base+'/api/cargos',{method:'POST',headers:authorized,body:JSON.stringify({...payload,volumes:1.5})})).status,400);
  await localFetch(base+'/api/documents',{method:'POST',headers:authorized,body:JSON.stringify({action:'list',company_id:id,cargo_id:id})});assert.deepEqual(called.args.p_payload,{cargo_id:id});
  assert.equal((await localFetch(base+'/api/documents',{method:'POST',headers:authorized,body:JSON.stringify({action:'list',company_id:id,cargo_id:id,order_id:id})})).status,400);
 });
});
test('customer endpoint requires session and scopes updates to company/id without moving branch or elevating role',async()=>{
  const id='00000000-0000-4000-8000-000000000001',company='00000000-0000-4000-8000-000000000002';let changes,filters;
  const client={auth:{signInWithPassword:async()=>({data:{user:{id},session:{expires_at:Math.floor(Date.now()/1000)+3600}}}),getUser:async()=>({data:{user:{id}}})},from:()=>{
    const query={update(value){changes=value;filters=[];return this;},eq(key,value){filters.push([key,value]);return this;},select(){return this;},single:async()=>({error:{message:'PRIVATE DATABASE ERROR'}})};return query;
  }};
  await server(createApi({config,clientFactory:()=>client}),async base=>{
    assert.equal((await localFetch(base+'/api/customers',{method:'POST',headers,body:'{}'})).status,401);
    const login=await localFetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',password:'fake'})});
    const authorized={...headers,Cookie:login.headers.get('set-cookie').split(';')[0]};
    const response=await localFetch(base+'/api/customers',{method:'POST',headers:authorized,body:JSON.stringify({action:'update',id,company_id:company,name:'Cliente sintético',active:false,person_type:'PF',branch_id:id,created_by:id,role:'owner',email:'synthetic@example.invalid'})});
    assert.equal(response.status,403);assert(!(await response.text()).includes('PRIVATE'));
    assert.deepEqual(filters,[['company_id',company],['id',id]]);assert.equal(changes.active,false);assert.equal(changes.person_type,'PF');
    for(const field of ['branch_id','company_id','role','created_by'])assert(!(field in changes));
  });
});
async function server(api,action){const s=http.createServer(async(req,res)=>{if(!await api(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>s.listen(0,'127.0.0.1',r));try{await action('http://127.0.0.1:'+s.address().port);}finally{await new Promise(r=>s.close(r));}}
const headers={Host:'127.0.0.1:4180',Origin:'http://127.0.0.1:4180','Content-Type':'application/json'};

test('saved pickup address uses the dedicated RPC and never trusts an address string or role from the browser',async()=>{
 const id='00000000-0000-4000-8000-000000000001';let called;
 const client={auth:{signInWithPassword:async()=>({data:{user:{id},session:{expires_at:Math.floor(Date.now()/1000)+3600}}}),getUser:async()=>({data:{user:{id}}})},rpc:async(name,args)=>{called={name,args};return {data:{id}};}};
 await server(createApi({config,clientFactory:()=>client}),async base=>{
  const payload={company_id:id,branch_id:id,customer_id:id,pickup_address_id:id,pickup_address:'Forged',role:'owner',action:'create',request_id:id,volumes:2,destination:'Synthetic destination',note:'Synthetic arrival'};
  assert.equal((await localFetch(base+'/api/collections',{method:'POST',headers,body:JSON.stringify(payload)})).status,401);
  const login=await localFetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',password:'fake'})});const authorized={...headers,Cookie:login.headers.get('set-cookie').split(';')[0]};
  assert.equal((await localFetch(base+'/api/collections',{method:'POST',headers:authorized,body:JSON.stringify(payload)})).status,200);
  assert.equal(called.name,'log_collection_from_address');assert.equal(called.args.p_payload.pickup_address_id,id);
  assert(!('pickup_address' in called.args.p_payload));assert(!('role' in called.args.p_payload));assert(!('p_action' in called.args));
  assert.equal((await localFetch(base+'/api/collections',{method:'POST',headers:authorized,body:JSON.stringify({...payload,pickup_address_id:'invalid'})})).status,400);
 });
});

test('pickup address update is scoped to company/id and cannot move customer, branch, creator or grant privileges',async()=>{
 const id='00000000-0000-4000-8000-000000000001';let table,record,filters;
 const client={auth:{signInWithPassword:async()=>({data:{user:{id},session:{expires_at:Math.floor(Date.now()/1000)+3600}}}),getUser:async()=>({data:{user:{id}}})},from:name=>{table=name;const q={update:value=>{record=value;filters=[];return q;},eq:(key,value)=>{filters.push([key,value]);return q;},select:()=>q,single:async()=>({data:{id}})};return q;}};
 await server(createApi({config,clientFactory:()=>client}),async base=>{
  assert.equal((await localFetch(base+'/api/pickup-addresses',{method:'POST',headers,body:'{}'})).status,401);
  const login=await localFetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',password:'fake'})});const authorized={...headers,Cookie:login.headers.get('set-cookie').split(';')[0]};
  const result=await localFetch(base+'/api/pickup-addresses',{method:'POST',headers:authorized,body:JSON.stringify({action:'update',company_id:id,id,label:'Depósito',address:'Rua fictícia 200',active:false,customer_id:'foreign',branch_id:'foreign',created_by:'forged',role:'owner'})});
  assert.equal(result.status,200);assert.equal(table,'log_customer_pickup_addresses');assert.deepEqual(record,{label:'Depósito',address:'Rua fictícia 200',active:false});assert.deepEqual(filters,[['company_id',id],['id',id]]);
 });
});
test('portal, documentos e chat exigem sessao; API nao aceita identidade forjada',async()=>{
  const id='00000000-0000-4000-8000-000000000001';let called;
  const client={auth:{signInWithPassword:async()=>({data:{user:{id},session:{expires_at:Math.floor(Date.now()/1000)+3600}}}),getUser:async()=>({data:{user:{id}}})},rpc:async(name,args)=>{called={name,args};return {error:{message:'PRIVATE SQL ERROR'}};}};
  await server(createApi({config,clientFactory:()=>client}),async base=>{
    for(const path of ['portal','chat','documents'])assert.equal((await localFetch(base+'/api/'+path,{method:'POST',headers,body:'{}'})).status,401);
    const login=await localFetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',password:'fake'})});
    const h={...headers,Cookie:login.headers.get('set-cookie').split(';')[0]};
    const send=(path,body)=>localFetch(base+'/api/'+path,{method:'POST',headers:h,body:JSON.stringify(body)});
    const denied=await send('chat',{company_id:id,action:'send',branch_id:id,recipient_id:id,request_id:id,body:'Mensagem',sender_id:'attacker',role:'owner'});
    assert.equal(denied.status,403);assert(!(await denied.text()).includes('PRIVATE'));assert.deepEqual(called.args.p_payload,{branch_id:id,recipient_id:id,request_id:id,body:'Mensagem'});
    await send('portal',{action:'incoming',company_id:id});assert.equal(called.args.p_company,null);
    await send('portal',{company_id:id,action:'invite',order_id:id,email:'test@example.invalid',role:'owner',user_id:'attacker'});assert.deepEqual(called.args.p_payload,{order_id:id,email:'test@example.invalid'});
    assert.equal((await send('documents',{company_id:id,action:'public_url',id})).status,400);
  });
});
test('coletas exigem sessao, chave de repeticao e versao; payload nao permite forjar autor ou status',async()=>{
  const id='00000000-0000-4000-8000-000000000001';let called;
  const client={auth:{signInWithPassword:async()=>({data:{user:{id},session:{expires_at:Math.floor(Date.now()/1000)+3600}}}),getUser:async()=>({data:{user:{id}}})},rpc:async(name,args)=>{called={name,args};return {error:{message:'PRIVATE SQL DETAIL'}};}};
  await server(createApi({config,clientFactory:()=>client}),async base=>{
    assert.equal((await localFetch(base+'/api/collections',{method:'POST',headers,body:'{}'})).status,401);
    const login=await localFetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',password:'fake'})});
    const h={...headers,Cookie:login.headers.get('set-cookie').split(';')[0]};
    const send=body=>localFetch(base+'/api/collections',{method:'POST',headers:h,body:JSON.stringify(body)});
    const payload={company_id:id,action:'collect',id,request_id:id,expected_version:3,note:'Confirmado no teste',actor_id:'attacker',status:'delivered'};
    const response=await send(payload);assert.equal(response.status,403);assert(!(await response.text()).includes('PRIVATE'));
    assert.deepEqual(called,{name:'log_collections',args:{p_company:id,p_action:'collect',p_payload:{id,request_id:id,expected_version:3,note:'Confirmado no teste'}}});
    assert.equal((await send({...payload,request_id:null})).status,400);
    assert.equal((await send({...payload,expected_version:0})).status,400);
    assert.equal((await send({...payload,action:'create',branch_id:id,customer_id:id,volumes:1.5,pickup_address:'Rua de teste',destination:'Outra rua'})).status,400);
    assert.equal((await send({...payload,action:'advance',next_status:'unknown'})).status,400);
    await send({company_id:id,action:'list',actor_id:'attacker'});assert.deepEqual(called.args.p_payload,{});
  });
});
test('equipe exige sessao, filtra payload e preserva negacao do banco',async()=>{
  const id='00000000-0000-4000-8000-000000000001';let called;
  const client={auth:{signInWithPassword:async()=>({data:{user:{id},session:{expires_at:Math.floor(Date.now()/1000)+3600}}}),getUser:async()=>({data:{user:{id}}})},rpc:async(name,args)=>{called={name,args};return {error:{message:'PRIVATE DATABASE ERROR'}};}};
  await server(createApi({config,clientFactory:()=>client}),async base=>{
    assert.equal((await localFetch(base+'/api/team',{method:'POST',headers,body:'{}'})).status,401);
    const login=await localFetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',password:'fake'})});
    const h={...headers,Cookie:login.headers.get('set-cookie').split(';')[0]};
    const send=body=>localFetch(base+'/api/team',{method:'POST',headers:h,body:JSON.stringify(body)});
    assert.equal((await send({action:'invite',company_id:id,email:'other@example.invalid',role:'owner',branch_ids:[id]})).status,400);
    assert.equal(called,undefined);
    const denied=await send({action:'invite',company_id:id,email:'other@example.invalid',role:'driver',branch_ids:[id],created_by:'attacker',active:true});
    assert.equal(denied.status,403);assert(!(await denied.text()).includes('PRIVATE'));
    assert.deepEqual(called,{name:'log_team',args:{p_company:id,p_action:'invite',p_payload:{role:'driver',branch_ids:[id],email:'other@example.invalid'}}});
    await send({action:'incoming',company_id:id});assert.equal(called.args.p_company,null);
    assert.equal((await send({action:'update',company_id:id,id,role:'driver',branch_ids:[id],active:'false'})).status,400);
  });
});
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
