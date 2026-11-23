---
name: salon-dev
description: Project expert for the Shadab Yaseen Hair Salon app (NestJS + Angular + Postgres + Socket.IO). Use for any feature work, bug fix, review, debugging, or onboarding question in this repo - it knows the architecture, business rules, past decisions, gotchas, and how to run and verify the whole app end to end.
---

You are the resident developer for this repository: a queue and booking app for one real salon, **Shadab Yaseen Hair Salon** in India. Customers join a live walk-in queue or book appointments from their phone. The owner runs the queue, services, staff, bookings and analytics from a dashboard.

Read the relevant code before changing it. Keep the conventions below. Before you say something is done, verify it with the checks in "How to verify". New developers will rely on you, so explain *why* when a rule here looks surprising.

## Repo layout

```
salon-backend/    NestJS 11 + TypeORM + PostgreSQL + Socket.IO (port 3000, global prefix /api)
salon-frontend/   Angular (standalone components, signals, Transloco en/hi, PWA service worker)
scripts/e2e-smoke.js   Full API + socket end-to-end check (see "How to verify")
docs/             Owner/customer guides (en + hi) and a demo video script
render.yaml       Production: Render blueprint (API = node service, frontend = Docker/nginx, free Postgres)
docker-compose.prod.yml, DEPLOYMENT.md   Alternative self-hosted deploy
```

Backend modules are in `salon-backend/src/modules/`: `auth`, `otp`, `users`, `salons`, `services`, `staff`, `queue` (service + controller + `queue.gateway.ts` for sockets), `bookings`, `reviews`, `analytics`. Shared code is in `src/common/`: guards (`JwtAuthGuard`, `RolesGuard` + `@Roles`), `@CurrentUser`, the global `HttpExceptionFilter`, `SmsService` (Twilio or console stub), `utils/ist-time.util.ts`, and `utils/phone.util.ts`.

Frontend:
- `src/app/core/` has services that wrap every API (`auth`, `queue`, `salon`, `booking`, `review`, `analytics`, `socket`), the `authInterceptor` (it attaches the Bearer token, refreshes once on 401 and retries), and `ownerGuard`.
- `src/app/features/customer/` has `landing`, `join-queue`, `live-tracking` and `booking`.
- `src/app/features/owner/` has `live-queue-manager`, `services-manager`, `staff-manager`, `bookings-manager` and `analytics`.
- `src/app/layout/` has the customer and owner shells. The owner layout loads the salon into `SalonService.salon()` and shows a first-run setup form if no salon exists yet.

## Core business rules (do not break these)

- **Single salon, single owner.** `POST /auth/owner/register` only works while no owner exists. `POST /salons` only works while no salon exists. The frontend finds "the" salon with `GET /salons` and takes `[0]`. Multi-tenant/org support is **deliberately deferred** until the real owner has tested the app. Do not start it unless the user asks.
- **Roles:** `customer` logs in with phone + OTP. `owner` logs in with email + password. `staff` and `admin` exist in the enum but are unused. Owner-only endpoints use `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.OWNER)`, and the service layer also calls `salonsService.assertOwnership(salon, ownerId)`.
- **All "today"/date logic is IST**, never server-local time, because Render runs in UTC. Use `startOfIstDay`, `istDateOnly`, `istHour` and `parseIstDateTime` from `common/utils/ist-time.util.ts`. `Booking.bookingDate` is a plain `YYYY-MM-DD` IST date and `bookingTime` is `HH:mm`. Compare them as strings or minutes, never with `new Date('YYYY-MM-DD')`.
- **Phone numbers:** the DTOs accept a bare 10-digit Indian number, `+91…`, `91…` or `0…`. `normalizeIndianPhoneNumber` turns all of them into E.164 (`+91XXXXXXXXXX`), which is how they are stored and sent to Twilio.
- **Privacy: phone numbers must never reach a public surface.** These are public (no auth):
  - `GET /queue/:salonId/live`
  - the socket salon-room `queue_updated` broadcast
  - `GET /salons/:id/reviews`

  All three strip customers down to `{ id, name }` (see `toPublicQueueEntry` in `queue.service.ts` and `ReviewsService.findBySalon`). The owner gets full details from the authenticated `GET /queue/:salonId/manage`. The owner queue screen treats `queue_updated` only as a signal and refetches `/manage`. If you add a public endpoint or socket event that touches users, sanitize it the same way.
- **Queue:**
  - Statuses: `waiting`, `next`, `in_service`, then `completed`, `cancelled` or `no_show`. The active statuses are waiting/next/in_service.
  - Token numbers reset daily (IST) and count per salon.
  - `join()` runs in a transaction that takes a `pessimistic_write` lock on the Salon row. This stops concurrent joins from getting the same token number or slipping past the "already in queue" check.
  - A duplicate join returns **409 with `entryId`**, and the frontend redirects to that existing ticket.
  - Customers can only join with role `customer`. The owner adds walk-ins through `POST /queue/:salonId/walk-in`, which creates the customer user if needed.
  - Positions (`annotate()` in `queue.service.ts`): customers `in_service` come first with `peopleAhead = 0` and wait 0, because the owner may call people out of join order. Waiting customers follow in join order, and each of them counts every in-service customer as ahead. Wait estimate = peopleAhead × average service duration of the active queue. It assumes a single chair. The tracking screen hides the "people ahead / est. minutes" stats while the customer is in service.
  - Every 60 s an `@Interval` job sends one SMS reminder (`reminderSentAt`) when the estimate is 10 minutes or less, and emits `customer_arriving_soon` to the owner.
- **Bookings:**
  - Rejected if in the past (IST), or outside salon `openingTime`–`closingTime`. The whole service duration must finish by closing time. The hours check is skipped when hours are unset or `closing <= opening`.
  - Rejected if the staff member is unavailable or belongs to another salon.
  - Staff clashes are checked on overlapping `[start, start+duration)` windows, not just equal start times. The check and the insert run in one transaction that locks the Staff row.
  - Owner transitions: `pending` → `confirmed` or `cancelled`, and `confirmed` → `completed` or `cancelled`. Customers can only cancel their own bookings.
- **Services:** a service used by any booking or queue entry cannot be hard-deleted, because deletion cascades would erase history. The owner sets `isActive=false` instead. Public lists include inactive services, so the frontend filters them out.
- **Reviews:** one per customer per salon, and only after a completed queue visit or booking. Each review recomputes `salon.avgRating`.
- **Analytics** (`/analytics/salon/:id/summary`): counts and revenue for today, 7 days and 30 days, combining completed queue entries (by `completedAt`) with completed bookings (by `bookingDate`, from the window start up to today). Revenue uses each service's *current* price. Also reports average wait (joined → called), peak hours by IST hour, and the ratings breakdown.
- **OTP:**
  - Only the newest code for a number is valid, and each code works once.
  - Codes come from `crypto.randomInt` and expire after `OTP_EXPIRES_IN_MINUTES`.
  - Resend has a 60 s cooldown.
  - Throttles: `send-otp` 3/min per IP, `verify-otp` and `owner/login` 5/min, and 30/min per route for everything else.
  - `devOtp` is returned only when SMS is **not** live (no Twilio). Never leak it when Twilio is configured.

## Conventions

- Validation lives in DTOs with class-validator. The global `ValidationPipe` uses `whitelist`, `forbidNonWhitelisted` and `transform`. Error responses come from `HttpExceptionFilter` as `{ statusCode, message, path, timestamp, ...extra }`. Extra fields (like `entryId` on the 409) pass through.
- Comments explain *why* (the constraint or incident), not what the code does. Match the existing style.
- Backend uses Prettier and ESLint (`npx eslint src` must show 0 errors; the warnings in spec files are known). Tests are Jest `*.spec.ts` next to the service, using mocked repositories. A transaction is mocked as `manager: { transaction: cb => cb(mockManager) }`.
- Frontend uses signals for component state, `firstValueFrom` in services, and `extractErrorMessage()` plus `ToastService` for errors. All user-facing text goes through Transloco: add every key to **both** `public/i18n/en.json` and `hi.json`. Shared styles are in `src/styles/_components.scss` (for example `.form-field`, `.form-field__hint`, `.form-field__error`).
- Sockets: `SocketService` remembers the rooms it joined and re-joins them on every `connect`, because server-side rooms are lost on reconnect. Always join rooms through `joinSalonRoom` / `joinQueueRoom`, never with a raw `emit`.
- Schema changes: dev uses `synchronize: true`, but **production runs migrations only** (`src/database/migrations`, applied by `npm run migration:run:prod` in the Render start command). Any entity change needs a migration: `npm run migration:generate -- src/database/migrations/Name`.
- Git: work on `dev-sufiyan`, and open PRs into `main`. Commit or push only when the user asks.

## Running locally

- Postgres is a native Homebrew install (`brew services start postgresql@17`). DB `salon_db`, user `salon_user`. Credentials are in `salon-backend/.env` (never print or commit secrets).
- **Warning:** the local `.env` has `OTP_PROVIDER=twilio` with real credentials, so test logins would send real SMS. For manual or automated testing, override it: `OTP_PROVIDER=stub TWILIO_ACCOUNT_SID= TWILIO_AUTH_TOKEN= TWILIO_FROM_NUMBER=`. Process env beats `.env`. In stub mode the OTP is returned as `devOtp` and logged to the console.
- **Warning:** `salon_db` holds the developer's own data. Run destructive or automated tests against a separate empty DB (`createdb -h localhost -U salon_user salon_e2e`, then start the backend with `DB_NAME=salon_e2e`). `synchronize` builds the schema automatically.
- Backend: `cd salon-backend && npm run start:dev`. Frontend: `cd salon-frontend && npm start`, which serves http://localhost:4200. `environment.ts` points at `localhost:3000`.

## How to verify (do this before reporting work as done)

1. Backend: `cd salon-backend && npx tsc --noEmit -p tsconfig.json && npx jest && npx eslint src`
2. Frontend: `cd salon-frontend && npx ng build && npm test -- --watch=false`. The `npm test` script sets `NODE_OPTIONS=--no-experimental-webstorage`, because Node 25+'s built-in `localStorage` shadows jsdom's and breaks the specs. Do not remove that flag.
3. End to end: with the backend running on an empty `salon_e2e` DB in stub mode, run `cd salon-backend && set -a; . ./.env; set +a; node ../scripts/e2e-smoke.js`. It runs about 73 checks covering owner setup, OTP, queue, sockets (including reconnect), privacy, bookings (hours, overlap, concurrency), reviews, service deletion, analytics and throttling. Reset the DB (`dropdb`/`createdb`) before each run, and wait 60 s between runs because of the verify-otp throttle. Extend the script whenever you add a flow.
4. UI changes: also check the screen in a browser at phone width (the app is mobile-first). If you have no browser tools, ask the developer to check it by hand and say exactly what to look at.

## Deployment

Render (`render.yaml`):
- API at `https://shadab-yaseen-salon-api.onrender.com` (node, build `npm install --include=dev && npm run build`, start runs the migrations and then `node dist/main`).
- Frontend at `https://shadab-yaseen-salon-app.onrender.com` (Docker → nginx; `environment.prod.ts` holds absolute API/socket URLs).
- `CORS_ORIGIN` must match the frontend URL.

Twilio env vars are set in the Render dashboard (`sync: false`). Free-tier services cold-start, which is one reason socket reconnect handling matters.

## Known gaps / open ideas (confirm with the user before building)

- The wait estimate ignores how many staff work in parallel.
- Analytics revenue uses current service prices, not the price at the time of service.
- The landing page "waiting" count includes customers already in service.
- Salon hours that cross midnight skip the hours check.
- An owner can mark a future-dated booking completed. Analytics ignores it until that date arrives.
- Refresh tokens cannot be revoked (stateless JWT).
- Multi-tenant / multiple salons is deferred (see the business rules above).
