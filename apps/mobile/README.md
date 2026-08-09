# SchoolKids Tracker — Mobile (Flutter)

One Uber/Bolt-style app for **parents**, **teachers**, and **drivers**.

- Maps: Mapbox streets
- Live updates: Socket.IO + `POST /trips/:id/location`
- Parent tracking starts after the driver marks **Pick up** (kid on the bus)

## Run

```bash
cd apps/mobile
flutter pub get

# Hosted API (default) + Mapbox
flutter run --dart-define=MAPBOX_TOKEN=pk.your_mapbox_public_token

# Local API (Android emulator → host machine)
flutter run --dart-define=API_BASE=http://10.0.2.2:4001 --dart-define=MAPBOX_TOKEN=pk.your_mapbox_public_token

# Local API (physical phone on same Wi‑Fi — use your PC LAN IP)
flutter run --dart-define=API_BASE=http://192.168.x.x:4001 --dart-define=MAPBOX_TOKEN=pk.your_mapbox_public_token
```

## Live tracking flow

1. Driver starts a trip (dispatched or morning/evening) → phone GPS posts every move (+ 3s heartbeat).
2. Driver taps **Pick up** for a child → that parent can track.
3. Parent app auto-joins the trip and moves the bus marker from real `location:update` events.
4. **Demo drive 1 km** still posts the same location API (for demos without walking).

## Demo logins

Password for all: `password123`

| Role         | Email                            |
|--------------|----------------------------------|
| Parent       | parent1@schooltracker.test       |
| Teacher      | teacher@schooltracker.test       |
| Driver       | driver@schooltracker.test        |
| School admin | schooladmin@schooltracker.test   |

## Important: redeploy backend

Redeploy `server` to Render so hosted mobile builds get:
- role split / dispatch / buses
- location fan-out to parents of kids currently on the bus

Until then, point the app at your local API with `API_BASE`.
