import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// PostgreSQL policy harness, NOT a substitute for testing real Supabase Auth/JWT.
const migration=await fs.readFile(new URL('../../supabase/migrations/20261106190046_logistics_foundation.sql',import.meta.url),'utf8');
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('fundacao em PostgreSQL descartavel: contratos, RLS, ACL, integridade e rollback',async t=>{
  const db=new PGlite();await db.waitReady;
  const q=async(sql,params=[])=> (await db.query(sql,params)).rows;
  const root=()=>db.exec('reset role');
  const as=async(n,role='authenticated')=>{await root();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);};
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(migration);
    await db.exec(await fs.readFile(new URL('../../supabase/migrations/20261109045522_logistics_customer_profile.sql',import.meta.url),'utf8'));
    await db.exec(await fs.readFile(new URL('../../supabase/migrations/20261106192642_logistics_fk_indexes.sql',import.meta.url),'utf8'));
    await db.query("insert into auth.users(id,email_confirmed_at) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now() from generate_series(1,9) n");
    await db.query('insert into auth.users(id) values($1)',[uid(10)]);
    let companyA,companyB,branchA,branchB,branchA2,customer,shared;
    await t.test('identidade verificada cria somente sua empresa e nao vira admin de outra',async()=>{
      await as(1);companyA=(await q("select public.log_create_company('Empresa A','Filial A') id"))[0].id;
      await as(2);companyB=(await q("select public.log_create_company('Empresa B','Filial B') id"))[0].id;
      assert.equal((await q('select * from public.log_companies')).length,1);
      await assert.rejects(q("select public.log_create_company('Duplicada','Filial')"));
      await as(10);await assert.rejects(q("select public.log_create_company('Sem email','Filial')"));
      await as(null);await assert.rejects(q("select public.log_create_company('Sem login','Filial')"));
      await root();branchA=(await q('select id from public.log_branches where company_id=$1',[companyA]))[0].id;
      branchB=(await q('select id from public.log_branches where company_id=$1',[companyB]))[0].id;
    });
    await t.test('filiais e cadastros persistentes, rollback atomico de bootstrap',async()=>{
      await as(1);branchA2=(await q("insert into public.log_branches(company_id,name) values($1,'Filial A2') returning id",[companyA]))[0].id;
      customer=(await q("insert into public.log_customers(company_id,branch_id,name) values($1,$2,'Cliente A') returning id",[companyA,branchA]))[0].id;
      shared=(await q("insert into public.log_customers(company_id,name) values($1,'Cliente compartilhado') returning id",[companyA]))[0].id;
      await q("insert into public.log_vehicles(company_id,branch_id,identifier,capacity_volumes) values($1,$2,'VEICULO-A',10)",[companyA,branchA]);
      await assert.rejects(q("insert into public.log_vehicles(company_id,branch_id,identifier) values($1,$2,'CRUZADO')",[companyA,branchB]));
      await as(9);await assert.rejects(q("select public.log_create_company('Falha de filial','x')"));
      assert.equal((await q('select * from public.log_companies')).length,0);
    });
    await root();
    for(const [n,role,branch] of [[3,'administrative',branchA],[4,'driver',branchA],[5,'collector',branchA],[6,'client',null],[7,'administrative',branchA2]]){
      const [{id}]=await q('insert into public.log_memberships(company_id,user_id,role) values($1,$2,$3) returning id',[companyA,uid(n),role]);
      if(branch)await q('insert into public.log_member_branches(company_id,membership_id,branch_id) values($1,$2,$3)',[companyA,id,branch]);
      else await q('insert into public.log_customer_contacts(company_id,customer_id,membership_id) values($1,$2,$3)',[companyA,customer,id]);
    }
    await t.test('RLS bloqueia outra empresa e impede falsificar company_id/branch_id',async()=>{
      await as(2);assert.equal((await q('select * from public.log_customers')).length,0);
      await assert.rejects(q("insert into public.log_customers(company_id,branch_id,name) values($1,$2,'Invasao')",[companyA,branchA]));
      await as(1);await assert.rejects(q('update public.log_customers set company_id=$1 where id=$2',[companyB,customer]));
      await assert.rejects(q('update public.log_customers set branch_id=$1 where id=$2',[branchA2,customer]));
    });
    await t.test('admin acessa apenas filial permitida mais clientes compartilhados; nao altera acessos',async()=>{
      await as(3);assert.equal((await q('select * from public.log_branches')).length,1);
      assert.equal((await q('select * from public.log_customers')).length,2);
      await assert.rejects(q("insert into public.log_customers(company_id,branch_id,name) values($1,$2,'Nao autorizado')",[companyA,branchA2]));
      await assert.rejects(q("insert into public.log_customers(company_id,name) values($1,'Compartilhamento indevido')",[companyA]));
      await assert.rejects(q("update public.log_memberships set role='owner' where user_id=$1",[uid(3)]));
      await assert.rejects(q("insert into public.log_branches(company_id,name) values($1,'Filial indevida')",[companyA]));
      await as(7);assert.equal((await q('select * from public.log_customers')).length,1);
    });
    await t.test('motorista e coletor nao acessam clientes nem escrevem financeiro/cadastros',async()=>{
      for(const n of [4,5]){await as(n);assert.equal((await q('select * from public.log_customers')).length,0);assert.equal((await q('select * from public.log_vehicles')).length,1);
        await assert.rejects(q("insert into public.log_customers(company_id,branch_id,name) values($1,$2,'Indevido')",[companyA,branchA]));}
    });
    await t.test('cliente ve apenas cadastro explicitamente vinculado e nenhum veiculo/auditoria',async()=>{
      await as(6);const rows=await q('select id from public.log_customers');assert.equal(rows.length,1);assert.equal(rows[0].id,customer);
      assert.equal((await q('select * from public.log_vehicles')).length,0);assert.equal((await q('select * from public.log_audit')).length,0);
      await assert.rejects(q('insert into public.log_customer_contacts(company_id,customer_id,membership_id) select company_id,$1,id from public.log_memberships',[shared]));
    });
    await t.test('extended customer fields persist with audit, RLS, column limits and immutable branch',async()=>{
      await as(1);
      await q("update public.log_customers set person_type='PJ',document='12345678000199',email='synthetic@example.invalid',street='Synthetic street',state='SP',notes='Synthetic note' where id=$1",[customer]);
      const [row]=await q('select person_type,document,email,street,state from public.log_customers where id=$1',[customer]);
      assert.equal(row.person_type,'PJ');assert.equal(row.document,'12345678000199');assert.equal(row.state,'SP');
      await assert.rejects(q("update public.log_customers set person_type='ADMIN' where id=$1",[customer]));
      await assert.rejects(q("update public.log_customers set notes=repeat('x',1001) where id=$1",[customer]));
      await as(3);assert.equal((await q("update public.log_customers set phone='11999999999',active=false where id=$1 returning id",[customer])).length,1);
      assert.equal((await q("update public.log_customers set email='forbidden@example.invalid' where id=$1 returning id",[shared])).length,0);
      await as(7);assert.equal((await q("update public.log_customers set phone='blocked' where id=$1 returning id",[customer])).length,0);
      await as(2);assert.equal((await q('select document,email from public.log_customers where id=$1',[customer])).length,0);
      assert.equal((await q("update public.log_customers set phone='blocked' where id=$1 returning id",[customer])).length,0);
      await as(1);await assert.rejects(q('update public.log_customers set branch_id=$1 where id=$2',[branchA2,customer]));
      await q('begin');await q("update public.log_customers set person_type='PF',phone='rolled back' where id=$1",[customer]);await q('rollback');
      assert.equal((await q('select person_type from public.log_customers where id=$1',[customer]))[0].person_type,'PJ');
      await q('update public.log_customers set active=true where id=$1',[customer]);
    });
    await t.test('revogacao de membro passa a valer sem alterar JWT',async()=>{
      await root();await q('update public.log_memberships set active=false where user_id=$1',[uid(3)]);
      await as(3);assert.equal((await q('select * from public.log_customers')).length,0);assert.equal((await q('select * from public.log_companies')).length,0);
    });
    await t.test('anon e PUBLIC sem acesso; auditoria imutavel para usuarios',async()=>{
      await as(null,'anon');await assert.rejects(q('select * from public.log_customers'));await assert.rejects(q("select public.log_create_company('Anon','Filial')"));
      await root();const [{allowed}]=await q("select has_function_privilege('anon','public.log_create_company(text,text)','execute') allowed");assert.equal(allowed,false);
      const rows=await q("select relname,relrowsecurity from pg_class where relname like 'log_%' and relkind='r'");assert.equal(rows.length,8);assert(rows.every(r=>r.relrowsecurity));
      const publicExecute=await q("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where (n.nspname='logistics_private' or p.proname='log_create_company') and acl.grantee=0 and acl.privilege_type='EXECUTE'");assert.equal(publicExecute.length,0);
      const definers=await q("select p.proname,p.proconfig,r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='logistics_private' and p.prosecdef");assert(definers.length>=4);assert(definers.every(f=>f.rolname==='postgres'&&f.proconfig.some(c=>c==='search_path=\"\"')));
      await as(1);assert((await q('select * from public.log_audit')).length>=5);await assert.rejects(q('delete from public.log_audit'));
    });
  }finally{await db.close();}
});
