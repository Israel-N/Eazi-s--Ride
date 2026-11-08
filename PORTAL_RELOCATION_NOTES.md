# Portal relocation notes

## Changes made

- Moved the driver application page to `apps/driver-web/src/pages/DriverApplication.jsx`.
- Updated the moved page's relative imports to use the driver app's own Supabase client, auth hook, and button component.
- Added the `/apply` route to the separate driver web app. Signed-in rider accounts can submit an application there; admin accounts are prevented from applying, and the driver dashboard remains role-restricted.
- Updated the driver login copy so riders know they can sign in and continue to the application form.
- Removed the rider app's old `/driver/apply`, `/driver`, and `/admin/drivers` routes and their imports. Removed the now-unused duplicate legacy rider-tree components `src/pages/DriverHome.jsx` and `src/pages/admin/AdminDrivers.jsx`; the separate driver and admin apps have their own versions.
- Updated the rider home page to open the separate driver/admin portals instead of routing into those pages inside the rider app.
- Added `VITE_DRIVER_APP_URL` and `VITE_ADMIN_APP_URL` to the root `.env.example`. They default to local development ports 5174 and 5175 in the rider home page; set them to the deployed HTTPS portal URLs for production.

## Admin dashboard file note

The uploaded archive did not contain `src/pages/AdminDashboard.tsx` or any `AdminDashboard.tsx` file. The archive already had a separate admin app under `apps/admin`, with `src/App.jsx`, `src/pages/Overview.jsx`, and `src/pages/Drivers.jsx` (among other pages). Those existing admin app files were preserved rather than inventing a replacement or moving a file that was not present.

## Verification

- Checked relative imports in the changed route, home, application, and login files; all resolved to existing files.
- Confirmed the old driver application path is gone and the new driver app path exists.
- Build verification could not be completed in this environment because npm package downloads failed with a DNS/network error (`EAI_AGAIN` from `registry.npmjs.org`). Run `npm ci` and `npm run build` in the root, `apps/admin`, and `apps/driver-web` on a machine with npm registry access.
