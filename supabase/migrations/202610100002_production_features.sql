-- Eazi's Ride production features: driver applications/admin review, device push tokens,
-- background-location metadata, and Paystack payments. Apply AFTER 202610100001.
-- Back up your project before applying to an existing database.

create extension if not exists pgcrypto;

-- Driver onboarding and review trail.
alter table public.driver_profiles
  add column if not exists application_status text not null default 'not_applied'
    check (application_status in ('not_applied','pending','approved','rejected','suspended')),
  add column if not exists suspended_at timestamptz,
  add column if not exists location_tracking_started_at timestamptz;
update public.driver_profiles set application_status='approved' where is_approved=true and application_status='not_applied';

create table if not exists public.driver_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  full_name text not null,
  phone text not null,
  license_number text not null,
  vehicle_make text not null,
  vehicle_model text not null,
  vehicle_color text not null,
  license_plate text not null,
  license_document_path text,
  vehicle_document_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  review_reason text,
  updated_at timestamptz not null default now()
);
create index if not exists driver_applications_status_submitted_idx
  on public.driver_applications(status, submitted_at desc);
alter table public.driver_applications enable row level security;
drop policy if exists driver_applications_read_own_or_admin on public.driver_applications;
create policy driver_applications_read_own_or_admin on public.driver_applications
  for select to authenticated using (
    user_id = auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
  );
drop policy if exists driver_applications_insert_own on public.driver_applications;
create policy driver_applications_insert_own on public.driver_applications
  for insert to authenticated with check (
    user_id = auth.uid() and status='pending' and reviewed_at is null and reviewed_by is null
    and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='rider')
  );
drop policy if exists driver_applications_update_own_pending on public.driver_applications;
create policy driver_applications_update_own_pending on public.driver_applications
  for update to authenticated using (user_id=auth.uid() and status in ('pending','rejected'))
  with check (user_id=auth.uid() and status='pending' and reviewed_at is null and reviewed_by is null
    and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='rider'));
revoke all on public.driver_applications from anon;

-- Device push tokens. Tokens are owned by the authenticated user; delivery is server-side only.
create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios','android')),
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists device_push_tokens_user_idx on public.device_push_tokens(user_id);
alter table public.device_push_tokens enable row level security;
drop policy if exists push_tokens_select_own on public.device_push_tokens;
create policy push_tokens_select_own on public.device_push_tokens for select to authenticated using (user_id=auth.uid());
drop policy if exists push_tokens_insert_own on public.device_push_tokens;
create policy push_tokens_insert_own on public.device_push_tokens for insert to authenticated with check (user_id=auth.uid());
drop policy if exists push_tokens_update_own on public.device_push_tokens;
create policy push_tokens_update_own on public.device_push_tokens for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists push_tokens_delete_own on public.device_push_tokens;
create policy push_tokens_delete_own on public.device_push_tokens for delete to authenticated using (user_id=auth.uid());
revoke all on public.device_push_tokens from anon;

-- Payments: only trusted Edge Functions may create/change financial state.
alter table public.payments add column if not exists provider text;
alter table public.payments add column if not exists provider_reference text;
alter table public.payments add column if not exists provider_transaction_id text;
alter table public.payments add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.payments add column if not exists updated_at timestamptz not null default now();
alter table public.payments add column if not exists paid_at timestamptz;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending','successful','failed','refunded','review_required'));
create unique index if not exists payments_provider_reference_unique
  on public.payments(provider, provider_reference) where provider_reference is not null;
create index if not exists payments_ride_status_idx on public.payments(ride_id, status);
-- A ride may have only one pending electronic payment at a time. Older duplicate pending
-- rows are marked failed so a legacy test run cannot block the migration.
with ranked_pending as (
  select id, row_number() over (partition by ride_id order by created_at desc, id desc) as rn
  from public.payments where status='pending' and ride_id is not null
)
update public.payments p set status='failed', updated_at=now(), metadata=coalesce(p.metadata,'{}'::jsonb) || '{"superseded_by_migration":true}'::jsonb
from ranked_pending r where p.id=r.id and r.rn>1;
create unique index if not exists payments_one_pending_per_ride
  on public.payments(ride_id) where status='pending' and ride_id is not null;
drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments for select to authenticated using (
  user_id=auth.uid() or exists (select 1 from public.rides r where r.id=payments.ride_id and r.driver_id=auth.uid())
);
revoke insert, update, delete on public.payments from authenticated, anon;

-- Private document bucket. A document path must begin with the authenticated user's UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driver-documents','driver-documents',false,10485760,array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=10485760,
  allowed_mime_types=array['image/jpeg','image/png','application/pdf'];
drop policy if exists driver_documents_upload_own on storage.objects;
create policy driver_documents_upload_own on storage.objects for insert to authenticated
  with check (bucket_id='driver-documents' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists driver_documents_read_own_or_admin on storage.objects;
create policy driver_documents_read_own_or_admin on storage.objects for select to authenticated using (
  bucket_id='driver-documents' and (
    (storage.foldername(name))[1]=auth.uid()::text or
    exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
  )
);
drop policy if exists driver_documents_update_own on storage.objects;
create policy driver_documents_update_own on storage.objects for update to authenticated
  using (bucket_id='driver-documents' and (storage.foldername(name))[1]=auth.uid()::text)
  with check (bucket_id='driver-documents' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists driver_documents_delete_own on storage.objects;
create policy driver_documents_delete_own on storage.objects for delete to authenticated
  using (bucket_id='driver-documents' and (storage.foldername(name))[1]=auth.uid()::text);

-- Include 'card' as a valid payment method. Fare is still computed by the database.
create or replace function public.request_ride(
  p_pickup_address text,
  p_destination_address text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_destination_lat double precision,
  p_destination_lng double precision,
  p_ride_type text default 'economy',
  p_scheduled_at timestamptz default null,
  p_payment_method text default 'cash'
) returns public.rides language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare result public.rides; distance_km double precision; duration_min integer; multiplier numeric; fare_value numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Sign in before requesting a ride.' using errcode='42501'; end if;
  if not exists (select 1 from public.profiles where id=auth.uid() and role='rider') then
    raise exception 'Only rider accounts can request rides.' using errcode='42501'; end if;
  if length(trim(coalesce(p_pickup_address,'')))=0 or length(trim(coalesce(p_destination_address,'')))=0 then
    raise exception 'Pickup and destination addresses are required.' using errcode='22023'; end if;
  if p_pickup_lat is null or p_pickup_lng is null or p_destination_lat is null or p_destination_lng is null
    or p_pickup_lat not between -90 and 90 or p_destination_lat not between -90 and 90
    or p_pickup_lng not between -180 and 180 or p_destination_lng not between -180 and 180 then
    raise exception 'Choose valid pickup and destination coordinates.' using errcode='22023'; end if;
  if p_ride_type not in ('economy','comfort','xl') then raise exception 'Invalid ride type.' using errcode='22023'; end if;
  if p_payment_method not in ('cash','mobile_money','card') then raise exception 'Invalid payment method.' using errcode='22023'; end if;
  if p_scheduled_at is not null and p_scheduled_at < now() + interval '5 minutes' then
    raise exception 'Scheduled rides must be at least five minutes in the future.' using errcode='22023'; end if;
  distance_km := 6371 * 2 * asin(sqrt(least(1.0, greatest(0.0,
    power(sin(radians(p_destination_lat-p_pickup_lat)/2),2) +
    cos(radians(p_pickup_lat))*cos(radians(p_destination_lat))*power(sin(radians(p_destination_lng-p_pickup_lng)/2),2)
  ))));
  distance_km := greatest(0.1, distance_km);
  duration_min := greatest(3, ceil((distance_km / 30.0) * 60)::integer);
  multiplier := case p_ride_type when 'comfort' then 1.35 when 'xl' then 1.7 else 1 end;
  fare_value := greatest(5::numeric, round((5 + distance_km * 1.5 + duration_min * 0.5)::numeric * multiplier, 2));
  insert into public.rides (rider_id,pickup_address,destination_address,pickup_lat,pickup_lng,destination_lat,destination_lng,
    fare,distance,duration,ride_type,scheduled_at,payment_method,status)
  values (auth.uid(),trim(p_pickup_address),trim(p_destination_address),p_pickup_lat,p_pickup_lng,p_destination_lat,p_destination_lng,
    fare_value,round(distance_km::numeric,2),duration_min,p_ride_type,p_scheduled_at,p_payment_method,'requested') returning * into result;
  return result;
end; $$;
revoke all on function public.request_ride(text,text,double precision,double precision,double precision,double precision,text,timestamptz,text) from public;
grant execute on function public.request_ride(text,text,double precision,double precision,double precision,double precision,text,timestamptz,text) to authenticated;

-- The client can submit an application, but only the Edge Function with service role reviews it.
create or replace function public.submit_driver_application(
  p_full_name text, p_phone text, p_license_number text, p_vehicle_make text, p_vehicle_model text,
  p_vehicle_color text, p_license_plate text, p_license_document_path text default null,
  p_vehicle_document_path text default null
) returns public.driver_applications language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare result public.driver_applications;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='rider') then
    raise exception 'Only a rider account can apply to become a driver.' using errcode='42501'; end if;
  if length(trim(coalesce(p_full_name,'')))<3 or length(trim(coalesce(p_phone,'')))<7 or length(trim(coalesce(p_license_number,'')))<3
     or length(trim(coalesce(p_vehicle_make,'')))<2 or length(trim(coalesce(p_vehicle_model,'')))<1
     or length(trim(coalesce(p_vehicle_color,'')))<2 or length(trim(coalesce(p_license_plate,'')))<3 then
    raise exception 'Complete all required driver and vehicle fields.' using errcode='22023'; end if;
  if p_license_document_path is not null and split_part(p_license_document_path,'/',1)<>auth.uid()::text then
    raise exception 'Invalid licence document path.' using errcode='42501'; end if;
  if p_vehicle_document_path is not null and split_part(p_vehicle_document_path,'/',1)<>auth.uid()::text then
    raise exception 'Invalid vehicle document path.' using errcode='42501'; end if;
  insert into public.driver_applications as existing_app (user_id,full_name,phone,license_number,vehicle_make,vehicle_model,vehicle_color,license_plate,
    license_document_path,vehicle_document_path,status,submitted_at,reviewed_at,reviewed_by,review_reason)
  values(auth.uid(),trim(p_full_name),trim(p_phone),trim(p_license_number),trim(p_vehicle_make),trim(p_vehicle_model),trim(p_vehicle_color),upper(trim(p_license_plate)),
    p_license_document_path,p_vehicle_document_path,'pending',now(),null,null,null)
  on conflict(user_id) do update set full_name=excluded.full_name,phone=excluded.phone,license_number=excluded.license_number,
    vehicle_make=excluded.vehicle_make,vehicle_model=excluded.vehicle_model,vehicle_color=excluded.vehicle_color,license_plate=excluded.license_plate,
    license_document_path=excluded.license_document_path,vehicle_document_path=excluded.vehicle_document_path,status='pending',
    submitted_at=now(),reviewed_at=null,reviewed_by=null,review_reason=null,updated_at=now()
  where existing_app.status in ('rejected','pending') returning * into result;
  if result.id is null then raise exception 'An approved or suspended application cannot be resubmitted.' using errcode='55000'; end if;
  return result;
end; $$;
revoke all on function public.submit_driver_application(text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.submit_driver_application(text,text,text,text,text,text,text,text,text) to authenticated;

-- Keep Realtime updates available to both clients.
do $$ begin
  alter publication supabase_realtime add table public.driver_applications;
exception when duplicate_object then null; when undefined_object then null; end $$;

create table if not exists public.driver_review_audit (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.driver_applications(id) on delete set null,
  driver_user_id uuid not null references public.profiles(id) on delete cascade,
  admin_user_id uuid not null references public.profiles(id),
  action text not null check (action in ('approved','rejected','suspended','reinstated')),
  reason text,
  created_at timestamptz not null default now()
);
alter table public.driver_review_audit enable row level security;
drop policy if exists driver_review_audit_admin_read on public.driver_review_audit;
create policy driver_review_audit_admin_read on public.driver_review_audit for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
revoke insert, update, delete on public.driver_review_audit from authenticated, anon;

-- Atomic, role-checked review operation. All application/profile/driver/audit changes commit together.
create or replace function public.review_driver_application(
  p_application_id uuid, p_action text, p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare app public.driver_applications; now_at timestamptz := now(); next_status text;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'Administrator access required.' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('approve','reject','suspend','reinstate') then raise exception 'Invalid review action.' using errcode='22023'; end if;
  select * into app from public.driver_applications where id=p_application_id for update;
  if app.id is null then raise exception 'Driver application not found.' using errcode='P0002'; end if;
  if p_action='approve' then
    if app.status <> 'pending' then raise exception 'Only pending applications can be approved.' using errcode='55000'; end if;
    if app.license_document_path is null or app.vehicle_document_path is null then
      raise exception 'Both driving licence and vehicle documents must be uploaded before approval.' using errcode='22023'; end if;
    update public.profiles set role='driver',full_name=app.full_name,phone=app.phone,updated_at=now_at where id=app.user_id;
    insert into public.driver_profiles(user_id,full_name,phone,vehicle_make,vehicle_model,vehicle_color,license_plate,is_approved,is_online,application_status,suspended_at,updated_at)
    values(app.user_id,app.full_name,app.phone,app.vehicle_make,app.vehicle_model,app.vehicle_color,app.license_plate,true,false,'approved',null,now_at)
    on conflict(user_id) do update set full_name=excluded.full_name,phone=excluded.phone,vehicle_make=excluded.vehicle_make,vehicle_model=excluded.vehicle_model,
      vehicle_color=excluded.vehicle_color,license_plate=excluded.license_plate,is_approved=true,is_online=false,application_status='approved',suspended_at=null,updated_at=now_at;
    next_status := 'approved';
  elsif p_action='reject' then
    if app.status <> 'pending' then raise exception 'Only pending applications can be rejected.' using errcode='55000'; end if;
    next_status := 'rejected';
  elsif p_action='suspend' then
    if app.status <> 'approved' then raise exception 'Only approved drivers can be suspended.' using errcode='55000'; end if;
    update public.driver_profiles set is_approved=false,is_online=false,application_status='suspended',suspended_at=now_at,updated_at=now_at where user_id=app.user_id;
    next_status := 'suspended';
  else
    if app.status <> 'suspended' then raise exception 'Only suspended drivers can be reinstated.' using errcode='55000'; end if;
    update public.driver_profiles set is_approved=true,is_online=false,application_status='approved',suspended_at=null,updated_at=now_at where user_id=app.user_id;
    next_status := 'approved';
  end if;
  update public.driver_applications set status=next_status,reviewed_at=now_at,reviewed_by=auth.uid(),review_reason=nullif(left(trim(coalesce(p_reason,'')),500),''),updated_at=now_at where id=app.id;
  insert into public.driver_review_audit(application_id,driver_user_id,admin_user_id,action,reason)
  values(app.id,app.user_id,auth.uid(),case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'suspend' then 'suspended' else 'reinstated' end,nullif(left(trim(coalesce(p_reason,'')),500),''));
  return jsonb_build_object('success',true,'user_id',app.user_id,'status',next_status,'action',p_action);
end; $$;
revoke all on function public.review_driver_application(uuid,text,text) from public;
grant execute on function public.review_driver_application(uuid,text,text) to authenticated;
