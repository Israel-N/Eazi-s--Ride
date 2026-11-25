# Eazi's Ride + Eazi's Driver — Android preparation

This package is a separate working copy based on the uploaded `RideFast-v2.02-dockerized.zip` archive. The original ZIP and uploaded branding ZIP are not modified.

## What was found
- The archive's internal root is `Ridefast v2.01` even though the ZIP filename says v2.02.
- It contains a native Expo driver app at `apps/mobile` and a React/Vite rider web app at the repository root.
- The Docker Compose stack builds the three web frontends only; it does not build Android APKs.
- The database booking interface is `request_ride(...)`; the server checks `auth.uid()` and the `profiles.role = 'rider'` condition, and calculates the fare on the server.

## Added/updated
- Official Ride and Driver branding asset folders under `brand-assets/`.
- Driver Expo icon/adaptive icon/splash/notification assets under `apps/mobile/assets/expo`.
- Separate Rider Expo project under `apps/rider-mobile`, using the same Supabase URL and publishable key and the existing `request_ride` and `cancel_my_ride` RPCs.
- APK preview profiles in both EAS config files.
- `.env.example` templates only; no real credentials are included.
- Google Maps API key is read from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` at build time. Restrict that key to the Android package IDs.

## Android IDs
- Rider: `com.eazisride.rider`
- Driver: `com.eazisride.driver` (preserved from the existing Expo config)

## Important limitations / not verified
- No live Supabase requests, sign-ins, RLS, payments, driver matching, push delivery, or GPS tracking have been tested.
- No EAS APK build has been run. EAS login/project linking and a working network are required.
- The rider app is a first native implementation for sign-in/sign-up, current-location pickup, destination geocoding, a pickup/destination map preview, ride type, cash/Mobile Money selection, request submission, activity/history, realtime updates and cancellation. It is not feature-parity with every rider web screen yet.
- Nominatim is used for geocoding as a prototype provider; before public launch, use a properly provisioned maps/geocoding provider and respect its usage policy.
- The driver app requires an approved driver profile. Background location and push notification behavior still need physical-device and EAS testing.
- `EXPO_PUBLIC_*` variables are bundled into the app. Only public Supabase publishable/anon keys and restricted client-side maps keys belong there. Never use a service-role key.

## Build on Windows PowerShell

### 1. Eazi's Driver APK

```powershell
cd .\apps\mobile
Copy-Item .env.example .env
notepad .env
npm ci
npx expo-doctor
npx eas-cli login
npx eas-cli project:info
npx eas-cli build --platform android --profile preview
```

The existing Driver EAS project ID is retained in `app.json`. Confirm that it belongs to the Expo account you sign in with. Do not run `eas init` unless the project link is missing or incorrect.

### 2. Eazi's Ride APK

```powershell
cd ..\rider-mobile
Copy-Item .env.example .env
notepad .env
npm ci
npx expo-doctor
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile preview
```

This creates/links a separate EAS project for the Rider app. The `preview` profile explicitly requests an installable APK (`android.buildType: apk`).

### EAS environment variables

For cloud builds, add these public client variables to each EAS project's `preview` environment (and later `production`):
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy public anon key)
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (restricted to the corresponding Android package ID)

A local `.env` is for local Expo development; configure the variables in the EAS project environment as well for remote builds. Never use a Supabase service-role key.
