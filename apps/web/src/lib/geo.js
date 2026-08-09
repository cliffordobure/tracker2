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
