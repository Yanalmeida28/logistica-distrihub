import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('direct receiving, legacy migration, cargo sheet and resource isolation in disposable PostgreSQL',async t=>{
 const db=new PGlite();await db.waitReady;
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const as=async(n,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);};
 const rpc=async(name,company,action,payload={})=>(await q('select public.'+name+'($1,$2,$3::jsonb) result',[company,action,JSON.stringify(payload)]))[0].result;
 const command=extra=>({request_id:randomUUID(),note:'Synthetic confirmation',...extra});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  const migrations=(await fs.readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&!f.endsWith('_logistics_private_storage.sql')).sort();
  const newMigration=migrations.find(f=>f.endsWith('_logistics_direct_receiving.sql'));
  for(const f of migrations.filter(f=>f!==newMigration))await db.exec(await fs.readFile(new URL('../../supabase/migrations/'+f,import.meta.url),'utf8'));
  for(let n=1;n<=7;n++)await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(n),'synthetic'+n+'@example.invalid']);
  await as(1);const company=(await q("select public.log_create_company('Synthetic A','Main') id"))[0].id;
  const branch=(await q('select id from public.log_branches'))[0].id;
  const branch2=(await q("insert into public.log_branches(company_id,name) values($1,'Other branch') returning id",[company]))[0].id;
  const customer=(await q("insert into public.log_customers(company_id,name) values($1,'Shared customer') returning id",[company]))[0].id;
  const customer2=(await q("insert into public.log_customers(company_id,branch_id,name) values($1,$2,'Branch customer') returning id",[company,branch2]))[0].id;
  const vehicle=(await q("insert into public.log_vehicles(company_id,branch_id,identifier,capacity_volumes) values($1,$2,'SYNTHETIC',100) returning id",[company,branch]))[0].id;
  await as(2);const other=(await q("select public.log_create_company('Synthetic B','Main') id"))[0].id;
  await db.exec('reset role');let driver;
  for(const [n,role,b] of [[3,'driver',branch],[4,'administrative',branch],[5,'administrative',branch2]]){
   const m=(await q('insert into public.log_memberships(company_id,user_id,role) values($1,$2,$3) returning id',[company,uid(n),role]))[0].id;if(n===3)driver=m;
   await q('insert into public.log_member_branches(company_id,membership_id,branch_id) values($1,$2,$3)',[company,m,b]);
  }
  await as(1);let os=await rpc('log_collections',company,'create',command({branch_id:branch,customer_id:customer,pickup_address:'Synthetic street',destination:'Synthetic destination',volumes:3}));
  os=await rpc('log_collections',company,'assign',command({id:os.id,expected_version:os.version,assignee_id:driver,vehicle_id:vehicle}));
  await as(3);for(const action of ['accept','start','collect'])os=await rpc('log_collections',company,action,command({id:os.id,expected_version:os.version}));
  await as(1);const legacy=await rpc('log_collections',company,'receive',command({id:os.id,expected_version:os.version}));
  const before=(await q('select * from public.log_cargos where id=$1',[legacy.cargo_id]))[0];
  await db.exec('reset role');await db.exec(await fs.readFile(new URL('../../supabase/migrations/'+newMigration,import.meta.url),'utf8'));
  let direct,request;
  await t.test('old cargo retains UUID, physical stage, timestamps, OS and historical events',async()=>{
   await as(1);const sheet=await rpc('log_cargos_workspace',company,'detail',{id:legacy.cargo_id});
   assert.equal(sheet.cargo.origin,'collection');assert.equal(sheet.cargo.id,before.id);assert.equal(sheet.cargo.status,before.status);assert.equal(new Date(sheet.cargo.received_at).getTime(),new Date(before.received_at).getTime());assert.equal(sheet.cargo.order_id,os.id);assert(sheet.events.some(e=>e.action==='receive'));assert.equal(sheet.cargo.created_by,null);
  });
  await t.test('direct arrival without references creates no OS and records server identity/time exactly once',async()=>{
   await as(1);request=command({branch_id:branch,customer_id:customer,destination:'Counter arrival',volumes:4,origin:'forged',status:'shipped',created_by:uid(2)});
   // PGlite queues a single connection: overlapping calls test deduplication, not independent transaction scheduling.
   const results=await Promise.all([rpc('log_cargos_workspace',company,'create_direct',request),rpc('log_cargos_workspace',company,'create_direct',request)]);assert.deepEqual(results[0],results[1]);direct=results[0];
   const sheet=await rpc('log_cargos_workspace',company,'detail',{id:direct.id});
   assert.equal(sheet.cargo.origin,'direct');assert.equal(sheet.cargo.order_id,null);assert.equal(sheet.cargo.status,'received');assert.equal(sheet.cargo.nf_reference,null);assert.equal(sheet.cargo.created_by,uid(1));
   assert.equal(sheet.events.length,1);assert.equal(sheet.events[0].action,'receive_direct');assert.equal(sheet.events[0].actor_id,uid(1));assert(sheet.events[0].at);
   assert.equal((await q('select id from public.log_collection_orders')).length,1);
   await assert.rejects(rpc('log_cargos_workspace',company,'create_direct',{...request,volumes:5}));
  });
  await t.test('tenant, branch, customer, role and anonymous access are enforced',async()=>{
   for(const n of [2,3,5]){await as(n);await assert.rejects(rpc('log_cargos_workspace',company,'detail',{id:direct.id}));await assert.rejects(rpc('log_cargos_workspace',company,'create_direct',command({...request,request_id:randomUUID()})));}
   await as(null,'anon');await assert.rejects(rpc('log_cargos_workspace',company,'list'));
   await as(4);assert.equal((await rpc('log_cargos_workspace',company,'detail',{id:direct.id})).cargo.id,direct.id);
   await assert.rejects(rpc('log_cargos_workspace',company,'create_direct',command({branch_id:branch,customer_id:customer2,destination:'Wrong customer',volumes:1})));
   await assert.rejects(rpc('log_cargos_workspace',other,'create_direct',request));
  });
  await t.test('later NF/CTe references and physical stages are independent and version guarded',async()=>{
   await as(1);const linked=await rpc('log_cargos_workspace',company,'references',command({id:direct.id,expected_version:1,nf_reference:'NF-SYNTHETIC',cte_reference:'CTE-SYNTHETIC'}));
   let sheet=await rpc('log_cargos_workspace',company,'detail',{id:direct.id});assert.equal(sheet.cargo.status,'received');assert.equal(sheet.cargo.nf_reference,'NF-SYNTHETIC');assert.equal(sheet.events.at(-1).action,'references');
   await assert.rejects(rpc('log_cargos_workspace',company,'advance',command({id:direct.id,expected_version:linked.version,next_status:'delivered'})));
   let version=linked.version;for(const next_status of ['shipped','destination','out_for_delivery','delivered'])version=(await rpc('log_cargos_workspace',company,'advance',command({id:direct.id,expected_version:version,next_status}))).version;
   sheet=await rpc('log_cargos_workspace',company,'detail',{id:direct.id});assert.equal(sheet.cargo.status,'delivered');assert.equal(sheet.events.filter(e=>e.action==='collect').length,0);
   await assert.rejects(rpc('log_cargos_workspace',company,'references',command({id:direct.id,expected_version:1,nf_reference:'STALE'})));
  });
  await t.test('cargo sheet advances legacy collection cargo through the existing collection contract',async()=>{
   await as(1);const payload=command({id:legacy.cargo_id,expected_version:1,next_status:'shipped'});
   const first=await rpc('log_cargos_workspace',company,'advance',payload);assert.deepEqual(await rpc('log_cargos_workspace',company,'advance',payload),first);
   const sheet=await rpc('log_cargos_workspace',company,'detail',{id:legacy.cargo_id});assert.equal(sheet.cargo.status,'shipped');assert.equal(sheet.events.filter(e=>e.action==='shipped').length,1);assert(sheet.events.some(e=>e.action==='collect'));
   let version=first.version;for(const next_status of ['destination','out_for_delivery','delivered'])version=(await rpc('log_cargos_workspace',company,'advance',command({id:legacy.cargo_id,expected_version:version,next_status}))).version;
   assert.equal((await rpc('log_cargos_workspace',company,'detail',{id:legacy.cargo_id})).cargo.status,'delivered');
  });
  await t.test('direct cargo portal grants expose only authorized fields and explicitly shared documents',async()=>{
   await as(1);await assert.rejects(rpc('log_portal',company,'manage',{order_id:direct.id}));await assert.rejects(rpc('log_documents',company,'list',{cargo_id:os.id}));
   await as(1);const invitation=await rpc('log_portal',company,'invite',{cargo_id:direct.id,email:'synthetic6@example.invalid'});
   const doc=await rpc('log_documents',company,'prepare',{cargo_id:direct.id,filename:'synthetic.pdf',mime:'application/pdf',byte_size:10,sha256:'a'.repeat(64),request_id:randomUUID()});assert.equal(doc.order_id,null);assert.equal(doc.cargo_id,direct.id);
   await assert.rejects(rpc('log_documents',company,'finalize',{cargo_id:direct.id,id:doc.id})); // No fake Storage validator.
   await as(6);await rpc('log_portal',company,'accept',{id:invitation.id});const member=(await q('select id from public.log_memberships'))[0].id;
   const projection=await rpc('log_portal',company,'list');assert.equal(projection.length,1);assert.equal(projection[0].id,direct.id);assert.equal(projection[0].documents.length,0);assert(!JSON.stringify(projection).includes('NF-SYNTHETIC'));assert(!JSON.stringify(projection).includes('Synthetic confirmation'));assert(!JSON.stringify(projection).includes(uid(1)));
   await assert.rejects(rpc('log_cargos_workspace',company,'detail',{id:direct.id}));
   // Explicit metadata fixture for sharing; no claim of real file upload or Storage validation.
   await db.exec('reset role');await q("update public.log_documents set state='ready' where id=$1",[doc.id]);
   await as(1);await rpc('log_documents',company,'share',{cargo_id:direct.id,id:doc.id,membership_id:member});
   await as(6);assert.equal((await rpc('log_portal',company,'list'))[0].documents[0].id,doc.id);
   await as(7);await assert.rejects(rpc('log_portal',company,'list'));await assert.rejects(rpc('log_documents',company,'download',{id:doc.id}));
   await as(1);await rpc('log_portal',company,'revoke',{cargo_id:direct.id,membership_id:member});
   await as(6);assert.equal((await rpc('log_portal',company,'list')).length,0);await assert.rejects(rpc('log_documents',company,'download',{id:doc.id}));
  });
  await t.test('delivered collection cargo is visible to its authorized contact, not another contact',async()=>{
   await as(1);const invitation=await rpc('log_portal',company,'invite',{order_id:os.id,email:'synthetic7@example.invalid'});
   await as(7);await rpc('log_portal',company,'accept',{id:invitation.id});const view=await rpc('log_portal',company,'list');assert.equal(view.length,1);assert.equal(view[0].id,os.id);assert.equal(view[0].status,'delivered');
   assert.equal(view[0].events.filter(e=>e.action==='collect').length,1);assert.equal(view[0].events.filter(e=>e.action==='receive').length,1);assert.equal(view[0].events.filter(e=>e.action==='delivered').length,1);
   await as(6);assert.equal((await rpc('log_portal',company,'list')).length,0);
  });
  await t.test('failed creation rolls back both cargo and command; ACL does not expose private resources',async()=>{
   await as(1);const broken=command({branch_id:branch,customer_id:customer,destination:'Invalid volumes',volumes:0});await assert.rejects(rpc('log_cargos_workspace',company,'create_direct',broken));
   await db.exec('reset role');assert.equal((await q('select * from public.log_cargo_commands where request_id=$1',[broken.request_id])).length,0);
   assert.equal((await q("select has_function_privilege('anon','public.log_cargos_workspace(uuid,text,jsonb)','EXECUTE') allowed"))[0].allowed,false);
   await as(1);await assert.rejects(q('select * from logistics_private.freight_resources'));await assert.rejects(q('insert into public.log_cargo_commands(company_id,request_id,actor_id,action,payload) values($1,$2,$3,\'x\',\'{}\')',[company,randomUUID(),uid(1)]));
  });
 }finally{await db.close();}
});
