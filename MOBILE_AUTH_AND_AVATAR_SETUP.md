# Eazi mobile authentication and rider profile photo setup

This update changes the mobile app source only. It does not deploy code or change the live Supabase project.

## 1. Install the Rider image picker dependency

Open PowerShell in the Rider app folder and run:

```powershell
cd "C:\Users\USER\OneDrive\Desktop\Ridefast v2.01\apps\rider-mobile"
npx expo install expo-image-picker
```

This selects the version compatible with the Expo SDK in this app and refreshes `package-lock.json`.

## 2. Supabase email OTP template

The apps use Supabase Auth's six-digit email signup code through `verifyOtp({ type: 'signup' })`.

In Supabase Dashboard, enable email confirmations under **Authentication → Providers → Email** (the exact toggle label can vary), then open **Authentication → Email Templates → Confirm signup** and configure the message to display the OTP token, for example:

```html
<h2>Confirm your Eazi account</h2>
<p>Your verification code is: <strong>{{ .Token }}</strong></p>
<p>Enter this code in the Eazi app to complete registration.</p>
```

Do not use a confirmation-link-only template for this OTP screen. Check the configured email provider and allowed auth settings before testing. Existing email/password login remains available.

## 3. Supabase phone OTP

In Supabase Dashboard, open **Authentication → Providers → Phone**:

- Enable Phone provider.
- Configure a supported SMS provider and its credentials.
- Confirm the sender/template and OTP expiry settings.
- Test delivery to a Ghanaian number in international format, such as `+233...`.

SMS provider charges may apply. No SMS provider was configured or tested by this source-code update.

## 4. Rider avatar storage migration

Review `supabase/migrations/202611230001_rider_avatars.sql`. It creates a public-read `avatars` bucket with a 5 MB limit and restricts uploads, updates and deletes to the signed-in user's own UUID folder. Public bucket images can be viewed by anyone who has the image URL.

Apply this migration only after you approve it and have a database backup. The app expects the bucket name `avatars` and stores its public URL in `public.profiles.avatar_url` (the column already exists in the supplied schema).

## 5. Driver onboarding behavior

New Driver app signups are created by the existing Supabase trigger as `role = 'rider'`. The app then lets the user submit a row to the existing `driver_applications` table. It does not set `role = 'driver'`, create a `driver_profiles` row, or approve itself. Your existing admin review workflow must approve the application; the supplied production migration's review function is responsible for granting driver access.

## 6. Location suggestions

Rider search now requests up to six results restricted to Ghana using the existing OpenStreetMap Nominatim service. Searches are explicit button actions, not per-keystroke autocomplete, and are throttled to at most one request per second within the app. Nominatim's public service has usage limits and is not a guaranteed production autocomplete service. For a high-volume commercial launch, use a hosted geocoding/Places provider with an appropriate usage plan and key rather than depending on the public endpoint.

## 7. Before building

After installing dependencies and reviewing the Supabase configuration, run:

```powershell
npx expo-doctor
npx expo start --clear
```

Run those commands separately inside `apps/mobile` and `apps/rider-mobile`. Test email OTP, SMS OTP, driver application submission and admin approval, rider avatar upload, and location selection on a real device. Do not build or deploy until these checks pass.
