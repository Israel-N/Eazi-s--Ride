# Eazi's Ride Driver (Expo)

Dedicated iOS/Android driver app using the same Supabase Auth and PostgreSQL project as the rider web app.

## Setup

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_EAS_PROJECT_ID`.
2. Run `npm install`, then `npx expo install --check`. If package compatibility is reported, run `npx expo install expo-location expo-task-manager expo-notifications expo-device expo-constants`.
3. Run `npx eas-cli login` and `npx eas-cli init` to link the Expo/EAS project. Configure Android FCM and iOS APNs credentials for push delivery.
4. Use an EAS development build on a physical device for background location and push notification testing. Background tasks and push delivery cannot be fully validated in a browser or by Expo web preview.
5. Sign in using a driver account that has been approved in the web admin console.

## Included

- Supabase Auth sign-in and persistent session storage.
- Driver approval gate, online/offline availability, nearby request refresh, accept/decline, and checked trip-state transitions.
- Foreground GPS while online and Expo Task Manager background GPS only during an active trip; the driver must grant the operating system's background permission.
- Background location uploads use the authenticated `update_my_driver_location` RPC, which derives the driver identity from the session.
- Expo push-token registration in `device_push_tokens`, ride update notification listeners, and Android notification channel setup.
- Active-ride recovery and map.

## Important behavior

- Background tracking starts when the driver has an active ride (`accepted`, `arriving`, `arrived`, or `in_progress`) and stops when there is no active ride or the driver signs out. The app prevents sign-out during an active ride to avoid unexpectedly ending tracking.
- Operating systems can throttle background GPS, and a user can revoke permissions. Always display tracking status and test on real Android and iOS devices.
- Push delivery needs the `ride-push` Supabase Edge Function, a configured database webhook, an EAS project ID, and FCM/APNs credentials. See `../../PRODUCTION_FEATURES.md`.
- Never add Supabase service-role keys or payment provider secrets to this app.
