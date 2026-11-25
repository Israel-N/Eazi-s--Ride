# Supabase review notes — RideFast v2.01

## Issues found and addressed

1. The admin overview called `public.admin_dashboard_stats(integer)`, but no SQL file in the supplied ZIP defined it. Added `supabase/migrations/202610280001_admin_dashboard_security.sql` with the role-checked RPC.
2. The admin Users, Rides, Payments, and Drivers screens query tables protected by rider/driver-only RLS policies. Added read-only admin policies for `profiles`, `driver_profiles`, `rides`, and `payments`, using `public.is_admin()` to avoid recursive RLS checks.
3. The signup trigger in `supabase/schema.sql` initially trusted signup metadata for `profiles.role`. It now always creates new profiles as `rider`; the secure migration already enforces the same rule.
4. The CORS helper accepted only one `APP_ORIGIN`, but the project has separate rider, driver-web, and admin origins. Edge Functions now support a comma-separated `APP_ORIGINS` allowlist while retaining `APP_ORIGIN` compatibility. Webhook functions continue to authenticate with their own signature/secret checks.
5. The admin driver review screen showed only the generic Supabase non-2xx error. It now attempts to show the Edge Function's JSON error details.
6. Updated setup docs and the admin overview's migration hint to refer to the actual migration filename.

## Apply database changes

Back up the project first. In Supabase SQL Editor, for a fresh project:

1. Run `supabase/schema.sql`.
2. Run `supabase/migrations/202610100002_production_features.sql`.
3. Run `supabase/migrations/202610280001_admin_dashboard_security.sql`.

For an existing project, apply `202610100001_driver_rides_security_tracking.sql` first if those changes are not already present, then apply `202610100002_production_features.sql` and `202610280001_admin_dashboard_security.sql` in order. Do not re-run schema/migrations blindly on a live database.

Afterward, run `supabase/tests/production_feature_smoke.sql` in SQL Editor. The admin RPC itself should be tested while signed in as an admin, rider, and driver: only the admin should receive stats.

## Configure and deploy Edge Functions

Set `APP_ORIGINS` to the comma-separated, exact origins for all deployed browser portals. Include local origins only while developing. Never put service-role or Paystack secret keys in a `VITE_*` or `EXPO_PUBLIC_*` variable.

Deploy the functions after linking the Supabase CLI to the correct project. This ZIP does not deploy changes to Supabase automatically.

## Verification limits

Static source checks were performed. This environment did not have the project's npm dependencies, Deno, or a live Supabase connection available, so SQL execution, Edge Function compilation, portal builds, live RLS behavior, driver approval, and payment/webhook flows still require testing in your project.
