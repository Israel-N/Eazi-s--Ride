# Eazi's Ride Admin

Operations dashboard for the Eazi's Ride Supabase project.

- **Overview**: live drivers online, rides waiting and underway, applications to review, today's totals, a 14-day rides chart, and a short "needs attention" list. It refreshes through Supabase Realtime.
- **Drivers**: review applications (view documents, approve, reject, suspend, reinstate) and see all drivers.
- **Rides**, **Users**, **Payments**: filterable, paged, read-only lists.

## Run

```bash
cd apps/admin
cp .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
# set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (same project as the other apps)
npm install --legacy-peer-deps
npm run dev                  # http://localhost:5175
```

## Before it works

1. Apply `supabase/migrations/202610280001_admin_dashboard_security.sql` (see `PRODUCTION_FEATURES.md`, "Admin dashboard").
2. Make your own account an admin from the SQL editor.
3. Deploy `admin-driver-review` and include this app's exact origin in the comma-separated `APP_ORIGINS` Supabase secret.

Only the publishable key belongs here. Never add the service-role key.
