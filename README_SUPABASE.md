# Eazi's Ride — Supabase setup

The rider web app, separate admin portal, driver web portal, and Expo driver app use the same Supabase project. Supabase Auth/PostgreSQL is the source of truth for rides, driver profiles, trip status, and live GPS updates. The legacy `server/` folder is not used by these app flows.

## Apply database changes

1. Back up the project before running migrations.
2. Fresh project: run `supabase/schema.sql` once, then apply migrations `202610100002_production_features.sql` and `202610280001_admin_dashboard_security.sql` in that order. The base schema already includes the driver/rides security changes from migration `202610100001`.
3. Existing project: apply `202610100001_driver_rides_security_tracking.sql` if its changes have not already been applied, then apply `202610100002_production_features.sql`, then `202610280001_admin_dashboard_security.sql`.
4. Run the read-only checks in `supabase/tests/production_feature_smoke.sql`.

The admin migration adds the `admin_dashboard_stats` RPC and read-only RLS policies needed by admin pages to inspect users, rides, driver profiles, and payments. It checks the caller's `profiles.role = 'admin'` in the database. Back up an existing project before applying SQL. Do not expose a service-role key in a frontend or mobile app.

## Web client

Copy `.env.example` to `.env.local` and set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Then run `npm install` and `npm run dev` at the repository root.

## Driver application and admin review

A signed-in rider can submit an application at `/driver/apply`. Documents are stored in the private `driver-documents` bucket. A trusted admin account opens `/admin/drivers` to approve/reject/suspend/reinstate drivers. The database checks the admin role again in the review RPC; hiding the page is not the security boundary.

Create the first admin through the trusted Supabase SQL Editor after verifying the correct account:

```sql
update public.profiles set role = 'admin', updated_at = now()
where email = 'YOUR_ADMIN_EMAIL';
```

Verify that exactly one intended profile changed. Never expose this update through a public route.

For a local-only test driver, the SQL example in the main README may still be used manually by a trusted administrator. Production applications should use the review console.

## Mobile client

See `apps/mobile/README.md` and `PRODUCTION_FEATURES.md`. The app needs the same Supabase URL/publishable key plus an EAS project ID. It requests foreground location while online and background location only during an active trip. Background tracking and push delivery require an EAS development build, native FCM/APNs credentials, and real-device verification.

## Payments and notifications

`PRODUCTION_FEATURES.md` documents Paystack hosted GHS card/Mobile Money checkout, payment verification and webhook configuration, the `ride-push` database webhook, required Supabase Edge Functions, and secrets. These external services are not live until you configure your own merchant/provider credentials and deploy the functions.

## Security behavior

- New signups always receive the `rider` role, regardless of client-supplied metadata.
- Ride requests use `request_ride`; fares are computed in the database.
- Driver acceptance, availability, GPS updates, transitions, and cancellation use validated RPCs.
- RLS and grants prevent direct client edits to critical ride, driver, payment, and review fields.


## Edge Function CORS origins

Set `APP_ORIGINS` to a comma-separated allowlist of the exact HTTPS origins for the rider, driver-web, and admin portals (include local development origins when needed). Origins must not include paths. The legacy `APP_ORIGIN` secret remains supported for a single origin. This setting is not an authentication mechanism: the functions still validate Supabase JWTs and server-side roles.
