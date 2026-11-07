begin;
create index log_audit_actor_idx on public.log_audit(actor_id);
create index log_contact_company_customer_idx on public.log_customer_contacts(company_id,customer_id);
create index log_contact_company_member_idx on public.log_customer_contacts(company_id,membership_id);
create index log_member_branch_company_branch_idx on public.log_member_branches(company_id,branch_id);
create index log_member_branch_company_member_idx on public.log_member_branches(company_id,membership_id);
commit;
