-- Eazi's Ride: booking, driver eligibility, secure trip transitions and GPS hardening.
-- Apply in Supabase SQL Editor after the original schema.sql, or run the updated schema.sql.

alter table public.driver_profiles add column if not exists is_approved boolean not null default false;
alter table public.driver_profiles add column if not exists location_updated_at timestamptz;
alter table public.rides add column if not exists arrived_at timestamptz;
alter table public.rides add column if not exists cancellation_reason text;
alter table public.rides add column if not exists cancelled_at timestamptz;
alter table public.rides drop constraint if exists rides_status_check;
alter table public.rides add constraint rides_status_check
  check (status in ('requested','accepted','arriving','arrived','in_progress','completed','cancelled'));

-- Never trust signup metadata to grant driver/admin privileges.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  insert into public.profiles (id, full_name, email, phone, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email,
          coalesce(new.raw_user_meta_data ->> 'phone', ''), 'rider')
  on conflict (id) do update set
    full_name = excluded.full_name, email = excluded.email, phone = excluded.phone,
    updated_at = now();
  return new;
end; $$;

-- Replace permissive direct-write policies. Critical writes go through checked RPCs below.
drop policy if exists "profiles_update_own" on public.profiles;
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url, updated_at) on public.profiles to authenticated;
drop policy if exists "profiles_update_own_safe_fields" on public.profiles;
create policy "profiles_update_own_safe_fields" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "driver_update_own" on public.driver_profiles;
revoke update on public.driver_profiles from authenticated;

drop policy if exists "rides_update_own" on public.rides;
drop policy if exists "drivers_claim_requested_ride" on public.rides;
-- Riders create their own ride; driver acceptance and state transitions are RPC-only.

-- Drivers may view open requests only while approved and online.
drop policy if exists "drivers_select_open_requests" on public.rides;
create policy "drivers_select_open_requests" on public.rides for select to authenticated using (
  status = 'requested' and driver_id is null and exists (
    select 1 from public.profiles p join public.driver_profiles d on d.user_id = p.id
    where p.id = auth.uid() and p.role = 'driver' and d.is_approved and d.is_online
  )
);

create or replace function public.set_driver_availability(p_is_online boolean)
returns public.driver_profiles language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare result public.driver_profiles;
begin
  if not exists (select 1 from public.profiles p join public.driver_profiles d on d.user_id=p.id
                 where p.id=auth.uid() and p.role='driver' and d.is_approved) then
    raise exception 'Driver account is not approved.' using errcode='42501';
  end if;
  if not p_is_online and exists (select 1 from public.rides where driver_id=auth.uid() and status in ('accepted','arriving','arrived','in_progress')) then
    raise exception 'Finish or cancel your active ride before going offline.' using errcode='55000';
  end if;
  update public.driver_profiles set is_online=p_is_online, updated_at=now()
    where user_id=auth.uid() returning * into result;
  if result.user_id is null then raise exception 'Driver profile not found.'; end if;
  return result;
end; $$;

create or replace function public.update_my_driver_location(p_latitude double precision, p_longitude double precision)
returns public.driver_profiles language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare result public.driver_profiles;
begin
  if p_latitude is null or p_longitude is null or p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid GPS coordinates.' using errcode='22023';
  end if;
  if not exists (select 1 from public.profiles p join public.driver_profiles d on d.user_id=p.id
                 where p.id=auth.uid() and p.role='driver' and d.is_approved) then
    raise exception 'Driver account is not approved.' using errcode='42501';
  end if;
  update public.driver_profiles set latitude=p_latitude, longitude=p_longitude,
    location_updated_at=now(), updated_at=now() where user_id=auth.uid() returning * into result;
  if result.user_id is null then raise exception 'Driver profile not found.'; end if;
  return result;
end; $$;

create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare result public.rides;
begin
  if not exists (select 1 from public.profiles p join public.driver_profiles d on d.user_id=p.id
                 where p.id=auth.uid() and p.role='driver' and d.is_approved and d.is_online) then
    raise exception 'Only an approved online driver can accept rides.' using errcode='42501';
  end if;
  update public.rides set driver_id=auth.uid(), status='accepted', accepted_at=now()
    where id=p_ride_id and status='requested' and driver_id is null
      and (scheduled_at is null or scheduled_at <= now())
    returning * into result;
  if result.id is null then raise exception 'Ride is no longer available. Refresh requests and try another ride.' using errcode='40001'; end if;
  return result;
end; $$;

create or replace function public.transition_my_ride(p_ride_id uuid, p_next_status text)
returns public.rides language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare result public.rides;
begin
  if p_next_status not in ('arriving','arrived','in_progress','completed') then
    raise exception 'Unsupported trip status transition.' using errcode='22023';
  end if;
  update public.rides set
    status=p_next_status,
    arrived_at=case when p_next_status='arrived' then now() else arrived_at end,
    completed_at=case when p_next_status='completed' then now() else completed_at end
  where id=p_ride_id and driver_id=auth.uid() and
    ((status='accepted' and p_next_status='arriving') or
     (status='arriving' and p_next_status='arrived') or
     (status='arrived' and p_next_status='in_progress') or
     (status='in_progress' and p_next_status='completed'))
  returning * into result;
  if result.id is null then raise exception 'Invalid transition or ride is not assigned to you.' using errcode='55000'; end if;
  if p_next_status='completed' then
    update public.driver_profiles set is_online=true, updated_at=now() where user_id=auth.uid();
  end if;
  return result;
end; $$;

create or replace function public.cancel_my_ride(p_ride_id uuid, p_reason text default 'Cancelled')
returns public.rides language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare result public.rides;
begin
  update public.rides set status='cancelled', cancellation_reason=left(coalesce(nullif(trim(p_reason),''),'Cancelled'),250), cancelled_at=now()
  where id=p_ride_id and rider_id=auth.uid() and status in ('requested','accepted','arriving','arrived')
  returning * into result;
  if result.id is null then raise exception 'Ride cannot be cancelled or does not belong to you.' using errcode='55000'; end if;
  return result;
end; $$;

-- Update existing matching function to require approved, online drivers.
create or replace function public.get_nearby_open_rides(p_latitude double precision, p_longitude double precision, p_radius_km double precision default 10)
returns setof public.rides language sql security definer set search_path = public, auth, pg_temp as $$
  select r.* from public.rides r
  where r.status='requested' and r.driver_id is null and r.pickup_lat is not null and r.pickup_lng is not null
    and (r.scheduled_at is null or r.scheduled_at <= now())
    and exists (select 1 from public.profiles p join public.driver_profiles d on d.user_id=p.id
                where p.id=auth.uid() and p.role='driver' and d.is_approved and d.is_online)
    and 6371 * acos(least(1.0,greatest(-1.0,
      cos(radians(p_latitude))*cos(radians(r.pickup_lat))*cos(radians(r.pickup_lng)-radians(p_longitude))+
      sin(radians(p_latitude))*sin(radians(r.pickup_lat))))) <= greatest(0,least(coalesce(p_radius_km,10),100))
  order by r.created_at asc;
$$;

revoke all on function public.set_driver_availability(boolean) from public;
revoke all on function public.update_my_driver_location(double precision,double precision) from public;
revoke all on function public.accept_ride(uuid) from public;
revoke all on function public.transition_my_ride(uuid,text) from public;
revoke all on function public.cancel_my_ride(uuid,text) from public;
grant execute on function public.set_driver_availability(boolean) to authenticated;
grant execute on function public.update_my_driver_location(double precision,double precision) to authenticated;
grant execute on function public.accept_ride(uuid) to authenticated;
grant execute on function public.transition_my_ride(uuid,text) to authenticated;
grant execute on function public.cancel_my_ride(uuid,text) to authenticated;
grant execute on function public.get_nearby_open_rides(double precision,double precision,double precision) to authenticated;

drop policy if exists "rides_insert_own" on public.rides;
drop policy if exists "rides_insert_own_safe" on public.rides;
create policy "rides_insert_own_safe" on public.rides for insert to authenticated
with check (auth.uid() = rider_id and driver_id is null and status = 'requested');

alter table public.payments alter column currency set default 'GHS';

-- Drivers can decline/dismiss a request without changing the rider's ride record.
create table if not exists public.driver_ride_dismissals (
  driver_id uuid not null references public.profiles(id) on delete cascade,
  ride_id uuid not null references public.rides(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (driver_id, ride_id)
);
alter table public.driver_ride_dismissals enable row level security;
revoke all on public.driver_ride_dismissals from anon, authenticated;

create or replace function public.decline_ride_request(p_ride_id uuid)
returns boolean language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  if not exists (select 1 from public.profiles p join public.driver_profiles d on d.user_id=p.id
                 where p.id=auth.uid() and p.role='driver' and d.is_approved and d.is_online) then
    raise exception 'Only an approved online driver can decline ride requests.' using errcode='42501';
  end if;
  if not exists (select 1 from public.rides where id=p_ride_id and status='requested' and driver_id is null) then
    raise exception 'This ride request is no longer available.' using errcode='40001';
  end if;
  insert into public.driver_ride_dismissals(driver_id, ride_id)
  values (auth.uid(), p_ride_id) on conflict (driver_id, ride_id) do nothing;
  return true;
end; $$;

create or replace function public.get_nearby_open_rides(p_latitude double precision, p_longitude double precision, p_radius_km double precision default 10)
returns setof public.rides language sql security definer set search_path = public, auth, pg_temp as $$
  select r.* from public.rides r
  where r.status='requested' and r.driver_id is null and r.pickup_lat is not null and r.pickup_lng is not null
    and (r.scheduled_at is null or r.scheduled_at <= now())
    and exists (select 1 from public.profiles p join public.driver_profiles d on d.user_id=p.id
                where p.id=auth.uid() and p.role='driver' and d.is_approved and d.is_online)
    and not exists (select 1 from public.driver_ride_dismissals x where x.driver_id=auth.uid() and x.ride_id=r.id)
    and 6371 * acos(least(1.0,greatest(-1.0,
      cos(radians(p_latitude))*cos(radians(r.pickup_lat))*cos(radians(r.pickup_lng)-radians(p_longitude))+
      sin(radians(p_latitude))*sin(radians(r.pickup_lat))))) <= greatest(0,least(coalesce(p_radius_km,10),100))
  order by r.created_at asc;
$$;
revoke all on function public.decline_ride_request(uuid) from public;
grant execute on function public.decline_ride_request(uuid) to authenticated;
grant execute on function public.get_nearby_open_rides(double precision,double precision,double precision) to authenticated;


create or replace function public.count_nearby_online_drivers(p_latitude double precision, p_longitude double precision, p_radius_km double precision default 8)
returns integer language sql security definer set search_path = public, auth, pg_temp as $$
  select count(*)::integer from public.driver_profiles d join public.profiles p on p.id=d.user_id
  where p.role='driver' and d.is_approved and d.is_online and d.latitude is not null and d.longitude is not null
    and d.location_updated_at > now() - interval '60 seconds'
    and 6371 * acos(least(1.0,greatest(-1.0,
      cos(radians(p_latitude))*cos(radians(d.latitude))*cos(radians(d.longitude)-radians(p_longitude))+
      sin(radians(p_latitude))*sin(radians(d.latitude))))) <= greatest(0,least(coalesce(p_radius_km,8),100));
$$;
grant execute on function public.count_nearby_online_drivers(double precision,double precision,double precision) to authenticated;

-- Compute the fare and distance on the trusted database instead of trusting client-supplied prices.
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
declare
  result public.rides;
  distance_km double precision;
  duration_min integer;
  multiplier numeric;
  fare_value numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Sign in before requesting a ride.' using errcode='42501'; end if;
  if not exists (select 1 from public.profiles where id=auth.uid() and role='rider') then
    raise exception 'Only rider accounts can request rides.' using errcode='42501';
  end if;
  if length(trim(coalesce(p_pickup_address,'')))=0 or length(trim(coalesce(p_destination_address,'')))=0 then
    raise exception 'Pickup and destination addresses are required.' using errcode='22023';
  end if;
  if p_pickup_lat is null or p_pickup_lng is null or p_destination_lat is null or p_destination_lng is null
    or p_pickup_lat not between -90 and 90 or p_destination_lat not between -90 and 90
    or p_pickup_lng not between -180 and 180 or p_destination_lng not between -180 and 180 then
    raise exception 'Choose valid pickup and destination coordinates.' using errcode='22023';
  end if;
  if p_ride_type not in ('economy','comfort','xl') then raise exception 'Invalid ride type.' using errcode='22023'; end if;
  if p_payment_method not in ('cash','mobile_money') then raise exception 'Invalid payment method.' using errcode='22023'; end if;
  if p_scheduled_at is not null and p_scheduled_at < now() + interval '5 minutes' then
    raise exception 'Scheduled rides must be at least five minutes in the future.' using errcode='22023';
  end if;
  distance_km := 6371 * 2 * asin(sqrt(least(1.0, greatest(0.0,
    power(sin(radians(p_destination_lat-p_pickup_lat)/2),2) +
    cos(radians(p_pickup_lat))*cos(radians(p_destination_lat))*power(sin(radians(p_destination_lng-p_pickup_lng)/2),2)
  ))));
  distance_km := greatest(0.1, distance_km);
  duration_min := greatest(3, ceil((distance_km / 30.0) * 60)::integer);
  multiplier := case p_ride_type when 'comfort' then 1.35 when 'xl' then 1.7 else 1 end;
  fare_value := greatest(5::numeric, round((5 + distance_km * 1.5 + duration_min * 0.5)::numeric * multiplier, 2));
  insert into public.rides (rider_id, pickup_address, destination_address, pickup_lat, pickup_lng,
    destination_lat, destination_lng, fare, distance, duration, ride_type, scheduled_at, payment_method, status)
  values (auth.uid(), trim(p_pickup_address), trim(p_destination_address), p_pickup_lat, p_pickup_lng,
    p_destination_lat, p_destination_lng, fare_value, round(distance_km::numeric,2), duration_min,
    p_ride_type, p_scheduled_at, p_payment_method, 'requested') returning * into result;
  return result;
end; $$;

revoke insert on public.rides from authenticated;
revoke all on function public.request_ride(text,text,double precision,double precision,double precision,double precision,text,timestamptz,text) from public;
grant execute on function public.request_ride(text,text,double precision,double precision,double precision,double precision,text,timestamptz,text) to authenticated;
