begin;
set local lock_timeout='5s';
create function logistics_private.freight_read(p_company uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare term text:=btrim(coalesce(p_payload->>'term','')); pg integer:=coalesce((p_payload->>'page')::integer,1);
 sz integer:=coalesce((p_payload->>'page_size')::integer,20); br uuid:=nullif(p_payload->>'branch_id','')::uuid;
 st text:=nullif(p_payload->>'status',''); c public.log_cargos; events jsonb; rows jsonb; total bigint;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and not coalesce(is_anonymous,false))
 or not logistics_private.access_company(p_company,null,array['owner','administrative']) then raise exception 'Access denied';end if;
 if length(term)>120 or pg<1 or pg>1000000 or sz<1 or sz>50 or (st is not null and st not in ('received','shipped','destination','out_for_delivery','delivered')) then raise exception 'Invalid filters';end if;
 if br is not null and not logistics_private.access_company(p_company,br,array['owner','administrative']) then raise exception 'Branch denied';end if;
 if p_action='search' then
  with authorized as (
   select x.*,u.name customer_name from public.log_cargos x join public.log_customers u on u.company_id=x.company_id and u.id=x.customer_id
   where x.company_id=p_company and logistics_private.access_company(x.company_id,x.branch_id,array['owner','administrative'])
    and (br is null or x.branch_id=br) and (st is null or x.status=st)
    and (term='' or strpos(lower(x.id::text),lower(term))>0 or strpos(lower(coalesce(x.nf_reference,'')),lower(term))>0
     or strpos(lower(coalesce(x.cte_reference,'')),lower(term))>0 or strpos(lower(u.name),lower(term))>0)
  ), paged as (select * from authorized order by received_at desc,id desc limit sz offset (pg-1)*sz)
  select (select count(*) from authorized),coalesce((select jsonb_agg(to_jsonb(p) order by received_at desc,id desc) from paged p),'[]'::jsonb) into total,rows;
  return jsonb_build_object('rows',rows,'total',total,'page',pg,'page_size',sz,'pages',greatest(1,ceil(total::numeric/sz)));
 elsif p_action='detail' then
  select * into c from public.log_cargos where company_id=p_company and id=(p_payload->>'id')::uuid;
  if c.id is null or not logistics_private.access_company(p_company,c.branch_id,array['owner','administrative']) then raise exception 'Cargo denied';end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by at,source,id),'[]'::jsonb) into events from (
   select id,'cargo'::text source,action,details,note,actor_id,at from public.log_cargo_events where company_id=p_company and cargo_id=c.id
   union all
   select id,'collection'::text source,action,details,note,actor_id,at from public.log_collection_events where company_id=p_company and order_id=c.order_id
  ) e;
  return jsonb_build_object('cargo',to_jsonb(c)||jsonb_build_object('customer_name',(select name from public.log_customers where company_id=p_company and id=c.customer_id)),'events',events);
 end if;
 raise exception 'Unknown action';
end$$;
revoke all on function logistics_private.freight_read(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function logistics_private.freight_read(uuid,text,jsonb) to authenticated;
create function public.log_freight_read(p_company uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select logistics_private.freight_read(p_company,p_action,p_payload)$$;
revoke all on function public.log_freight_read(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.log_freight_read(uuid,text,jsonb) to authenticated;
commit;
