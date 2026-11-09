begin;
set local lock_timeout='5s';
do $$begin if to_regclass('public.partner_sales') is not null then raise exception 'ERP database refused';end if;end$$;
alter table public.log_cargos alter column order_id drop not null;
alter table public.log_cargos
 add column origin text not null default 'collection',
 add column customer_id uuid,
 add column destination text,
 add column volumes integer,
 add column created_by uuid references auth.users(id),
 add column version integer not null default 1 check(version>0),
 add column nf_reference text check(length(nf_reference) between 1 and 80),
 add column cte_reference text check(length(cte_reference) between 1 and 80);
-- Existing identity, physical status, timestamps and historical events are untouched.
update public.log_cargos c set customer_id=o.customer_id,destination=o.destination,volumes=o.volumes
 from public.log_collection_orders o where o.id=c.order_id and o.company_id=c.company_id and o.branch_id=c.branch_id;
alter table public.log_cargos
 alter column customer_id set not null,alter column destination set not null,alter column volumes set not null,
 add constraint log_cargo_origin check((origin='collection' and order_id is not null) or (origin='direct' and order_id is null and created_by is not null)),
 add constraint log_cargo_volumes check(volumes between 1 and 100000),
 add constraint log_cargo_destination check(length(btrim(destination)) between 3 and 300),
 add constraint log_cargo_identity unique(company_id,branch_id,id),
 add constraint log_cargo_branch_fk foreign key(company_id,branch_id) references public.log_branches(company_id,id),
 add constraint log_cargo_customer_fk foreign key(company_id,customer_id) references public.log_customers(company_id,id);
create index log_cargo_customer_idx on public.log_cargos(company_id,customer_id);
create index log_cargo_recent_idx on public.log_cargos(company_id,received_at desc);
create index log_cargo_creator_idx on public.log_cargos(created_by);

create function logistics_private.cargo_collection_fields() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.log_collection_orders;
begin
 if new.order_id is not null then
  select * into strict o from public.log_collection_orders where id=new.order_id and company_id=new.company_id and branch_id=new.branch_id;
  new.origin:='collection';new.customer_id:=o.customer_id;new.destination:=o.destination;new.volumes:=o.volumes;new.created_by:=auth.uid();
 end if;
 return new;
end$$;
revoke all on function logistics_private.cargo_collection_fields() from public,anon,authenticated;
create trigger log_cargo_collection_fields before insert on public.log_cargos for each row execute function logistics_private.cargo_collection_fields();

create table public.log_cargo_events(
 id bigint generated always as identity primary key,company_id uuid not null,branch_id uuid not null,cargo_id uuid not null,
 action text not null,details jsonb not null default '{}'::jsonb,note text not null check(length(btrim(note)) between 3 and 500),actor_id uuid not null references auth.users(id),
 at timestamptz not null default clock_timestamp(),
 foreign key(company_id,branch_id,cargo_id) references public.log_cargos(company_id,branch_id,id)
);
create index log_cargo_event_scope_idx on public.log_cargo_events(company_id,branch_id,cargo_id,id);
create index log_cargo_event_actor_idx on public.log_cargo_events(actor_id);
create table public.log_cargo_commands(
 company_id uuid not null references public.log_companies(id),request_id uuid not null,actor_id uuid not null references auth.users(id),
 action text not null,payload jsonb not null,response jsonb,primary key(company_id,request_id)
);
create index log_cargo_command_actor_idx on public.log_cargo_commands(actor_id);
alter table public.log_cargo_events enable row level security;
alter table public.log_cargo_commands enable row level security;
revoke all on public.log_cargo_events,public.log_cargo_commands from public,anon,authenticated;
drop policy cargo_read on public.log_cargos;
create policy cargo_read on public.log_cargos for select to authenticated using(
 logistics_private.access_company(company_id,branch_id,array['owner','administrative']) or
 exists(select 1 from public.log_collection_orders o where o.id=order_id and o.company_id=log_cargos.company_id));

-- Documents/invitations/grants keep their OS identity or bind to a direct cargo, never both.
alter table public.log_portal_invites alter column order_id drop not null;
alter table public.log_portal_invites add column cargo_id uuid,
 add constraint log_portal_invite_resource check(num_nonnulls(order_id,cargo_id)=1),
 add constraint log_portal_invite_cargo_fk foreign key(company_id,branch_id,cargo_id) references public.log_cargos(company_id,branch_id,id);
create unique index log_portal_invite_cargo_pending_idx on public.log_portal_invites(cargo_id,email) where state='pending' and cargo_id is not null;
create index log_portal_invite_cargo_idx on public.log_portal_invites(company_id,branch_id,cargo_id);
alter table public.log_portal_grants drop constraint log_portal_grants_pkey;
alter table public.log_portal_grants alter column order_id drop not null;
alter table public.log_portal_grants add column cargo_id uuid,
 add constraint log_portal_grant_resource check(num_nonnulls(order_id,cargo_id)=1),
 add constraint log_portal_grant_cargo_fk foreign key(company_id,branch_id,cargo_id) references public.log_cargos(company_id,branch_id,id);
create unique index log_portal_grant_order_member_idx on public.log_portal_grants(order_id,membership_id) where order_id is not null;
create unique index log_portal_grant_cargo_member_idx on public.log_portal_grants(cargo_id,membership_id) where cargo_id is not null;
create index log_portal_grant_cargo_idx on public.log_portal_grants(company_id,branch_id,cargo_id);
alter table public.log_documents alter column order_id drop not null;
alter table public.log_documents add column cargo_id uuid,
 add constraint log_document_resource check(num_nonnulls(order_id,cargo_id)=1),
 add constraint log_document_cargo_fk foreign key(company_id,branch_id,cargo_id) references public.log_cargos(company_id,branch_id,id);
create index log_document_cargo_idx on public.log_documents(company_id,branch_id,cargo_id);

-- Private resource abstraction: OS resources remain valid before and after receiving.
-- Direct cargo exposes no fabricated OS. No caller has SELECT/USAGE on this view.
create view logistics_private.freight_resources as
 select o.id,o.company_id,o.branch_id,o.customer_id,o.destination,o.volumes,o.status,o.created_at,
  o.id as order_id,null::uuid as cargo_id
 from public.log_collection_orders o
 union all
 select c.id,c.company_id,c.branch_id,c.customer_id,c.destination,c.volumes,c.status,c.received_at,
  null::uuid,c.id
 from public.log_cargos c where c.origin='direct';
revoke all on logistics_private.freight_resources from public,anon,authenticated;

create function logistics_private.cargos(p_company uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();c public.log_cargos;cmd public.log_cargo_commands;r uuid;result jsonb;b uuid;n text;next text;
begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'Verified identity required' using errcode='42501';end if;
 perform 1 from public.log_companies where id=p_company and active for share;
 if not found or not logistics_private.access_company(p_company,null,array['owner','administrative']) then raise exception 'Administration required' using errcode='42501';end if;
 if p_action='list' then return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from
  (select c.* from public.log_cargos c where c.company_id=p_company and logistics_private.access_company(c.company_id,c.branch_id,array['owner','administrative']) order by c.received_at desc,c.id limit 100) x);end if;
 if p_action='create_direct' then b:=(p_payload->>'branch_id')::uuid;
 else
  select * into c from public.log_cargos where id=(p_payload->>'id')::uuid and company_id=p_company;
  if c.order_id is not null then perform 1 from public.log_collection_orders where id=c.order_id for update;end if;
  select * into c from public.log_cargos where id=(p_payload->>'id')::uuid and company_id=p_company for update;
  if not found then raise exception 'Cargo denied' using errcode='42501';end if;b:=c.branch_id;
 end if;
 if not logistics_private.access_company(p_company,b,array['owner','administrative']) or not exists(select 1 from public.log_branches where id=b and company_id=p_company and active) then raise exception 'Branch denied' using errcode='42501';end if;
 if p_action='detail' then return jsonb_build_object('cargo',to_jsonb(c),'events',
  (select coalesce(jsonb_agg(to_jsonb(e) order by e.at),'[]') from (
   select action,note,actor_id,at from public.log_cargo_events where cargo_id=c.id
   union all select action,note,actor_id,at from public.log_collection_events where order_id=c.order_id and company_id=p_company
  ) e));end if;
 if p_action not in ('create_direct','references','advance') then raise exception 'Invalid action';end if;
 r:=(p_payload->>'request_id')::uuid;if r is null then raise exception 'Request ID required';end if;
 insert into public.log_cargo_commands(company_id,request_id,actor_id,action,payload) values(p_company,r,u,p_action,p_payload) on conflict do nothing;
 select * into strict cmd from public.log_cargo_commands where company_id=p_company and request_id=r for update;
 if cmd.actor_id<>u or cmd.action<>p_action or cmd.payload<>p_payload then raise exception 'Request mismatch';end if;
 if cmd.response is not null then return cmd.response;end if;
 n:=btrim(p_payload->>'note');if n is null or length(n) not between 3 and 500 then raise exception 'Note required';end if;
 if p_action='create_direct' then
  if not exists(select 1 from public.log_customers where id=(p_payload->>'customer_id')::uuid and company_id=p_company and active and (branch_id is null or branch_id=b)) then raise exception 'Customer outside branch';end if;
  insert into public.log_cargos(company_id,branch_id,origin,customer_id,destination,volumes,created_by,nf_reference,cte_reference)
  values(p_company,b,'direct',(p_payload->>'customer_id')::uuid,btrim(p_payload->>'destination'),(p_payload->>'volumes')::integer,u,nullif(btrim(p_payload->>'nf_reference'),''),nullif(btrim(p_payload->>'cte_reference'),'')) returning * into c;
 elsif (p_payload->>'expected_version')::integer is distinct from c.version then raise exception 'Cargo changed';
 elsif p_action='references' then
  update public.log_cargos set nf_reference=nullif(btrim(p_payload->>'nf_reference'),''),cte_reference=nullif(btrim(p_payload->>'cte_reference'),''),version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
 elsif p_action='advance' then
  if c.origin='collection' then
   result:=logistics_private.collections(p_company,'advance',p_payload||jsonb_build_object('id',c.order_id,'expected_version',(select version from public.log_collection_orders where id=c.order_id)));
   update public.log_cargos set version=version+1 where id=c.id returning * into c;
  else
   next:=case c.status when 'received' then 'shipped' when 'shipped' then 'destination' when 'destination' then 'out_for_delivery' when 'out_for_delivery' then 'delivered' end;
   if next is null or p_payload->>'next_status' is distinct from next then raise exception 'Invalid cargo transition';end if;
   update public.log_cargos set status=next,version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
  end if;
 end if;
 if p_action<>'advance' or c.origin='direct' then
 insert into public.log_cargo_events(company_id,branch_id,cargo_id,action,note,actor_id,details) values(p_company,b,c.id,case p_action when 'create_direct' then 'receive_direct' when 'references' then 'references' else c.status end,n,u,jsonb_build_object('nf_reference',c.nf_reference,'cte_reference',c.cte_reference,'status',c.status,'version',c.version));end if;
 insert into public.log_audit(company_id,actor_id,object_type,object_id,action) values(p_company,u,'cargo',c.id,p_action);
 result:=jsonb_build_object('id',c.id,'version',c.version);
 update public.log_cargo_commands set response=result where company_id=p_company and request_id=r;return result;
end$$;
revoke all on function logistics_private.cargos(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function logistics_private.cargos(uuid,text,jsonb) to authenticated;
create function public.log_cargos_workspace(p_company uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select logistics_private.cargos(p_company,p_action,p_payload)$$;
revoke all on function public.log_cargos_workspace(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.log_cargos_workspace(uuid,text,jsonb) to authenticated;

-- Existing public signatures and ACLs retained; resource lookups support an OS or a direct cargo.
create or replace function logistics_private.portal_access(p_company uuid,p_order uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.log_portal_grants g
 join public.log_memberships m on m.id=g.membership_id and m.company_id=g.company_id and m.active and m.role='client' and m.user_id=auth.uid()
 join public.log_companies c on c.id=g.company_id and c.active
 join public.log_branches b on b.id=g.branch_id and b.company_id=g.company_id and b.active
 join logistics_private.freight_resources o on o.id=coalesce(g.order_id,g.cargo_id) and o.company_id=g.company_id and o.branch_id=g.branch_id
 join public.log_customers cust on cust.id=o.customer_id and cust.company_id=o.company_id and cust.active
 join public.log_customer_contacts cc on cc.customer_id=o.customer_id and cc.company_id=g.company_id and cc.membership_id=m.id
 where g.company_id=p_company and coalesce(g.order_id,g.cargo_id)=p_order)
$$;

create or replace function logistics_private.portal(p_company uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_email text;v_o logistics_private.freight_resources;v_i public.log_portal_invites;v_m public.log_memberships;v_id uuid;v_member uuid;
begin
 select lower(btrim(email)) into v_email from auth.users where id=v_user and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if v_user is null or v_email is null then raise exception 'Verified identity required' using errcode='42501';end if;
 if p_action in ('manage','invite','revoke_invite','revoke') and num_nonnulls(p_payload->>'order_id',p_payload->>'cargo_id')<>1 then raise exception 'Exactly one resource required';end if;
 if p_action='incoming' then return (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'company_id',i.company_id,'company_name',c.name,'expires_at',i.expires_at)),'[]') from public.log_portal_invites i join public.log_companies c on c.id=i.company_id and c.active where i.email=v_email and i.state='pending' and i.expires_at>now());end if;
 perform 1 from public.log_companies where id=p_company and active for update;
 if not found then raise exception 'Access denied' using errcode='42501';end if;
 if p_action='list' then
   if not exists(select 1 from public.log_memberships where company_id=p_company and user_id=v_user and active and role='client') then raise exception 'Client required' using errcode='42501';end if;
   return (select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'branch_id',o.branch_id,'destination',o.destination,'volumes',o.volumes,'status',coalesce(c.status,o.status),
     'events',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'at',e.at) order by e.at,e.id),'[]') from (select id,action,at from public.log_collection_events where order_id=o.order_id and action in ('collect','receive','shipped','destination','out_for_delivery','delivered') union all select id,case when action='receive_direct' then 'receive' else action end,at from public.log_cargo_events where cargo_id=o.cargo_id and action in ('receive_direct','shipped','destination','out_for_delivery','delivered')) e),
     'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'filename',d.filename,'mime',d.mime,'byte_size',d.byte_size)),'[]') from public.log_documents d join public.log_document_grants dg on dg.document_id=d.id and dg.company_id=d.company_id join public.log_memberships dm on dm.id=dg.membership_id and dm.active and dm.role='client' and dm.user_id=v_user where coalesce(d.order_id,d.cargo_id)=o.id and d.state='ready'))),'[]')
   from (select * from logistics_private.freight_resources x where x.company_id=p_company and logistics_private.portal_access(p_company,x.id) order by x.created_at desc limit 100) o left join public.log_cargos c on c.order_id=o.id);
 elsif p_action='accept' then
   select * into v_i from public.log_portal_invites where id=(p_payload->>'id')::uuid and company_id=p_company for update;
   if not found or v_i.email<>v_email or v_i.state<>'pending' or v_i.expires_at<=now() then raise exception 'Invite unavailable' using errcode='42501';end if;
   select * into v_o from logistics_private.freight_resources where id=coalesce(v_i.order_id,v_i.cargo_id) and company_id=p_company;
   if not exists(select 1 from public.log_memberships m where m.company_id=p_company and m.user_id=v_i.created_by and logistics_private.member_at_branch(p_company,v_o.branch_id,m.id,array['owner','administrative'])) then raise exception 'Inviter revoked' using errcode='42501';end if;
   if not exists(select 1 from public.log_customers where id=v_o.customer_id and company_id=p_company and active) then raise exception 'Customer unavailable';end if;
   select * into v_m from public.log_memberships where company_id=p_company and user_id=v_user for update;
   if found then
     if not v_m.active or v_m.role<>'client' then raise exception 'Protected membership' using errcode='42501';end if;v_member:=v_m.id;
   else insert into public.log_memberships(company_id,user_id,role) values(p_company,v_user,'client') returning id into v_member;end if;
   insert into public.log_customer_contacts(company_id,customer_id,membership_id) values(p_company,v_o.customer_id,v_member) on conflict do nothing;
   insert into public.log_portal_grants(company_id,branch_id,order_id,cargo_id,membership_id) values(p_company,v_o.branch_id,v_o.order_id,v_o.cargo_id,v_member) on conflict do nothing;
   update public.log_portal_invites set state='accepted' where id=v_i.id;v_id:=v_i.id;
 else
   select * into v_o from logistics_private.freight_resources where id=coalesce((p_payload->>'order_id')::uuid,(p_payload->>'cargo_id')::uuid) and company_id=p_company and order_id is not distinct from (p_payload->>'order_id')::uuid and cargo_id is not distinct from (p_payload->>'cargo_id')::uuid;
   if not found or not logistics_private.access_company(p_company,v_o.branch_id,array['owner','administrative']) then raise exception 'Administration required' using errcode='42501';end if;
   if p_action='manage' then return jsonb_build_object('invites',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from public.log_portal_invites i where coalesce(i.order_id,i.cargo_id)=v_o.id and i.state='pending' and i.expires_at>now()),
     'grants',(select coalesce(jsonb_agg(jsonb_build_object('membership_id',g.membership_id,'email',u.email)),'[]') from public.log_portal_grants g join public.log_memberships m on m.id=g.membership_id join auth.users u on u.id=m.user_id where coalesce(g.order_id,g.cargo_id)=v_o.id));
   elsif p_action='invite' then
     v_email:=lower(btrim(p_payload->>'email'));
     if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(v_email)>254 then raise exception 'Invalid email';end if;
     update public.log_portal_invites set state='revoked' where coalesce(order_id,cargo_id)=v_o.id and email=v_email and state='pending' and expires_at<=now();
     insert into public.log_portal_invites(company_id,branch_id,order_id,cargo_id,email,created_by) values(p_company,v_o.branch_id,v_o.order_id,v_o.cargo_id,v_email,v_user) returning id into v_id;
   elsif p_action='revoke_invite' then
     update public.log_portal_invites set state='revoked' where id=(p_payload->>'id')::uuid and coalesce(order_id,cargo_id)=v_o.id and state='pending' returning id into v_id;
     if not found then raise exception 'Invite unavailable';end if;
   elsif p_action='revoke' then
     v_member:=(p_payload->>'membership_id')::uuid;
     delete from public.log_document_grants where membership_id=v_member and document_id in(select id from public.log_documents where coalesce(order_id,cargo_id)=v_o.id);
     delete from public.log_portal_grants where coalesce(order_id,cargo_id)=v_o.id and membership_id=v_member;
     -- Pending invitations must not silently regrant a revoked access.
     update public.log_portal_invites set state='revoked' where coalesce(order_id,cargo_id)=v_o.id and state='pending' and email=(select lower(btrim(u.email)) from auth.users u join public.log_memberships m on m.user_id=u.id where m.id=v_member);
     v_id:=v_o.id;
   else raise exception 'Invalid action';end if;
 end if;
 insert into public.log_audit(company_id,actor_id,object_type,object_id,action) values(p_company,v_user,'portal',v_id,p_action);
 return jsonb_build_object('id',v_id);
end $$;

create or replace function logistics_private.document_access(p_document uuid,p_mode text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.log_documents d where d.id=p_document and
  ((p_mode='upload' and d.state='pending' and d.created_by=auth.uid() and d.created_at>now()-interval '15 minutes' and logistics_private.access_company(d.company_id,d.branch_id,array['owner','administrative'])) or
   (p_mode='read' and ((d.state in ('pending','ready') and logistics_private.access_company(d.company_id,d.branch_id,array['owner','administrative']) and (d.state='ready' or (d.created_by=auth.uid() and d.created_at>now()-interval '15 minutes'))) or
    (d.state='ready' and logistics_private.portal_access(d.company_id,coalesce(d.order_id,d.cargo_id)) and exists(select 1 from public.log_document_grants g join public.log_memberships m on m.id=g.membership_id and m.user_id=auth.uid() and m.active and m.role='client' where g.document_id=d.id and g.company_id=d.company_id))))))
$$;

create or replace function logistics_private.documents(p_company uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_o logistics_private.freight_resources;v_d public.log_documents;v_id uuid;v_member uuid;v_valid boolean;v_inserted integer;
begin
 if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'Verified identity required' using errcode='42501';end if;
 perform 1 from public.log_companies where id=p_company and active for update;
 if not found then raise exception 'Access denied' using errcode='42501';end if;
 if p_action='download' then
   select * into v_d from public.log_documents where id=(p_payload->>'id')::uuid and company_id=p_company;
   if not found or v_d.state<>'ready' or not logistics_private.document_access(v_d.id,'read') then raise exception 'Document denied' using errcode='42501';end if;
   insert into public.log_audit(company_id,actor_id,object_type,object_id,action) values(p_company,v_user,'document',v_d.id,'download_authorized');
   return to_jsonb(v_d)||jsonb_build_object('path',v_d.company_id::text||'/'||v_d.branch_id::text||'/'||v_d.id::text);
 end if;
 if num_nonnulls(p_payload->>'order_id',p_payload->>'cargo_id')<>1 then raise exception 'Exactly one resource required';end if;
 select * into v_o from logistics_private.freight_resources where id=coalesce((p_payload->>'order_id')::uuid,(p_payload->>'cargo_id')::uuid) and company_id=p_company and order_id is not distinct from (p_payload->>'order_id')::uuid and cargo_id is not distinct from (p_payload->>'cargo_id')::uuid;
 if not found or not logistics_private.access_company(p_company,v_o.branch_id,array['owner','administrative']) then raise exception 'Administration required' using errcode='42501';end if;
 if p_action='list' then return (select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('shared_with',(select coalesce(jsonb_agg(membership_id),'[]') from public.log_document_grants where document_id=d.id)) order by d.created_at desc),'[]') from public.log_documents d where coalesce(d.order_id,d.cargo_id)=v_o.id and d.state<>'revoked');end if;
 if p_action='prepare' then
   insert into public.log_documents(company_id,branch_id,order_id,cargo_id,filename,mime,byte_size,sha256,request_id,created_by)
   values(p_company,v_o.branch_id,v_o.order_id,v_o.cargo_id,p_payload->>'filename',p_payload->>'mime',(p_payload->>'byte_size')::integer,p_payload->>'sha256',(p_payload->>'request_id')::uuid,v_user) on conflict(company_id,request_id) do nothing;
   get diagnostics v_inserted=row_count;
   select * into v_d from public.log_documents where company_id=p_company and request_id=(p_payload->>'request_id')::uuid for update;
   if v_d.created_by<>v_user or coalesce(v_d.order_id,v_d.cargo_id)<>v_o.id or v_d.filename<>p_payload->>'filename' or v_d.mime<>p_payload->>'mime' or v_d.byte_size<>(p_payload->>'byte_size')::integer or v_d.sha256<>p_payload->>'sha256' or v_d.state='revoked' then raise exception 'Request mismatch';end if;
   if v_d.state='pending' and v_d.created_at<=now()-interval '15 minutes' then raise exception 'Upload expired';end if;
   if v_inserted=1 then insert into public.log_audit(company_id,actor_id,object_type,object_id,action) values(p_company,v_user,'document',v_d.id,'prepare');end if;
   return to_jsonb(v_d)||jsonb_build_object('path',v_d.company_id::text||'/'||v_d.branch_id::text||'/'||v_d.id::text);
 end if;
 select * into v_d from public.log_documents where id=(p_payload->>'id')::uuid and coalesce(order_id,cargo_id)=v_o.id for update;
 if not found then raise exception 'Document unavailable';end if;
 if p_action='finalize' then
   if v_d.state='ready' and v_d.created_by=v_user then return jsonb_build_object('id',v_d.id);end if;
   if not logistics_private.document_access(v_d.id,'upload') then raise exception 'Upload denied' using errcode='42501';end if;
   if to_regprocedure('logistics_private.document_object_valid(uuid)') is null then raise exception 'Private Storage not installed';end if;
   execute 'select logistics_private.document_object_valid($1)' into v_valid using v_d.id;
   if not coalesce(v_valid,false) then raise exception 'Object metadata mismatch';end if;
   update public.log_documents set state='ready' where id=v_d.id;
 elsif p_action in ('share','unshare') then
   v_member:=(p_payload->>'membership_id')::uuid;
   if v_d.state<>'ready' or not exists(select 1 from public.log_portal_grants g join public.log_memberships m on m.id=g.membership_id and m.active and m.role='client' join public.log_customer_contacts cc on cc.membership_id=m.id and cc.customer_id=v_o.customer_id and cc.company_id=p_company where coalesce(g.order_id,g.cargo_id)=v_o.id and g.membership_id=v_member) then raise exception 'Client not entitled';end if;
   if p_action='share' then insert into public.log_document_grants(company_id,document_id,membership_id) values(p_company,v_d.id,v_member) on conflict do nothing;
   else delete from public.log_document_grants where document_id=v_d.id and membership_id=v_member;end if;
 elsif p_action='revoke' then update public.log_documents set state='revoked' where id=v_d.id;
 else raise exception 'Invalid action';end if;
 insert into public.log_audit(company_id,actor_id,object_type,object_id,action) values(p_company,v_user,'document',v_d.id,p_action);
 return jsonb_build_object('id',v_d.id);
end $$;
commit;
