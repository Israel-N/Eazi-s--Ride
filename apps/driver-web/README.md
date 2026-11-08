# Eazi's Ride Driver (web)

Browser dashboard for approved drivers: go online, see nearby requests, accept or decline, and move a trip through its states. It is the driver screen that used to live inside the rider web app. The Expo app in `apps/mobile` is the main driver app and is the one with background GPS and push notifications.

```bash
cd apps/driver-web
cp .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
npm install --legacy-peer-deps
npm run dev                  # http://localhost:5174
```

Only accounts with `profiles.role = 'driver'` get past the sign-in screen. New drivers apply from the rider app and are approved in `apps/admin`.


## Direct driver onboarding

Open `/register` to create an account directly in this portal, without using the rider app. New accounts are always created with the `rider` role by the database trigger. After email confirmation (if enabled), sign in and complete `/apply`. Upload both the driving-licence and vehicle documents. An administrator must review the application before the profile is promoted to `driver`; never set a driver role from the browser.

For local development, copy `.env.example` to `.env.local` and configure the same Supabase project used by the rider and admin portals.
