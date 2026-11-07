-- Local preparation for the independent logistics project. No data imported.
begin;
create table public.log_portal_invites (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, branch_id uuid not null,order_id uuid not null,
 email text not null check(email=lower(btrim(email)) and length(email) between 3 and 254),
 created_by uuid not null references auth.users(id),expires_at timestamptz not null default now()+interval '7 days',
 state text not null default 'pending' check(state in ('pending','accepted','revoked')),
 foreign key(company_id,branch_id,order_id) references public.log_collection_orders(company_id,branch_id,id)
);
create unique index log_portal_invite_pending_idx on public.log_portal_invites(order_id,email) where state='pending';
create index log_portal_invite_scope_idx on public.log_portal_invites(company_id,branch_id,order_id);
create index log_portal_invite_email_idx on public.log_portal_invites(email) where state='pending';
create index log_portal_invite_creator_idx on public.log_portal_invites(created_by);
create table public.log_portal_grants (
 company_id uuid not null,branch_id uuid not null,order_id uuid not null,membership_id uuid not null,
 primary key(order_id,membership_id),
 foreign key(company_id,branch_id,order_id) references public.log_collection_orders(company_id,branch_id,id),
 foreign key(company_id,membership_id) references public.log_memberships(company_id,id)
);
create index log_portal_grant_scope_idx on public.log_portal_grants(company_id,branch_id,order_id);
create index log_portal_grant_member_idx on public.log_portal_grants(company_id,membership_id);
create table public.log_documents (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,branch_id uuid not null,order_id uuid not null,
 filename text not null check(length(filename) between 1 and 160 and filename !~ '[[:cntrl:]/\\]'),
 mime text not null check(mime in ('application/pdf','image/png','image/jpeg')),
 check((mime='application/pdf' and lower(filename) like '%.pdf') or (mime='image/png' and lower(filename) like '%.png') or (mime='image/jpeg' and (lower(filename) like '%.jpg' or lower(filename) like '%.jpeg'))),
 byte_size integer not null check(byte_size between 1 and 5242880),sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 request_id uuid not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 state text not null default 'pending' check(state in ('pending','ready','revoked')),
 unique(company_id,id),unique(company_id,request_id),
 foreign key(company_id,branch_id,order_id) references public.log_collection_orders(company_id,branch_id,id)
);
create index log_document_scope_idx on public.log_documents(company_id,branch_id,order_id);
create index log_document_creator_idx on public.log_documents(created_by);
create table public.log_document_grants (
 company_id uuid not null,document_id uuid not null,membership_id uuid not null,
 primary key(document_id,membership_id),
 foreign key(company_id,document_id) references public.log_documents(company_id,id),
 foreign key(company_id,membership_id) references public.log_memberships(company_id,id)
);
create index log_document_grant_scope_idx on public.log_document_grants(company_id,document_id);
create index log_document_grant_member_idx on public.log_document_grants(company_id,membership_id);
create table public.log_chat_messages (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,branch_id uuid not null,
 sender_id uuid not null,recipient_id uuid not null,request_id uuid not null,
 body text not null check(length(btrim(body)) between 1 and 2000),at timestamptz not null default now(),
 check(sender_id<>recipient_id),unique(company_id,request_id),
 foreign key(company_id,branch_id) references public.log_branches(company_id,id),
 foreign key(company_id,sender_id) references public.log_memberships(company_id,id),
 foreign key(company_id,recipient_id) references public.log_memberships(company_id,id)
);
create index log_chat_scope_idx on public.log_chat_messages(company_id,branch_id,at desc);
create index log_chat_sender_idx on public.log_chat_messages(company_id,sender_id);
create index log_chat_recipient_idx on public.log_chat_messages(company_id,recipient_id);
alter table public.log_portal_invites enable row level security;
alter table public.log_portal_grants enable row level security;
alter table public.log_documents enable row level security;
alter table public.log_document_grants enable row level security;
alter table public.log_chat_messages enable row level security;
revoke all on public.log_portal_invites,public.log_portal_grants,public.log_documents,public.log_document_grants,public.log_chat_messages from public,anon,authenticated;

create function logistics_private.member_at_branch(p_company uuid,p_branch uuid,p_member uuid,p_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.log_memberships m join public.log_companies c on c.id=m.company_id and c.active
 join public.log_branches b on b.company_id=m.company_id and b.id=p_branch and b.active
 where m.company_id=p_company and m.id=p_member and m.active and m.role=any(p_roles)
 and (m.role='owner' or exists(select 1 from public.log_member_branches mb where mb.membership_id=m.id and mb.company_id=p_company and mb.branch_id=p_branch)))
$$;
revoke all on function logistics_private.member_at_branch(uuid,uuid,uuid,text[]) from public,anon,authenticated;
create function logistics_private.portal_access(p_company uuid,p_order uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.log_portal_grants g
 join public.log_memberships m on m.id=g.membership_id and m.company_id=g.company_id and m.active and m.role='client' and m.user_id=auth.uid()
 join public.log_companies c on c.id=g.company_id and c.active
 join public.log_branches b on b.id=g.branch_id and b.company_id=g.company_id and b.active
 join public.log_collection_orders o on o.id=g.order_id and o.company_id=g.company_id and o.branch_id=g.branch_id
 join public.log_customers cust on cust.id=o.customer_id and cust.company_id=o.company_id and cust.active
 join public.log_customer_contacts cc on cc.customer_id=o.customer_id and cc.company_id=g.company_id and cc.membership_id=m.id
 where g.company_id=p_company and g.order_id=p_order)
$$;
revoke all on function logistics_private.portal_access(uuid,uuid) from public,anon,authenticated;

create function logistics_private.portal(p_company uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_email text;v_o public.log_collection_orders;v_i public.log_portal_invites;v_m public.log_memberships;v_id uuid;v_member uuid;
begin
 select lower(btrim(email)) into v_email from auth.users where id=v_user and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if v_user is null or v_email is null then raise exception 'Verified identity required' using errcode='42501';end if;
 if p_action='incoming' then return (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'company_id',i.company_id,'company_name',c.name,'expires_at',i.expires_at)),'[]') from public.log_portal_invites i join public.log_companies c on c.id=i.company_id and c.active where i.email=v_email and i.state='pending' and i.expires_at>now());end if;
 perform 1 from public.log_companies where id=p_company and active for update;
 if not found then raise exception 'Access denied' using errcode='42501';end if;
 if p_action='list' then
   if not exists(select 1 from public.log_memberships where company_id=p_company and user_id=v_user and active and role='client') then raise exception 'Client required' using errcode='42501';end if;
   return (select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'branch_id',o.branch_id,'destination',o.destination,'volumes',o.volumes,'status',coalesce(c.status,o.status),
     'events',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'at',e.at) order by e.id),'[]') from public.log_collection_events e where e.order_id=o.id and e.action in ('collect','receive','shipped','destination','out_for_delivery','delivered')),
     'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'filename',d.filename,'mime',d.mime,'byte_size',d.byte_size)),'[]') from public.log_documents d join public.log_document_grants dg on dg.document_id=d.id and dg.company_id=d.company_id join public.log_memberships dm on dm.id=dg.membership_id and dm.active and dm.role='client' and dm.user_id=v_user where d.order_id=o.id and d.state='ready'))),'[]')
   from (select * from public.log_collection_orders x where x.company_id=p_company and logistics_private.portal_access(p_company,x.id) order by x.created_at desc limit 100) o left join public.log_cargos c on c.order_id=o.id);
 elsif p_action='accept' then
   select * into v_i from public.log_portal_invites where id=(p_payload->>'id')::uuid and company_id=p_company for update;
   if not found or v_i.email<>v_email or v_i.state<>'pending' or v_i.expires_at<=now() then raise exception 'Invite unavailable' using errcode='42501';end if;
   select * into v_o from public.log_collection_orders where id=v_i.order_id and company_id=p_company;
   if not exists(select 1 from public.log_memberships m where m.company_id=p_company and m.user_id=v_i.created_by and logistics_private.member_at_branch(p_company,v_o.branch_id,m.id,array['owner','administrative'])) then raise exception 'Inviter revoked' using errcode='42501';end if;
   if not exists(select 1 from public.log_customers where id=v_o.customer_id and company_id=p_company and active) then raise exception 'Customer unavailable';end if;
   select * into v_m from public.log_memberships where company_id=p_company and user_id=v_user for update;
   if found then
     if not v_m.active or v_m.role<>'client' then raise exception 'Protected membership' using errcode='42501';end if;v_member:=v_m.id;
   else insert into public.log_memberships(company_id,user_id,role) values(p_company,v_user,'client') returning id into v_member;end if;
   insert into public.log_customer_contacts(company_id,customer_id,membership_id) values(p_company,v_o.customer_id,v_member) on conflict do nothing;
   insert into public.log_portal_grants(company_id,branch_id,order_id,membership_id) values(p_company,v_o.branch_id,v_o.id,v_member) on conflict do nothing;
   update public.log_portal_invites set state='accepted' where id=v_i.id;v_id:=v_i.id;
 else
   select * into v_o from public.log_collection_orders where id=(p_payload->>'order_id')::uuid and company_id=p_company;
   if not found or not logistics_private.access_company(p_company,v_o.branch_id,array['owner','administrative']) then raise exception 'Administration required' using errcode='42501';end if;
   if p_action='manage' then return jsonb_build_object('invites',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from public.log_portal_invites i where i.order_id=v_o.id and i.state='pending' and i.expires_at>now()),
     'grants',(select coalesce(jsonb_agg(jsonb_build_object('membership_id',g.membership_id,'email',u.email)),'[]') from public.log_portal_grants g join public.log_memberships m on m.id=g.membership_id join auth.users u on u.id=m.user_id where g.order_id=v_o.id));
   elsif p_action='invite' then
     v_email:=lower(btrim(p_payload->>'email'));
     if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(v_email)>254 then raise exception 'Invalid email';end if;
     update public.log_portal_invites set state='revoked' where order_id=v_o.id and email=v_email and state='pending' and expires_at<=now();
     insert into public.log_portal_invites(company_id,branch_id,order_id,email,created_by) values(p_company,v_o.branch_id,v_o.id,v_email,v_user) returning id into v_id;
   elsif p_action='revoke_invite' then
     update public.log_portal_invites set state='revoked' where id=(p_payload->>'id')::uuid and order_id=v_o.id and state='pending' returning id into v_id;
     if not found then raise exception 'Invite unavailable';end if;
   elsif p_action='revoke' then
     v_member:=(p_payload->>'membership_id')::uuid;
     delete from public.log_document_grants where membership_id=v_member and document_id in(select id from public.log_documents where order_id=v_o.id);
     delete from public.log_portal_grants where order_id=v_o.id and membership_id=v_member;
     -- Pending invitations must not silently regrant a revoked access.
     update public.log_portal_invites set state='revoked' where order_id=v_o.id and state='pending' and email=(select lower(btrim(u.email)) from auth.users u join public.log_memberships m on m.user_id=u.id where m.id=v_member);
     v_id:=v_o.id;
   else raise exception 'Invalid action';end if;
 end if;
 insert into public.log_audit(company_id,actor_id,object_type,object_id,action) values(p_company,v_user,'portal',v_id,p_action);
 return jsonb_build_object('id',v_id);
end $$;

create function logistics_private.document_access(p_document uuid,p_mode text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.log_documents d where d.id=p_document and
  ((p_mode='upload' and d.state='pending' and d.created_by=auth.uid() and d.created_at>now()-interval '15 minutes' and logistics_private.access_company(d.company_id,d.branch_id,array['owner','administrative'])) or
   (p_mode='read' and ((d.state in ('pending','ready') and logistics_private.access_company(d.company_id,d.branch_id,array['owner','administrative']) and (d.state='ready' or (d.created_by=auth.uid() and d.created_at>now()-interval '15 minutes'))) or
    (d.state='ready' and logistics_private.portal_access(d.company_id,d.order_id) and exists(select 1 from public.log_document_grants g join public.log_memberships m on m.id=g.membership_id and m.user_id=auth.uid() and m.active and m.role='client' where g.document_id=d.id and g.company_id=d.company_id))))))
$$;
revoke all on function logistics_private.document_access(uuid,text) from public,anon,authenticated;

create function logistics_private.documents(p_company uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_o public.log_collection_orders;v_d public.log_documents;v_id uuid;v_member uuid;v_valid boolean;v_inserted integer;
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
 select * into v_o from public.log_collection_orders where id=(p_payload->>'order_id')::uuid and company_id=p_company;
 if not found or not logistics_private.access_company(p_company,v_o.branch_id,array['owner','administrative']) then raise exception 'Administration required' using errcode='42501';end if;
 if p_action='list' then return (select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('shared_with',(select coalesce(jsonb_agg(membership_id),'[]') from public.log_document_grants where document_id=d.id)) order by d.created_at desc),'[]') from public.log_documents d where d.order_id=v_o.id and d.state<>'revoked');end if;
 if p_action='prepare' then
   insert into public.log_documents(company_id,branch_id,order_id,filename,mime,byte_size,sha256,request_id,created_by)
   values(p_company,v_o.branch_id,v_o.id,p_payload->>'filename',p_payload->>'mime',(p_payload->>'byte_size')::integer,p_payload->>'sha256',(p_payload->>'request_id')::uuid,v_user) on conflict(company_id,request_id) do nothing;
   get diagnostics v_inserted=row_count;
   select * into v_d from public.log_documents where company_id=p_company and request_id=(p_payload->>'request_id')::uuid for update;
   if v_d.created_by<>v_user or v_d.order_id<>v_o.id or v_d.filename<>p_payload->>'filename' or v_d.mime<>p_payload->>'mime' or v_d.byte_size<>(p_payload->>'byte_size')::integer or v_d.sha256<>p_payload->>'sha256' or v_d.state='revoked' then raise exception 'Request mismatch';end if;
   if v_d.state='pending' and v_d.created_at<=now()-interval '15 minutes' then raise exception 'Upload expired';end if;
   if v_inserted=1 then insert into public.log_audit(company_id,actor_id,object_type,object_id,action) values(p_company,v_user,'document',v_d.id,'prepare');end if;
   return to_jsonb(v_d)||jsonb_build_object('path',v_d.company_id::text||'/'||v_d.branch_id::text||'/'||v_d.id::text);
 end if;
 select * into v_d from public.log_documents where id=(p_payload->>'id')::uuid and order_id=v_o.id for update;
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
   if v_d.state<>'ready' or not exists(select 1 from public.log_portal_grants g join public.log_memberships m on m.id=g.membership_id and m.active and m.role='client' join public.log_customer_contacts cc on cc.membership_id=m.id and cc.customer_id=v_o.customer_id and cc.company_id=p_company where g.order_id=v_o.id and g.membership_id=v_member) then raise exception 'Client not entitled';end if;
   if p_action='share' then insert into public.log_document_grants(company_id,document_id,membership_id) values(p_company,v_d.id,v_member) on conflict do nothing;
   else delete from public.log_document_grants where document_id=v_d.id and membership_id=v_member;end if;
 elsif p_action='revoke' then update public.log_documents set state='revoked' where id=v_d.id;
 else raise exception 'Invalid action';end if;
 insert into public.log_audit(company_id,actor_id,object_type,object_id,action) values(p_company,v_user,'document',v_d.id,p_action);
 return jsonb_build_object('id',v_d.id);
end $$;

create function logistics_private.chat_pair(p_company uuid,p_branch uuid,p_sender uuid,p_recipient uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_sender<>p_recipient and
 ((logistics_private.member_at_branch(p_company,p_branch,p_sender,array['owner','administrative']) and logistics_private.member_at_branch(p_company,p_branch,p_recipient,array['driver','collector'])) or
  (logistics_private.member_at_branch(p_company,p_branch,p_recipient,array['owner','administrative']) and logistics_private.member_at_branch(p_company,p_branch,p_sender,array['driver','collector'])))
$$;
revoke all on function logistics_private.chat_pair(uuid,uuid,uuid,uuid) from public,anon,authenticated;
create function logistics_private.chat(p_company uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_me uuid;v_branch uuid;v_peer uuid;v_msg public.log_chat_messages;
begin
 if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'Verified identity required' using errcode='42501';end if;
 perform 1 from public.log_companies where id=p_company and active for share;
 if not found then raise exception 'Access denied' using errcode='42501';end if;
 select id into v_me from public.log_memberships where company_id=p_company and user_id=v_user and active and role in ('owner','administrative','driver','collector');
 if v_me is null then raise exception 'Staff required' using errcode='42501';end if;
 v_branch:=(p_payload->>'branch_id')::uuid;
 if p_action='contacts' then return (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'label',u.email,'role',m.role)),'[]') from public.log_memberships m join auth.users u on u.id=m.user_id where m.company_id=p_company and logistics_private.chat_pair(p_company,v_branch,v_me,m.id));end if;
 v_peer:=(p_payload->>'recipient_id')::uuid;
 if not logistics_private.chat_pair(p_company,v_branch,v_me,v_peer) then raise exception 'Conversation denied' using errcode='42501';end if;
 if p_action='list' then return (select coalesce(jsonb_agg(to_jsonb(m) order by m.at,m.id),'[]') from (select * from public.log_chat_messages where company_id=p_company and branch_id=v_branch and ((sender_id=v_me and recipient_id=v_peer) or (sender_id=v_peer and recipient_id=v_me)) order by at desc,id desc limit 100) m);end if;
 if p_action<>'send' then raise exception 'Invalid action';end if;
 insert into public.log_chat_messages(company_id,branch_id,sender_id,recipient_id,body,request_id) values(p_company,v_branch,v_me,v_peer,btrim(p_payload->>'body'),(p_payload->>'request_id')::uuid) on conflict(company_id,request_id) do nothing;
 select * into v_msg from public.log_chat_messages where company_id=p_company and request_id=(p_payload->>'request_id')::uuid;
 if v_msg.sender_id<>v_me or v_msg.recipient_id<>v_peer or v_msg.branch_id<>v_branch or v_msg.body<>btrim(p_payload->>'body') then raise exception 'Request mismatch';end if;
 return jsonb_build_object('id',v_msg.id,'at',v_msg.at);
end $$;

revoke all on function logistics_private.portal(uuid,text,jsonb),logistics_private.documents(uuid,text,jsonb),logistics_private.chat(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function logistics_private.portal(uuid,text,jsonb),logistics_private.documents(uuid,text,jsonb),logistics_private.chat(uuid,text,jsonb) to authenticated;
create function public.log_portal(p_company uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select logistics_private.portal(p_company,p_action,p_payload)$$;
create function public.log_documents(p_company uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select logistics_private.documents(p_company,p_action,p_payload)$$;
create function public.log_chat(p_company uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select logistics_private.chat(p_company,p_action,p_payload)$$;
revoke all on function public.log_portal(uuid,text,jsonb),public.log_documents(uuid,text,jsonb),public.log_chat(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.log_portal(uuid,text,jsonb),public.log_documents(uuid,text,jsonb),public.log_chat(uuid,text,jsonb) to authenticated;
commit;
