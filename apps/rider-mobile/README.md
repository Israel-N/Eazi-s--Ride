# Eazi's Ride — native Android passenger app

This Expo app is separate from the existing browser-based passenger app. It uses the same Supabase project as Eazi's Driver and calls the existing `request_ride` and `cancel_my_ride` RPCs.

## Included in this first native version
- Rider sign-up and sign-in with Supabase Auth
- Rider-role verification using `profiles.role`
- Current-location pickup and typed pickup/destination geocoding
- Map preview with pickup and destination markers
- Economy, Comfort and XL ride types
- Cash and Mobile Money payment-method selection
- Ride request through the database `request_ride` RPC (server calculates the fare)
- Ride activity/history, realtime updates and cancellation

## Setup
1. Copy `.env.example` to `.env` and add the Supabase URL, public publishable/anon key, and a restricted Google Maps Android key.
2. Add the same variables to the EAS project environment for the `preview` build.
3. Run `npm ci`, `npx expo-doctor`, then `npx eas-cli login` and `npx eas-cli init`.
4. Build an installable APK with `npx eas-cli build --platform android --profile preview`.

Do not use a Supabase service-role key in the app. The current native version does not yet include every feature from the passenger web app.
