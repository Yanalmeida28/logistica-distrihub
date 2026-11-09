-- Read-only structural preflight. No application rows, function bodies or secrets.
-- Run with a catalog-authorized connection; never with the ERP project.
with checks as (
 select 'independent_logistics_schema'::text as check_name,
   to_regclass('public.log_companies') is not null and to_regclass('public.partner_sales') is null as passed
 union all
 select 'customer_profile', count(*)=14 and bool_and(data_type='text' and is_nullable='YES')
 from information_schema.columns where table_schema='public' and table_name='log_customers'
 and column_name in ('person_type','document','trade_name','contact_name','email','phone','postal_code','street','address_number','complement','district','city','state','notes')
 union all
 select 'direct_cargo_columns',count(*)=9 from information_schema.columns
 where table_schema='public' and table_name='log_cargos'
 and column_name in ('origin','customer_id','destination','volumes','created_by','version','nf_reference','cte_reference','order_id')
 union all
 select 'direct_cargo_nullable_order',coalesce((select is_nullable='YES' from information_schema.columns
 where table_schema='public' and table_name='log_cargos' and column_name='order_id'),false)
 union all
 select 'manager_role_constraints',count(*)=2 and bool_and(position('''manager''' in pg_get_constraintdef(oid))>0)
 from pg_constraint where conrelid in (to_regclass('public.log_memberships'),to_regclass('public.log_team_invites'))
 and conname in ('log_memberships_role_check','log_team_invites_role_check')
 union all
 select 'auth_contract',to_regprocedure('auth.uid()') is not null and to_regclass('auth.users') is not null
 union all
 select 'managed_storage_schema',to_regclass('storage.objects') is not null and to_regclass('storage.buckets') is not null
 union all
 select 'operational_rls',count(*)=8 and bool_and(relrowsecurity)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and c.relname in ('log_cargos','log_collection_orders','log_documents','log_portal_grants','log_memberships','log_customers','log_cargo_events','log_cargo_commands')
), expected_rpc(signature) as (values
 ('public.log_team(uuid,text,jsonb)'),('public.log_collections(uuid,text,jsonb)'),
 ('public.log_portal(uuid,text,jsonb)'),('public.log_documents(uuid,text,jsonb)'),
 ('public.log_chat(uuid,text,jsonb)'),('public.log_cargos_workspace(uuid,text,jsonb)')
), rpc_checks as (
 select 'rpc_security:'||e.signature as check_name,
 coalesce(not p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
 and p.prorettype='jsonb'::regtype
 and has_function_privilege('authenticated',p.oid,'EXECUTE')
 and not has_function_privilege('anon',p.oid,'EXECUTE'),false) as passed
 from expected_rpc e left join pg_proc p on p.oid=to_regprocedure(e.signature)
)
select check_name,case when passed then 'confirmed' else 'blocked' end as result from checks
union all select check_name,case when passed then 'confirmed' else 'blocked' end from rpc_checks
order by check_name;
