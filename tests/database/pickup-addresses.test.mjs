import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('multiple pickup addresses: real SQL policies, branch isolation and immutable order snapshots',async t=>{
 const db=new PGlite();await db.waitReady;
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const as=async(n,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);};
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  for(const f of (await fs.readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&!f.endsWith('_logistics_private_storage.sql')).sort())await db.exec(await fs.readFile(new URL('../../supabase/migrations/'+f,import.meta.url),'utf8'));
  for(let n=1;n<=5;n++)await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(n),'pickup'+n+'@example.invalid']);
  await as(1);const company=(await q("select public.log_create_company('Synthetic A','Branch A') id"))[0].id;
  const branch=(await q('select id from public.log_branches'))[0].id;
  const branch2=(await q("insert into public.log_branches(company_id,name) values($1,'Branch B') returning id",[company]))[0].id;
  const customer=(await q("insert into public.log_customers(company_id,name) values($1,'Shared synthetic customer') returning id",[company]))[0].id;
  const local=(await q("insert into public.log_customers(company_id,branch_id,name) values($1,$2,'Local synthetic customer') returning id",[company,branch]))[0].id;
  await as(2);const other=(await q("select public.log_create_company('Synthetic B','Other') id"))[0].id;
  await db.exec('reset role');
  for(const [n,role] of [[3,'manager'],[4,'driver'],[5,'client']]){
   const member=(await q('insert into public.log_memberships(company_id,user_id,role) values($1,$2,$3) returning id',[company,uid(n),role]))[0].id;
   if(role==='client')await q('insert into public.log_customer_contacts(company_id,customer_id,membership_id) values($1,$2,$3)',[company,customer,member]);
   else await q('insert into public.log_member_branches(company_id,membership_id,branch_id) values($1,$2,$3)',[company,member,branch]);
  }
  const insert=async(c,b,client,label,address='Rua fictícia 100')=>(await q('insert into public.log_customer_pickup_addresses(company_id,branch_id,customer_id,label,address) values($1,$2,$3,$4,$5) returning *',[c,b,client,label,address]))[0];
  let store,depot;
  await t.test('owner saves multiple named locations and cannot mismatch a branch-specific customer',async()=>{
   await as(1);store=await insert(company,branch,customer,'Loja');depot=await insert(company,branch,customer,'Depósito','Galpão fictício 200');await insert(company,branch2,customer,'Outra unidade');
   assert.equal((await q('select id from public.log_customer_pickup_addresses')).length,3);
   assert.equal(store.created_by,uid(1));
   await assert.rejects(insert(company,branch2,local,'Wrong branch'));
   await assert.rejects(insert(other,branch,customer,'Foreign company'));
   await assert.rejects(insert(company,branch,customer,'Loja'));
  });
  await t.test('manager is restricted to assigned branches, even for shared customers',async()=>{
   await as(3);assert.equal((await q('select id from public.log_customer_pickup_addresses')).length,2);
   const added=await insert(company,branch,customer,'Local autorizado');assert.equal(added.created_by,uid(3));
   await assert.rejects(insert(company,branch2,customer,'Forbidden'));
   await assert.rejects(q('update public.log_customer_pickup_addresses set branch_id=$1 where id=$2',[branch2,store.id]));
   await assert.rejects(q('delete from public.log_customer_pickup_addresses where id=$1',[store.id]));
  });
  const payload=()=>({branch_id:branch,customer_id:customer,pickup_address_id:store.id,pickup_address:'Forged text ignored',destination:'Destino fictício',volumes:2,note:'Confirmação sintética',request_id:randomUUID()});
  const create=async(p)=>(await q('select public.log_collection_from_address($1,$2::jsonb) result',[company,JSON.stringify(p)]))[0].result;
  await t.test('server resolves the selected location, preserves creation actor and deduplicates retries',async()=>{
   await as(3);const p=payload(),first=await create(p),retry=await create(p);assert.equal(first.id,retry.id);
   const order=(await q('select * from public.log_collection_orders where id=$1',[first.id]))[0];
   assert.equal(order.pickup_address,store.address);assert.equal(order.created_by,uid(3));assert.equal(order.status,'pending');
   assert.equal((await q('select id from public.log_collection_events where order_id=$1',[first.id])).length,1);
   await q('update public.log_customer_pickup_addresses set address=$1 where id=$2',['Novo endereço 500',store.id]);
   assert.equal((await q('select pickup_address from public.log_collection_orders where id=$1',[first.id]))[0].pickup_address,store.address);
   await assert.rejects(create(p)); // A changed address is not treated as the original request.
   const next=await create(payload());assert.notEqual(next.id,first.id);
   assert.equal((await q('select pickup_address from public.log_collection_orders where id=$1',[next.id]))[0].pickup_address,'Novo endereço 500');
   await q('update public.log_customer_pickup_addresses set active=false where id=$1',[store.id]);await assert.rejects(create(payload()));
   await assert.rejects(create({...payload(),customer_id:local,pickup_address_id:depot.id}));
   const manual={...payload(),pickup_address:'Endereço avulso 300'};delete manual.pickup_address_id;
   const saved=(await q("select public.log_collections($1,'create',$2::jsonb) result",[company,JSON.stringify(manual)]))[0].result;assert(saved.id);
  });
  await t.test('another company, driver, client and anonymous identity cannot enumerate or select locations',async()=>{
   for(const n of [2,4,5]){await as(n);assert.equal((await q('select id from public.log_customer_pickup_addresses')).length,0);await assert.rejects(create({...payload(),pickup_address_id:depot.id}));}
   await as(null,'anon');await assert.rejects(q('select * from public.log_customer_pickup_addresses'));await assert.rejects(create(payload()));
   await db.exec('reset role');assert.equal((await q("select has_function_privilege('anon','public.log_collection_from_address(uuid,jsonb)','execute') allowed"))[0].allowed,false);
   assert.equal((await q("select prosecdef from pg_proc where oid='public.log_collection_from_address(uuid,jsonb)'::regprocedure"))[0].prosecdef,false);
  });
  await t.test('saved destinations support collection and direct arrival with RLS, snapshots and retries',async()=>{
   const table='public.log_customer_destination_addresses';await as(1);
   const dest=(await q('insert into '+table+'(company_id,branch_id,customer_id,label,address) values($1,$2,$3,$4,$5) returning *',[company,branch,customer,'Entrega loja','Destino sintético 900']))[0];
   const second=(await q('insert into '+table+'(company_id,branch_id,customer_id,label,address) values($1,$2,$3,$4,$5) returning *',[company,branch2,customer,'Entrega outra filial','Destino sintético 901']))[0];
   await assert.rejects(q('insert into '+table+'(company_id,branch_id,customer_id,label,address) values($1,$2,$3,$4,$5)',[company,branch2,local,'Mismatch','Destino inválido']));
   const create=async(kind,p)=>(await q('select public.log_create_with_destination($1,$2,$3::jsonb) result',[company,kind,JSON.stringify(p)]))[0].result;
   const args=()=>({branch_id:branch,customer_id:customer,destination_address_id:dest.id,destination:'Forged destination',volumes:2,note:'Synthetic destination receipt',request_id:randomUUID()});
   await as(3);const p=args(),direct=await create('direct',p);assert.deepEqual(await create('direct',p),direct);
   const cargo=(await q('select * from public.log_cargos where id=$1',[direct.id]))[0];assert.equal(cargo.destination,dest.address);assert.equal(cargo.order_id,null);assert.equal(cargo.status,'received');
   const collected=await create('collection',{...args(),pickup_address_id:depot.id,pickup_address:'Forged pickup'});
   const order=(await q('select * from public.log_collection_orders where id=$1',[collected.id]))[0];assert.equal(order.destination,dest.address);assert.equal(order.pickup_address,depot.address);assert.equal(order.status,'pending');
   const manualPickup=await create('collection',{...args(),pickup_address:'Manual pickup 100'});assert(manualPickup.id);
   await assert.rejects(create('direct',{...args(),destination_address_id:second.id}));
   await assert.rejects(create('direct',{...args(),customer_id:local}));
   await assert.rejects(q('update '+table+' set branch_id=$1 where id=$2',[branch2,dest.id]));
   await q('update '+table+' set address=$1 where id=$2',['Destino atualizado 950',dest.id]);
   assert.equal((await q('select destination from public.log_cargos where id=$1',[direct.id]))[0].destination,dest.address);
   await assert.rejects(create('direct',p));
   await q('update '+table+' set active=false where id=$1',[dest.id]);await assert.rejects(create('direct',args()));
   for(const n of [2,4,5]){await as(n);assert.equal((await q('select id from '+table)).length,0);await assert.rejects(create('direct',{...args(),destination_address_id:second.id}));}
   await as(null,'anon');await assert.rejects(q('select id from '+table));await assert.rejects(create('direct',args()));
   await db.exec('reset role');assert.equal((await q("select has_function_privilege('anon','public.log_create_with_destination(uuid,text,jsonb)','execute') allowed"))[0].allowed,false);
  });
 }finally{await db.close();}
});
