import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('operacao persistente: coleta, recebimento, carga, RLS e idempotencia',async t=>{
 const db=new PGlite();await db.waitReady;const q=async(s,p=[])=>(await db.query(s,p)).rows;
 const as=async(n,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);};
 const rpc=async(company,action,payload={})=>(await q('select public.log_collections($1,$2,$3::jsonb) result',[company,action,JSON.stringify(payload)]))[0].result;
 const command=(extra={})=>({request_id:randomUUID(),note:'Confirmacao sintetica de teste',...extra});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  for(const f of (await fs.readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&!f.endsWith('_logistics_private_storage.sql')).sort())await db.exec(await fs.readFile(new URL('../../supabase/migrations/'+f,import.meta.url),'utf8'));
  for(let n=1;n<=8;n++)await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(n),'op'+n+'@example.invalid']);
  await as(1);const a=(await q("select public.log_create_company('Empresa A','Filial A') id"))[0].id;
  const b1=(await q('select id from public.log_branches'))[0].id;
  const b2=(await q("insert into public.log_branches(company_id,name) values($1,'Filial A2') returning id",[a]))[0].id;
  const shared=(await q("insert into public.log_customers(company_id,name) values($1,'Cliente compartilhado') returning id",[a]))[0].id;
  const customerB2=(await q("insert into public.log_customers(company_id,branch_id,name) values($1,$2,'Cliente A2') returning id",[a,b2]))[0].id;
  const vehicle=(await q("insert into public.log_vehicles(company_id,branch_id,identifier,capacity_volumes) values($1,$2,'TESTE-A',20) returning id",[a,b1]))[0].id;
  const small=(await q("insert into public.log_vehicles(company_id,branch_id,identifier,capacity_volumes) values($1,$2,'TESTE-PEQUENO',1) returning id",[a,b1]))[0].id;
  await as(2);const other=(await q("select public.log_create_company('Empresa B','Filial B') id"))[0].id;
  const foreign=(await q('select id from public.log_branches'))[0].id;
  await db.exec('reset role');const workers={};
  for(const [n,role,branch] of [[3,'driver',b1],[4,'driver',b1],[5,'administrative',b2],[6,'collector',b1],[7,'client',null]]){
   const id=(await q('insert into public.log_memberships(company_id,user_id,role) values($1,$2,$3) returning id',[a,uid(n),role]))[0].id;workers[n]=id;
   if(branch)await q('insert into public.log_member_branches(company_id,membership_id,branch_id) values($1,$2,$3)',[a,id,branch]);
  }
  const create=()=>command({branch_id:b1,customer_id:shared,pickup_address:'Rua ficticia 10',destination:'Destino sintetico',volumes:5});
  let order,version=1;
  await t.test('criacao persistente com cliente compartilhado e repeticao da mesma requisicao',async()=>{
   await as(1);const payload=create();order=(await rpc(a,'create',payload)).id;
   assert.equal((await rpc(a,'create',payload)).id,order);
   assert.equal((await q('select * from public.log_collection_orders')).length,1);
   assert.equal((await q('select * from public.log_cargos')).length,0);
   await assert.rejects(rpc(a,'create',{...payload,volumes:6}));
   const o=(await rpc(a,'list')).orders[0];assert.equal(o.status,'pending');assert.equal(o.created_by,uid(1));
  });
  await t.test('empresa, cliente e filial cruzados recusados, sem escrita direta',async()=>{
   await as(2);assert.equal((await q('select * from public.log_collection_orders')).length,0);await assert.rejects(rpc(a,'list'));
   await as(1);await assert.rejects(rpc(a,'create',{...create(),branch_id:foreign}));await assert.rejects(rpc(a,'create',{...create(),customer_id:customerB2}));
   await assert.rejects(q("update public.log_collection_orders set status='collected' where id=$1",[order]));
   await assert.rejects(q('delete from public.log_collection_events'));
   await assert.rejects(q('select * from public.log_collection_commands'));
  });
  await t.test('administrativo restrito a outra filial nao ve nem altera a ordem',async()=>{
   await as(5);const data=await rpc(a,'list');assert.equal(data.orders.length,0);assert.equal(data.events.length,0);assert.equal(data.workers.length,0);
   await assert.rejects(rpc(a,'assign',command({id:order,expected_version:version,assignee_id:workers[3],vehicle_id:vehicle})));
   await assert.rejects(rpc(a,'create',create()));
  });
  await t.test('atribuicao exige responsavel, capacidade e filial; guarda versao',async()=>{
   await as(1);for(const [assignee_id,vehicle_id] of [[workers[5],vehicle],[workers[3],small]])await assert.rejects(rpc(a,'assign',command({id:order,expected_version:version,assignee_id,vehicle_id})));
   await assert.rejects(rpc(a,'assign',command({id:order,expected_version:999,assignee_id:workers[3],vehicle_id:vehicle})));
   const assigned=await rpc(a,'assign',command({id:order,expected_version:version,assignee_id:workers[3],vehicle_id:vehicle}));version=assigned.version;
   assert.equal((await rpc(a,'list')).events.at(-1).details.assignee_id,workers[3]);
  });
  await t.test('duas tentativas de alocacao nao duplicam responsavel ou veiculo',async()=>{
   await as(1);const second=(await rpc(a,'create',create())).id;
   await assert.rejects(rpc(a,'assign',command({id:second,expected_version:1,assignee_id:workers[3],vehicle_id:vehicle})));
   await assert.rejects(rpc(a,'assign',command({id:second,expected_version:1,assignee_id:workers[4],vehicle_id:vehicle})));
   assert.equal((await q("select * from public.log_collection_orders where status='assigned'")).length,1);
   const data=await rpc(a,'list');assert.equal(data.orders.find(o=>o.id===second).version,1);
  });
  await t.test('outro motorista e cliente nao veem dados; somente atribuido confirma',async()=>{
   await as(4);assert.equal((await q('select * from public.log_collection_orders')).length,0);await assert.rejects(rpc(a,'accept',command({id:order,expected_version:version})));
   await as(7);await assert.rejects(rpc(a,'list'));assert.equal((await q('select * from public.log_collection_events')).length,0);
   await as(1);await assert.rejects(rpc(a,'accept',command({id:order,expected_version:version})));
   await as(3);assert.equal((await rpc(a,'list')).orders.length,1);assert.equal((await rpc(a,'list')).workers.length,0);
   await assert.rejects(rpc(a,'collect',command({id:order,expected_version:version})));
  });
  await t.test('aceite, inicio e coleta sao sequenciais e idempotentes',async()=>{
   await as(3);
   for(const action of ['accept','start','collect']){
    const payload=command({id:order,expected_version:version});const saved=await rpc(a,action,payload);version=saved.version;
    assert.deepEqual(await rpc(a,action,payload),saved);
   }
   assert.equal((await rpc(a,'list')).orders[0].status,'collected');assert.equal((await q('select * from public.log_cargos')).length,0);
   await assert.rejects(rpc(a,'receive',command({id:order,expected_version:version})));
   await as(1);await assert.rejects(rpc(a,'release',command({id:order,expected_version:version})));
  });
  let receipt;
  await t.test('somente a central recebe e cria uma carga, sem inferir embarque',async()=>{
   await as(1);const payload=command({id:order,expected_version:version});receipt=await rpc(a,'receive',payload);version=receipt.version;
   assert.deepEqual(await rpc(a,'receive',payload),receipt);
   const data=await rpc(a,'list');assert.equal(data.cargos.length,1);assert.equal(data.cargos[0].status,'received');
   await assert.rejects(rpc(a,'receive',command({id:order,expected_version:version})));
   await as(3);await assert.rejects(rpc(a,'advance',command({id:order,expected_version:version,next_status:'shipped'})));
  });
  await t.test('rastreamento ate entrega exige confirmacao explicita e historico',async()=>{
   await as(1);await assert.rejects(rpc(a,'advance',command({id:order,expected_version:version,next_status:'delivered'})));
   for(const next_status of ['shipped','destination','out_for_delivery','delivered'])version=(await rpc(a,'advance',command({id:order,expected_version:version,next_status}))).version;
   const data=await rpc(a,'list');assert.equal(data.cargos[0].status,'delivered');
   const events=data.events.filter(e=>e.order_id===order);assert.equal(events.length,version);assert.equal(new Set(events.map(e=>e.version)).size,version);
   assert(events.every(e=>e.actor_id&&e.at&&e.note));
   await as(2);assert.equal((await q('select * from public.log_cargos')).length,0);assert.equal((await q('select * from public.log_collection_events')).length,0);
  });
  await t.test('falha injetada reverte ordem, evento, auditoria e chave idempotente',async()=>{
   await db.exec('reset role');const before=(await q('select count(*)::int n from public.log_collection_commands'))[0].n;
   await db.exec("create function public.test_collect_failure() returns trigger language plpgsql as $$begin if new.object_type='collection' then raise exception 'injected';end if;return new;end$$;create trigger test_collect_failure before insert on public.log_audit for each row execute function public.test_collect_failure()");
   await as(1);const payload=create();await assert.rejects(rpc(a,'create',payload));
   await db.exec('reset role');assert.equal((await q('select count(*)::int n from public.log_collection_commands'))[0].n,before);
   assert.equal((await q('select count(*)::int n from public.log_collection_orders'))[0].n,2);
   await db.exec('drop trigger test_collect_failure on public.log_audit');await as(1);await rpc(a,'create',payload);
  });
  await t.test('liberacao justificada preserva historico e coletor confirma a propria OS',async()=>{
   await as(1);const second=(await rpc(a,'list')).orders.find(o=>o.status==='pending');
   const assign=command({id:second.id,expected_version:second.version,assignee_id:workers[6],vehicle_id:vehicle});
   let saved=await rpc(a,'assign',assign);
   await assert.rejects(rpc(a,'release',command({id:second.id,expected_version:saved.version,note:' '})));
   saved=await rpc(a,'release',command({id:second.id,expected_version:saved.version,note:'Nova distribuicao autorizada'}));
   assert.equal((await rpc(a,'list')).orders.find(o=>o.id===second.id).assignee_id,null);
   saved=await rpc(a,'assign',command({id:second.id,expected_version:saved.version,assignee_id:workers[6],vehicle_id:vehicle}));
   await as(6);
   for(const action of ['accept','start','collect'])saved=await rpc(a,action,command({id:second.id,expected_version:saved.version}));
   const events=(await rpc(a,'list')).events.filter(e=>e.order_id===second.id);
   assert.equal(events.filter(e=>e.action==='assign').length,2);assert.equal(events.filter(e=>e.action==='release').length,1);
   assert.equal((await rpc(a,'list')).orders.find(o=>o.id===second.id).status,'collected');
   await as(1);
   const pending=(await rpc(a,'list')).orders.find(o=>o.status==='pending');
   await assert.rejects(rpc(a,'assign',command({id:pending.id,expected_version:pending.version,assignee_id:workers[4],vehicle_id:vehicle})));
   await rpc(a,'receive',command({id:second.id,expected_version:saved.version}));
  });
  await t.test('tentativas simultaneas no harness preservam chave unica e versao',async()=>{
   // PGlite queues statements in one embedded connection; this is not a multi-connection race test.
   await as(1);const payload=create();const results=await Promise.all([rpc(a,'create',payload),rpc(a,'create',payload)]);
   assert.equal(results[0].id,results[1].id);
   const assignments=await Promise.allSettled([3,4].map(n=>rpc(a,'assign',command({id:results[0].id,expected_version:1,assignee_id:workers[n],vehicle_id:vehicle}))));
   assert.equal(assignments.filter(r=>r.status==='fulfilled').length,1);assert.equal(assignments.filter(r=>r.status==='rejected').length,1);
  });
  await t.test('revogacao retira leitura inclusive de historico e replay',async()=>{
   await db.exec('reset role');await q('update public.log_memberships set active=false where id=$1',[workers[3]]);
   await as(3);assert.equal((await q('select * from public.log_collection_orders')).length,0);assert.equal((await q('select * from public.log_cargos')).length,0);await assert.rejects(rpc(a,'list'));
  });
  await t.test('RLS e ACL de anon e PUBLIC sem bypass',async()=>{
   await as(null,'anon');await assert.rejects(rpc(a,'list'));await assert.rejects(q('select * from public.log_collection_orders'));
   await db.exec('reset role');assert.equal((await q("select has_function_privilege('anon','public.log_collections(uuid,text,jsonb)','execute') allowed"))[0].allowed,false);
   const tables=await q("select relrowsecurity from pg_class where relname in ('log_collection_orders','log_cargos','log_collection_events','log_collection_commands')");assert.equal(tables.length,4);assert(tables.every(t=>t.relrowsecurity));
  });
 }finally{await db.close();}
});
