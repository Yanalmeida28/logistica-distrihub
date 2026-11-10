begin;
set local lock_timeout='5s';
create table public.log_cargo_issues(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,branch_id uuid not null,cargo_id uuid not null,
 kind text not null check(kind in ('damage','volume')),reason text not null check(length(btrim(reason)) between 3 and 500),
 responsible_id uuid references auth.users(id),status text not null default 'open' check(status in ('open','resolved')),
 expected_volumes integer not null,observed_volumes integer check(observed_volumes between 0 and 100000),
 version integer not null default 1,created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(company_id,branch_id,cargo_id) references public.log_cargos(company_id,branch_id,id),
 check((kind='volume' and observed_volumes is not null and observed_volumes<>expected_volumes) or (kind='damage' and observed_volumes is null))
);
create index log_cargo_issues_scope on public.log_cargo_issues(company_id,branch_id,cargo_id,created_at,id);
create table public.log_cargo_issue_events(
 id bigint generated always as identity primary key,issue_id uuid not null references public.log_cargo_issues(id),
 action text not null check(action in ('opened','resolved')),note text not null,actor_id uuid not null references auth.users(id),at timestamptz not null default clock_timestamp()
);
create index log_issue_events_parent on public.log_cargo_issue_events(issue_id,id);
create table public.log_cargo_issue_commands(
 company_id uuid not null references public.log_companies(id),request_id uuid not null,actor_id uuid not null references auth.users(id),
 action text not null,payload jsonb not null,response jsonb,primary key(company_id,request_id)
);
alter table public.log_cargo_issues enable row level security;
alter table public.log_cargo_issue_events enable row level security;
alter table public.log_cargo_issue_commands enable row level security;
revoke all on public.log_cargo_issues,public.log_cargo_issue_events,public.log_cargo_issue_commands from public,anon,authenticated;
create function logistics_private.cargo_issues(p_company uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.log_cargos; issue public.log_cargo_issues; cmd public.log_cargo_issue_commands;
 rid uuid; ident uuid; note text:=btrim(p_payload->>'note'); result jsonb; br uuid:=nullif(p_payload->>'branch_id','')::uuid;
 pg integer:=coalesce((p_payload->>'page')::integer,1); wanted text:=coalesce(p_payload->>'status','open');
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and not coalesce(is_anonymous,false))
 or not logistics_private.access_company(p_company,null,array['owner','administrative']) then raise exception 'Access denied';end if;
 perform 1 from public.log_companies where id=p_company and active for share;
 if not found then raise exception 'Company denied';end if;
 if br is not null and not logistics_private.access_company(p_company,br,array['owner','administrative']) then raise exception 'Branch denied';end if;
 if p_action='queue' then
  if pg<1 or pg>1000000 or wanted not in ('open','resolved','all') then raise exception 'Invalid filters';end if;
  with queue as (
   select i.id::text id,i.cargo_id,i.branch_id,i.kind,i.reason,i.status,i.responsible_id,i.created_at,i.version,
    'Registrar solução na ficha'::text next_action from public.log_cargo_issues i
   where i.company_id=p_company and logistics_private.access_company(p_company,i.branch_id,array['owner','administrative'])
   union all
   select 'documentation:'||x.id::text,x.id,x.branch_id,'documentation','Completar referências de NF e/ou CT-e','open',null::uuid,x.received_at,0,'Completar referências na ficha'
   from public.log_cargos x where x.company_id=p_company and (x.nf_reference is null or x.cte_reference is null)
    and logistics_private.access_company(p_company,x.branch_id,array['owner','administrative'])
  ), filtered as (select * from queue where (br is null or branch_id=br) and (wanted='all' or status=wanted)),
  paged as (select * from filtered order by created_at,id limit 20 offset (pg-1)*20)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by created_at,id) from paged p),'[]'::jsonb),
   'total',(select count(*) from filtered),'page',pg,'pages',greatest(1,ceil((select count(*) from filtered)::numeric/20))) into result;
  return result;
 end if;
 if p_action='resolve' then
  select * into issue from public.log_cargo_issues where id=(p_payload->>'id')::uuid and company_id=p_company;
  if issue.id is null then raise exception 'Issue denied';end if;
  ident:=issue.cargo_id;
 else ident:=(p_payload->>'cargo_id')::uuid;
 end if;
 select * into c from public.log_cargos where company_id=p_company and id=ident for update;
 if c.id is null or not logistics_private.access_company(p_company,c.branch_id,array['owner','administrative']) then raise exception 'Cargo denied';end if;
 if p_action='detail' then
  return jsonb_build_object('issues',coalesce((select jsonb_agg(to_jsonb(i) order by created_at,id) from public.log_cargo_issues i where i.company_id=p_company and i.cargo_id=c.id),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('source','issue') order by e.at,e.id) from public.log_cargo_issue_events e join public.log_cargo_issues i on i.id=e.issue_id where i.company_id=p_company and i.cargo_id=c.id),'[]'::jsonb));
 end if;
 if p_action not in ('create','resolve') or note is null or length(note) not between 3 and 500 then raise exception 'Invalid command';end if;
 rid:=(p_payload->>'request_id')::uuid;if rid is null then raise exception 'Request required';end if;
 insert into public.log_cargo_issue_commands(company_id,request_id,actor_id,action,payload) values(p_company,rid,auth.uid(),p_action,p_payload) on conflict do nothing;
 select * into strict cmd from public.log_cargo_issue_commands where company_id=p_company and request_id=rid for update;
 if cmd.actor_id<>auth.uid() or cmd.action<>p_action or cmd.payload<>p_payload then raise exception 'Request reused';end if;
 if cmd.response is not null then return cmd.response;end if;
 if p_action='create' then
  if p_payload->>'responsibility' not in ('self','central') or p_payload->>'responsibility' is null then raise exception 'Responsibility required';end if;
  insert into public.log_cargo_issues(company_id,branch_id,cargo_id,kind,reason,responsible_id,expected_volumes,observed_volumes,created_by)
  values(p_company,c.branch_id,c.id,p_payload->>'kind',note,case when p_payload->>'responsibility'='self' then auth.uid() end,c.volumes,(p_payload->>'observed_volumes')::integer,auth.uid()) returning * into issue;
 else
  select * into strict issue from public.log_cargo_issues where id=issue.id for update;
  if issue.status<>'open' or issue.version<>(p_payload->>'expected_version')::integer or p_payload->>'expected_version' is null then raise exception 'Issue changed';end if;
  update public.log_cargo_issues set status='resolved',version=version+1 where id=issue.id returning * into issue;
 end if;
 insert into public.log_cargo_issue_events(issue_id,action,note,actor_id) values(issue.id,case when p_action='create' then 'opened' else 'resolved' end,note,auth.uid());
 result:=to_jsonb(issue);update public.log_cargo_issue_commands set response=result where company_id=p_company and request_id=rid;return result;
end$$;
revoke all on function logistics_private.cargo_issues(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function logistics_private.cargo_issues(uuid,text,jsonb) to authenticated;
create function public.log_cargo_issues(p_company uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select logistics_private.cargo_issues(p_company,p_action,p_payload)$$;
revoke all on function public.log_cargo_issues(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.log_cargo_issues(uuid,text,jsonb) to authenticated;
commit;
