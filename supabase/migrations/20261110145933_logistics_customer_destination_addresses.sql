begin;
set local lock_timeout='5s';
do $$begin if to_regclass('public.partner_sales') is not null then raise exception 'ERP database refused';end if;end$$;

create table public.log_customer_destination_addresses (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 branch_id uuid not null,
 customer_id uuid not null,
 label text not null check(length(btrim(label)) between 2 and 80),
 address text not null check(length(btrim(address)) between 3 and 300),
 active boolean not null default true,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(company_id,branch_id) references public.log_branches(company_id,id),
 foreign key(company_id,customer_id) references public.log_customers(company_id,id),
 unique(company_id,branch_id,customer_id,label)
);
create index log_destination_address_customer_idx on public.log_customer_destination_addresses(company_id,customer_id);
create index log_destination_address_creator_idx on public.log_customer_destination_addresses(created_by);
alter table public.log_customer_destination_addresses enable row level security;
revoke all on public.log_customer_destination_addresses from public,anon,authenticated;
grant select on public.log_customer_destination_addresses to authenticated;
grant insert(company_id,branch_id,customer_id,label,address),update(label,address,active)
 on public.log_customer_destination_addresses to authenticated;

create policy destination_address_read on public.log_customer_destination_addresses for select to authenticated using(
 logistics_private.access_company(company_id,branch_id,array['owner','administrative'])
 and exists(select 1 from public.log_customers c where c.company_id=log_customer_destination_addresses.company_id
 and c.id=customer_id and (c.branch_id is null or c.branch_id=log_customer_destination_addresses.branch_id)));
create policy destination_address_insert on public.log_customer_destination_addresses for insert to authenticated with check(
 logistics_private.access_company(company_id,branch_id,array['owner','administrative'])
 and exists(select 1 from public.log_customers c where c.company_id=log_customer_destination_addresses.company_id
 and c.id=customer_id and c.active and (c.branch_id is null or c.branch_id=log_customer_destination_addresses.branch_id)));
create policy destination_address_update on public.log_customer_destination_addresses for update to authenticated using(
 logistics_private.access_company(company_id,branch_id,array['owner','administrative'])) with check(
 logistics_private.access_company(company_id,branch_id,array['owner','administrative'])
 and exists(select 1 from public.log_customers c where c.company_id=log_customer_destination_addresses.company_id
 and c.id=customer_id and (c.branch_id is null or c.branch_id=log_customer_destination_addresses.branch_id)));
create trigger log_destination_address_audit before insert or update on public.log_customer_destination_addresses
 for each row execute function logistics_private.audit_record();

-- Resolve the saved destination with the caller's RLS, then preserve existing creation contracts.
create function public.log_create_with_destination(p_company uuid,p_kind text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_address public.log_customer_destination_addresses; v_payload jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_kind not in ('collection','direct') or p_kind is null then raise exception 'Invalid creation kind';end if;
 select * into v_address from public.log_customer_destination_addresses
 where id=(p_payload->>'destination_address_id')::uuid and company_id=p_company
 and customer_id=(p_payload->>'customer_id')::uuid and branch_id=(p_payload->>'branch_id')::uuid and active for share;
 if not found then raise exception 'Destination unavailable' using errcode='42501';end if;
 v_payload:=(p_payload-'destination_address_id')||jsonb_build_object('destination',v_address.address);
 if p_kind='direct' then return public.log_cargos_workspace(p_company,'create_direct',v_payload);end if;
 if nullif(p_payload->>'pickup_address_id','') is not null then return public.log_collection_from_address(p_company,v_payload);end if;
 return public.log_collections(p_company,'create',v_payload);
end$$;
revoke all on function public.log_create_with_destination(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.log_create_with_destination(uuid,text,jsonb) to authenticated;
commit;
