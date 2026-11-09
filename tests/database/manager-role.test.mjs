import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('manager role: invitation, branch-scoped operations and owner-only controls in disposable PostgreSQL',async t=>{
 const db=new PGlite();await db.waitReady;
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const as=async(n,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);};
 const rpc=async(name,company,action,payload={})=>(await q('select public.'+name+'($1,$2,$3::jsonb) result',[company,action,JSON.stringify(payload)]))[0].result;
 const command=extra=>({request_id:randomUUID(),note:'Synthetic manager confirmation',...extra});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  for(const file of (await fs.readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&!f.endsWith('_logistics_private_storage.sql')).sort())await db.exec(await fs.readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  for(let n=1;n<=7;n++)await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[uid(n),'manager-test'+n+'@example.invalid',n===7?null:new Date().toISOString()]);
  await as(1);const company=(await q("select public.log_create_company('Synthetic A','Main') id"))[0].id;
  const branch=(await q('select id from public.log_branches'))[0].id;
  const branch2=(await q("insert into public.log_branches(company_id,name) values($1,'Other branch') returning id",[company]))[0].id;
  const shared=(await q("insert into public.log_customers(company_id,name) values($1,'Shared synthetic customer') returning id",[company]))[0].id;
  const outside=(await q("insert into public.log_customers(company_id,branch_id,name) values($1,$2,'Outside customer') returning id",[company,branch2]))[0].id;
  const owner=(await q("select id from public.log_memberships where role='owner'"))[0].id;
  await as(2);const other=(await q("select public.log_create_company('Synthetic B','Main') id"))[0].id;
  let manager,driver,customer,vehicle,cargo;
  await t.test('owner invites a distinct manager role; only confirmed invited identity accepts',async()=>{
   await as(1);const invitation=await rpc('log_team',company,'invite',{email:'manager-test3@example.invalid',role:'manager',branch_ids:[branch]});
   await as(6);await assert.rejects(rpc('log_team',company,'accept',{id:invitation.id}));
   await as(3);manager=(await rpc('log_team',company,'accept',{id:invitation.id})).id;
   const members=await q('select role from public.log_memberships');assert.equal(members.length,1);assert.equal(members[0].role,'manager');
   await as(1);const unconfirmed=await rpc('log_team',company,'invite',{email:'manager-test7@example.invalid',role:'manager',branch_ids:[branch]});
   await as(7);await assert.rejects(rpc('log_team',company,'accept',{id:unconfirmed.id}));
   await as(1);const driverInvite=await rpc('log_team',company,'invite',{email:'manager-test4@example.invalid',role:'driver',branch_ids:[branch]});
   await as(4);driver=(await rpc('log_team',company,'accept',{id:driverInvite.id})).id;
  });
  await t.test('manager has administrative operations only in assigned branches, without owner capability',async()=>{
   await as(3);assert.equal((await q('select id from public.log_branches')).length,1);
   assert.equal((await q("select logistics_private.access_company($1,$2,array['owner','administrative']) allowed",[company,branch]))[0].allowed,true);
   assert.equal((await q("select logistics_private.access_company($1,$2,array['owner']) allowed",[company,branch]))[0].allowed,false);
   assert.equal((await q("select logistics_private.access_company($1,$2,array['owner','administrative']) allowed",[company,branch2]))[0].allowed,false);
   customer=(await q("insert into public.log_customers(company_id,branch_id,name) values($1,$2,'Manager customer') returning id",[company,branch]))[0].id;
   await q("update public.log_customers set name='Manager updated customer' where id=$1",[customer]);
   assert.equal((await q("update public.log_customers set name='Forbidden shared change' where id=$1 returning id",[shared])).length,0);
   await assert.rejects(q("insert into public.log_customers(company_id,branch_id,name) values($1,$2,'Forbidden branch')",[company,branch2]));
   vehicle=(await q("insert into public.log_vehicles(company_id,branch_id,identifier,capacity_volumes) values($1,$2,'MANAGER-TEST',10) returning id",[company,branch]))[0].id;
   await assert.rejects(rpc('log_cargos_workspace',other,'list'));
   await assert.rejects(rpc('log_cargos_workspace',company,'create_direct',command({branch_id:branch2,customer_id:outside,destination:'Forbidden branch',volumes:1})));
  });
  await t.test('manager assigns collection, receives confirmed collection and handles direct cargo without skipped stages',async()=>{
   await as(3);let os=await rpc('log_collections',company,'create',command({branch_id:branch,customer_id:customer,pickup_address:'Synthetic street',destination:'Synthetic destination',volumes:2}));
   os=await rpc('log_collections',company,'assign',command({id:os.id,expected_version:os.version,assignee_id:driver,vehicle_id:vehicle}));
   await assert.rejects(rpc('log_collections',company,'receive',command({id:os.id,expected_version:os.version})));
   await as(4);for(const action of ['accept','start','collect'])os=await rpc('log_collections',company,action,command({id:os.id,expected_version:os.version}));
   await as(3);const received=await rpc('log_collections',company,'receive',command({id:os.id,expected_version:os.version}));assert(received.cargo_id);
   cargo=await rpc('log_cargos_workspace',company,'create_direct',command({branch_id:branch,customer_id:shared,destination:'Synthetic direct destination',volumes:1}));
   const detail=await rpc('log_cargos_workspace',company,'detail',{id:cargo.id});assert.equal(detail.cargo.status,'received');assert.equal(detail.cargo.created_by,uid(3));
   await rpc('log_cargos_workspace',company,'references',command({id:cargo.id,expected_version:1,nf_reference:'SYNTHETIC-NF'}));
   await rpc('log_cargos_workspace',company,'advance',command({id:cargo.id,expected_version:2,next_status:'shipped'}));
  });
  await t.test('manager can prepare private documents, authorize client portal and communicate with branch driver',async()=>{
   await as(3);const doc=await rpc('log_documents',company,'prepare',{cargo_id:cargo.id,filename:'synthetic.pdf',mime:'application/pdf',byte_size:10,sha256:'a'.repeat(64),request_id:randomUUID()});assert.equal(doc.created_by,uid(3));
   await assert.rejects(rpc('log_documents',company,'finalize',{cargo_id:cargo.id,id:doc.id}));
   const invitation=await rpc('log_portal',company,'invite',{cargo_id:cargo.id,email:'manager-test5@example.invalid'});
   await as(5);await rpc('log_portal',company,'accept',{id:invitation.id});assert.equal((await rpc('log_portal',company,'list'))[0].id,cargo.id);
   await as(3);const contacts=await rpc('log_chat',company,'contacts',{branch_id:branch});assert(contacts.some(c=>c.id===driver));
   await rpc('log_chat',company,'send',{branch_id:branch,recipient_id:driver,request_id:randomUUID(),body:'Synthetic manager message'});
   await as(4);assert.equal((await rpc('log_chat',company,'list',{branch_id:branch,recipient_id:manager}))[0].body,'Synthetic manager message');
  });
  await t.test('manager cannot manage staff, invite another manager, alter owner or create branches',async()=>{
   await as(3);
   await assert.rejects(rpc('log_team',company,'list'));
   await assert.rejects(rpc('log_team',company,'invite',{email:'manager-test6@example.invalid',role:'manager',branch_ids:[branch]}));
   await assert.rejects(rpc('log_team',company,'update',{id:owner,role:'manager',active:false,branch_ids:[]}));
   await assert.rejects(q("update public.log_memberships set role='owner' where id=$1",[manager]));
   await assert.rejects(q("insert into public.log_branches(company_id,name) values($1,'Forbidden branch')",[company]));
   assert.equal((await q('select * from public.log_audit')).length,0);
  });
  await t.test('owner can update and revoke manager; existing session loses branch access immediately',async()=>{
   await as(1);await rpc('log_team',company,'update',{id:manager,role:'manager',active:false,branch_ids:[]});
   await as(3);assert.equal((await q('select id from public.log_branches')).length,0);await assert.rejects(rpc('log_cargos_workspace',company,'list'));await assert.rejects(rpc('log_chat',company,'contacts',{branch_id:branch}));
   await as(null,'anon');await assert.rejects(rpc('log_team',company,'list'));
  });
 }finally{await db.close();}
});
