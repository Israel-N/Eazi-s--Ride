-- Run in Supabase SQL Editor after applying the production migration.
-- Read-only checks: these queries do not modify application data.
select to_regclass('public.driver_applications') as driver_applications_table,
       to_regclass('public.driver_review_audit') as driver_review_audit_table,
       to_regclass('public.device_push_tokens') as device_push_tokens_table,
       to_regclass('public.payments') as payments_table;

select p.proname as required_rpc
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('submit_driver_application','review_driver_application','request_ride','accept_ride','transition_my_ride','update_my_driver_location')
order by p.proname;

select tablename, policyname, cmd
from pg_policies
where schemaname='public' and tablename in ('driver_applications','driver_review_audit','device_push_tokens','payments')
order by tablename, policyname;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id='driver-documents';

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid='public.payments'::regclass and conname='payments_status_check';

-- Admin dashboard RPC must exist and be executable by authenticated users.
select to_regprocedure('public.admin_dashboard_stats(integer)') as admin_dashboard_stats_rpc,
       to_regprocedure('public.is_admin()') as is_admin_helper;
