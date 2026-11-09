-- Manager is a distinct role with administrative operations only in authorized branches.
-- Owner-only checks stay owner-only. No existing member is promoted or changed.
begin;
set local lock_timeout='5s';
do $$begin if to_regclass('public.partner_sales') is not null then raise exception 'ERP database refused';end if;end$$;
alter table public.log_memberships drop constraint log_memberships_role_check;
alter table public.log_memberships add constraint log_memberships_role_check check(role in ('owner','administrative','manager','collector','driver','client'));
alter table public.log_team_invites drop constraint log_team_invites_role_check;
alter table public.log_team_invites add constraint log_team_invites_role_check check(role in ('administrative','manager','collector','driver'));
-- Existing RPCs and policies use these guarded private helpers; manager never bypasses branch checks.
create or replace function logistics_private.access_company(p_company uuid,p_branch uuid,p_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.log_memberships m
    join public.log_companies c on c.id=m.company_id and c.active
    where m.user_id=auth.uid() and m.active and m.company_id=p_company and (m.role=any(p_roles) or (m.role='manager' and 'administrative'=any(p_roles)))
      and (m.role='owner' or exists(
        select 1 from public.log_member_branches mb
        join public.log_branches b on b.id=mb.branch_id and b.company_id=mb.company_id and b.active
        where mb.membership_id=m.id and mb.company_id=p_company and (p_branch is null or mb.branch_id=p_branch)
      ))
  )
$$;

create or replace function logistics_private.member_at_branch(p_company uuid,p_branch uuid,p_member uuid,p_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.log_memberships m join public.log_companies c on c.id=m.company_id and c.active
 join public.log_branches b on b.company_id=m.company_id and b.id=p_branch and b.active
 where m.company_id=p_company and m.id=p_member and m.active and (m.role=any(p_roles) or (m.role='manager' and 'administrative'=any(p_roles)))
 and (m.role='owner' or exists(select 1 from public.log_member_branches mb where mb.membership_id=m.id and mb.company_id=p_company and mb.branch_id=p_branch)))
$$;

create or replace function logistics_private.team(p_company uuid,p_action text,p_payload jsonb)
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
     if v_role is null or v_role not in ('administrative','manager','collector','driver') or coalesce(cardinality(v_branches),0) not between 1 and 100 then raise exception 'Invalid access';end if;
     if exists(select 1 from unnest(v_branches) b where not exists(select 1 from public.log_branches where id=b and company_id=p_company and active)) then raise exception 'Invalid branch';end if;
     if exists(select 1 from public.log_memberships m join auth.users u on u.id=m.user_id where m.company_id=p_company and lower(btrim(u.email))=v_email) then raise exception 'Member already exists';end if;
     update public.log_team_invites set state='revoked' where company_id=p_company and email=v_email and state='pending' and expires_at<=now();
     insert into public.log_team_invites(company_id,email,role,branch_ids,created_by) values(p_company,v_email,v_role,v_branches,v_user) returning id into v_id;
   elsif p_action='revoke' then
     update public.log_team_invites set state='revoked' where id=(p_payload->>'id')::uuid and company_id=p_company and state='pending' returning id into v_id;
     if not found then raise exception 'Invite unavailable';end if;
   elsif p_action='update' then
     select * into v_member from public.log_memberships where id=(p_payload->>'id')::uuid and company_id=p_company for update;
     if not found or v_member.role not in ('administrative','manager','collector','driver') or v_member.user_id=v_user then raise exception 'Protected membership' using errcode='42501';end if;
     v_role:=p_payload->>'role';v_active:=(p_payload->>'active')::boolean;
     select array_agg(distinct x::uuid) into v_branches from jsonb_array_elements_text(p_payload->'branch_ids') x;
     if v_role is null or v_role not in ('administrative','manager','collector','driver') or v_active is null or coalesce(cardinality(v_branches),0)>100 or (v_active and coalesce(cardinality(v_branches),0)=0) then raise exception 'Invalid access';end if;
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

create or replace function logistics_private.chat(p_company uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_me uuid;v_branch uuid;v_peer uuid;v_msg public.log_chat_messages;
begin
 if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'Verified identity required' using errcode='42501';end if;
 perform 1 from public.log_companies where id=p_company and active for share;
 if not found then raise exception 'Access denied' using errcode='42501';end if;
 select id into v_me from public.log_memberships where company_id=p_company and user_id=v_user and active and role in ('owner','administrative','manager','driver','collector');
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
-- CREATE OR REPLACE preserves owners and ACLs. Explicitly retain only the existing execution contract.
revoke all on function logistics_private.access_company(uuid,uuid,text[]),logistics_private.member_at_branch(uuid,uuid,uuid,text[]),logistics_private.team(uuid,text,jsonb),logistics_private.chat(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function logistics_private.access_company(uuid,uuid,text[]),logistics_private.team(uuid,text,jsonb),logistics_private.chat(uuid,text,jsonb) to authenticated;
-- member_at_branch remains internal, invoked exclusively by definer functions.
commit;
