-- Admin portal read access and dashboard stats.
-- Apply after 202610100001_driver_rides_security_tracking.sql and
-- 202610100002_production_features.sql.

-- A SECURITY DEFINER helper avoids recursive profiles RLS policies when an
-- admin policy needs to check the caller's role.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Admin portal tables: read-only operational access. Mutations continue to use
-- the existing role-checked RPCs and Edge Functions.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists driver_profiles_select_admin on public.driver_profiles;
create policy driver_profiles_select_admin on public.driver_profiles
  for select to authenticated using (public.is_admin());

drop policy if exists rides_select_admin on public.rides;
create policy rides_select_admin on public.rides
  for select to authenticated using (public.is_admin());

drop policy if exists payments_select_admin on public.payments;
create policy payments_select_admin on public.payments
  for select to authenticated using (public.is_admin());

-- Shape matches apps/admin/src/pages/Overview.jsx.
create or replace function public.admin_dashboard_stats(p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 14), 90));
  v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'drivers_online', (select count(*)::integer from public.driver_profiles d
      join public.profiles p on p.id = d.user_id
      where p.role = 'driver' and d.is_approved and d.is_online),
    'drivers_approved', (select count(*)::integer from public.driver_profiles d
      join public.profiles p on p.id = d.user_id
      where p.role = 'driver' and d.is_approved),
    'rides_waiting', (select count(*)::integer from public.rides r
      where r.status = 'requested' and r.driver_id is null),
    'rides_active', (select count(*)::integer from public.rides r
      where r.status in ('accepted', 'arriving', 'arrived', 'in_progress')),
    'pending_applications', (select count(*)::integer from public.driver_applications a
      where a.status = 'pending'),
    'payments_in_review', (select count(*)::integer from public.payments p
      where p.status = 'review_required'),
    'rides_today', (select count(*)::integer from public.rides r
      where r.created_at >= current_date and r.created_at < current_date + interval '1 day'),
    'completed_today', (select count(*)::integer from public.rides r
      where r.status = 'completed' and r.completed_at >= current_date
        and r.completed_at < current_date + interval '1 day'),
    'collected_today', (select coalesce(sum(p.amount), 0)::numeric(12,2)
      from public.payments p where p.status = 'successful'
        and p.paid_at >= current_date and p.paid_at < current_date + interval '1 day'),
    'riders', (select count(*)::integer from public.profiles p where p.role = 'rider'),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', to_char(days.day, 'YYYY-MM-DD'),
        'rides', (select count(*)::integer from public.rides r
          where r.created_at >= days.day and r.created_at < days.day + interval '1 day'),
        'completed', (select count(*)::integer from public.rides r
          where r.status = 'completed' and r.completed_at >= days.day
            and r.completed_at < days.day + interval '1 day')
      ) order by days.day)
      from generate_series(current_date - (v_days - 1), current_date, interval '1 day') as days(day)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.admin_dashboard_stats(integer) from public;
grant execute on function public.admin_dashboard_stats(integer) to authenticated;
