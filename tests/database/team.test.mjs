import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('equipe: convites, aceite verificado, filiais e revogacao em PostgreSQL descartavel',async t=>{
 const db=new PGlite();await db.waitReady;
 const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
 const as=async(n,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);};
 const rpc=async(company,action,payload={})=>(await q('select public.log_team($1,$2,$3::jsonb) result',[company,action,JSON.stringify(payload)]))[0].result;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const f of (await fs.readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&!f.endsWith('_logistics_private_storage.sql')).sort())await db.exec(await fs.readFile(new URL('../../supabase/migrations/'+f,import.meta.url),'utf8'));
 for(let n=1;n<=5;n++)await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[uid(n),'user'+n+'@example.invalid',n===5?null:new Date().toISOString()]);
 await as(1);const a=(await q("select public.log_create_company('Empresa A','Filial A') id"))[0].id;
 const branches=await q('select id from public.log_branches');const b1=branches[0].id;
 const b2=(await q("insert into public.log_branches(company_id,name) values($1,'Filial A2') returning id",[a]))[0].id;
 await as(2);const other=(await q("select public.log_create_company('Empresa B','Filial B') id"))[0].id;
 const foreign=(await q('select id from public.log_branches'))[0].id;
 let invitation,member;
 await t.test('proprietario convida sem criar usuario ou conceder acesso imediato',async()=>{
  await as(1);invitation=(await rpc(a,'invite',{email:' USER3@example.invalid ',role:'administrative',branch_ids:[b1]})).id;
  assert.equal((await rpc(a,'list')).invites.length,1);
  await as(3);assert.equal((await q('select * from public.log_companies')).length,0);
  assert.equal((await rpc(null,'incoming')).length,1);
 });
 await t.test('outro email, usuario sem confirmacao e anon nao aceitam convite',async()=>{
  for(const n of [4,5]){await as(n);await assert.rejects(rpc(a,'accept',{id:invitation}));}
  await as(null,'anon');await assert.rejects(rpc(a,'accept',{id:invitation}));
 });
 await t.test('aceite atomico concede apenas filial autorizada e nao pode repetir',async()=>{
  await as(3);member=(await rpc(a,'accept',{id:invitation})).id;
  assert.deepEqual((await q('select id from public.log_branches')).map(b=>b.id),[b1]);
  await assert.rejects(rpc(a,'accept',{id:invitation}));
 });
 await t.test('administrativo nao lista equipe, convida ou eleva seu papel',async()=>{
  await as(3);for(const action of ['list','invite','update','revoke'])await assert.rejects(rpc(a,action,{id:member,email:'user4@example.invalid',role:'owner',branch_ids:[b1],active:true}));
  await assert.rejects(q("update public.log_memberships set role='owner' where id=$1",[member]));
  await assert.rejects(q('select * from public.log_team_invites'));
 });
 await t.test('empresa e filiais cruzadas, promocao owner e mudanca do proprietario recusadas',async()=>{
  await as(2);await assert.rejects(rpc(a,'list'));
  await as(1);
  for(const role of ['owner','client'])await assert.rejects(rpc(a,'invite',{email:'user4@example.invalid',role,branch_ids:[b1]}));
  await assert.rejects(rpc(a,'invite',{email:'user4@example.invalid',role:'driver',branch_ids:[foreign]}));
  const owner=(await rpc(a,'list')).members.find(m=>m.role==='owner');
  await assert.rejects(rpc(a,'update',{id:owner.id,role:'driver',active:false,branch_ids:[b1]}));
  await assert.rejects(rpc(other,'update',{id:member,role:'driver',active:true,branch_ids:[foreign]}));
 });
 await t.test('mudanca de filial e desativacao retiram acesso sem renovar JWT',async()=>{
  await as(1);await rpc(a,'update',{id:member,role:'collector',active:true,branch_ids:[b2]});
  await as(3);assert.deepEqual((await q('select id from public.log_branches')).map(b=>b.id),[b2]);
  await as(1);await rpc(a,'update',{id:member,role:'collector',active:false,branch_ids:[b2]});
  await as(3);assert.equal((await q('select * from public.log_companies')).length,0);
 });
 await t.test('revogacao e expiracao impedem aceite',async()=>{
  await as(1);const id=(await rpc(a,'invite',{email:'user4@example.invalid',role:'driver',branch_ids:[b1]})).id;
  await rpc(a,'revoke',{id});await as(4);await assert.rejects(rpc(a,'accept',{id}));
  await as(1);const expired=(await rpc(a,'invite',{email:'user4@example.invalid',role:'driver',branch_ids:[b1]})).id;
  await db.exec('reset role');await q("update public.log_team_invites set expires_at=now()-interval '1 minute' where id=$1",[expired]);
  await as(4);assert.equal((await rpc(null,'incoming')).length,0);await assert.rejects(rpc(a,'accept',{id:expired}));
 });
 await t.test('falha de auditoria reverte integralmente alteracoes de acesso',async()=>{
  await db.exec('reset role');await db.exec("create function public.test_team_failure() returns trigger language plpgsql as $$begin if new.object_type='team' then raise exception 'injected';end if;return new;end$$;create trigger test_team_failure before insert on public.log_audit for each row execute function public.test_team_failure()");
  await as(1);await assert.rejects(rpc(a,'update',{id:member,role:'driver',active:true,branch_ids:[b1]}));
  const saved=(await rpc(a,'list')).members.find(m=>m.id===member);assert.equal(saved.active,false);assert.equal(saved.role,'collector');assert.deepEqual(saved.branch_ids,[b2]);
  await db.exec('reset role');await db.exec('drop trigger test_team_failure on public.log_audit');
 });
 await t.test('desativacao funciona sem filial ativa e reativacao exige filial',async()=>{
  await as(1);await q('update public.log_branches set active=false where id=$1',[b2]);
  await rpc(a,'update',{id:member,role:'collector',active:false,branch_ids:[]});
  await assert.rejects(rpc(a,'update',{id:member,role:'collector',active:true,branch_ids:[]}));
  await assert.rejects(rpc(a,'update',{id:member,role:'collector',active:true,branch_ids:[b2]}));
  await rpc(a,'update',{id:member,role:'collector',active:true,branch_ids:[b1]});
  await as(3);assert.deepEqual((await q('select id from public.log_branches')).map(b=>b.id),[b1]);
 });
 await t.test('convite nao e aceito se o criador perdeu acesso de proprietario',async()=>{
  await as(1);const id=(await rpc(a,'invite',{email:'user4@example.invalid',role:'driver',branch_ids:[b1]})).id;
  await db.exec('reset role');await q('update public.log_memberships set active=false where company_id=$1 and user_id=$2',[a,uid(1)]);
  await as(4);await assert.rejects(rpc(a,'accept',{id}));
  assert.equal((await q('select * from public.log_memberships')).length,0);
  await db.exec('reset role');await q('update public.log_memberships set active=true where company_id=$1 and user_id=$2',[a,uid(1)]);
 });
 await t.test('ACL, RLS e helpers nao permitem bypass anonimo ou arbitrario',async()=>{
  await db.exec('reset role');
  assert.equal((await q("select has_function_privilege('anon','public.log_team(uuid,text,jsonb)','execute') allowed"))[0].allowed,false);
  assert.equal((await q("select has_function_privilege('authenticated','logistics_private.access_for_owner(uuid,uuid)','execute') allowed"))[0].allowed,false);
  assert.equal((await q("select relrowsecurity from pg_class where oid='public.log_team_invites'::regclass"))[0].relrowsecurity,true);
 });
 }finally{await db.close();}
});
