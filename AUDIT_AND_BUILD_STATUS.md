# Eazi's Ride Android preparation — audit and build status

## Source archives inspected

- `RideFast-v2.02-dockerized.zip` — archive integrity passed. The internal project directory is `Ridefast v2.01` (the ZIP filename and internal folder version do not match).
- `eazi-production-assets.zip` — archive integrity passed. It contains separate Ride and Driver brand packs, including Expo icons, adaptive icons, splash screens, notification icons, web logos/icons, map assets and onboarding illustrations.

## Existing project findings

- Rider web app: repository root (`src/`, root `package.json`, root `index.html`).
- Driver web portal: `apps/driver-web`.
- Admin web dashboard: `apps/admin`.
- Existing native Expo driver app: `apps/mobile`.
- Existing Docker Compose file: `docker-compose.yml`; it builds the Rider, Driver Portal and Admin web frontends only. The Expo app is outside Docker and Docker does not produce an APK.
- Supabase client configuration uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for web apps. The native Driver app uses `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Rider booking service calls `request_ride` with pickup/destination addresses and coordinates, ride type, scheduled time and payment method. The SQL function checks that the authenticated profile has the `rider` role and calculates the fare server-side.
- Driver app checks approval before allowing the driver online and uses existing authenticated Supabase RPCs for ride matching, trip transitions and location updates.

## Changes in this working copy

- Added the complete official Ride and Driver asset packs under `brand-assets/`.
- Integrated the official Ride and Driver web logos and favicons into their respective login pages and web entrypoints.
- Integrated Driver Expo icon, adaptive icon, splash and notification icon assets into `apps/mobile`.
- Updated the Driver app's displayed product name and logo to **Eazi's Driver**, retaining Android ID `com.eazisride.driver` and its existing EAS project link.
- Added a separate native passenger Expo app at `apps/rider-mobile`, Android ID `com.eazisride.rider`, with its own icon, splash screen and logo.
- Rider native app first-pass scope: Supabase rider sign-up/sign-in, rider-role check, current-location pickup, address geocoding, pickup/destination map preview, Economy/Comfort/XL selection, Cash/Mobile Money selection, ride request through the existing `request_ride` RPC, activity/history, realtime ride updates and cancellation through `cancel_my_ride`.
- Added APK preview build profiles for both Expo apps.
- Added `.env.example` templates only. No actual credentials or service-role keys were added.
- Added dynamic Expo config to read a Google Maps Android key from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`.

## Validation performed

- Both input ZIPs passed ZIP integrity tests.
- All 16 JSON configuration files in the working copy parsed successfully.
- TypeScript's parser successfully transpiled/parsed 85 JavaScript/JSX files with zero syntax diagnostics.
- Both Expo app configs resolve the expected app name, Android package ID and icon asset path.
- Both Expo app package manifests match their npm lockfile dependency metadata.
- The original source and branding archives were not modified. All edits are in this separate working copy.
- No Supabase SQL migration was applied, no Edge Function was deployed, no AWS resource was created, and no paid service was used.

## Not yet verified

- `npm ci`, `expo-doctor`, Vite production builds and EAS cloud APK builds have not been run in this environment.
- No physical Samsung device installation has been performed.
- Live Supabase authentication, RLS, ride booking, driver matching, cancellation, payment flows, push notifications and background GPS still require real-account testing.
- The new Rider app is an initial native implementation, not yet full feature parity with the web Rider app (for example, route-aware navigation, saved places, scheduled rides, live driver tracking, SOS, trip sharing, ratings, wallet and receipts are not all implemented natively).
- The Driver app's background location and push delivery require EAS credentials and real Android device tests.
- The Rider app's current fare display is indicative only. The existing database RPC remains authoritative for the actual fare.
- Nominatim is currently used for prototype geocoding. Replace it with a production-approved geocoding/maps provider and observe provider terms and rate limits before public launch.

## Required before building APKs

1. Add the Supabase project URL and public publishable/anon key to each app's `.env` for local testing and to each EAS project's `preview` environment for cloud builds.
2. Add a restricted Google Maps Android API key to each EAS project's `preview` environment. Restrict keys to the matching Android package IDs (`com.eazisride.driver` and `com.eazisride.rider`).
3. Log in to the Expo account that owns the existing Driver EAS project. Verify its project link before building.
4. Initialize a separate EAS project for `apps/rider-mobile`.
5. Run `npm ci`, `npx expo-doctor`, then `npx eas-cli build --platform android --profile preview` from each app folder.
6. Download each generated APK from the EAS build page and install it on the Samsung phone. Allow installation from the browser/files app when Android asks.

Never place Supabase service-role keys, database passwords, Paystack secret keys or webhook secrets in either mobile app.
