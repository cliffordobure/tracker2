# SchoolKids Tracker — Mobile (Flutter)

One Uber/Bolt-style app for **parents**, **teachers**, and **drivers**.

- Maps: Mapbox (`navigation-day-v1` style)
- API: `https://tracker2-j8vr.onrender.com`
- Live updates: Socket.IO

## Run

```bash
cd apps/mobile
flutter pub get

# Pass Mapbox token via dart-define (do NOT commit the token)
flutter run --dart-define=MAPBOX_TOKEN=pk.your_mapbox_public_token
```

## Demo logins

Password for all: `password123`

| Role    | Email                         |
|---------|-------------------------------|
| Parent  | parent1@schooltracker.test    |
| Teacher | teacher@schooltracker.test    |
| Driver  | driver@schooltracker.test     |

## Role screens

- **Parent** — live bus map, road route, pickup/drop notifications
- **Teacher** — school-wide active buses + students list
- **Driver** — start morning/evening trip, GPS share, pick up / drop off, simulate along road

## Important: redeploy backend

Teacher routes (`/teacher/*`) were added after the first Render deploy.  
Redeploy the `server` folder to Render so teacher login works on the hosted API.

Parent and driver flows already match the existing hosted endpoints.

## Config

Edit `lib/config.dart` for API URL / Mapbox token.
