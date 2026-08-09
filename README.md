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

| Role   | Email                         |
|--------|-------------------------------|
| Admin  | admin@schooltracker.test      |
| Driver | driver@schooltracker.test     |
| Parent | parent1@schooltracker.test    |
| Parent | parent2@schooltracker.test    |

## Core flow

1. Admin manages schools/routes and assigns kids + drivers.
2. Driver signs in → **Start morning** (`to_school`) or **Start evening** (`to_home`).
3. Parents of kids on that route get a `trip_started` notification and can watch the driver on the map.
4. Driver marks each kid **Pick up** / **Drop off** → parents are notified.
5. Driver **Complete trip**.

If browser GPS is blocked, use **Simulate GPS** on the driver screen.

## Project layout

```
apps/web          React Vite frontend (admin / driver / parent)
server            Express API + Socket.IO + Mongo models
packages/shared   Shared constants
```

## API highlights

- `POST /auth/login`, `GET /auth/me`
- ` /admin/*` CRUD
- `GET /driver/routes`
- `POST /trips`, `POST /trips/:id/location`, pickup/dropoff/complete
- `GET /parent/kids`, `/parent/trips/active`, `/parent/notifications`

Socket rooms: `user:{userId}`, `trip:{tripId}`  
Events: `location:update`, `trip:started`, `kid:picked_up`, `kid:dropped_off`, `trip:completed`, `notification:new`
