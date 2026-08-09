# SchoolKids Tracker — Phase 1 (MERN Web)

Web platform for school transport tracking:

- **Admin** — schools, routes/stops, kids, parents, drivers
- **Driver** — start morning/evening trips, live GPS, pick up / drop off kids
- **Parent** — live Mapbox tracking + in-app notifications (+ optional Web Push / FCM)

Flutter mobile app lives in `apps/mobile` against the same API.

## Stack

- MongoDB + Express + React (Vite) + Node.js
- Socket.IO for live location
- Mapbox GL JS for maps

## Prerequisites

- Node.js 20+
- MongoDB running locally (default `mongodb://127.0.0.1:27017/school_kids_tracker`)
- A Mapbox public token

## Setup

```bash
# from repo root
npm install

# copy env files if needed
cp server/.env.example server/.env
# create apps/web/.env with:
# VITE_API_URL=http://localhost:4001
# VITE_MAPBOX_TOKEN=pk.your_token
# VITE_VAPID_PUBLIC_KEY=   # same as server VAPID_PUBLIC_KEY (optional)

# seed demo data
npm run seed

# run API + web
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:4001  

## Demo accounts

Password for all: `password123`

| Role         | Email                            |
|--------------|----------------------------------|
| Super admin  | admin@schooltracker.test         |
| School admin | schooladmin@schooltracker.test   |
| Driver       | driver@schooltracker.test        |
| Teacher      | teacher@schooltracker.test       |
| Parent       | parent1@schooltracker.test       |
| Parent       | parent2@schooltracker.test       |

If an existing DB still has `role: 'admin'`, the API migrates those users to `super_admin` on startup. Re-run `npm run seed` in `server/` to get the school admin + bus demo data.

## Core flow

1. Super admin creates schools and school admin accounts.
2. School admin sets school location, buses (with seats), routes, and onboards students (map boarding + parent password).
3. School admin creates **Trip schedules** → instances; drivers run today’s trips.
4. Driver starts a trip → parents get `trip_started` and can watch live after pickup.
5. Pickup / drop-off / complete / cancel / assign notify parents (in-app + push when configured).

Allow location access in the browser so the driver can share live GPS.

### Parent notifications & push

In-app notifications always work (Mongo + Socket.IO). Background push is optional:

| Channel | Config |
|---------|--------|
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` on server; optional `VITE_VAPID_PUBLIC_KEY` on web. Generate with `npx web-push generate-vapid-keys`. |
| FCM (Flutter) | `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS` on server; place `google-services.json` in `apps/mobile/android/app/` (see mobile README). |

Without these env vars, APIs and in-app alerts still succeed; push is skipped.

## Project layout

```
apps/web          React Vite frontend (admin / driver / parent)
apps/mobile       Flutter app (parent / teacher / driver) — Uber-style Mapbox UI
server            Express API + Socket.IO + Mongo models
packages/shared   Shared constants
```

## Mobile app

```bash
cd apps/mobile
flutter pub get
flutter run
```

Uses hosted API `https://tracker2-j8vr.onrender.com` and Mapbox.  
See [apps/mobile/README.md](apps/mobile/README.md). Redeploy backend to Render for teacher routes.

## API highlights

- `POST /auth/login`, `GET /auth/me`
- `/admin/*` school-scoped CRUD (buses, dispatch, kids/onboard, school-admins)
- `GET /driver/routes`, `GET /driver/trips/scheduled`
- `POST /trips`, `POST /trips/:id/start`, location / pickup / dropoff / complete
- `GET /parent/kids`, `/parent/trips/active`, `/parent/notifications`

Socket rooms: `user:{userId}`, `trip:{tripId}`  
Events: `location:update`, `trip:started`, `kid:picked_up`, `kid:dropped_off`, `trip:completed`, `notification:new`
