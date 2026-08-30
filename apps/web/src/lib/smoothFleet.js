import mapboxgl from 'mapbox-gl';
import { createBoltCarElement, setBoltCarHeading, setBoltCarLabel, setBoltCarSelected } from './mapMarkers';
import { connectSocket } from './socket';
import { createVehicleMotion } from './vehicleMotion';

export function tripPlate(trip) {
  const plate = String(trip?.busId?.plate || '').trim();
  if (plate) return plate;
  return trip?.busId?.label || trip?.tripCode || 'Bus';
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
  return trip?.latestLocation || trip?.startLocation || item?.schoolLocation || null;
}

function speedMpsFrom(loc, speedKmh) {
  if (typeof loc?.speed === 'number' && Number.isFinite(loc.speed) && loc.speed >= 0) {
    return loc.speed > 40 ? loc.speed / 3.6 : loc.speed;
  }
  if (typeof speedKmh === 'number' && Number.isFinite(speedKmh) && speedKmh >= 0) {
    return speedKmh / 3.6;
  }
  return undefined;
}

function pingTime(value) {
  if (!value) return 0;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

export function applyLocationPing(targets, payload) {
  if (!payload?.tripId || payload.lat == null || payload.lng == null) return;
  const id = String(payload.tripId);
  const prev = targets.get(id) || {};
  const at = pingTime(payload.at) || Date.now();
  if (prev.at && at < prev.at) return;
  targets.set(id, {
    ...prev,
    lat: payload.lat,
    lng: payload.lng,
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
    const loc = busMapLocation(item);
    if (loc?.lat == null || loc?.lng == null || !trip?._id) continue;
    const id = String(trip._id);
    seen.add(id);
    coords.push([loc.lng, loc.lat]);

    const plate = tripPlate(trip);
    const selected = selectedId === id;
    const speedMps = speedMpsFrom(loc, item.speedKmh);
    const prev = targetsRef.current.get(id);
    const at = pingTime(loc.at);
    const keepLive = prev && at && prev.at && at < prev.at;
    targetsRef.current.set(id, {
      lat: keepLive ? prev.lat : loc.lat,
      lng: keepLive ? prev.lng : loc.lng,
      heading: keepLive
        ? prev.heading
        : Number.isFinite(loc.heading)
          ? loc.heading
          : prev?.heading,
      speedMps: keepLive ? prev.speedMps : speedMps ?? prev?.speedMps,
      plate,
      selected,
      at: keepLive ? prev.at : at || prev?.at || 0,
    });

    let entry = markersRef.current.get(id);
    if (!entry) {
      const el = createBoltCarElement({ heading: loc.heading, selected, label: plate, pulse });
      if (scale) el.style.transform = `scale(${scale})`;
      if (onSelect) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelect(id);
        });
      }
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([loc.lng, loc.lat])
        .addTo(map);
      const motion = createVehicleMotion();
      motion.onGps([], { lat: loc.lat, lng: loc.lng }, speedMps);
      if (Number.isFinite(loc.heading)) motion.state.heading = loc.heading;
      markersRef.current.set(id, { marker, motion });
    } else {
      const el = entry.marker.getElement();
      setBoltCarLabel(el, plate);
      setBoltCarSelected(el, selected);
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
      setBoltCarHeading(entry.marker.getElement(), heading);

      if (
        followSelected &&
        map &&
        selectedId === id &&
        Date.now() - lastFollow > 450
      ) {
        lastFollow = Date.now();
        map.easeTo({
          center: [pos.lng, pos.lat],
          duration: 420,
          essential: true,
        });
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
