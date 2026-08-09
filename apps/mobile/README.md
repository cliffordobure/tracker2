# SchoolKids Tracker — Mobile (Flutter)

One Uber/Bolt-style app for **parents**, **teachers**, and **drivers**.

- Maps: Mapbox streets
- Live updates: Socket.IO + `POST /trips/:id/location`
- Parent tracking starts after the driver marks **Pick up** (kid on the bus)

## Mapbox token

The token is **not** stored in `lib/config.dart`. Pass it when you run or build:

```bash
--dart-define=MAPBOX_TOKEN=pk.your_mapbox_public_token
```

Or create a local (gitignored) file `apps/mobile/dart_defines.json`:

```json
{
  "MAPBOX_TOKEN": "pk.your_mapbox_public_token",
  "API_BASE": "https://tracker2-j8vr.onrender.com"
}
```

Copy from `dart_defines.json.example`.

## Run

```bash
cd apps/mobile
flutter pub get

# Hosted API (default) + Mapbox
flutter run --dart-define=MAPBOX_TOKEN=pk.your_mapbox_public_token

# Or with dart_defines.json
flutter run --dart-define-from-file=dart_defines.json
```

## Build APK (test on another phone)

```bash
cd apps/mobile

# Option A — pass token inline
flutter build apk --release --dart-define=MAPBOX_TOKEN=pk.your_mapbox_public_token

# Option B — use dart_defines.json
flutter build apk --release --dart-define-from-file=dart_defines.json
```

APK path:

`apps/mobile/build/app/outputs/flutter-apk/app-release.apk`

Install on the phone (enable “Install unknown apps”), then log in as driver / parent against Render.

## Parent notifications (FCM)

In-app inbox works without Firebase. For background push:

1. Create a Firebase project and Android app with package `com.schoolkids.school_kids_tracker`.
2. Download `google-services.json` into `apps/mobile/android/app/` (see `google-services.json.example`).
3. Put the Firebase **service account JSON** on the API as `FIREBASE_SERVICE_ACCOUNT_JSON` (string) or `GOOGLE_APPLICATION_CREDENTIALS` (file path).
4. Rebuild the app. On parent login the app registers an FCM token via `POST /parent/device-tokens`.

iOS: add `GoogleService-Info.plist` and enable Push Notifications / Background Modes in Xcode when you ship iOS.

## Live tracking flow

1. Driver starts a trip (dispatched or morning/evening) → phone GPS posts every move (+ 3s heartbeat).
2. Driver taps **Pick up** for a child → that parent can track.
3. Parent app auto-joins the trip and moves the bus marker from real `location:update` events.

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
