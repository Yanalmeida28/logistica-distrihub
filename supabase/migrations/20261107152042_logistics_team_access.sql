-- Local preparation; install only in the independent logistics project.
begin;
create table public.log_team_invites (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.log_companies(id),
 email text not null check(email=lower(btrim(email)) and length(email) between 3 and 254),
 role text not null check(role in ('administrative','collector','driver')),
 branch_ids uuid[] not null check(cardinality(branch_ids) between 1 and 100),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 state text not null default 'pending' check(state in ('pending','accepted','revoked'))
);
create index log_team_invites_company_idx on public.log_team_invites(company_id);
create index log_team_invites_creator_idx on public.log_team_invites(created_by);
create index log_team_invites_email_idx on public.log_team_invites(email) where state='pending';
create unique index log_team_invites_pending_idx on public.log_team_invites(company_id,email) where state='pending';
alter table public.log_team_invites enable row level security;
revoke all on public.log_team_invites from public,anon,authenticated;

create function logistics_private.team(p_company uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_email text;v_id uuid;v_role text;v_branches uuid[];v_inv public.log_team_invites;v_member public.log_memberships;v_active boolean;
begin
 select lower(btrim(email)) into v_email from auth.users where id=v_user and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if v_user is null or v_email is null then raise exception 'Verified identity required' using errcode='42501';end if;
 if p_action='incoming' then
   return (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'company_id',i.company_id,'company_name',c.name,'role',i.role,'expires_at',i.expires_at)),'[]') from public.log_team_invites i join public.log_companies c on c.id=i.company_id and c.active where i.email=v_email and i.state='pending' and i.expires_at>now());
 end if;
 -- Serialize membership/invitation changes by company and recheck authority after locking.
 perform 1 from public.log_companies where id=p_company and active for update;
 if not found then raise exception 'Access denied' using errcode='42501';end if;
 if p_action='accept' then
   select * into v_inv from public.log_team_invites where id=(p_payload->>'id')::uuid and company_id=p_company for update;
   if not found or v_inv.email<>v_email or v_inv.state<>'pending' or v_inv.expires_at<=now() then raise exception 'Invite unavailable' using errcode='42501';end if;
   if not logistics_private.access_for_owner(v_inv.company_id,v_inv.created_by) then raise exception 'Inviter no longer authorized' using errcode='42501';end if;
   v_branches:=v_inv.branch_ids;
   if exists(select 1 from unnest(v_branches) b where not exists(select 1 from public.log_branches where id=b and company_id=p_company and active)) then raise exception 'Invalid branch';end if;
   insert into public.log_memberships(company_id,user_id,role) values(p_company,v_user,v_inv.role) returning id into v_id;
   insert into public.log_member_branches(company_id,membership_id,branch_id) select p_company,v_id,b from unnest(v_branches) b;
   update public.log_team_invites set state='accepted' where id=v_inv.id;
 else
   if not logistics_private.access_company(p_company,null,array['owner']) then raise exception 'Owner required' using errcode='42501';end if;
   if p_action='list' then
     return jsonb_build_object('members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'email',u.email,'role',m.role,'active',m.active,'branch_ids',(select coalesce(jsonb_agg(mb.branch_id),'[]') from public.log_member_branches mb where mb.membership_id=m.id))),'[]') from public.log_memberships m join auth.users u on u.id=m.user_id where m.company_id=p_company),
       'invites',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from public.log_team_invites i where i.company_id=p_company and i.state='pending' and i.expires_at>now()));
   elsif p_action='invite' then
     v_role:=p_payload->>'role';
     select array_agg(distinct x::uuid) into v_branches from jsonb_array_elements_text(p_payload->'branch_ids') x;
     v_email:=lower(btrim(p_payload->>'email'));
     if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(v_email)>254 then raise exception 'Invalid email';end if;
     if v_role is null or v_role not in ('administrative','collector','driver') or coalesce(cardinality(v_branches),0) not between 1 and 100 then raise exception 'Invalid access';end if;
     if exists(select 1 from unnest(v_branches) b where not exists(select 1 from public.log_branches where id=b and company_id=p_company and active)) then raise exception 'Invalid branch';end if;
     if exists(select 1 from public.log_memberships m join auth.users u on u.id=m.user_id where m.company_id=p_company and lower(btrim(u.email))=v_email) then raise exception 'Member already exists';end if;
     update public.log_team_invites set state='revoked' where company_id=p_company and email=v_email and state='pending' and expires_at<=now();
     insert into public.log_team_invites(company_id,email,role,branch_ids,created_by) values(p_company,v_email,v_role,v_branches,v_user) returning id into v_id;
   elsif p_action='revoke' then
     update public.log_team_invites set state='revoked' where id=(p_payload->>'id')::uuid and company_id=p_company and state='pending' returning id into v_id;
     if not found then raise exception 'Invite unavailable';end if;
   elsif p_action='update' then
     select * into v_member from public.log_memberships where id=(p_payload->>'id')::uuid and company_id=p_company for update;
     if not found or v_member.role not in ('administrative','collector','driver') or v_member.user_id=v_user then raise exception 'Protected membership' using errcode='42501';end if;
     v_role:=p_payload->>'role';v_active:=(p_payload->>'active')::boolean;
     select array_agg(distinct x::uuid) into v_branches from jsonb_array_elements_text(p_payload->'branch_ids') x;
     if v_role is null or v_role not in ('administrative','collector','driver') or v_active is null or coalesce(cardinality(v_branches),0)>100 or (v_active and coalesce(cardinality(v_branches),0)=0) then raise exception 'Invalid access';end if;
     if exists(select 1 from unnest(v_branches) b where not exists(select 1 from public.log_branches where id=b and company_id=p_company and (not v_active or active))) then raise exception 'Invalid branch';end if;
     update public.log_memberships set role=v_role,active=v_active where id=v_member.id;
     delete from public.log_member_branches where membership_id=v_member.id;
     insert into public.log_member_branches(company_id,membership_id,branch_id) select p_company,v_member.id,b from unnest(v_branches) b;
     v_id:=v_member.id;
   else raise exception 'Unknown operation';end if;
 end if;
 insert into public.log_audit(company_id,actor_id,object_type,object_id,action) values(p_company,v_user,'team',coalesce(v_id,v_inv.id),p_action);
 return jsonb_build_object('id',coalesce(v_id,v_inv.id));
end $$;
-- Internal check for a persisted inviter; never callable by clients.
create function logistics_private.access_for_owner(p_company uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.log_memberships m join public.log_companies c on c.id=m.company_id where m.company_id=p_company and m.user_id=p_user and m.role='owner' and m.active and c.active)
$$;
revoke all on function logistics_private.access_for_owner(uuid,uuid) from public,anon,authenticated;
revoke all on function logistics_private.team(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function logistics_private.team(uuid,text,jsonb) to authenticated;
create function public.log_team(p_company uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select logistics_private.team(p_company,p_action,p_payload)$$;
revoke all on function public.log_team(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.log_team(uuid,text,jsonb) to authenticated;
commit;
