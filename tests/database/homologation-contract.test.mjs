import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('read-only preflight detects missing migrations and does not treat PGlite as real Storage',async()=>{
 const db=new PGlite();await db.waitReady;
 const root=new URL('../../',import.meta.url);
 const sql=await fs.readFile(new URL('tools/homologation-contract.sql',root),'utf8');
 const inspect=async()=>{
  await db.exec('begin read only');
  try{return (await db.query(sql)).rows;}finally{await db.exec('rollback');}
 };
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  const files=(await fs.readdir(new URL('supabase/migrations/',root))).filter(f=>f.endsWith('.sql')&&!f.endsWith('_logistics_private_storage.sql')).sort();
  for(const file of files.filter(f=>f<'20261109'))await db.exec(await fs.readFile(new URL('supabase/migrations/'+file,root),'utf8'));
  const before=await inspect();
  for(const name of ['customer_profile','direct_cargo_columns','direct_cargo_nullable_order','manager_role_constraints','rpc_security:public.log_cargos_workspace(uuid,text,jsonb)'])assert.equal(before.find(r=>r.check_name===name)?.result,'blocked',name);
  for(const file of files.filter(f=>f>='20261109'))await db.exec(await fs.readFile(new URL('supabase/migrations/'+file,root),'utf8'));
  const after=await inspect();
  assert.deepEqual(after.filter(r=>r.result==='blocked').map(r=>r.check_name),['managed_storage_schema']);
  // An existing RPC is insufficient: anonymous EXECUTE must be detected too.
  await db.exec('begin;grant execute on function public.log_cargos_workspace(uuid,text,jsonb) to public');
  const insecure=(await db.query(sql)).rows;
  assert.equal(insecure.find(r=>r.check_name==='rpc_security:public.log_cargos_workspace(uuid,text,jsonb)').result,'blocked');
  await db.exec('rollback');
  assert.deepEqual(await inspect(),after);
 }finally{await db.close();}
});
