# Eazi's Ride — Production feature setup

This guide covers the new background location, push notifications, driver approval console, and Paystack card/Mobile Money checkout. Supabase Auth/Postgres remains the source of truth. The legacy `server/` folder is not used for these features.

## 0. Safety first

- Back up the existing Supabase project before migrations.
- Apply `supabase/schema.sql` for a fresh project, then `supabase/migrations/202610100002_production_features.sql` and `supabase/migrations/202610280001_admin_dashboard_security.sql`. For an existing original-schema project, apply migration `202610100001_driver_rides_security_tracking.sql` first if needed, then the two later migrations.
- Do not run the full schema and the same migrations blindly against a live database. Inspect migration history and apply each change once.
- Never put `SUPABASE_SERVICE_ROLE_KEY`, Paystack secret keys, webhook secrets, or signing secrets in `VITE_*` or `EXPO_PUBLIC_*` variables.
- Use Paystack test keys until test transactions and webhooks pass. Do not use production keys for local experiments.

## 1. Supabase database

In Supabase SQL Editor, apply the migrations in order. The production migration adds:

- `driver_applications` and `driver_review_audit` with row-level security.
- A private `driver-documents` Storage bucket and user/admin policies.
- `device_push_tokens` for Expo push tokens.
- Provider reference and verification metadata on `payments`, plus one pending electronic payment per ride.
- `submit_driver_application()` and the `card` option for `request_ride()`.

For an existing admin account, promote the correct profile only from the trusted SQL Editor after checking the account ID/email:

```sql
update public.profiles set role = 'admin', updated_at = now()
where email = 'YOUR_ADMIN_EMAIL';
```

Verify exactly one expected profile changed. Never expose this SQL as a public endpoint or let users self-select the admin role.

## 2. Web app and driver application

From the repository root, copy `.env.example` to `.env.local`, set the Supabase project URL and publishable key, then run `npm install` and `npm run dev`.

- A signed-in rider can open **Apply to Drive** from the home page or `/driver/apply`.
- Upload the driving licence and vehicle document to the private bucket. Accepted formats are JPG, PNG, and PDF, up to 10 MB each.
- The application remains pending until an admin reviews it.
- Admins open `/admin/drivers`; only profiles whose database role is `admin` can see application data. Review actions are performed by `admin-driver-review`, which verifies the JWT and role server-side and writes an audit row.
- The approval function intentionally refuses to approve an application without both document paths. Admins still need to verify the documents manually; this software does not establish that an uploaded document is genuine.

Deploy the admin function after linking the Supabase CLI to the correct project:

```bash
supabase functions deploy admin-driver-review
```

## 3. Background location (Android and iOS)

The Expo app requests foreground permission when going online and requests background permission only when a ride is active. A module-scope Expo Task Manager task uploads coordinates through the authenticated `update_my_driver_location` RPC. The active-trip flag is persisted locally; tracking stops when no active ride remains or the driver signs out.

1. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set the same Supabase URL/publishable key used by the web app.
2. From `apps/mobile`, run `npm install` and `npx expo install --check`. If Expo reports version mismatches, run `npx expo install expo-location expo-task-manager expo-notifications expo-device expo-constants` and commit the resulting lockfile.
3. Run `npx eas-cli login` and `npx eas-cli init`. This links the Expo project and adds the EAS project ID. Set `EXPO_PUBLIC_EAS_PROJECT_ID` in the local environment if your build environment does not inject it.
4. Create a development build (`npx eas-cli build --profile development --platform android` and the same command for `ios`) and install it on physical devices. Background location and push notification delivery cannot be verified fully in a browser or by static checks.
5. On Android, test the foreground-service notification, background permission flow, battery optimization behavior, screen lock, app switching, network loss, and resumption. On iOS, test the Always permission flow, location indicator, background mode, low-power behavior, and app suspension.
6. Test a trip while backgrounded and verify the passenger only sees the assigned driver's current location. Tracking is intended only for active rides, not all-day collection.

Expo/EAS push delivery also needs native project credentials: configure Android FCM credentials and Apple APNs credentials in the Expo project. `EXPO_PUBLIC_EAS_PROJECT_ID` is not a secret, but provider private keys are.

## 4. Push notifications

The mobile driver app registers its Expo push token in `device_push_tokens`. `ride-push` is designed for a Supabase Database Webhook on `public.rides` for INSERT and UPDATE events. It notifies approved, online drivers within 10 km of a new pickup and notifies stored participant tokens for later ride status changes. The message payload contains a ride ID/status, not the passenger's precise pickup address.

Deploy functions:

```bash
supabase functions deploy ride-push --no-verify-jwt
```

`ride-push` is deployed without Supabase JWT verification because Database Webhooks do not send a user JWT; it independently checks a high-entropy shared secret header. Generate a long random value and configure it as a function secret:

```bash
supabase secrets set RIDE_WEBHOOK_SECRET='REPLACE_WITH_LONG_RANDOM_SECRET' APP_ORIGINS='https://YOUR_RIDER_DOMAIN,https://YOUR_DRIVER_DOMAIN,https://YOUR_ADMIN_DOMAIN'
```

In Supabase Dashboard → Database → Webhooks, create a webhook on `public.rides` for INSERT and UPDATE. Set the URL to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/ride-push`, method POST, JSON payload with the record and old record, and add header `x-webhook-secret` with the exact `RIDE_WEBHOOK_SECRET` value. Protect the secret like a password. Confirm delivery logs show HTTP 200.

Push delivery is best-effort: the app still uses Supabase Realtime for live in-app updates. This ZIP registers native Expo push tokens from the driver app. The rider client in this repository is a web app; browser push while the browser is closed needs a separately configured PWA/Web Push service worker and VAPID credentials and is not claimed as implemented here.

## 5. Paystack checkout (GHS, card and Mobile Money)

The payment flow only starts after a ride is marked `completed`. The fare is read from the database, not accepted from the browser. The server initializes Paystack checkout, verifies amount and currency with Paystack, and stores the result in `payments`. The browser never receives the Paystack secret key. Amount/currency mismatches are quarantined as `review_required` instead of being reported as paid. The gateway hosts the card/MoMo form; this app does not collect PINs or card security codes.

1. Create/verify a Paystack merchant account with Ghana enabled and confirm your account can accept the desired Mobile Money networks and cards.
2. Set test credentials and callback URL as Supabase function secrets:

```bash
supabase secrets set PAYSTACK_SECRET_KEY='sk_test_REPLACE_ME' PAYMENT_CALLBACK_URL='https://YOUR_RIDER_DOMAIN/completed' APP_ORIGINS='https://YOUR_RIDER_DOMAIN,https://YOUR_DRIVER_DOMAIN,https://YOUR_ADMIN_DOMAIN'
```

3. Deploy the functions:

```bash
supabase functions deploy payment-initiate
supabase functions deploy payment-verify
supabase functions deploy payment-webhook --no-verify-jwt
```

4. In the Paystack Dashboard, set the webhook URL to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/payment-webhook`. Paystack's `x-paystack-signature` is checked using HMAC SHA-512, and successful events are re-verified against the Paystack API before the payment is marked successful.
5. Use the web app to complete a test ride with `Mobile Money` or `Bank card` selected. On the Completed page, initiate checkout, finish the provider's test payment, return to `/completed`, and confirm `payments.status = successful`, the GHS amount matches, and a receipt reference is shown.
6. Test failed, abandoned, repeated, delayed-webhook, and mismatched-amount scenarios before using live keys. Reconcile provider settlement reports against the database.

The code supports Paystack-hosted card and Mobile Money checkout, but live merchant availability and exact payment channels depend on Paystack's current Ghana account configuration. This ZIP does not implement driver payouts, automatic refunds, or a full finance/reconciliation dashboard.

## 6. Edge Function secrets and deployment checklist

Supabase normally injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into Edge Function environments. If your project uses different runtime defaults, confirm them in the deployed function logs; do not expose the service-role key to clients.

| Function | Authentication | Purpose |
|---|---|---|
| `admin-driver-review` | Supabase user JWT + server-side admin role check | Approve, reject, suspend, reinstate, audit and notify driver |
| `payment-initiate` | Supabase user JWT + ride ownership check | Initialize hosted Paystack checkout |
| `payment-verify` | Supabase user JWT + payment ownership check | Verify provider reference and persist status |
| `payment-webhook` | Paystack HMAC signature | Receive provider events and independently verify transactions |
| `ride-push` | High-entropy `x-webhook-secret` | Dispatch Expo push notifications for ride changes |

Before launch: set `APP_ORIGINS` to the exact comma-separated HTTPS origins for all browser portals (or use the legacy `APP_ORIGIN` for a single origin); use HTTPS; review function logs; test RLS using rider, approved driver, pending driver and admin accounts; confirm no secret appears in client bundles; and run all scenarios on actual Android and iOS devices.

## 7. Known limits that require external configuration or further work

- No real Supabase project, Paystack credentials, Expo EAS project, FCM/APNs credentials, or webhook URL was available during packaging, so external integrations cannot be live-verified from this workspace.
- iOS/Android background GPS behavior must be validated using EAS development builds and real phones; operating systems may throttle updates.
- The web rider app receives Realtime changes while open. Browser push for a closed web browser/PWA is not implemented in this ZIP.
- Push delivery is best-effort; notification receipts, scheduled retries, and dead-letter handling are not implemented.
- Driver document authenticity and regulatory checks remain a human/admin responsibility.
- Payment receipts show the provider reference/status, but driver payout processing, refunds, chargebacks, accounting exports, and settlement reconciliation still require implementation.
