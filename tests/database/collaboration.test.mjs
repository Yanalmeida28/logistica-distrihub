import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('portal, documentos privados e chat: contratos e isolamento PostgreSQL',async t=>{
 const db=new PGlite();await db.waitReady;const q=async(s,p=[])=>(await db.query(s,p)).rows;
 const as=async(n,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);};
 const rpc=async(name,company,action,payload={})=>(await q('select public.'+name+'($1,$2,$3::jsonb) result',[company,action,JSON.stringify(payload)]))[0].result;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const f of (await fs.readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&!f.endsWith('_logistics_private_storage.sql')).sort())await db.exec(await fs.readFile(new URL('../../supabase/migrations/'+f,import.meta.url),'utf8'));
 for(let n=1;n<=9;n++)await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(n),'contact'+n+'@example.invalid']);
 await as(1);const company=(await q("select public.log_create_company('Empresa A','Filial A') id"))[0].id;
 const branch=(await q('select id from public.log_branches'))[0].id;
 const branch2=(await q("insert into public.log_branches(company_id,name) values($1,'Filial A2') returning id",[company]))[0].id;
 const customer=(await q("insert into public.log_customers(company_id,name) values($1,'Cliente teste') returning id",[company]))[0].id;
 await as(2);const other=(await q("select public.log_create_company('Empresa B','Filial B') id"))[0].id;
 await db.exec('reset role');
 const members={};for(const [n,role,b] of [[5,'driver',branch],[6,'collector',branch],[7,'administrative',branch2],[9,'administrative',branch]]){
  const id=(await q('insert into public.log_memberships(company_id,user_id,role) values($1,$2,$3) returning id',[company,uid(n),role]))[0].id;members[n]=id;await q('insert into public.log_member_branches(company_id,membership_id,branch_id) values($1,$2,$3)',[company,id,b]);
 }
 const owner=(await q("select id from public.log_memberships where company_id=$1 and role='owner'",[company]))[0].id;
 const order=(await q("insert into public.log_collection_orders(company_id,branch_id,customer_id,pickup_address,destination,volumes,created_by) values($1,$2,$3,'Rua ficticia','Destino publico',2,$4) returning id",[company,branch,customer,uid(1)]))[0].id;
 const hidden=(await q("insert into public.log_collection_orders(company_id,branch_id,customer_id,pickup_address,destination,volumes,created_by) values($1,$2,$3,'Rua privada','Outra carga do mesmo cliente',2,$4) returning id",[company,branch,customer,uid(1)]))[0].id;
 await q("insert into public.log_collection_events(company_id,branch_id,order_id,version,action,details,note,actor_id) values($1,$2,$3,1,'collect','{}','INTERNAL SECRET NOTE',$4)",[company,branch,order,uid(1)]);
 let invitation,clientMember,doc;
 await t.test('convite autoriza apenas uma carga e exige o email verificado correto',async()=>{
  await as(1);invitation=(await rpc('log_portal',company,'invite',{order_id:order,email:'CONTACT3@example.invalid'})).id;
  await as(4);assert.equal((await rpc('log_portal',null,'incoming')).length,0);await assert.rejects(rpc('log_portal',company,'accept',{id:invitation}));
  await as(3);assert.equal((await rpc('log_portal',null,'incoming')).length,1);await rpc('log_portal',company,'accept',{id:invitation});
  await assert.rejects(rpc('log_portal',company,'accept',{id:invitation}));
  clientMember=(await q('select id from public.log_memberships'))[0].id;
 });
 await t.test('portal projeta marcos sem notas, autores, endereco interno ou outra carga',async()=>{
  await as(3);const data=await rpc('log_portal',company,'list');assert.equal(data.length,1);assert.equal(data[0].id,order);assert.equal(data[0].events.length,1);
  const encoded=JSON.stringify(data);assert(!encoded.includes('INTERNAL'));assert(!encoded.includes('actor_id'));assert(!encoded.includes('pickup_address'));assert(!encoded.includes(hidden));
  assert.equal((await q('select * from public.log_collection_events')).length,0); // RLS returns no internal events
  await assert.rejects(q('select * from public.log_documents'));
  await assert.rejects(rpc('log_portal',other,'list'));
 });
 await t.test('portal nao transforma funcionario em cliente ou permite administracao cruzada',async()=>{
  await as(1);const id=(await rpc('log_portal',company,'invite',{order_id:order,email:'contact5@example.invalid'})).id;
  await as(5);await assert.rejects(rpc('log_portal',company,'accept',{id}));
  await as(7);await assert.rejects(rpc('log_portal',company,'invite',{order_id:order,email:'contact4@example.invalid'}));
  await as(2);await assert.rejects(rpc('log_portal',company,'manage',{order_id:order}));
 });
 await t.test('preparo de documento e idempotente, sem simular Storage ou publicar anexo',async()=>{
  await as(1);const payload={order_id:order,request_id:randomUUID(),filename:'teste.pdf',mime:'application/pdf',byte_size:9,sha256:'a'.repeat(64)};
  doc=await rpc('log_documents',company,'prepare',payload);assert.equal(doc.state,'pending');assert.equal((await rpc('log_documents',company,'prepare',payload)).id,doc.id);
  await assert.rejects(rpc('log_documents',company,'prepare',{...payload,filename:'outro.pdf'}));
  await assert.rejects(rpc('log_documents',company,'finalize',{order_id:order,id:doc.id}));
  await assert.rejects(rpc('log_documents',company,'prepare',{...payload,request_id:randomUUID(),filename:'../secret.pdf'}));
  await as(3);assert.equal((await rpc('log_portal',company,'list'))[0].documents.length,0);await assert.rejects(rpc('log_documents',company,'download',{id:doc.id}));
 });
 await t.test('compartilhamento explicito e revogacao por documento',async()=>{
  // Ready is a privileged fixture for permission tests, NOT a successful Storage upload.
  await db.exec('reset role');await q("update public.log_documents set state='ready' where id=$1",[doc.id]);
  await as(1);await rpc('log_documents',company,'share',{order_id:order,id:doc.id,membership_id:clientMember});
  await as(3);assert.equal((await rpc('log_portal',company,'list'))[0].documents.length,1);assert.equal((await rpc('log_documents',company,'download',{id:doc.id})).id,doc.id);
  await as(1);await rpc('log_documents',company,'unshare',{order_id:order,id:doc.id,membership_id:clientMember});
  await as(3);await assert.rejects(rpc('log_documents',company,'download',{id:doc.id}));
  await as(7);await assert.rejects(rpc('log_documents',company,'list',{order_id:order}));
  await as(5);await assert.rejects(rpc('log_documents',company,'download',{id:doc.id}));
 });
 await t.test('revogacao de carga bloqueia portal e documentos imediatamente',async()=>{
  await as(1);await rpc('log_documents',company,'share',{order_id:order,id:doc.id,membership_id:clientMember});
  await rpc('log_portal',company,'revoke',{order_id:order,membership_id:clientMember});
  await as(3);assert.equal((await rpc('log_portal',company,'list')).length,0);await assert.rejects(rpc('log_documents',company,'download',{id:doc.id}));
 });
 let message;
 await t.test('central e motorista compartilham conversa persistente e deduplicada',async()=>{
  await as(1);const payload={branch_id:branch,recipient_id:members[5],request_id:randomUUID(),body:'Mensagem sintetica <script>'};
  message=await rpc('log_chat',company,'send',payload);assert.deepEqual(await rpc('log_chat',company,'send',payload),message);
  await assert.rejects(rpc('log_chat',company,'send',{...payload,body:'Conteudo diferente'}));
  await as(5);const data=await rpc('log_chat',company,'list',{branch_id:branch,recipient_id:owner});assert.equal(data.length,1);assert.equal(data[0].id,message.id);
  await rpc('log_chat',company,'send',{branch_id:branch,recipient_id:owner,request_id:randomUUID(),body:'Confirmado pela equipe'});
  await as(1);assert.equal((await rpc('log_chat',company,'list',{branch_id:branch,recipient_id:members[5]})).length,2);
 });
 await t.test('outro funcionario, filial, empresa e cliente nao interceptam conversa',async()=>{
  await as(6);assert.equal((await rpc('log_chat',company,'list',{branch_id:branch,recipient_id:owner})).length,0);
  await assert.rejects(rpc('log_chat',company,'send',{branch_id:branch,recipient_id:members[5],request_id:randomUUID(),body:'Funcionario para funcionario recusado'}));
  await as(9);assert.equal((await rpc('log_chat',company,'list',{branch_id:branch,recipient_id:members[5]})).length,0);
  await as(7);assert.equal((await rpc('log_chat',company,'contacts',{branch_id:branch})).length,0);await assert.rejects(rpc('log_chat',company,'list',{branch_id:branch,recipient_id:members[5]}));
  await as(2);await assert.rejects(rpc('log_chat',company,'contacts',{branch_id:branch}));
  await as(3);await assert.rejects(rpc('log_chat',company,'contacts',{branch_id:branch}));
 });
 await t.test('vinculo revogado retira chat sem renovacao de JWT',async()=>{
  await db.exec('reset role');await q('update public.log_memberships set active=false where id=$1',[members[5]]);
  await as(5);await assert.rejects(rpc('log_chat',company,'list',{branch_id:branch,recipient_id:owner}));
  await as(1);await assert.rejects(rpc('log_chat',company,'list',{branch_id:branch,recipient_id:members[5]}));
 });
 await t.test('ACL e RLS negam tabelas cruas e funcoes para anon',async()=>{
  await as(null,'anon');for(const name of ['log_portal','log_chat','log_documents'])await assert.rejects(rpc(name,company,'list'));
  await db.exec('reset role');for(const name of ['log_portal','log_chat','log_documents'])assert.equal((await q("select has_function_privilege('anon',$1,'execute') allowed",['public.'+name+'(uuid,text,jsonb)']))[0].allowed,false);
  assert.equal((await q("select has_function_privilege('authenticated','logistics_private.member_at_branch(uuid,uuid,uuid,text[])','execute') allowed"))[0].allowed,false);
  const rows=await q("select relrowsecurity from pg_class where relname in ('log_portal_invites','log_portal_grants','log_documents','log_document_grants','log_chat_messages')");assert.equal(rows.length,5);assert(rows.every(r=>r.relrowsecurity));
 });
 await t.test('migration Storage recusa schema gerenciado ausente sem criar substitutos',async()=>{
  await db.exec('reset role');const sql=await fs.readFile(new URL('../../supabase/migrations/20261107154438_logistics_private_storage.sql',import.meta.url),'utf8');await assert.rejects(db.exec(sql));await db.exec('rollback');assert.equal((await q("select to_regclass('storage.objects') object"))[0].object,null);
 });
 }finally{await db.close();}
});
test('upload/download e politicas no Supabase Storage real',{skip:'Requer stack Supabase isolada com Auth e Storage reais; nao emulado no PGlite.'},()=>{});
