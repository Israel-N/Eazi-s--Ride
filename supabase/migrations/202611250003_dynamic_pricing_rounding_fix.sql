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
  if auth.uid() is null then
    raise exception 'Sign in to get a fare quote.' using errcode='28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where id=auth.uid() and role='rider'
  ) then
    raise exception 'Only rider accounts can request fare quotes.' using errcode='42501';
  end if;

  if coalesce(trim(p_pickup_address),'') = ''
     or coalesce(trim(p_destination_address),'') = '' then
    raise exception 'Pickup and destination addresses are required.' using errcode='22023';
  end if;

  if p_pickup_lat is null or p_pickup_lng is null
     or p_destination_lat is null or p_destination_lng is null
     or p_pickup_lat not between -90 and 90
     or p_destination_lat not between -90 and 90
     or p_pickup_lng not between -180 and 180
     or p_destination_lng not between -180 and 180 then
    raise exception 'Choose valid pickup and destination coordinates.' using errcode='22023';
  end if;

  if p_ride_type not in ('economy','comfort','xl') then
    raise exception 'Invalid ride type.' using errcode='22023';
  end if;

  if p_payment_method not in ('cash','mobile_money','card') then
    raise exception 'Invalid payment method.' using errcode='22023';
  end if;

  select * into v_settings
  from public.ride_pricing_settings
  where id=true;

  if not found then
    raise exception 'Ride pricing has not been configured.';
  end if;

  v_distance := 6371 * 2 * asin(sqrt(least(1.0, greatest(0.0,
    power(sin(radians(p_destination_lat-p_pickup_lat)/2),2) +
    cos(radians(p_pickup_lat))*cos(radians(p_destination_lat))*
    power(sin(radians(p_destination_lng-p_pickup_lng)/2),2)
  ))));

  v_distance := greatest(0.1, v_distance);
  v_minutes := greatest(3, ceil((v_distance / 30.0) * 60)::integer);

  v_base := round((
    v_settings.base_fare +
    v_distance::numeric * v_settings.per_km +
    v_minutes * v_settings.per_minute
  )::numeric, 2);

  v_category := case p_ride_type
    when 'comfort' then v_settings.comfort_multiplier
    when 'xl' then v_settings.xl_multiplier
    else v_settings.economy_multiplier
  end;

  v_manual := v_settings.manual_multiplier;

  if v_settings.automatic_pricing_enabled then
    select count(*)::integer into v_drivers
    from public.driver_profiles d
    join public.profiles p on p.id=d.user_id
    where p.role='driver'
      and d.is_approved=true
      and d.is_online=true
      and d.latitude is not null
      and d.longitude is not null
      and d.location_updated_at > now() - interval '60 seconds'
      and 6371 * acos(least(1.0,greatest(-1.0,
        cos(radians(p_pickup_lat))*cos(radians(d.latitude))*
        cos(radians(d.longitude)-radians(p_pickup_lng))+
        sin(radians(p_pickup_lat))*sin(radians(d.latitude))
      ))) <= v_settings.demand_radius_km;

    select count(*)::integer into v_requests
    from public.rides r
    where r.status='requested'
      and r.driver_id is null
      and r.created_at > now() - interval '15 minutes'
      and (r.scheduled_at is null or r.scheduled_at <= now())
      and r.pickup_lat is not null
      and r.pickup_lng is not null
      and 6371 * acos(least(1.0,greatest(-1.0,
        cos(radians(p_pickup_lat))*cos(radians(r.pickup_lat))*
        cos(radians(r.pickup_lng)-radians(p_pickup_lng))+
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
      v_reason := format(
        'High demand nearby: %s requests and %s available drivers',
        v_requests, v_drivers
      );
    else
      v_reason := 'Standard demand';
    end if;
  else
    v_reason := 'Automatic demand pricing is disabled';
  end if;

  v_fare := greatest(
    v_settings.minimum_fare,
    round((v_base * v_category * v_demand * v_manual)::numeric, 2)
  );

  insert into public.ride_fare_quotes (
    rider_id,pickup_address,destination_address,
    pickup_lat,pickup_lng,destination_lat,destination_lng,
    ride_type,payment_method,distance_km,duration_minutes,
    base_amount,category_multiplier,demand_multiplier,
    manual_multiplier,final_fare,nearby_drivers,nearby_requests,
    pricing_reason,expires_at
  ) values (
    auth.uid(),trim(p_pickup_address),trim(p_destination_address),
    p_pickup_lat,p_pickup_lng,p_destination_lat,p_destination_lng,
    p_ride_type,p_payment_method,round(v_distance::numeric,2),
    v_minutes,v_base,v_category,v_demand,v_manual,v_fare,
    v_drivers,v_requests,v_reason,now()+interval '5 minutes'
  ) returning * into v_quote;

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'fare',v_quote.final_fare,
    'currency','GHS',
    'distance_km',v_quote.distance_km,
    'duration_minutes',v_quote.duration_minutes,
    'ride_type',v_quote.ride_type,
    'category_multiplier',v_quote.category_multiplier,
    'demand_multiplier',v_quote.demand_multiplier,
    'manual_multiplier',v_quote.manual_multiplier,
    'nearby_drivers',v_quote.nearby_drivers,
    'nearby_requests',v_quote.nearby_requests,
    'pricing_reason',v_quote.pricing_reason,
    'expires_at',v_quote.expires_at
  );
end;
$$;
