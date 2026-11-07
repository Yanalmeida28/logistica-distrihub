-- Requires REAL Supabase Storage. Do not emulate this managed schema to install.
begin;
do $$begin
 if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then raise exception 'Real Supabase Storage required';end if;
 if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then raise exception 'Storage RLS must already be enabled';end if;
 if to_regclass('public.partner_sales') is not null then raise exception 'ERP database refused';end if;
 if exists(select 1 from storage.buckets where id='logistics-private-documents' and (public is distinct from false or file_size_limit is distinct from 5242880 or allowed_mime_types is distinct from array['application/pdf','image/png','image/jpeg']::text[])) then raise exception 'Unknown bucket configuration';end if;
end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('logistics-private-documents','logistics-private-documents',false,5242880,array['application/pdf','image/png','image/jpeg']) on conflict(id) do nothing;
create function logistics_private.storage_document_access(p_name text,p_mode text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_mode in ('read','upload') and exists(select 1 from public.log_documents d where p_name=d.company_id::text||'/'||d.branch_id::text||'/'||d.id::text and logistics_private.document_access(d.id,p_mode))
$$;
revoke all on function logistics_private.storage_document_access(text,text) from public,anon,authenticated;
grant execute on function logistics_private.storage_document_access(text,text) to authenticated;
create function logistics_private.document_object_valid(p_document uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.log_documents d join storage.objects o on o.bucket_id='logistics-private-documents' and o.name=d.company_id::text||'/'||d.branch_id::text||'/'||d.id::text
 where d.id=p_document and o.metadata->>'mimetype'=d.mime and (o.metadata->>'size')::bigint=d.byte_size)
$$;
revoke all on function logistics_private.document_object_valid(uuid) from public,anon,authenticated;
create policy logistics_document_select on storage.objects for select to authenticated using(bucket_id='logistics-private-documents' and logistics_private.storage_document_access(name,'read'));
create policy logistics_document_insert on storage.objects for insert to authenticated with check(bucket_id='logistics-private-documents' and logistics_private.storage_document_access(name,'upload'));
-- Restrictive policies prevent unrelated broad policies from opening this bucket.
create policy logistics_document_select_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'logistics-private-documents' or logistics_private.storage_document_access(name,'read'));
create policy logistics_document_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'logistics-private-documents' or logistics_private.storage_document_access(name,'upload'));
create policy logistics_document_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'logistics-private-documents') with check(bucket_id<>'logistics-private-documents');
create policy logistics_document_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'logistics-private-documents');
create policy logistics_document_no_anon on storage.objects as restrictive for all to anon using(bucket_id<>'logistics-private-documents') with check(bucket_id<>'logistics-private-documents');
commit;
