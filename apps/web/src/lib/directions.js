const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Fetch a road-snapped driving route through waypoints [{lat,lng}, ...]
 * Returns { coordinates, durationSec, distanceM, legDurationsSec } or null.
 */
export async function fetchDrivingRoute(waypoints) {
  if (!TOKEN || TOKEN.includes('your_mapbox') || !waypoints || waypoints.length < 2) {
    return null;
  }

  // Deduplicate nearly-identical points (Directions rejects duplicates)
  const cleaned = [];
  for (const w of waypoints) {
    if (typeof w?.lat !== 'number' || typeof w?.lng !== 'number') continue;
    const prev = cleaned[cleaned.length - 1];
    if (prev && Math.abs(prev.lat - w.lat) < 1e-6 && Math.abs(prev.lng - w.lng) < 1e-6) {
      continue;
    }
    cleaned.push(w);
  }
  if (cleaned.length < 2) return null;

  const coords = cleaned.map((w) => `${w.lng},${w.lat}`).join(';');
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&steps=false&access_token=${TOKEN}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.code && data.code !== 'Ok') {
    console.warn('Mapbox Directions error:', data.code, data.message);
    return null;
  }
  const route = data.routes?.[0];
  if (!route?.geometry?.coordinates?.length) return null;

  return {
    coordinates: route.geometry.coordinates,
    durationSec: Number(route.duration) || 0,
    distanceM: Number(route.distance) || 0,
    legDurationsSec: (route.legs || []).map((l) => Number(l.duration) || 0),
  };
}

/** Back-compat: coordinates only. */
export async function fetchRoadRoute(waypoints) {
  const route = await fetchDrivingRoute(waypoints);
  return route?.coordinates || null;
}

export function formatEtaMinutes(durationSec) {
  if (!Number.isFinite(durationSec) || durationSec < 0) return null;
  const mins = Math.max(1, Math.round(durationSec / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Move along a [lng,lat][] polyline by roughly `stepMeters`. */
export function advanceAlongRoute(coordinates, fromIndex = 0, stepMeters = 120) {
  if (!coordinates?.length) return { index: 0, location: null };
  let idx = Math.min(Math.max(fromIndex, 0), coordinates.length - 1);
  let remaining = stepMeters;

  while (idx < coordinates.length - 1 && remaining > 0) {
    const [lng1, lat1] = coordinates[idx];
    const [lng2, lat2] = coordinates[idx + 1];
    const seg = haversineLngLat(lng1, lat1, lng2, lat2);
    if (seg <= remaining || seg < 1) {
      remaining -= seg;
      idx += 1;
      continue;
    }
    const t = remaining / seg;
    return {
      index: idx,
      location: {
        lng: lng1 + (lng2 - lng1) * t,
        lat: lat1 + (lat2 - lat1) * t,
      },
    };
  }

  const [lng, lat] = coordinates[idx];
  return { index: idx, location: { lng, lat } };
}

function haversineLngLat(lng1, lat1, lng2, lat2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestRouteIndex(coordinates, location) {
  if (!coordinates?.length || !location) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coordinates.length; i += 1) {
    const [lng, lat] = coordinates[i];
    const d = (lng - location.lng) ** 2 + (lat - location.lat) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
