# Eazi's Ride v2.02 — Docker deployment (web apps)

This setup builds three independent frontend containers from the existing Vite apps:

| App | Local address | Container service |
|---|---|---|
| Rider | http://localhost:8080 | `rider` |
| Driver portal | http://localhost:8081 | `driver` |
| Admin dashboard | http://localhost:8082 | `admin` |

All three frontend apps are configured to use the same Supabase URL and publishable/anon key.

## Requirements

- Docker Desktop installed and running (Docker Compose v2)
- Supabase project URL
- Supabase publishable key (or legacy anon key)

## Start on Windows PowerShell

Run from the `Ridefast v2.01` repository root:

```powershell
Copy-Item .env.docker.example .env
notepad .env
```

Replace the two Supabase placeholders and save. Then:

```powershell
docker compose config
docker compose build
docker compose up -d
docker compose ps
```

Open the three local addresses in the table above.

## Common commands

```powershell
# Follow all logs
docker compose logs -f

# Follow one app
docker compose logs -f rider

# Stop and remove containers/networks (images remain)
docker compose down

# Rebuild after frontend source or VITE_* configuration changes
docker compose down
docker compose build --no-cache
docker compose up -d
```

Vite embeds `VITE_*` variables into the browser bundle at build time. Rebuild images after changing `.env`.

## Scope and important notes

- This Compose stack containerizes the three browser frontends only.
- Supabase remains an external managed backend; this does not start PostgreSQL/Supabase, apply migrations, or deploy Supabase Edge Functions.
- The `apps/mobile` Expo project remains outside this stack. Run it with Expo/EAS separately; a web container does not create an Android APK.
- The repository has a root Vite development proxy for `/api` to `localhost:5000`. This Nginx production config does not proxy `/api` to a backend container. If the application uses those API routes in production, configure the actual API host/reverse proxy before deployment. No backend container is defined here because this archive does not provide a standalone backend Docker build/package definition.
- Only the Supabase URL and public publishable/anon key may be exposed to the frontend. Never put `service_role`, database passwords, payment secrets, or other private credentials in `VITE_*` values.
- A successful image build does not prove that sign-in, RLS, ride booking, payment, maps, or realtime flows work. Test those against the configured Supabase project.

## Image names

Compose builds local images for the three services. You can inspect them with:

```powershell
docker image ls
```
