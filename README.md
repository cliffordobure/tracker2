# SchoolKids Tracker — Phase 1 (MERN Web)

Web platform for school transport tracking:

- **Admin** — schools, routes/stops, kids, parents, drivers
- **Driver** — start morning/evening trips, live GPS, pick up / drop off kids
- **Parent** — live Mapbox tracking + in-app notifications

Flutter mobile apps are planned for Phase 2 against the same API.

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
cp .env.example server/.env
# create apps/web/.env with:
# VITE_API_URL=http://localhost:4001
# VITE_MAPBOX_TOKEN=pk.your_token

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
3. School admin **Dispatch**: pick date / route / bus / driver — over-capacity routes split into sequenced trips.
4. Driver starts a dispatched trip (or an ad-hoc morning/evening run).
5. Parents get `trip_started` and can watch live; pickup/dropoff/complete notify parents.

If browser GPS is blocked, use **Simulate GPS** on the driver screen.

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
