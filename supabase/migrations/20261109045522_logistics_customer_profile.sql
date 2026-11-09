begin;
-- Additive only: existing customers remain valid. No change to RLS, identities or branches.
alter table public.log_customers
  add column person_type text check(person_type in ('PF','PJ')),
  add column document text check(length(document)<=20),
  add column trade_name text check(length(trade_name)<=120),
  add column contact_name text check(length(contact_name)<=120),
  add column email text check(length(email)<=254),
  add column phone text check(length(phone)<=30),
  add column postal_code text check(length(postal_code)<=10),
  add column street text check(length(street)<=160),
  add column address_number text check(length(address_number)<=20),
  add column complement text check(length(complement)<=120),
  add column district text check(length(district)<=100),
  add column city text check(length(city)<=100),
  add column state text check(state ~ '^[A-Z]{2}$'),
  add column notes text check(length(notes)<=1000);
grant insert(person_type,document,trade_name,contact_name,email,phone,postal_code,street,address_number,complement,district,city,state,notes),
  update(person_type,document,trade_name,contact_name,email,phone,postal_code,street,address_number,complement,district,city,state,notes)
  on public.log_customers to authenticated;
-- Existing customer_read/insert/update policies and audit trigger apply to every new column.
-- No permission to change company_id, branch_id, id or created_at is added.
commit;
