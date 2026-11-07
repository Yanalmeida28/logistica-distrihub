-- New, independent logistics project only. Never install in the DistriHub database.
begin;
do $$ begin
  if to_regclass('public.partner_customers') is not null or to_regclass('public.partner_sales') is not null then
    raise exception 'Refusing installation in an existing ERP database';
  end if;
end $$;
create schema logistics_private;
revoke all on schema logistics_private from public,anon,authenticated;
grant usage on schema logistics_private to authenticated;
alter default privileges in schema logistics_private revoke execute on functions from public;

create table public.log_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 2 and 120),
  created_by uuid not null unique references auth.users(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.log_branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.log_companies(id),
  name text not null check(length(btrim(name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id,id)
);
create table public.log_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.log_companies(id),
  user_id uuid not null references auth.users(id),
  role text not null check(role in ('owner','administrative','collector','driver','client')),
  active boolean not null default true,
  unique(company_id,user_id),unique(company_id,id)
);
create table public.log_member_branches (
  company_id uuid not null,
  membership_id uuid not null,
  branch_id uuid not null,
  primary key(membership_id,branch_id),
  foreign key(company_id,membership_id) references public.log_memberships(company_id,id),
  foreign key(company_id,branch_id) references public.log_branches(company_id,id)
);
create table public.log_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.log_companies(id),
  branch_id uuid,
  name text not null check(length(btrim(name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id,id),
  foreign key(company_id,branch_id) references public.log_branches(company_id,id)
);
create table public.log_customer_contacts (
  company_id uuid not null,
  customer_id uuid not null,
  membership_id uuid not null,
  primary key(customer_id,membership_id),
  foreign key(company_id,customer_id) references public.log_customers(company_id,id),
  foreign key(company_id,membership_id) references public.log_memberships(company_id,id)
);
create table public.log_vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.log_companies(id),
  branch_id uuid not null,
  identifier text not null check(length(btrim(identifier)) between 2 and 40),
  capacity_volumes integer check(capacity_volumes between 1 and 100000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id,id),unique(company_id,identifier),
  foreign key(company_id,branch_id) references public.log_branches(company_id,id)
);
create table public.log_audit (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.log_companies(id),
  actor_id uuid references auth.users(id),
  object_type text not null,
  object_id uuid not null,
  action text not null,
  at timestamptz not null default now()
);
create index log_memberships_user_idx on public.log_memberships(user_id,company_id) where active;
create index log_customer_branch_idx on public.log_customers(company_id,branch_id);
create index log_vehicle_branch_idx on public.log_vehicles(company_id,branch_id);
create index log_contact_membership_idx on public.log_customer_contacts(membership_id,customer_id);
create index log_audit_company_idx on public.log_audit(company_id,at desc);

-- Deliberate private definer lookups avoid recursive membership RLS.
-- Only current auth.uid() is accepted; there is no arbitrary-user parameter.
create function logistics_private.access_company(p_company uuid,p_branch uuid,p_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.log_memberships m
    join public.log_companies c on c.id=m.company_id and c.active
    where m.user_id=auth.uid() and m.active and m.company_id=p_company and m.role=any(p_roles)
      and (m.role='owner' or exists(
        select 1 from public.log_member_branches mb
        join public.log_branches b on b.id=mb.branch_id and b.company_id=mb.company_id and b.active
        where mb.membership_id=m.id and mb.company_id=p_company and (p_branch is null or mb.branch_id=p_branch)
      ))
  )
$$;
create function logistics_private.company_member(p_company uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.log_memberships m
    join public.log_companies c on c.id=m.company_id and c.active
    where m.company_id=p_company and m.user_id=auth.uid() and m.active)
$$;
create function logistics_private.customer_contact(p_company uuid,p_customer uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.log_customer_contacts cc
    join public.log_memberships m on m.id=cc.membership_id and m.company_id=cc.company_id
    join public.log_companies c on c.id=cc.company_id and c.active
    where cc.company_id=p_company and cc.customer_id=p_customer and m.user_id=auth.uid() and m.active and m.role='client')
$$;
revoke all on function logistics_private.access_company(uuid,uuid,text[]),logistics_private.company_member(uuid),logistics_private.customer_contact(uuid,uuid) from public,anon,authenticated;
grant execute on function logistics_private.access_company(uuid,uuid,text[]),logistics_private.company_member(uuid),logistics_private.customer_contact(uuid,uuid) to authenticated;

create function logistics_private.audit_record()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.company_id<>old.company_id or new.id<>old.id or new.created_at<>old.created_at) then
    raise exception 'Immutable record identity';
  end if;
  insert into public.log_audit(company_id,actor_id,object_type,object_id,action)
  values(new.company_id,auth.uid(),tg_table_name,new.id,lower(tg_op));
  return new;
end $$;
revoke all on function logistics_private.audit_record() from public,anon,authenticated;
create trigger log_branch_audit before insert or update on public.log_branches for each row execute function logistics_private.audit_record();
create trigger log_customer_audit before insert or update on public.log_customers for each row execute function logistics_private.audit_record();
create trigger log_vehicle_audit before insert or update on public.log_vehicles for each row execute function logistics_private.audit_record();

alter table public.log_companies enable row level security;
alter table public.log_branches enable row level security;
alter table public.log_memberships enable row level security;
alter table public.log_member_branches enable row level security;
alter table public.log_customers enable row level security;
alter table public.log_customer_contacts enable row level security;
alter table public.log_vehicles enable row level security;
alter table public.log_audit enable row level security;
revoke all on public.log_companies,public.log_branches,public.log_memberships,public.log_member_branches,public.log_customers,public.log_customer_contacts,public.log_vehicles,public.log_audit from public,anon,authenticated;
grant select on public.log_companies,public.log_branches,public.log_memberships,public.log_member_branches,public.log_customers,public.log_customer_contacts,public.log_vehicles,public.log_audit to authenticated;
grant insert(company_id,name) on public.log_branches to authenticated;
grant update(name,active) on public.log_branches to authenticated;
grant insert(company_id,branch_id,name) on public.log_customers to authenticated;
grant update(name,active) on public.log_customers to authenticated;
grant insert(company_id,branch_id,identifier,capacity_volumes) on public.log_vehicles to authenticated;
grant update(identifier,capacity_volumes,active) on public.log_vehicles to authenticated;

create policy company_read on public.log_companies for select to authenticated using(logistics_private.company_member(id));
create policy membership_self on public.log_memberships for select to authenticated using(user_id=(select auth.uid()));
create policy member_branch_self on public.log_member_branches for select to authenticated using(exists(select 1 from public.log_memberships m where m.id=membership_id and m.user_id=(select auth.uid())));
create policy customer_contact_self on public.log_customer_contacts for select to authenticated using(exists(select 1 from public.log_memberships m where m.id=membership_id and m.user_id=(select auth.uid())));
create policy branch_read on public.log_branches for select to authenticated using(logistics_private.access_company(company_id,id,array['owner','administrative','collector','driver']));
create policy branch_insert on public.log_branches for insert to authenticated with check(logistics_private.access_company(company_id,null,array['owner']));
create policy branch_update on public.log_branches for update to authenticated using(logistics_private.access_company(company_id,null,array['owner'])) with check(logistics_private.access_company(company_id,null,array['owner']));
create policy customer_read on public.log_customers for select to authenticated using(logistics_private.access_company(company_id,branch_id,array['owner','administrative']) or logistics_private.customer_contact(company_id,id));
create policy customer_insert on public.log_customers for insert to authenticated with check(logistics_private.access_company(company_id,branch_id,case when branch_id is null then array['owner'] else array['owner','administrative'] end));
create policy customer_update on public.log_customers for update to authenticated using(logistics_private.access_company(company_id,branch_id,case when branch_id is null then array['owner'] else array['owner','administrative'] end)) with check(logistics_private.access_company(company_id,branch_id,case when branch_id is null then array['owner'] else array['owner','administrative'] end));
create policy vehicle_read on public.log_vehicles for select to authenticated using(logistics_private.access_company(company_id,branch_id,array['owner','administrative','driver','collector']));
create policy vehicle_insert on public.log_vehicles for insert to authenticated with check(logistics_private.access_company(company_id,branch_id,array['owner','administrative']));
create policy vehicle_update on public.log_vehicles for update to authenticated using(logistics_private.access_company(company_id,branch_id,array['owner','administrative'])) with check(logistics_private.access_company(company_id,branch_id,array['owner','administrative']));
create policy audit_owner on public.log_audit for select to authenticated using(logistics_private.access_company(company_id,null,array['owner']));

-- Bootstrap only: one company per verified user, no user-editable JWT role claims.
create function logistics_private.create_company(p_name text,p_branch text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company uuid;v_user uuid:=auth.uid();
begin
  if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null and coalesce(is_anonymous,false)=false) then
    raise exception 'Verified non-anonymous identity required' using errcode='42501';
  end if;
  insert into public.log_companies(name,created_by) values(btrim(p_name),v_user) returning id into v_company;
  insert into public.log_memberships(company_id,user_id,role) values(v_company,v_user,'owner');
  insert into public.log_branches(company_id,name) values(v_company,btrim(p_branch));
  insert into public.log_audit(company_id,actor_id,object_type,object_id,action) values(v_company,v_user,'log_companies',v_company,'created');
  return v_company;
end $$;
revoke all on function logistics_private.create_company(text,text) from public,anon,authenticated;
grant execute on function logistics_private.create_company(text,text) to authenticated;
create function public.log_create_company(p_name text,p_branch text)
returns uuid language sql security invoker set search_path='' as $$
  select logistics_private.create_company(p_name,p_branch)
$$;
revoke all on function public.log_create_company(text,text) from public,anon,authenticated;
grant execute on function public.log_create_company(text,text) to authenticated;
commit;
