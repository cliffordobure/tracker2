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
  if (direction === 'to_home') return [...school, ...homes];
  return [...homes, ...school];
}

export function nextPendingStop(orderedStops, visitedStopIds = new Set()) {
  return orderedStops.find((s) => !visitedStopIds.has(s._id));
}
