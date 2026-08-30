import { haversineMeters } from './geo';
import { nearestRouteIndex } from './directions';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function shortestAngleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function bearingDegrees(from, to) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function pathLength(route) {
  let total = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const [lng1, lat1] = route[i];
    const [lng2, lat2] = route[i + 1];
    total += haversineMeters({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
  }
  return total;
}

function pointAtDistance(route, metersAlong) {
  if (!route?.length) return null;
  if (route.length === 1 || metersAlong <= 0) {
    const [lng, lat] = route[0];
    return { lng, lat };
  }
  let remaining = metersAlong;
  for (let i = 0; i < route.length - 1; i += 1) {
    const [lng1, lat1] = route[i];
    const [lng2, lat2] = route[i + 1];
    const seg = haversineMeters({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
    if (seg < 0.01) continue;
    if (remaining <= seg) {
      const t = remaining / seg;
      return { lng: lerp(lng1, lng2, t), lat: lerp(lat1, lat2, t) };
    }
    remaining -= seg;
  }
  const [lng, lat] = route[route.length - 1];
  return { lng, lat };
}

function bearingAtDistance(route, metersAlong) {
  const a = pointAtDistance(route, metersAlong);
  const b = pointAtDistance(route, metersAlong + 8);
  if (!a || !b) return 0;
  return bearingDegrees(a, b);
}

function projectOntoRoute(route, point) {
  if (!route?.length) return null;
  if (route.length === 1) {
    const [lng, lat] = route[0];
    return {
      point: { lng, lat },
      distanceAlong: 0,
      distanceToRoute: haversineMeters(point, { lat, lng }),
      bearing: 0,
    };
  }
  let best = null;
  let prefix = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const [lng1, lat1] = route[i];
    const [lng2, lat2] = route[i + 1];
    const a = { lat: lat1, lng: lng1 };
    const b = { lat: lat2, lng: lng2 };
    const segLen = haversineMeters(a, b);
    if (segLen < 0.05) {
      prefix += segLen;
      continue;
    }
    const abx = lng2 - lng1;
    const aby = lat2 - lat1;
    const apx = point.lng - lng1;
    const apy = point.lat - lat1;
    const ab2 = abx * abx + aby * aby;
    let t = ab2 <= 0 ? 0 : (apx * abx + apy * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
    const cand = { lng: lng1 + abx * t, lat: lat1 + aby * t };
    const d = haversineMeters(point, cand);
    const along = prefix + segLen * t;
    const proj = {
      point: cand,
      distanceAlong: along,
      distanceToRoute: d,
      bearing: bearingDegrees(a, b),
    };
    if (!best || d < best.distanceToRoute) best = proj;
    prefix += segLen;
  }
  return best;
}

export function projectOntoRouteNear(route, point, preferAlong = 0) {
  if (!route?.length) return null;
  if (route.length === 1) return projectOntoRoute(route, point);

  const total = pathLength(route);
  const windowLo = Math.max(0, preferAlong - 40);
  const windowHi = Math.min(total, preferAlong + 140);

  let bestOverall = null;
  let bestInWindow = null;
  let prefix = 0;

  for (let i = 0; i < route.length - 1; i += 1) {
    const [lng1, lat1] = route[i];
    const [lng2, lat2] = route[i + 1];
    const a = { lat: lat1, lng: lng1 };
    const b = { lat: lat2, lng: lng2 };
    const segLen = haversineMeters(a, b);
    if (segLen < 0.05) {
      prefix += segLen;
      continue;
    }
    const abx = lng2 - lng1;
    const aby = lat2 - lat1;
    const apx = point.lng - lng1;
    const apy = point.lat - lat1;
    const ab2 = abx * abx + aby * aby;
    let t = ab2 <= 0 ? 0 : (apx * abx + apy * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
    const cand = { lng: lng1 + abx * t, lat: lat1 + aby * t };
    const d = haversineMeters(point, cand);
    const along = prefix + segLen * t;
    const proj = {
      point: cand,
      distanceAlong: along,
      distanceToRoute: d,
      bearing: bearingDegrees(a, b),
    };
    if (!bestOverall || d < bestOverall.distanceToRoute) bestOverall = proj;
    if (along >= windowLo && along <= windowHi) {
      if (!bestInWindow || d < bestInWindow.distanceToRoute) bestInWindow = proj;
    }
    prefix += segLen;
  }

  if (
    bestInWindow &&
    (!bestOverall || bestInWindow.distanceToRoute <= bestOverall.distanceToRoute + 16)
  ) {
    return bestInWindow;
  }
  return bestOverall;
}

const OFF_ROUTE_M = 28;
const COURSE_OFF_DEG = 42;

/** Bolt/Uber forward-only motion with fast turn / detour reroute. */
export function createVehicleMotion() {
  const state = {
    displayM: 0,
    targetM: 0,
    speedMps: 8,
    heading: 0,
    display: null,
    lastGpsAt: 0,
    lastRaw: null,
    routeId: 0,
    needsReroute: false,
    offRouteStreak: 0,
    behindStreak: 0,
    courseOffStreak: 0,
    courseOffTravelM: 0,
  };

  const hashRoute = (route) => {
    if (!route?.length) return 0;
    const a = route[0];
    const b = route[route.length - 1];
    return `${route.length}:${a[0].toFixed(5)},${a[1].toFixed(5)}:${b[0].toFixed(5)},${b[1].toFixed(5)}`;
  };

  const blendHeading = (desired, sharp = false) => {
    const d = shortestAngleDelta(state.heading, desired);
    if (Math.abs(d) < 2.5) return;
    const maxStep = sharp ? 55 : 40;
    const weight = sharp ? 0.55 : 0.42;
    state.heading =
      (state.heading + Math.max(-maxStep, Math.min(maxStep, d)) * weight + 360) % 360;
  };

  const snapToGps = (raw, route) => {
    state.lastRaw = raw;
    state.lastGpsAt = Date.now();
    if (route?.length >= 2) {
      const proj = projectOntoRoute(route, raw);
      if (proj && proj.distanceToRoute <= OFF_ROUTE_M * 1.6) {
        state.displayM = proj.distanceAlong;
        state.targetM = state.displayM;
        state.display = proj.point;
        state.heading = proj.bearing;
        state.needsReroute = true;
        return;
      }
    }
    state.display = raw;
    state.displayM = 0;
    state.targetM = 0;
    state.needsReroute = true;
  };

  return {
    state,
    setRoute(route, snapGps) {
      const id = hashRoute(route);
      if (id === state.routeId) return;
      state.routeId = id;
      if (!route?.length || route.length < 2) {
        state.displayM = 0;
        state.targetM = 0;
        if (snapGps) state.display = snapGps;
        state.needsReroute = false;
        return;
      }
      const anchor = snapGps || state.display || pointAtDistance(route, state.displayM);
      const proj = projectOntoRoute(route, anchor) || projectOntoRouteNear(route, anchor, 0);
      state.displayM = proj?.distanceAlong || 0;
      state.targetM = state.displayM;
      state.display = proj?.point || pointAtDistance(route, state.displayM);
      state.heading = proj?.bearing || bearingAtDistance(route, state.displayM);
      state.needsReroute = false;
      state.offRouteStreak = 0;
      state.behindStreak = 0;
      state.courseOffStreak = 0;
      state.courseOffTravelM = 0;
    },
    onGps(route, raw, gpsSpeedMps) {
      const now = Date.now();
      const movedFromLast = state.lastRaw ? haversineMeters(state.lastRaw, raw) : 999;

      if (!route?.length || route.length < 2) {
        if (!state.display) state.display = raw;
        const moved = state.lastRaw ? haversineMeters(state.lastRaw, raw) : 0;
        const dt = state.lastGpsAt ? (now - state.lastGpsAt) / 1000 : 0;
        if (moved > 0.5 && dt > 0.2 && dt < 10) {
          state.speedMps = state.speedMps * 0.55 + Math.max(1.5, Math.min(28, moved / dt)) * 0.45;
        }
        if (Number.isFinite(gpsSpeedMps) && gpsSpeedMps >= 0.8 && gpsSpeedMps <= 30) {
          state.speedMps = state.speedMps * 0.6 + gpsSpeedMps * 0.4;
        }
        if (!state.lastRaw || moved > 0.15) {
          state.lastRaw = raw;
          state.lastGpsAt = now;
        }
        state.needsReroute = true;
        return 'offRoute';
      }

      const total = pathLength(route);
      const nearEnd = state.displayM >= total - 20;
      const near = projectOntoRouteNear(route, raw, state.displayM);
      const global = projectOntoRoute(route, raw);
      const proj = near || global;
      if (!proj) {
        state.lastRaw = raw;
        return 'held';
      }

      const distToRoad = global?.distanceToRoute ?? proj.distanceToRoute;
      let courseDelta = 0;
      let courseOff = false;
      if (state.lastRaw && movedFromLast >= 7) {
        const travelBearing = bearingDegrees(state.lastRaw, raw);
        courseDelta = Math.abs(shortestAngleDelta(travelBearing, proj.bearing));
        courseOff = courseDelta >= COURSE_OFF_DEG;
      }

      const progressGain = proj.distanceAlong - state.displayM;
      const inefficient =
        movedFromLast >= 14 &&
        progressGain < movedFromLast * 0.35 &&
        (gpsSpeedMps || state.speedMps) > 1.5;

      const crossTrackOff =
        distToRoad > OFF_ROUTE_M ||
        (nearEnd && distToRoad > 22) ||
        (global &&
          near &&
          global.distanceAlong + 60 < state.displayM &&
          global.distanceToRoute + 8 < near.distanceToRoute);

      if (courseOff || inefficient || crossTrackOff) {
        state.offRouteStreak += 1;
        if (courseOff) {
          state.courseOffStreak += 1;
          state.courseOffTravelM += Math.max(0, Math.min(40, movedFromLast));
        }

        const turnConfirmed =
          state.courseOffStreak >= 2 ||
          state.courseOffTravelM >= 18 ||
          (courseDelta >= 55 && movedFromLast >= 8);
        const pathConfirmed =
          state.offRouteStreak >= 2 || distToRoad > 40 || inefficient || movedFromLast > 20;

        if (turnConfirmed || pathConfirmed) {
          const prevRaw = state.lastRaw;
          snapToGps(raw, route);
          state.needsReroute = true;
          state.offRouteStreak = 0;
          state.courseOffStreak = 0;
          state.courseOffTravelM = 0;
          state.lastRaw = raw;
          state.lastGpsAt = now;
          if (Number.isFinite(gpsSpeedMps) && gpsSpeedMps > 1) {
            state.speedMps = Math.max(1.5, Math.min(30, gpsSpeedMps));
          }
          if (prevRaw && movedFromLast >= 5) {
            state.heading = bearingDegrees(prevRaw, raw);
          }
          return 'offRoute';
        }
        state.lastRaw = raw;
        state.lastGpsAt = now;
        return 'held';
      }

      state.offRouteStreak = 0;
      state.courseOffStreak = 0;
      state.courseOffTravelM = 0;
      state.needsReroute = false;

      let m = proj.distanceAlong;
      if (m < state.displayM - 8) {
        state.behindStreak += 1;
        if (state.behindStreak >= 3 && distToRoad < 22) {
          snapToGps(raw, route);
          state.needsReroute = true;
          state.behindStreak = 0;
          state.lastRaw = raw;
          state.lastGpsAt = now;
          return 'offRoute';
        }
        state.lastRaw = raw;
        state.lastGpsAt = now;
        return 'held';
      }
      state.behindStreak = 0;

      if (m > state.displayM + 80) m = state.displayM + 45;
      if (
        m <= state.targetM + 0.5 &&
        movedFromLast > 4 &&
        (gpsSpeedMps || 0) > 1.2 &&
        courseDelta < 30
      ) {
        m = Math.min(total, state.displayM + Math.max(3, Math.min(18, movedFromLast)));
      }

      if (state.lastGpsAt && m > state.targetM) {
        const dt = (now - state.lastGpsAt) / 1000;
        if (dt > 0.2 && dt < 8) {
          const measured = Math.max(1.5, Math.min(30, (m - state.targetM) / dt));
          state.speedMps = state.speedMps * 0.55 + measured * 0.45;
        }
      }
      if (Number.isFinite(gpsSpeedMps) && gpsSpeedMps >= 1 && gpsSpeedMps <= 30) {
        state.speedMps = state.speedMps * 0.6 + gpsSpeedMps * 0.4;
      }

      if (m > state.targetM) state.targetM = m;
      state.lastRaw = raw;
      state.lastGpsAt = now;
      return 'advanced';
    },
    tick(route, dt) {
      if (dt <= 0) return state.display;

      if (!route?.length || route.length < 2 || state.needsReroute) {
        if (!state.lastRaw) return state.display;
        const from = state.display || state.lastRaw;
        const d = haversineMeters(from, state.lastRaw);
        if (d < 0.3) {
          state.display = state.lastRaw;
          return state.display;
        }
        const t = Math.max(0.12, Math.min(1, (state.speedMps * dt) / d));
        state.display = {
          lat: from.lat + (state.lastRaw.lat - from.lat) * t,
          lng: from.lng + (state.lastRaw.lng - from.lng) * t,
        };
        blendHeading(bearingDegrees(from, state.lastRaw), true);
        return state.display;
      }

      const total = pathLength(route);
      const gap = state.targetM - state.displayM;
      if (gap > 0.1) {
        const catchUp = Math.max(state.speedMps * 0.85, Math.min(state.speedMps * 2.8, gap / 0.85));
        state.displayM = Math.min(state.targetM, state.displayM + catchUp * dt);
      } else {
        const age = state.lastGpsAt ? (Date.now() - state.lastGpsAt) / 1000 : 99;
        if (age < 2 && state.speedMps > 1.2 && state.courseOffStreak === 0) {
          state.displayM += state.speedMps * 0.35 * dt;
          if (state.displayM > state.targetM) state.targetM = state.displayM;
        }
      }
      if (total > 0) state.displayM = Math.max(0, Math.min(total, state.displayM));
      state.display = pointAtDistance(route, state.displayM);
      blendHeading(bearingAtDistance(route, state.displayM), gap > 12);
      return state.display;
    },
    nearestIndex(route) {
      if (!state.display) return 0;
      return nearestRouteIndex(route, state.display);
    },
  };
}
