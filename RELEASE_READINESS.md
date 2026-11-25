# Eazi's Ride — Release Readiness and Verification Report

## Changes made in this pass

- Added direct account registration to the independent Driver Portal at `/register`.
- Driver Portal registration always requests a normal `rider` profile. The database signup trigger also forces the role to `rider`; only the protected admin review RPC can grant driver access.
- Added a direct link from driver sign-in to registration. A new applicant can register, confirm email if Supabase requires it, sign in, and apply at `/apply` without the rider app.
- Kept the admin review portal separate and the rider homepage free of the admin approvals button.
- Added `.env.example` files for all three web portals and updated the Supabase setup guide for direct driver onboarding and independent local dev servers.

## Required configuration before running

1. Copy root `.env.example` to root `.env.local` and configure the correct Supabase project URL and publishable/anon key.
2. Copy `apps/driver-web/.env.example` to `apps/driver-web/.env.local` and set the same project values.
3. Copy `apps/admin/.env.example` to `apps/admin/.env.local` and set the same project values.
4. Never put the Supabase service-role key, database password, or Paystack secret in any Vite environment file.
5. Apply the database schema and migrations in the order documented in `README_SUPABASE.md`, after backing up an existing database.
6. Configure/deploy Supabase Edge Functions and provider secrets before using payment or server-side approval workflows.

## Build commands

Run from PowerShell in the project root:

```powershell
npm ci
npm run build
Push-Location .pps\driver-web
npm ci
npm run build
Pop-Location
Push-Location .ppsdmin
npm ci
npm run build
Pop-Location
```

## Acceptance tests to perform against your own Supabase project

- [ ] New user registers directly at Driver Portal `/register`; no rider app is needed.
- [ ] New signup has `profiles.role = 'rider'`, regardless of client metadata.
- [ ] Applicant confirms email and signs in if email confirmation is enabled.
- [ ] Applicant submits both required document files and sees a pending application.
- [ ] Non-admin cannot approve/reject applications by calling the Edge Function or RPC directly.
- [ ] Admin can see the pending application and open documents using short-lived signed URLs.
- [ ] Admin approval fails if either required document is missing.
- [ ] Admin approval atomically changes the profile role to `driver`, creates/updates the driver profile, and records an audit event.
- [ ] Approved driver can sign in to Driver Portal and go online only after granting location access.
- [ ] Rider homepage has no admin-dashboard or driver-approval shortcut.
- [ ] Rider, driver, and admin apps use the same Supabase project and distinct role-appropriate interfaces.
- [ ] Ride request, atomic driver acceptance, trip state transitions, cancellation, and realtime updates work on real sessions.
- [ ] Payment success/failure, amount mismatch, repeated webhook, and verification failure are tested with provider test credentials before production.
- [ ] Android Eazi Driver build is tested on a physical device, including foreground/background location and push notifications.

## Verification limitations

This archive has been edited locally. This work session does not have your Supabase credentials, production secrets, or access to execute migrations/deploy functions against your project. Therefore live database execution, Edge Function deployment, real payment-provider checks, and end-to-end acceptance are **not certified** by this report. A successful source build is also not claimed until the commands above complete successfully on your machine.
