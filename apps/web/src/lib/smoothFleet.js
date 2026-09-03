import mapboxgl from 'mapbox-gl';
import { createBoltCarElement, setBoltCarHeading, setBoltCarLabel, setBoltCarDetail, setBoltCarSelected } from './mapMarkers';
import { connectSocket } from './socket';
import { createVehicleMotion } from './vehicleMotion';

export function tripPlate(trip) {
  const plate = String(trip?.busId?.plate || '').trim();
  if (plate) return plate;
  return trip?.busId?.label || trip?.tripCode || 'Bus';
}

export function tripDriverName(trip) {
  return String(trip?.driverId?.name || '').trim();
}

function fleetSpeedKmh(item, loc, target) {
  if (typeof item?.speedKmh === 'number' && Number.isFinite(item.speedKmh) && item.speedKmh >= 0) {
    return Math.round(item.speedKmh);
  }
  const mps = target?.speedMps ?? speedMpsFrom(loc, null);
  if (typeof mps === 'number' && Number.isFinite(mps) && mps >= 0) {
    return Math.round(mps * 3.6);
  }
  return null;
}

function fleetHoverDetail(trip, item, loc, target) {
  const plate = tripPlate(trip);
  const kmh = fleetSpeedKmh(item, loc, target);
  const speed = kmh != null ? `${kmh} km/h` : '';
  return [plate, speed].filter(Boolean).join(' · ');
}

export function normalizeMapPoint(value) {
  if (!value || typeof value !== 'object') return null;
  const lat = Number(value.lat ?? value.latitude ?? value.coordinates?.[1]);
  const lng = Number(value.lng ?? value.longitude ?? value.coordinates?.[0]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { ...value, lat, lng };
}

export function fleetVehicleKey(item) {
  const trip = item?.trip;
  const busId = trip?.busId?._id || trip?.busId;
  if (busId) return `bus:${busId}`;
  const driverId = trip?.driverId?._id || trip?.driverId;
  if (driverId) return `drv:${driverId}`;
  if (trip?._id) return `trip:${trip._id}`;
  return '';
}

function liveScore(item) {
  const trip = item?.trip;
  const loc = normalizeMapPoint(trip?.latestLocation);
  return (
    (trip?.status === 'active' ? 8 : 0) +
    (loc ? 4 : 0) +
    (trip?.startedAt ? 2 : 0) +
    (item?.lastGpsAt ? 1 : 0)
  );
}

/** One row per physical bus — keeps the active / GPS trip. */
export function dedupeLiveFleet(items) {
  const byKey = new Map();
  for (const item of items || []) {
    const key = fleetVehicleKey(item);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      continue;
    }
    const nextScore = liveScore(item);
    const prevScore = liveScore(prev);
    if (nextScore !== prevScore) {
      byKey.set(key, nextScore > prevScore ? item : prev);
      continue;
    }
    const nextAt = pingTime(item.lastGpsAt || item.trip?.latestLocation?.at || item.trip?.startedAt);
    const prevAt = pingTime(prev.lastGpsAt || prev.trip?.latestLocation?.at || prev.trip?.startedAt);
    byKey.set(key, nextAt >= prevAt ? item : prev);
  }
  return [...byKey.values()];
}

export function attachFleetPlates(items, fleetBuses) {
  if (!items?.length) return items || [];
  const byId = new Map();
  const byDriver = new Map();
  for (const bus of fleetBuses || []) {
    if (bus?._id) byId.set(String(bus._id), bus);
    const driverId = bus?.driver?.id || bus?.driver?._id || bus?.driverId;
    if (driverId) byDriver.set(String(driverId), bus);
  }
  return items.map((item) => {
    const trip = item.trip;
    if (!trip) return item;
    if (trip.busId?.plate) return item;
    const existingId = trip.busId?._id || trip.busId;
    const driverId = trip.driverId?._id || trip.driverId;
    const bus = (existingId && byId.get(String(existingId))) || (driverId && byDriver.get(String(driverId)));
    if (!bus) return item;
    return {
      ...item,
      trip: {
        ...trip,
        busId: {
          _id: bus._id,
          plate: bus.plate || '',
          label: bus.label || trip.busId?.label || '',
          seats: bus.seats ?? trip.busId?.seats,
        },
      },
    };
  });
}

export function busMapLocation(item) {
  const trip = item?.trip;
  return (
    normalizeMapPoint(trip?.latestLocation) ||
    normalizeMapPoint(trip?.startLocation) ||
    normalizeMapPoint(item?.schoolLocation) ||
    null
  );
}

function speedMpsFrom(loc, speedKmh) {
  if (typeof loc?.speed === 'number' && Number.isFinite(loc.speed) && loc.speed >= 0) {
    const mps = loc.speed > 70 ? loc.speed / 3.6 : loc.speed;
    return Math.min(50, Math.max(0, mps));
  }
  if (typeof speedKmh === 'number' && Number.isFinite(speedKmh) && speedKmh >= 0) {
    return Math.min(50, Math.max(0, speedKmh / 3.6));
  }
  return undefined;
}

function pingTime(value) {
  if (!value) return 0;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

function targetKeyForTrip(targets, tripId) {
  const id = String(tripId);
  if (targets.has(id)) return id;
  for (const [key, value] of targets) {
    if (value?.tripId === id) return key;
  }
  return id;
}

export function applyLocationPing(targets, payload) {
  const point = normalizeMapPoint(payload);
  if (!payload?.tripId || !point) return;
  const id = targetKeyForTrip(targets, payload.tripId);
  const prev = targets.get(id) || {};
  const at = pingTime(payload.at) || Date.now();
  if (prev.at && at < prev.at) return;
  targets.set(id, {
    ...prev,
    tripId: String(payload.tripId),
    lat: point.lat,
    lng: point.lng,
    heading: Number.isFinite(payload.heading) ? payload.heading : prev.heading,
    speedMps: speedMpsFrom(payload, null) ?? prev.speedMps,
    at,
  });
}

export function syncFleetVehicles({
  map,
  buses,
  markersRef,
  targetsRef,
  selectedId,
  onSelect,
  pulse = true,
  scale,
}) {
  if (!map) return [];
  const seen = new Set();
  const coords = [];

  for (const item of buses) {
    const trip = item.trip;
    const id = fleetVehicleKey(item);
    if (!id || !trip?._id) continue;
    const tripId = String(trip._id);
    const loc = busMapLocation(item);
    const pending = targetsRef.current.get(id) || targetsRef.current.get(tripId);
    const lat = loc?.lat ?? pending?.lat;
    const lng = loc?.lng ?? pending?.lng;
    if (!normalizeMapPoint({ lat, lng })) continue;
    if (pending && targetsRef.current.has(tripId) && id !== tripId) {
      targetsRef.current.delete(tripId);
    }
    seen.add(id);
    coords.push([lng, lat]);

    const plate = tripPlate(trip);
    const driverName = tripDriverName(trip) || plate;
    const selected = selectedId === tripId || selectedId === id;
    const speedMps = speedMpsFrom(loc || pending, item.speedKmh);
    const prev = targetsRef.current.get(id) || pending;
    const at = pingTime(loc?.at);
    const keepLive = prev && at && prev.at && at < prev.at;
    const nextTarget = {
      tripId,
      lat: keepLive ? prev.lat : lat,
      lng: keepLive ? prev.lng : lng,
      heading: keepLive
        ? prev.heading
        : Number.isFinite(loc?.heading)
          ? loc.heading
          : prev?.heading,
      speedMps: keepLive ? prev.speedMps : speedMps ?? prev?.speedMps,
      plate,
      selected,
      at: keepLive ? prev.at : at || prev?.at || 0,
    };
    targetsRef.current.set(id, nextTarget);
    const detail = fleetHoverDetail(trip, item, loc, nextTarget);

    let entry = markersRef.current.get(id);
    if (!entry) {
      const heading = loc?.heading ?? prev?.heading;
      const el = createBoltCarElement({ heading, selected, label: driverName, detail, pulse });
      if (scale) el.style.transform = `scale(${scale})`;
      if (onSelect) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelect(tripId);
        });
      }
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);
      const motion = createVehicleMotion();
      motion.onGps([], { lat, lng }, speedMps);
      if (Number.isFinite(heading)) motion.state.heading = heading;
      markersRef.current.set(id, { marker, motion, tripId, lastDetail: detail });
    } else {
      entry.tripId = tripId;
      const el = entry.marker.getElement();
      setBoltCarLabel(el, driverName);
      setBoltCarDetail(el, detail);
      setBoltCarSelected(el, selected);
      entry.lastDetail = detail;
    }
  }

  for (const [id, entry] of markersRef.current) {
    if (!seen.has(id)) {
      entry.marker.remove();
      markersRef.current.delete(id);
      targetsRef.current.delete(id);
    }
  }

  return coords;
}

export function startSmoothFleetLoop({
  mapRef,
  markersRef,
  targetsRef,
  selectedRef,
  followSelected = false,
}) {
  let lastTs = 0;
  let lastFollow = 0;
  let running = true;
  let raf = 0;

  const loop = (ts) => {
    if (!running) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    const map = mapRef.current;
    const selectedId = selectedRef?.current;

    for (const [id, entry] of markersRef.current) {
      const target = targetsRef.current.get(id);
      if (!target || target.lat == null || target.lng == null) continue;
      const raw = { lat: target.lat, lng: target.lng };
      entry.motion.onGps([], raw, target.speedMps);
      const pos = entry.motion.tick([], dt);
      if (!pos) continue;
      entry.marker.setLngLat([pos.lng, pos.lat]);
      const moving = (target.speedMps || 0) >= 1.2;
      const heading = moving
        ? entry.motion.state.heading || target.heading || 0
        : Number.isFinite(target.heading)
          ? target.heading
          : entry.motion.state.heading || 0;
      const el = entry.marker.getElement();
      setBoltCarHeading(el, heading);
      const kmh = Number.isFinite(target.speedMps) ? Math.round(target.speedMps * 3.6) : null;
      const detail = [target.plate, kmh != null ? `${kmh} km/h` : ''].filter(Boolean).join(' · ');
      if (detail && entry.lastDetail !== detail) {
        entry.lastDetail = detail;
        setBoltCarDetail(el, detail);
      }

      if (
        followSelected &&
        map &&
        selectedId === id &&
        Date.now() - lastFollow > 80
      ) {
        lastFollow = Date.now();
        try {
          map.stop();
        } catch (_) {}
        map.setCenter([pos.lng, pos.lat]);
      }
    }

    raf = requestAnimationFrame(loop);
  };

  raf = requestAnimationFrame(loop);
  return () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
  };
}

export function subscribeFleetLocations(tripIds, targetsRef) {
  const socket = connectSocket();
  if (!socket) return () => {};

  const ids = [...new Set((tripIds || []).filter(Boolean).map(String))];
  const joinAll = () => {
    ids.forEach((id) => socket.emit('trip:join', id));
  };
  const onPing = (payload) => applyLocationPing(targetsRef.current, payload);

  joinAll();
  socket.on('connect', joinAll);
  socket.on('location:update', onPing);

  return () => {
    ids.forEach((id) => socket.emit('trip:leave', id));
    socket.off('connect', joinAll);
    socket.off('location:update', onPing);
  };
}
