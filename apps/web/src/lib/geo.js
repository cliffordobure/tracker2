const EARTH_M = 6371000;

export function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Order stops for trip direction: morning home→school, evening school→homes */
export function orderedStopsForDirection(stops, direction) {
  const list = [...(stops || [])];
  const school = list.filter((s) => s.type === 'school').sort((a, b) => a.order - b.order);
  const homes = list.filter((s) => s.type !== 'school').sort((a, b) => a.order - b.order);
  const schoolOne = school.slice(0, 1);
  if (direction === 'to_home') return [...schoolOne, ...homes];
  return [...homes, ...schoolOne];
}

/** School + boarding/drop stops for kids on this trip (ignore leftover route stops). */
export function stopsForTripKids(stops, kids = []) {
  const homeIds = new Set(
    kids
      .map((k) => (typeof k.homeStopId === 'object' ? k.homeStopId?._id : k.homeStopId))
      .filter(Boolean)
      .map(String)
  );
  const list = stops || [];
  const school = list.filter((s) => s.type === 'school').sort((a, b) => a.order - b.order);
  const homes = list
    .filter((s) => s.type !== 'school' && homeIds.has(String(s._id)))
    .sort((a, b) => a.order - b.order);

  const deduped = [];
  for (const stop of homes) {
    const near = deduped.some((kept) => haversineMeters(kept.location, stop.location) < 35);
    if (!near) deduped.push(stop);
  }
  return [...(school[0] ? [school[0]] : []), ...deduped];
}

export function nextPendingStop(orderedStops, visitedStopIds = new Set()) {
  return orderedStops.find((s) => !visitedStopIds.has(s._id));
}

function kidHomeStopId(kid) {
  return String(kid?.homeStopId?._id || kid?.homeStopId || '');
}

function kidEventMatch(events, kidId, type) {
  const id = String(kidId?._id || kidId || '');
  return (events || []).some(
    (e) => String(e?.kidId?._id || e?.kidId || '') === id && e.type === type
  );
}

/**
 * Stops the driver still needs to visit (pickup/drop order), so the parent
 * map can draw a live Mapbox path from the bus through remaining stops.
 */
export function remainingServiceStops({ stops, direction, kids = [], events = [] }) {
  const ordered = orderedStopsForDirection(stops, direction);
  const kidList = kids || [];
  if (!ordered.length) return [];

  const isPicked = (kid) => kidEventMatch(events, kid._id || kid.id, 'picked_up');
  const isDropped = (kid) => kidEventMatch(events, kid._id || kid.id, 'dropped_off');

  if (direction === 'to_home') {
    const remaining = [];
    for (const stop of ordered) {
      if (stop.type === 'school') {
        // Still need school pickup if any kid is not picked up yet
        if (kidList.some((k) => !isPicked(k) && !isDropped(k))) remaining.push(stop);
        continue;
      }
      const atStop = kidList.filter((k) => kidHomeStopId(k) === String(stop._id));
      if (!atStop.length) continue;
      // Drop still needed if any child for this home is not dropped off
      if (atStop.some((k) => !isDropped(k))) remaining.push(stop);
    }
    return remaining;
  }

  // to_school: pick homes, then school
  const remaining = [];
  for (const stop of ordered) {
    if (stop.type === 'school') {
      if (kidList.some((k) => !isDropped(k))) remaining.push(stop);
      continue;
    }
    const atStop = kidList.filter((k) => kidHomeStopId(k) === String(stop._id));
    if (!atStop.length) continue;
    if (atStop.some((k) => !isPicked(k) && !isDropped(k))) remaining.push(stop);
  }
  return remaining;
}

/** Approx distance from a point to the nearest vertex on a [lng,lat][] polyline. */
export function distanceToRouteMeters(coordinates, location) {
  if (!coordinates?.length || !location) return Infinity;
  let best = Infinity;
  for (const [lng, lat] of coordinates) {
    const d = haversineMeters(location, { lat, lng });
    if (d < best) best = d;
  }
  return best;
}
