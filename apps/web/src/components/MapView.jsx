import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  distanceToRouteMeters,
  orderedStopsForDirection,
  remainingServiceStops,
} from '../lib/geo';
import { fetchDrivingRoute, fetchRoadRoute, nearestRouteIndex } from '../lib/directions';
import { createBoltCarElement, setBoltCarHeading } from '../lib/mapMarkers';
import { createVehicleMotion } from '../lib/vehicleMotion';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const ROUTE_SOURCE = 'trip-route';
const ROUTE_LAYER = 'trip-route-line';
const ROUTE_GLOW = 'trip-route-glow';
const PROGRESS_SOURCE = 'trip-progress';
const PROGRESS_LAYER = 'trip-progress-line';
const BUS_ZOOM = 15.2;
const ROUTE_BLUE = '#1d4ed8';
const ROUTE_BLUE_SOFT = '#93c5fd';
const PROGRESS_BLUE = '#1e3a8a';
/** Reroute when driver is farther than this from the drawn path. */
const OFF_ROUTE_M = 28;
/** Don't hammer Mapbox Directions more often than this. */
const REROUTE_MIN_MS = 1200;

function createStopElement(stop, { isNext, index }) {
  const el = document.createElement('div');
  el.className = `marker-stop ${stop.type === 'school' ? 'is-school' : 'is-home'} ${
    isNext ? 'is-next' : ''
  }`;
  el.innerHTML = `
    <span class="marker-stop-pin"><span class="marker-stop-num">${index + 1}</span></span>
    <span class="marker-stop-label">${stop.name}</span>
  `;
  el.title = stop.name;
  return el;
}

function ensureLayers(map) {
  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, {
      type: 'geojson',
      data: emptyLine(),
    });
    map.addLayer({
      id: ROUTE_GLOW,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ROUTE_BLUE_SOFT,
        'line-width': 14,
        'line-opacity': 0.45,
      },
    });
    map.addLayer({
      id: ROUTE_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ROUTE_BLUE,
        'line-width': 6,
        'line-opacity': 0.95,
      },
    });
  }

  if (!map.getSource(PROGRESS_SOURCE)) {
    map.addSource(PROGRESS_SOURCE, {
      type: 'geojson',
      data: emptyLine(),
    });
    map.addLayer({
      id: PROGRESS_LAYER,
      type: 'line',
      source: PROGRESS_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': PROGRESS_BLUE,
        'line-width': 6,
        'line-opacity': 0.95,
      },
    });
  }
}

function emptyLine() {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [] },
  };
}

function setLine(map, sourceId, coordinates) {
  const source = map.getSource(sourceId);
  if (!source) return;
  source.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coordinates || [] },
  });
}

function fitToCoordinates(map, coordinates, padding = 70) {
  if (!coordinates?.length) return;
  const bounds = new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]);
  coordinates.forEach((c) => bounds.extend(c));
  map.fitBounds(bounds, { padding, maxZoom: 14.5, duration: 900 });
}

export default function MapView({
  center = { lat: -1.3965, lng: 36.7542 },
  zoom = 13,
  driverLocation,
  stops = [],
  direction,
  nextStopId,
  showRoute = false,
  /** When true + driverLocation: blue line from bus through remaining pick/drop stops; reroutes if off-path. */
  liveNavigate = false,
  events = [],
  kids = [],
  followDriver = true,
  interactive = true,
  onMapClick,
  onRouteReady,
  /** Called with { durationSec, distanceM } when a live/planned route is fetched. */
  onRouteEta,
  /** Fly the camera here (search result). { lat, lng, zoom?, at? } */
  focus,
  className = 'map-canvas',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapReadyRef = useRef(false);
  const driverMarkerRef = useRef(null);
  const stopMarkersRef = useRef([]);
  const routeKeyRef = useRef('');
  const routeCoordsRef = useRef([]);
  const hasZoomedToBusRef = useRef(false);
  const followRef = useRef(followDriver);
  const onRouteReadyRef = useRef(onRouteReady);
  const onRouteEtaRef = useRef(onRouteEta);
  const onMapClickRef = useRef(onMapClick);
  const lastRerouteAtRef = useRef(0);
  const remainKeyRef = useRef('');
  const liveFetchingRef = useRef(false);
  const liveNavRef = useRef(liveNavigate);
  const displayBusRef = useRef(null);
  const animRafRef = useRef(0);
  const motionRef = useRef(createVehicleMotion());
  const latestDriverRef = useRef(driverLocation);
  const lastFollowMoveRef = useRef(0);

  useEffect(() => {
    followRef.current = followDriver;
  }, [followDriver]);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    onRouteReadyRef.current = onRouteReady;
  }, [onRouteReady]);

  useEffect(() => {
    onRouteEtaRef.current = onRouteEta;
  }, [onRouteEta]);

  useEffect(() => {
    liveNavRef.current = liveNavigate;
  }, [liveNavigate]);

  useEffect(() => {
    latestDriverRef.current = driverLocation;
  }, [driverLocation]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!TOKEN || TOKEN.includes('your_mapbox')) return;

    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [center.lng, center.lat],
      zoom,
      interactive,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      mapReadyRef.current = true;
      ensureLayers(map);
    });

    map.on('click', (e) => {
      onMapClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    return () => {
      if (animRafRef.current) cancelAnimationFrame(animRafRef.current);
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
      driverMarkerRef.current = null;
      stopMarkersRef.current = [];
      routeKeyRef.current = '';
      routeCoordsRef.current = [];
      hasZoomedToBusRef.current = false;
      displayBusRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || focus?.lat == null || focus?.lng == null) return undefined;
    const run = () => {
      map.flyTo({
        center: [Number(focus.lng), Number(focus.lat)],
        zoom: focus.zoom ?? 16.2,
        essential: true,
        duration: 1100,
      });
    };
    if (mapReadyRef.current || map.isStyleLoaded()) run();
    else map.once('load', run);
    return undefined;
  }, [focus?.lat, focus?.lng, focus?.zoom, focus?.at]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyStops = () => {
      stopMarkersRef.current.forEach((m) => m.remove());
      const ordered = showRoute ? orderedStopsForDirection(stops, direction) : stops;
      stopMarkersRef.current = ordered.map((stop, index) => {
        const el = createStopElement(stop, {
          isNext: nextStopId && stop._id === nextStopId,
          index,
        });
        return new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([stop.location.lng, stop.location.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 22 }).setHTML(
              `<strong>${stop.name}</strong><br/><span>${
                stop.type === 'school' ? 'School stop' : 'Pickup / drop-off'
              }</span>`
            )
          )
          .addTo(map);
      });
    };

    if (mapReadyRef.current || map.isStyleLoaded()) applyStops();
    else map.once('load', applyStops);
  }, [stops, direction, nextStopId, showRoute]);

  // Planned stop-to-stop route (before live bus nav takes over)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showRoute || !stops.length) return;
    if (liveNavigate && driverLocation?.lat != null) return;

    const ordered = orderedStopsForDirection(stops, direction);
    const key = `plan:${direction || 'none'}:${ordered.map((s) => s._id).join(',')}`;
    if (routeKeyRef.current === key) return;
    routeKeyRef.current = key;
    hasZoomedToBusRef.current = false;
    remainKeyRef.current = '';

    let cancelled = false;

    const draw = async () => {
      const waypoints = ordered.map((s) => s.location);
      const coordinates = await fetchRoadRoute(waypoints);
      if (cancelled || !mapRef.current) return;

      if (!coordinates?.length) {
        console.warn('Could not load road route from Mapbox Directions');
        return;
      }

      routeCoordsRef.current = coordinates;
      onRouteReadyRef.current?.(coordinates);

      const apply = () => {
        ensureLayers(map);
        setLine(map, ROUTE_SOURCE, coordinates);
        setLine(map, PROGRESS_SOURCE, []);
        fitToCoordinates(map, coordinates);
      };

      if (map.isStyleLoaded()) apply();
      else map.once('load', apply);
    };

    draw();
    return () => {
      cancelled = true;
    };
  }, [stops, direction, showRoute, liveNavigate, driverLocation?.lat, driverLocation?.lng]);

  // Live Mapbox path: driver → remaining pick/drop stops (reroutes when off-path)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !liveNavigate || !showRoute) return;
    if (!driverLocation?.lat || !driverLocation?.lng) return;

    const remaining = remainingServiceStops({
      stops,
      direction,
      kids,
      events,
    });
    const remainKey = remaining.map((s) => s._id).join(',');
    const offRoute =
      routeCoordsRef.current.length > 0 &&
      distanceToRouteMeters(routeCoordsRef.current, driverLocation) > OFF_ROUTE_M;
    const stopsChanged = remainKey !== remainKeyRef.current;
    const now = Date.now();
    const cooledDown = now - lastRerouteAtRef.current >= REROUTE_MIN_MS;
    const needFetch =
      !routeCoordsRef.current.length ||
      stopsChanged ||
      (offRoute && cooledDown) ||
      !String(routeKeyRef.current).startsWith('live:');

    if (!needFetch || liveFetchingRef.current) return;

    let cancelled = false;
    liveFetchingRef.current = true;

    const drawLive = async () => {
      try {
        if (!remaining.length) {
          remainKeyRef.current = remainKey;
          routeKeyRef.current = 'live:done';
          routeCoordsRef.current = [];
          const clear = () => {
            ensureLayers(map);
            setLine(map, ROUTE_SOURCE, []);
            setLine(map, PROGRESS_SOURCE, []);
          };
          if (map.isStyleLoaded()) clear();
          else map.once('load', clear);
          return;
        }

        const waypoints = [
          { lat: driverLocation.lat, lng: driverLocation.lng },
          ...remaining.map((s) => s.location).filter((l) => l?.lat != null),
        ];
        const route = await fetchDrivingRoute(waypoints);
        if (cancelled || !mapRef.current) return;
        const coordinates = route?.coordinates;
        if (!coordinates?.length) return;

        remainKeyRef.current = remainKey;
        routeKeyRef.current = `live:${remainKey}`;
        lastRerouteAtRef.current = Date.now();
        routeCoordsRef.current = coordinates;
        onRouteReadyRef.current?.(coordinates);
        onRouteEtaRef.current?.({
          durationSec: route.durationSec,
          distanceM: route.distanceM,
        });

        const apply = () => {
          ensureLayers(map);
          setLine(map, ROUTE_SOURCE, coordinates);
          // Live path is already "remaining" — no separate progress strip
          setLine(map, PROGRESS_SOURCE, []);
        };
        if (map.isStyleLoaded()) apply();
        else map.once('load', apply);
      } finally {
        liveFetchingRef.current = false;
      }
    };

    drawLive();
    return () => {
      cancelled = true;
      liveFetchingRef.current = false;
    };
  }, [
    liveNavigate,
    showRoute,
    // Intentionally NOT full driverLocation — every GPS ping was cancelling fetches
    driverLocation?.lat,
    driverLocation?.lng,
    stops,
    direction,
    kids,
    events,
  ]);

  // Bolt/Uber continuous forward motion along Mapbox road
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    let lastTs = 0;
    let running = true;
    const motion = motionRef.current;

    const ensureMarker = (pos, heading) => {
      ensureLayers(map);
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new mapboxgl.Marker({
          element: createBoltCarElement({ heading: heading || 0 }),
          anchor: 'center',
        })
          .setLngLat([pos.lng, pos.lat])
          .addTo(map);
      }
    };

    const loop = (ts) => {
      if (!running) return;
      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;

      const raw = latestDriverRef.current;
      const route = routeCoordsRef.current;

      if (!raw?.lat || !raw?.lng) {
        animRafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (route.length >= 2) {
        motion.setRoute(route, { lat: raw.lat, lng: raw.lng });
        const feed = motion.onGps(route, { lat: raw.lat, lng: raw.lng }, raw.speed);
        const pos = motion.tick(route, dt);
        if (pos) {
          displayBusRef.current = pos;
          ensureMarker(pos, motion.state.heading);
          driverMarkerRef.current.setLngLat([pos.lng, pos.lat]);
          setBoltCarHeading(driverMarkerRef.current.getElement(), motion.state.heading);

          if (!liveNavRef.current) {
            const idx = motion.nearestIndex(route);
            setLine(map, PROGRESS_SOURCE, route.slice(0, Math.max(idx + 1, 2)));
          }
          if (
            liveNavRef.current &&
            (feed === 'offRoute' ||
              motion.state.needsReroute ||
              distanceToRouteMeters(route, raw) > OFF_ROUTE_M) &&
            Date.now() - lastRerouteAtRef.current >= REROUTE_MIN_MS
          ) {
            routeKeyRef.current = 'live:stale';
            lastRerouteAtRef.current = Date.now() - REROUTE_MIN_MS; // allow immediate fetch
          }

          if (!hasZoomedToBusRef.current) {
            hasZoomedToBusRef.current = true;
            map.flyTo({
              center: [pos.lng, pos.lat],
              zoom: BUS_ZOOM,
              speed: 1.15,
              curve: 1.25,
              essential: true,
            });
          } else if (followRef.current && Date.now() - lastFollowMoveRef.current > 400) {
            lastFollowMoveRef.current = Date.now();
            map.easeTo({
              center: [pos.lng, pos.lat],
              zoom: Math.max(map.getZoom(), BUS_ZOOM - 0.4),
              duration: 450,
              essential: true,
            });
          }
        }
      } else {
        // No route yet — soft follow raw GPS without teleport spin
        const prev = displayBusRef.current || { lat: raw.lat, lng: raw.lng };
        const pos = {
          lat: prev.lat + (raw.lat - prev.lat) * 0.12,
          lng: prev.lng + (raw.lng - prev.lng) * 0.12,
        };
        displayBusRef.current = pos;
        ensureMarker(pos, motion.state.heading || raw.heading || 0);
        driverMarkerRef.current.setLngLat([pos.lng, pos.lat]);
        if (!hasZoomedToBusRef.current) {
          hasZoomedToBusRef.current = true;
          map.flyTo({ center: [pos.lng, pos.lat], zoom: BUS_ZOOM, essential: true });
        }
      }

      animRafRef.current = requestAnimationFrame(loop);
    };

    const start = () => {
      if (animRafRef.current) cancelAnimationFrame(animRafRef.current);
      animRafRef.current = requestAnimationFrame(loop);
    };
    if (map.isStyleLoaded()) start();
    else map.once('load', start);

    return () => {
      running = false;
      if (animRafRef.current) cancelAnimationFrame(animRafRef.current);
    };
  }, []);

  if (!TOKEN || TOKEN.includes('your_mapbox')) {
    return (
      <div className={`${className} map-fallback`}>
        <p>
          Set <code>VITE_MAPBOX_TOKEN</code> in <code>apps/web/.env</code> to enable the map.
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className={className} />;
}
