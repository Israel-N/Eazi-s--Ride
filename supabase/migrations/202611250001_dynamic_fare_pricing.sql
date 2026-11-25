-- Eazi's Ride dynamic fare pricing.
-- This migration is local project work only; it is not applied automatically.

create table if not exists public.ride_pricing_settings (
  id boolean primary key default true check (id = true),
  base_fare numeric(10,2) not null default 5.00 check (base_fare >= 0),
  per_km numeric(10,2) not null default 1.50 check (per_km >= 0),
  per_minute numeric(10,2) not null default 0.50 check (per_minute >= 0),
  minimum_fare numeric(10,2) not null default 5.00 check (minimum_fare >= 0),
  economy_multiplier numeric(6,3) not null default 1.000 check (economy_multiplier between 0.5 and 5),
  comfort_multiplier numeric(6,3) not null default 1.350 check (comfort_multiplier between 0.5 and 5),
  xl_multiplier numeric(6,3) not null default 1.700 check (xl_multiplier between 0.5 and 5),
  automatic_pricing_enabled boolean not null default true,
  manual_multiplier numeric(6,3) not null default 1.000 check (manual_multiplier between 0.5 and 3),
  maximum_surge_multiplier numeric(6,3) not null default 1.500 check (maximum_surge_multiplier between 1 and 3),
  demand_radius_km numeric(6,2) not null default 5.00 check (demand_radius_km between 1 and 30),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.ride_pricing_settings (id) values (true)
on conflict (id) do nothing;

create table if not exists public.ride_pricing_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  before_settings jsonb not null,
  after_settings jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ride_fare_quotes (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references auth.users(id) on delete cascade,
  pickup_address text not null,
  destination_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  ride_type text not null check (ride_type in ('economy','comfort','xl')),
  payment_method text not null default 'cash' check (payment_method in ('cash','mobile_money','card')),
  distance_km numeric(10,2) not null,
  duration_minutes integer not null,
  base_amount numeric(12,2) not null,
  category_multiplier numeric(6,3) not null,
  demand_multiplier numeric(6,3) not null,
  manual_multiplier numeric(6,3) not null,
  final_fare numeric(12,2) not null,
  nearby_drivers integer not null default 0,
  nearby_requests integer not null default 0,
  pricing_reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  ride_id uuid references public.rides(id)
);

create index if not exists ride_fare_quotes_rider_created_idx
  on public.ride_fare_quotes (rider_id, created_at desc);
create index if not exists ride_fare_quotes_expiry_idx
  on public.ride_fare_quotes (expires_at) where consumed_at is null;

alter table public.ride_pricing_settings enable row level security;
alter table public.ride_pricing_audit enable row level security;
alter table public.ride_fare_quotes enable row level security;

revoke all on public.ride_pricing_settings from anon, authenticated;
revoke all on public.ride_pricing_audit from anon, authenticated;
revoke all on public.ride_fare_quotes from anon, authenticated;

create or replace function public.get_ride_fare_quote(
  p_pickup_address text,
  p_destination_address text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_destination_lat double precision,
  p_destination_lng double precision,
  p_ride_type text default 'economy',
  p_payment_method text default 'cash'
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_settings public.ride_pricing_settings%rowtype;
  v_distance double precision;
  v_minutes integer;
  v_base numeric(12,2);
  v_category numeric(6,3);
  v_demand numeric(6,3) := 1.0;
  v_manual numeric(6,3);
  v_fare numeric(12,2);
  v_drivers integer := 0;
  v_requests integer := 0;
  v_ratio numeric;
  v_reason text := 'Standard fare';
  v_quote public.ride_fare_quotes%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to get a fare quote.' using errcode='28000'; end if;
  if not exists (select 1 from public.profiles where id=auth.uid() and role='rider') then
    raise exception 'Only rider accounts can request fare quotes.' using errcode='42501';
  end if;
  if coalesce(trim(p_pickup_address),'') = '' or coalesce(trim(p_destination_address),'') = '' then
    raise exception 'Pickup and destination addresses are required.' using errcode='22023';
  end if;
  if p_pickup_lat is null or p_pickup_lng is null or p_destination_lat is null or p_destination_lng is null
     or p_pickup_lat not between -90 and 90 or p_destination_lat not between -90 and 90
     or p_pickup_lng not between -180 and 180 or p_destination_lng not between -180 and 180 then
    raise exception 'Choose valid pickup and destination coordinates.' using errcode='22023';
  end if;
  if p_ride_type not in ('economy','comfort','xl') then raise exception 'Invalid ride type.' using errcode='22023'; end if;
  if p_payment_method not in ('cash','mobile_money','card') then raise exception 'Invalid payment method.' using errcode='22023'; end if;

  select * into v_settings from public.ride_pricing_settings where id=true;
  if not found then raise exception 'Ride pricing has not been configured.'; end if;

  v_distance := 6371 * 2 * asin(sqrt(least(1.0, greatest(0.0,
    power(sin(radians(p_destination_lat-p_pickup_lat)/2),2) +
    cos(radians(p_pickup_lat))*cos(radians(p_destination_lat))*power(sin(radians(p_destination_lng-p_pickup_lng)/2),2)
  ))));
  v_distance := greatest(0.1, v_distance);
  v_minutes := greatest(3, ceil((v_distance / 30.0) * 60)::integer);
  v_base := round(v_settings.base_fare + v_distance * v_settings.per_km + v_minutes * v_settings.per_minute, 2);
  v_category := case p_ride_type when 'comfort' then v_settings.comfort_multiplier when 'xl' then v_settings.xl_multiplier else v_settings.economy_multiplier end;
  v_manual := v_settings.manual_multiplier;

  if v_settings.automatic_pricing_enabled then
    select count(*)::integer into v_drivers
    from public.driver_profiles d join public.profiles p on p.id=d.user_id
    where p.role='driver' and d.is_approved=true and d.is_online=true
      and d.latitude is not null and d.longitude is not null
      and d.location_updated_at > now() - interval '60 seconds'
      and 6371 * acos(least(1.0,greatest(-1.0,
        cos(radians(p_pickup_lat))*cos(radians(d.latitude))*cos(radians(d.longitude)-radians(p_pickup_lng))+
        sin(radians(p_pickup_lat))*sin(radians(d.latitude))
      ))) <= v_settings.demand_radius_km;

    select count(*)::integer into v_requests
    from public.rides r
    where r.status='requested' and r.driver_id is null
      and r.created_at > now() - interval '15 minutes'
      and (r.scheduled_at is null or r.scheduled_at <= now())
      and r.pickup_lat is not null and r.pickup_lng is not null
      and 6371 * acos(least(1.0,greatest(-1.0,
        cos(radians(p_pickup_lat))*cos(radians(r.pickup_lat))*cos(radians(r.pickup_lng)-radians(p_pickup_lng))+
        sin(radians(p_pickup_lat))*sin(radians(r.pickup_lat))
      ))) <= v_settings.demand_radius_km;

    v_ratio := v_requests::numeric / greatest(v_drivers,1);
    if v_requests >= 2 and v_drivers = 0 then
      v_demand := 1.50;
    elsif v_ratio >= 2 then
      v_demand := 1.35;
    elsif v_ratio >= 1 then
      v_demand := 1.15;
    else
      v_demand := 1.00;
    end if;
    v_demand := least(v_demand, v_settings.maximum_surge_multiplier);
    if v_demand > 1 then
      v_reason := format('High demand nearby: %s requests and %s available drivers', v_requests, v_drivers);
    else
      v_reason := 'Standard demand';
    end if;
  else
    v_reason := 'Automatic demand pricing is disabled';
  end if;

  v_fare := greatest(v_settings.minimum_fare, round(v_base * v_category * v_demand * v_manual, 2));

  insert into public.ride_fare_quotes (
    rider_id,pickup_address,destination_address,pickup_lat,pickup_lng,destination_lat,destination_lng,
    ride_type,payment_method,distance_km,duration_minutes,base_amount,category_multiplier,demand_multiplier,
    manual_multiplier,final_fare,nearby_drivers,nearby_requests,pricing_reason,expires_at
  ) values (
    auth.uid(),trim(p_pickup_address),trim(p_destination_address),p_pickup_lat,p_pickup_lng,p_destination_lat,p_destination_lng,
    p_ride_type,p_payment_method,round(v_distance::numeric,2),v_minutes,v_base,v_category,v_demand,
    v_manual,v_fare,v_drivers,v_requests,v_reason,now()+interval '5 minutes'
  ) returning * into v_quote;

  return jsonb_build_object(
    'quote_id',v_quote.id,'fare',v_quote.final_fare,'currency','GHS',
    'distance_km',v_quote.distance_km,'duration_minutes',v_quote.duration_minutes,
    'ride_type',v_quote.ride_type,'category_multiplier',v_quote.category_multiplier,
    'demand_multiplier',v_quote.demand_multiplier,'manual_multiplier',v_quote.manual_multiplier,
    'nearby_drivers',v_quote.nearby_drivers,'nearby_requests',v_quote.nearby_requests,
    'pricing_reason',v_quote.pricing_reason,'expires_at',v_quote.expires_at
  );
end;
$$;

create or replace function public.request_ride_with_quote(
  p_quote_id uuid,
  p_scheduled_at timestamptz default null
) returns public.rides
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_quote public.ride_fare_quotes%rowtype;
  v_ride public.rides%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to request a ride.' using errcode='28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'rider'
  ) then
    raise exception 'Only rider accounts can request rides.' using errcode='42501';
  end if;
  if p_scheduled_at is not null and p_scheduled_at < now()+interval '5 minutes' then
    raise exception 'Scheduled rides must be at least 5 minutes in the future.' using errcode='22023';
  end if;

  select * into v_quote from public.ride_fare_quotes
  where id=p_quote_id and rider_id=auth.uid()
  for update;
  if not found then raise exception 'Fare quote not found.' using errcode='P0002'; end if;
  if v_quote.consumed_at is not null then raise exception 'This fare quote has already been used.' using errcode='22023'; end if;
  if v_quote.expires_at <= now() then raise exception 'Fare quote expired. Please refresh your fare.' using errcode='22023'; end if;

  insert into public.rides (
    rider_id,pickup_address,destination_address,pickup_lat,pickup_lng,destination_lat,destination_lng,
    fare,distance,duration,ride_type,scheduled_at,payment_method,status
  ) values (
    auth.uid(),v_quote.pickup_address,v_quote.destination_address,v_quote.pickup_lat,v_quote.pickup_lng,
    v_quote.destination_lat,v_quote.destination_lng,v_quote.final_fare,v_quote.distance_km,
    v_quote.duration_minutes,v_quote.ride_type,p_scheduled_at,v_quote.payment_method,'requested'
  ) returning * into v_ride;

  update public.ride_fare_quotes set consumed_at=now(),ride_id=v_ride.id where id=v_quote.id;
  return v_ride;
end;
$$;

create or replace function public.admin_get_ride_pricing()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare v_settings public.ride_pricing_settings%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  select * into v_settings from public.ride_pricing_settings where id=true;
  return to_jsonb(v_settings);
end;
$$;

create or replace function public.admin_update_ride_pricing(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_admin uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  select to_jsonb(s) into v_before from public.ride_pricing_settings s where id=true for update;

  update public.ride_pricing_settings set
    base_fare = coalesce((p_settings->>'base_fare')::numeric,base_fare),
    per_km = coalesce((p_settings->>'per_km')::numeric,per_km),
    per_minute = coalesce((p_settings->>'per_minute')::numeric,per_minute),
    minimum_fare = coalesce((p_settings->>'minimum_fare')::numeric,minimum_fare),
    economy_multiplier = coalesce((p_settings->>'economy_multiplier')::numeric,economy_multiplier),
    comfort_multiplier = coalesce((p_settings->>'comfort_multiplier')::numeric,comfort_multiplier),
    xl_multiplier = coalesce((p_settings->>'xl_multiplier')::numeric,xl_multiplier),
    automatic_pricing_enabled = coalesce((p_settings->>'automatic_pricing_enabled')::boolean,automatic_pricing_enabled),
    manual_multiplier = coalesce((p_settings->>'manual_multiplier')::numeric,manual_multiplier),
    maximum_surge_multiplier = coalesce((p_settings->>'maximum_surge_multiplier')::numeric,maximum_surge_multiplier),
    demand_radius_km = coalesce((p_settings->>'demand_radius_km')::numeric,demand_radius_km),
    updated_at=now(),updated_by=v_admin
  where id=true;

  select to_jsonb(s) into v_after from public.ride_pricing_settings s where id=true;
  insert into public.ride_pricing_audit(admin_id,before_settings,after_settings)
  values(v_admin,coalesce(v_before,'{}'::jsonb),v_after);
  return v_after;
end;
$$;

revoke all on function public.get_ride_fare_quote(text,text,double precision,double precision,double precision,double precision,text,text) from public;
revoke all on function public.request_ride_with_quote(uuid,timestamptz) from public;
revoke all on function public.admin_get_ride_pricing() from public;
revoke all on function public.admin_update_ride_pricing(jsonb) from public;
grant execute on function public.get_ride_fare_quote(text,text,double precision,double precision,double precision,double precision,text,text) to authenticated;
grant execute on function public.request_ride_with_quote(uuid,timestamptz) to authenticated;
grant execute on function public.admin_get_ride_pricing() to authenticated;
grant execute on function public.admin_update_ride_pricing(jsonb) to authenticated;

comment on table public.ride_pricing_settings is 'Server-controlled Eazi Ride fare configuration; read and write only through admin RPCs.';
comment on table public.ride_fare_quotes is 'Short-lived rider-owned fare quotes; prices are locked when a ride is requested.';


