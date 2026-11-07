-- Independent logistics project only. No historical ERP contracts are used.
begin;
do $$begin if to_regclass('public.partner_sales') is not null then raise exception 'ERP database refused';end if;end$$;
create table public.log_collection_orders (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.log_companies(id),
 branch_id uuid not null,
 customer_id uuid not null,
 pickup_address text not null check(length(btrim(pickup_address)) between 3 and 300),
 destination text not null check(length(btrim(destination)) between 3 and 300),
 volumes integer not null check(volumes between 1 and 100000),
 status text not null default 'pending' check(status in ('pending','assigned','accepted','in_progress','collected','received')),
 assignee_id uuid,
 vehicle_id uuid,
 version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,branch_id,id),
 foreign key(company_id,branch_id) references public.log_branches(company_id,id),
 foreign key(company_id,customer_id) references public.log_customers(company_id,id),
 foreign key(company_id,assignee_id) references public.log_memberships(company_id,id),
 foreign key(company_id,vehicle_id) references public.log_vehicles(company_id,id),
 check((status='pending' and assignee_id is null and vehicle_id is null) or (status<>'pending' and assignee_id is not null and vehicle_id is not null))
);
create unique index log_collection_assignee_busy_idx on public.log_collection_orders(company_id,assignee_id) where status in ('assigned','accepted','in_progress','collected');
create unique index log_collection_vehicle_busy_idx on public.log_collection_orders(company_id,vehicle_id) where status in ('assigned','accepted','in_progress','collected');
create index log_collection_branch_idx on public.log_collection_orders(company_id,branch_id,created_at desc);
create index log_collection_customer_idx on public.log_collection_orders(company_id,customer_id);
create index log_collection_creator_idx on public.log_collection_orders(created_by);
create index log_collection_assignee_idx on public.log_collection_orders(company_id,assignee_id);
create index log_collection_vehicle_idx on public.log_collection_orders(company_id,vehicle_id);

create table public.log_cargos (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 branch_id uuid not null,
 order_id uuid not null unique,
 status text not null default 'received' check(status in ('received','shipped','destination','out_for_delivery','delivered')),
 received_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,branch_id,order_id) references public.log_collection_orders(company_id,branch_id,id)
);
create index log_cargo_scope_idx on public.log_cargos(company_id,branch_id,order_id);
create table public.log_collection_events (
 id bigint generated always as identity primary key,
 company_id uuid not null,
 branch_id uuid not null,
 order_id uuid not null,
 version integer not null,
 action text not null,
 details jsonb not null,
 note text not null check(length(btrim(note)) between 3 and 500),
 actor_id uuid not null references auth.users(id),
 at timestamptz not null default now(),
 unique(order_id,version),
 foreign key(company_id,branch_id,order_id) references public.log_collection_orders(company_id,branch_id,id)
);
create index log_collection_event_scope_idx on public.log_collection_events(company_id,branch_id,order_id);
create index log_collection_event_actor_idx on public.log_collection_events(actor_id);
create table public.log_collection_commands (
 company_id uuid not null references public.log_companies(id),
 request_id uuid not null,
 actor_id uuid not null references auth.users(id),
 action text not null,
 payload jsonb not null,
 response jsonb,
 primary key(company_id,request_id)
);
create index log_collection_command_actor_idx on public.log_collection_commands(actor_id);
alter table public.log_collection_orders enable row level security;
alter table public.log_cargos enable row level security;
alter table public.log_collection_events enable row level security;
alter table public.log_collection_commands enable row level security;
revoke all on public.log_collection_orders,public.log_cargos,public.log_collection_events,public.log_collection_commands from public,anon,authenticated;
grant select on public.log_collection_orders,public.log_cargos,public.log_collection_events to authenticated;

create function logistics_private.collection_access(p_company uuid,p_branch uuid,p_assignee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select logistics_private.access_company(p_company,p_branch,array['owner','administrative']) or
 (logistics_private.access_company(p_company,p_branch,array['driver','collector']) and exists(select 1 from public.log_memberships where id=p_assignee and company_id=p_company and user_id=auth.uid() and active and role in ('driver','collector')))
$$;
revoke all on function logistics_private.collection_access(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function logistics_private.collection_access(uuid,uuid,uuid) to authenticated;
create policy collection_read on public.log_collection_orders for select to authenticated using(logistics_private.collection_access(company_id,branch_id,assignee_id));
create policy cargo_read on public.log_cargos for select to authenticated using(exists(select 1 from public.log_collection_orders o where o.id=order_id and o.company_id=log_cargos.company_id));
create policy collection_event_read on public.log_collection_events for select to authenticated using(exists(select 1 from public.log_collection_orders o where o.id=order_id and o.company_id=log_collection_events.company_id));

create function logistics_private.collections(p_company uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_order public.log_collection_orders;v_command public.log_collection_commands;
 v_request uuid;v_result jsonb;v_branch uuid;v_customer uuid;v_assignee public.log_memberships;v_vehicle public.log_vehicles;v_cargo uuid;v_note text;v_next text;v_admin boolean;
begin
 if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'Verified identity required' using errcode='42501';end if;
 -- Team changes lock this same company exclusively: assignment cannot race a revocation.
 perform 1 from public.log_companies where id=p_company and active for share;
 if not found or not logistics_private.access_company(p_company,null,array['owner','administrative','driver','collector']) then raise exception 'Access denied' using errcode='42501';end if;
 if p_action='list' then
   return jsonb_build_object(
    'orders',(select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc),'[]') from (select * from public.log_collection_orders x where x.company_id=p_company and logistics_private.collection_access(x.company_id,x.branch_id,x.assignee_id) order by x.created_at desc limit 100) o),
    'cargos',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.log_cargos c where c.company_id=p_company and exists(select 1 from public.log_collection_orders o where o.id=c.order_id and logistics_private.collection_access(o.company_id,o.branch_id,o.assignee_id) and o.id in(select id from public.log_collection_orders x where x.company_id=p_company and logistics_private.collection_access(x.company_id,x.branch_id,x.assignee_id) order by created_at desc limit 100))),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from (select e.* from public.log_collection_events e join public.log_collection_orders o on o.id=e.order_id where e.company_id=p_company and logistics_private.collection_access(o.company_id,o.branch_id,o.assignee_id) order by e.id desc limit 1000) e),
    'workers',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'label',u.email,'branch_id',mb.branch_id,'role',m.role)),'[]') from public.log_memberships m join auth.users u on u.id=m.user_id join public.log_member_branches mb on mb.membership_id=m.id and mb.company_id=m.company_id join public.log_branches b on b.id=mb.branch_id and b.company_id=mb.company_id where m.company_id=p_company and m.active and m.role in ('driver','collector') and b.active and logistics_private.access_company(p_company,b.id,array['owner','administrative'])));
 end if;
 if p_action not in ('create','assign','release','accept','start','collect','receive','advance') then raise exception 'Invalid action';end if;
 v_request:=(p_payload->>'request_id')::uuid;
 if v_request is null then raise exception 'Request ID required';end if;
 if p_action='create' then
   v_branch:=(p_payload->>'branch_id')::uuid;
   if not logistics_private.access_company(p_company,v_branch,array['owner','administrative']) then raise exception 'Branch denied' using errcode='42501';end if;
 else
   select * into v_order from public.log_collection_orders where id=(p_payload->>'id')::uuid and company_id=p_company for update;
   if not found or not logistics_private.collection_access(p_company,v_order.branch_id,v_order.assignee_id) then raise exception 'Order denied' using errcode='42501';end if;
   v_branch:=v_order.branch_id;
 end if;
 if not exists(select 1 from public.log_branches where id=v_branch and company_id=p_company and active) then raise exception 'Inactive branch';end if;
 v_admin:=logistics_private.access_company(p_company,v_branch,array['owner','administrative']);
 if p_action in ('create','assign','release','receive','advance') and not v_admin then raise exception 'Administration required' using errcode='42501';end if;
 if p_action in ('accept','start','collect') and not exists(select 1 from public.log_memberships where id=v_order.assignee_id and user_id=v_user and active and role in ('driver','collector')) then raise exception 'Assigned worker required' using errcode='42501';end if;
 -- Unique request insert blocks concurrent retries until the first transaction finishes.
 insert into public.log_collection_commands(company_id,request_id,actor_id,action,payload) values(p_company,v_request,v_user,p_action,p_payload) on conflict do nothing;
 select * into v_command from public.log_collection_commands where company_id=p_company and request_id=v_request for update;
 if v_command.actor_id<>v_user or v_command.action<>p_action or v_command.payload<>p_payload then raise exception 'Request key reused with different content';end if;
 if v_command.response is not null then return v_command.response;end if;
 v_note:=btrim(p_payload->>'note');
 if v_note is null or length(v_note) not between 3 and 500 then raise exception 'Confirmation note required';end if;
 if p_action='create' then
   v_customer:=(p_payload->>'customer_id')::uuid;
   if not exists(select 1 from public.log_customers where id=v_customer and company_id=p_company and active and (branch_id is null or branch_id=v_branch)) then raise exception 'Customer outside branch';end if;
   insert into public.log_collection_orders(company_id,branch_id,customer_id,pickup_address,destination,volumes,created_by)
   values(p_company,v_branch,v_customer,btrim(p_payload->>'pickup_address'),btrim(p_payload->>'destination'),(p_payload->>'volumes')::integer,v_user) returning * into v_order;
 else
   if (p_payload->>'expected_version')::integer is distinct from v_order.version then raise exception 'Order changed; refresh before confirming';end if;
   if p_action='assign' then
     if v_order.status<>'pending' then raise exception 'Order not pending';end if;
     select * into v_assignee from public.log_memberships where id=(p_payload->>'assignee_id')::uuid and company_id=p_company for update;
     if not found or not v_assignee.active or v_assignee.role not in ('driver','collector') or not exists(select 1 from public.log_member_branches where membership_id=v_assignee.id and company_id=p_company and branch_id=v_branch) then raise exception 'Worker unavailable';end if;
     select * into v_vehicle from public.log_vehicles where id=(p_payload->>'vehicle_id')::uuid and company_id=p_company for update;
     if not found or not v_vehicle.active or v_vehicle.branch_id<>v_branch or v_vehicle.capacity_volumes is null or v_vehicle.capacity_volumes<v_order.volumes then raise exception 'Vehicle capacity or branch invalid';end if;
     update public.log_collection_orders set status='assigned',assignee_id=v_assignee.id,vehicle_id=v_vehicle.id where id=v_order.id;
   elsif p_action='release' then
     if v_order.status not in ('assigned','accepted') then raise exception 'Cannot release started order';end if;
     update public.log_collection_orders set status='pending',assignee_id=null,vehicle_id=null where id=v_order.id;
   elsif p_action in ('accept','start','collect') then
     v_next:=case p_action when 'accept' then 'accepted' when 'start' then 'in_progress' else 'collected' end;
     if (p_action='accept' and v_order.status<>'assigned') or (p_action='start' and v_order.status<>'accepted') or (p_action='collect' and v_order.status<>'in_progress') then raise exception 'Invalid collection transition';end if;
     update public.log_collection_orders set status=v_next where id=v_order.id;
   elsif p_action='receive' then
     if v_order.status<>'collected' then raise exception 'Collection confirmation required';end if;
     insert into public.log_cargos(company_id,branch_id,order_id) values(p_company,v_branch,v_order.id) returning id into v_cargo;
     update public.log_collection_orders set status='received' where id=v_order.id;
   elsif p_action='advance' then
     select id,case status when 'received' then 'shipped' when 'shipped' then 'destination' when 'destination' then 'out_for_delivery' when 'out_for_delivery' then 'delivered' end into v_cargo,v_next from public.log_cargos where order_id=v_order.id for update;
     if v_order.status<>'received' or v_next is null or p_payload->>'next_status' is distinct from v_next then raise exception 'Invalid cargo transition';end if;
     update public.log_cargos set status=v_next,updated_at=clock_timestamp() where id=v_cargo;
   end if;
   update public.log_collection_orders set version=version+1,updated_at=clock_timestamp() where id=v_order.id returning * into v_order;
 end if;
 insert into public.log_collection_events(company_id,branch_id,order_id,version,action,details,note,actor_id) values(p_company,v_branch,v_order.id,v_order.version,case when p_action='advance' then v_next else p_action end,jsonb_build_object('status',v_order.status,'assignee_id',v_order.assignee_id,'vehicle_id',v_order.vehicle_id,'cargo_id',v_cargo,'cargo_status',v_next),v_note,v_user);
 insert into public.log_audit(company_id,actor_id,object_type,object_id,action) values(p_company,v_user,'collection',v_order.id,p_action);
 v_result:=jsonb_build_object('id',v_order.id,'version',v_order.version,'cargo_id',v_cargo);
 update public.log_collection_commands set response=v_result where company_id=p_company and request_id=v_request;
 return v_result;
end $$;
revoke all on function logistics_private.collections(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function logistics_private.collections(uuid,text,jsonb) to authenticated;
create function public.log_collections(p_company uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select logistics_private.collections(p_company,p_action,p_payload)$$;
revoke all on function public.log_collections(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.log_collections(uuid,text,jsonb) to authenticated;
commit;
