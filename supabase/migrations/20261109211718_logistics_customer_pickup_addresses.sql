begin;
set local lock_timeout='5s';
do $$begin if to_regclass('public.partner_sales') is not null then raise exception 'ERP database refused';end if;end$$;

create table public.log_customer_pickup_addresses (
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
create index log_pickup_address_customer_idx on public.log_customer_pickup_addresses(company_id,customer_id);
create index log_pickup_address_creator_idx on public.log_customer_pickup_addresses(created_by);
alter table public.log_customer_pickup_addresses enable row level security;
revoke all on public.log_customer_pickup_addresses from public,anon,authenticated;
grant select on public.log_customer_pickup_addresses to authenticated;
grant insert(company_id,branch_id,customer_id,label,address),update(label,address,active)
 on public.log_customer_pickup_addresses to authenticated;

create policy pickup_address_read on public.log_customer_pickup_addresses for select to authenticated using(
 logistics_private.access_company(company_id,branch_id,array['owner','administrative'])
 and exists(select 1 from public.log_customers c where c.company_id=log_customer_pickup_addresses.company_id
 and c.id=customer_id and (c.branch_id is null or c.branch_id=log_customer_pickup_addresses.branch_id)));
create policy pickup_address_insert on public.log_customer_pickup_addresses for insert to authenticated with check(
 logistics_private.access_company(company_id,branch_id,array['owner','administrative'])
 and exists(select 1 from public.log_customers c where c.company_id=log_customer_pickup_addresses.company_id
 and c.id=customer_id and c.active and (c.branch_id is null or c.branch_id=log_customer_pickup_addresses.branch_id)));
create policy pickup_address_update on public.log_customer_pickup_addresses for update to authenticated using(
 logistics_private.access_company(company_id,branch_id,array['owner','administrative'])) with check(
 logistics_private.access_company(company_id,branch_id,array['owner','administrative'])
 and exists(select 1 from public.log_customers c where c.company_id=log_customer_pickup_addresses.company_id
 and c.id=customer_id and (c.branch_id is null or c.branch_id=log_customer_pickup_addresses.branch_id)));
create trigger log_pickup_address_audit before insert or update on public.log_customer_pickup_addresses
 for each row execute function logistics_private.audit_record();

-- Resolve the address atomically under the user's RLS; keep the original creation,
-- business checks, event/audit and request-id deduplication contract intact.
create function public.log_collection_from_address(p_company uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_address public.log_customer_pickup_addresses;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into v_address from public.log_customer_pickup_addresses
 where id=(p_payload->>'pickup_address_id')::uuid and company_id=p_company
 and customer_id=(p_payload->>'customer_id')::uuid and branch_id=(p_payload->>'branch_id')::uuid
 and active for share;
 if not found then raise exception 'Pickup address unavailable' using errcode='42501';end if;
 return public.log_collections(p_company,'create',(p_payload-'pickup_address_id')||jsonb_build_object('pickup_address',v_address.address));
end$$;
revoke all on function public.log_collection_from_address(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.log_collection_from_address(uuid,jsonb) to authenticated;
commit;
