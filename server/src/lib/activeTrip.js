import { Trip } from '../models/index.js';
import { formatDateKey } from './clock.js';

const RECENT_PING_MS = 2 * 60 * 60 * 1000;

export function serviceDayKey(trip) {
  return formatDateKey(trip?.serviceDate || trip?.scheduledFor || trip?.startedAt || trip?.createdAt);
}

function refId(value) {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

/** Same schedule, or the same route and period, on the same service day. */
export function sameDriverRun(a, b) {
  if (!a || !b) return false;
  const dayA = serviceDayKey(a);
  const dayB = serviceDayKey(b);
  if (dayA && dayB && dayA !== dayB) return false;
  const scheduleA = refId(a.scheduleId);
  const scheduleB = refId(b.scheduleId);
  if (scheduleA && scheduleB && scheduleA === scheduleB) return true;
  const routeA = refId(a.routeId);
  const routeB = refId(b.routeId);
  if (!routeA || routeA !== routeB) return false;
  const periodA = a.period || (a.direction === 'to_home' ? 'evening' : 'morning');
  const periodB = b.period || (b.direction === 'to_home' ? 'evening' : 'morning');
  return periodA === periodB;
}

function stillOnTheRoad(trip, now = Date.now()) {
  const at = trip?.latestLocation?.at ? new Date(trip.latestLocation.at).getTime() : 0;
  return at > 0 && now - at < RECENT_PING_MS;
}

/**
 * A trip left active from a previous service day blocks every new start.
 * Close it when the bus is not still sending location.
 * Returns the active trips that should still block.
 */
export async function closeStaleActiveTrips(driverId, now = Date.now()) {
  const todayKey = formatDateKey(new Date(now));
  const active = await Trip.find({ driverId, status: 'active' });
  const still = [];
  for (const trip of active) {
    const startedKey = formatDateKey(trip.startedAt);
    const dayKey = serviceDayKey(trip);
    const fromToday = (startedKey && todayKey && startedKey >= todayKey) || (dayKey && todayKey && dayKey >= todayKey);
    if (fromToday || stillOnTheRoad(trip, now) || !dayKey) {
      still.push(trip);
      continue;
    }
    trip.status = 'completed';
    trip.endedAt = trip.endedAt || new Date(now);
    await trip.save();
  }
  return still;
}

/**
 * @returns {null | { resume: import('mongoose').Document } | { block: import('mongoose').Document }}
 * resume: the driver already has this same run active (duplicate card).
 * block: a different run is active.
 */
export async function activeConflict(driverId, target) {
  const still = await closeStaleActiveTrips(driverId);
  const other = still.find((trip) => !target?._id || String(trip._id) !== String(target._id));
  if (!other) return null;
  if (target && sameDriverRun(other, target)) return { resume: other };
  return { block: other };
}
