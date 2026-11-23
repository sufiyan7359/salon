# Deployment Guide

## Architecture

- **salon-backend**: NestJS + TypeORM + PostgreSQL + Socket.IO, built to `dist/` and run with plain `node`.
- **salon-frontend**: Angular, built to static files and served by nginx, which also reverse-proxies
  `/api/*` and `/socket.io/*` to the backend so the browser only ever talks to one origin.
- **postgres**: single Postgres instance. In dev this project uses a native Homebrew install; in
  production the provided compose file runs a `postgres:16-alpine` container with a named volume.

```
Browser ── https://your-domain ──> nginx (frontend container)
                                      ├── / static Angular files
                                      ├── /api/*      -> backend:3000
                                      └── /socket.io/* -> backend:3000 (websocket upgrade)
                                             │
                                             v
                                        postgres:5432
```

## Local development

See `salon-backend/.env.example` and the Phase 1 setup notes: Postgres runs natively (`brew services
start postgresql@17`), backend via `npm run start:dev`, frontend via `npm start`. This section covers
**production** deployment only.

## Database migrations

`synchronize` is only enabled when `NODE_ENV !== 'production'` (see `src/config/database.config.ts`) -
in dev the schema is kept in sync automatically, but **production requires running migrations
explicitly**. The initial schema migration (`src/database/migrations/*-InitialSchema.ts`) was generated
from every entity in the app and verified against a clean database (migrate up, then re-generate and
confirm the diff is empty).

Scripts (see `salon-backend/package.json`):

| Script | Use |
|---|---|
| `npm run migration:generate -- src/database/migrations/Name` | Generate a new migration from entity changes (dev, needs ts-node) |
| `npm run migration:run` | Run pending migrations (dev, needs ts-node) |
| `npm run migration:run:prod` | Run pending migrations from the **compiled** `dist/` output - no dev dependencies needed, safe to run inside the production image/container |

## Docker Compose (production)

1. Copy the env template and fill in real values:
   ```bash
   cp .env.prod.example .env
   ```
   Generate real JWT secrets (don't ship the placeholders):
   ```bash
   openssl rand -base64 48   # run twice, once for each of JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
   ```

2. Build and start everything:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env up -d --build
   ```

3. Run the initial migration (one-time, and again after any future migration is added):
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env run --rm backend npm run migration:run:prod
   ```

4. Visit `http://<host>:${HTTP_PORT:-80}`.

### What's intentionally out of scope here

- **TLS/HTTPS**: `nginx.conf` serves plain HTTP on port 80. Put this behind a TLS-terminating reverse
  proxy or load balancer (Caddy, Traefik, a cloud LB) for a real deployment - browsers will refuse
  geolocation/PWA install prompts and OTP-adjacent flows should not run over plain HTTP in production.
- **Real SMS delivery**: `OTP_PROVIDER=stub` logs OTP codes server-side instead of sending SMS (see
  Phase 2 notes). Wire up Twilio/MSG91 in `OtpService` before onboarding real customers.
- **Backups / HA**: the compose file runs a single Postgres container with a local volume - fine for a
  small single-salon deployment, not a substitute for real backups if this ever needs to survive host
  loss.
- **CI/CD**: no pipeline is set up; this doc describes the manual build/run/migrate steps.

### A note on verification

Docker itself isn't installed on the machine this project was built on, so the Dockerfiles/compose file
above have **not** been through an actual `docker build`/`docker compose up` locally - they follow
standard multi-stage patterns and the underlying build commands (`npm run build` for both packages,
`npm run migration:run:prod`) were verified directly, but please do a real build-and-run pass in an
environment with Docker before trusting this in production.
