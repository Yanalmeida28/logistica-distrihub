begin;
set local lock_timeout='5s';
create table public.log_commercial_records(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.log_companies(id),
 branch_id uuid not null,kind text not null check(kind in ('quotes','income','expense')),
 customer_id uuid,description text not null check(length(description) between 3 and 400),
 party text not null check(length(party) between 2 and 120),category text not null,
 amount_cents bigint not null default 0 check(amount_cents between 0 and 99999999999),
 paid_cents bigint not null default 0 check(paid_cents>=0 and paid_cents<=amount_cents),
 status text not null,details jsonb not null default '{}',version integer not null default 1,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(company_id,branch_id) references public.log_branches(company_id,id),
 foreign key(company_id,customer_id) references public.log_customers(company_id,id),
 check((kind='quotes' and status in ('requested','proposed','accepted','declined')) or (kind<>'quotes' and status in ('open','settled','cancelled')))
);
create index log_commercial_scope on public.log_commercial_records(company_id,branch_id,kind,created_at,id);
create index log_commercial_customer on public.log_commercial_records(company_id,customer_id);
create index log_commercial_creator on public.log_commercial_records(created_by);
create table public.log_commercial_events(
 id bigint generated always as identity primary key,record_id uuid not null references public.log_commercial_records(id),
 actor_id uuid not null references auth.users(id),action text not null,details jsonb not null,at timestamptz not null default clock_timestamp()
);
create index log_commercial_event_record on public.log_commercial_events(record_id,id);
create index log_commercial_event_actor on public.log_commercial_events(actor_id);
create table public.log_commercial_commands(
 company_id uuid not null references public.log_companies(id),request_id uuid not null,actor_id uuid not null references auth.users(id),
 kind text not null,action text not null,payload jsonb not null,result jsonb not null,primary key(company_id,request_id)
);
create index log_commercial_command_actor on public.log_commercial_commands(actor_id);
alter table public.log_commercial_records enable row level security;
alter table public.log_commercial_events enable row level security;
alter table public.log_commercial_commands enable row level security;
revoke all on public.log_commercial_records,public.log_commercial_events,public.log_commercial_commands from public,anon,authenticated;
create function logistics_private.commercial(p_company uuid,p_kind text,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.log_commercial_records; cmd public.log_commercial_commands; br uuid:=nullif(p_payload->>'branch_id','')::uuid;
 rid uuid:=nullif(p_payload->>'request_id','')::uuid; customer uuid; result jsonb; info jsonb; amount bigint;
 pg integer:=coalesce((p_payload->>'page')::integer,1); today date:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and not coalesce(is_anonymous,false))
 or not logistics_private.access_company(p_company,null,array['owner','administrative']) then raise exception 'Access denied';end if;
 if p_kind is null or p_kind not in ('quotes','income','expense','finance') then raise exception 'Invalid module';end if;
 if br is not null and not logistics_private.access_company(p_company,br,array['owner','administrative']) then raise exception 'Branch denied';end if;
 if p_action='list' then
  if pg<1 or pg>1000000 then raise exception 'Invalid page';end if;
  with scoped as (select x.* from public.log_commercial_records x where x.company_id=p_company
   and (x.kind=p_kind or (p_kind='finance' and x.kind in ('income','expense')))
   and (br is null or x.branch_id=br) and logistics_private.access_company(p_company,x.branch_id,array['owner','administrative'])),
  paged as (select * from scoped order by created_at desc,id limit 20 offset (pg-1)*20)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by created_at desc,id) from paged p),'[]'::jsonb),
   'total',(select count(*) from scoped),'page',pg,'pages',greatest(1,ceil((select count(*) from scoped)::numeric/20)),
   'summary',jsonb_build_object('receivable',coalesce((select sum(amount_cents-paid_cents) from scoped where kind='income' and status<>'cancelled'),0),
    'payable',coalesce((select sum(amount_cents-paid_cents) from scoped where kind='expense' and status<>'cancelled'),0),
    'received',coalesce((select sum(paid_cents) from scoped where kind='income' and status<>'cancelled'),0),
    'spent',coalesce((select sum(paid_cents) from scoped where kind='expense' and status<>'cancelled'),0))) into result;
  return result;
 end if;
 if p_action='history' then
  select * into r from public.log_commercial_records where id=(p_payload->>'id')::uuid and company_id=p_company and kind=p_kind;
  if r.id is null or not logistics_private.access_company(p_company,r.branch_id,array['owner','administrative']) then raise exception 'Record denied';end if;
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.log_commercial_events e where record_id=r.id),'[]'::jsonb);
 end if;
 if rid is null or p_kind='finance' or p_action is null or p_action not in ('create','propose','decision','pay','cancel') then raise exception 'Invalid command';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text||':commercial:'||rid::text,0));
 select * into cmd from public.log_commercial_commands where company_id=p_company and request_id=rid;
 if found then
  if cmd.actor_id<>auth.uid() or cmd.kind<>p_kind or cmd.action<>p_action or cmd.payload<>p_payload then raise exception 'Request conflict';end if;
  select * into r from public.log_commercial_records where id=(cmd.result->>'id')::uuid and company_id=p_company;
  if not logistics_private.access_company(p_company,r.branch_id,array['owner','administrative']) then raise exception 'Branch denied';end if;
  return cmd.result;
 end if;
 if p_action='create' then
  if br is null or not exists(select 1 from public.log_branches where id=br and company_id=p_company and active) then raise exception 'Invalid branch';end if;
  if coalesce(length(btrim(p_payload->>'description')),0) not between 3 and 400 or coalesce(length(btrim(p_payload->>'party')),0) not between 2 and 120 then raise exception 'Invalid description';end if;
  customer:=nullif(p_payload->>'customer_id','')::uuid;
  if customer is not null and not exists(select 1 from public.log_customers where id=customer and company_id=p_company and active and (branch_id is null or branch_id=br)) then raise exception 'Invalid customer';end if;
  info:=coalesce(p_payload->'details','{}'::jsonb);
  if jsonb_typeof(info)<>'object' or octet_length(info::text)>8000 then raise exception 'Invalid details';end if;
  if p_kind='quotes' then
   if customer is null or coalesce(length(btrim(info->>'origin')),0) not between 3 and 300 or coalesce(length(btrim(info->>'destination')),0) not between 3 and 300
   or coalesce(info->>'volumes','')!~'^[0-9]+$' or (info->>'volumes')::int not between 1 and 100000
   or coalesce(info->>'weight_kg','')!~'^[0-9]+(\.[0-9]{1,3})?$' or (info->>'weight_kg')::numeric<=0 or (info->>'weight_kg')::numeric>1000000 then raise exception 'Invalid quote';end if;
   info:=jsonb_build_object('origin',btrim(info->>'origin'),'destination',btrim(info->>'destination'),'volumes',(info->>'volumes')::int,'weight_kg',(info->>'weight_kg')::numeric);
   amount:=0;
  else
   if coalesce(p_payload->>'amount_cents','')!~'^[0-9]+$' then raise exception 'Invalid cents';end if;
   amount:=(p_payload->>'amount_cents')::bigint;
   if amount is null or amount<=0 or coalesce(p_payload->>'category','') not in ('freight','food','fuel','toll','maintenance','staff','office','other')
   or coalesce(info->>'issued_date','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(info->>'due_date','')!~'^\d{4}-\d{2}-\d{2}$'
   or (info->>'issued_date')::date>today or (info->>'due_date')::date<(info->>'issued_date')::date then raise exception 'Invalid account';end if;
   info:=jsonb_build_object('issued_date',(info->>'issued_date')::date,'due_date',(info->>'due_date')::date,'reference',left(coalesce(info->>'reference',''),300));
  end if;
  insert into public.log_commercial_records(company_id,branch_id,kind,customer_id,description,party,category,amount_cents,status,details,created_by)
  values(p_company,br,p_kind,customer,btrim(p_payload->>'description'),btrim(p_payload->>'party'),case when p_kind='quotes' then 'quote' else p_payload->>'category' end,amount,case when p_kind='quotes' then 'requested' else 'open' end,info,auth.uid()) returning * into r;
 else
  select * into r from public.log_commercial_records where id=(p_payload->>'id')::uuid and company_id=p_company and kind=p_kind for update;
  if r.id is null or not logistics_private.access_company(p_company,r.branch_id,array['owner','administrative']) then raise exception 'Record denied';end if;
  if (p_payload->>'expected_version')::int is distinct from r.version then raise exception 'Version conflict';end if;
  if p_action='propose' and p_kind='quotes' and r.status='requested' then
   if coalesce(p_payload->>'amount_cents','')!~'^[0-9]+$' then raise exception 'Invalid cents';end if;
   amount:=(p_payload->>'amount_cents')::bigint;
   if amount is null or amount<=0 or coalesce(p_payload->>'estimated_days','')!~'^[0-9]+$' or (p_payload->>'estimated_days')::int not between 1 and 365
    or nullif(p_payload->>'valid_until','')::timestamptz is null or (p_payload->>'valid_until')::timestamptz<=clock_timestamp()
    or coalesce(length(btrim(p_payload->>'note')),0) not between 3 and 500 then raise exception 'Invalid proposal';end if;
   update public.log_commercial_records set amount_cents=amount,status='proposed',version=version+1,details=details||jsonb_build_object('estimated_days',(p_payload->>'estimated_days')::int,'valid_until',(p_payload->>'valid_until')::timestamptz,'terms',btrim(p_payload->>'note')) where id=r.id returning * into r;
  elsif p_action='decision' and p_kind='quotes' and r.status='proposed' then
   if coalesce(p_payload->>'decision','') not in ('accepted','declined') or (r.details->>'valid_until')::timestamptz<=clock_timestamp() or coalesce(length(btrim(p_payload->>'note')),0) not between 3 and 500 then raise exception 'Invalid response';end if;
   update public.log_commercial_records set status=p_payload->>'decision',version=version+1 where id=r.id returning * into r;
  elsif p_action='pay' and p_kind in ('income','expense') and r.status='open' then
   if coalesce(p_payload->>'amount_cents','')!~'^[0-9]+$' then raise exception 'Invalid cents';end if;
   amount:=(p_payload->>'amount_cents')::bigint;
   if amount is null or amount<=0 or amount>r.amount_cents-r.paid_cents or coalesce(p_payload->>'method','') not in ('pix','cash','transfer','card','other')
    or nullif(p_payload->>'date','')::date is null or (p_payload->>'date')::date>today or (p_payload->>'date')::date<(r.details->>'issued_date')::date then raise exception 'Invalid settlement';end if;
   update public.log_commercial_records set paid_cents=paid_cents+amount,status=case when paid_cents+amount=amount_cents then 'settled' else 'open' end,version=version+1 where id=r.id returning * into r;
  elsif p_action='cancel' and p_kind in ('income','expense') and r.status='open' and r.paid_cents=0 then
   if coalesce(length(btrim(p_payload->>'note')),0) not between 3 and 500 then raise exception 'Reason required';end if;
   update public.log_commercial_records set status='cancelled',version=version+1 where id=r.id returning * into r;
  else raise exception 'Invalid transition';end if;
 end if;
 insert into public.log_commercial_events(record_id,actor_id,action,details) values(r.id,auth.uid(),p_action,p_payload-'request_id');
 result:=to_jsonb(r);
 insert into public.log_commercial_commands values(p_company,rid,auth.uid(),p_kind,p_action,p_payload,result);
 return result;
end $$;
revoke all on function logistics_private.commercial(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function logistics_private.commercial(uuid,text,text,jsonb) to authenticated;
create function public.log_commercial(p_company uuid,p_kind text,p_action text,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select logistics_private.commercial(p_company,p_kind,p_action,p_payload)$$;
revoke all on function public.log_commercial(uuid,text,text,jsonb) from public,anon;
grant execute on function public.log_commercial(uuid,text,text,jsonb) to authenticated;
commit;
