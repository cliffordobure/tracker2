import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  distanceToRouteMeters,
  orderedStopsForDirection,
  remainingServiceStops,
} from '../lib/geo';
import { fetchRoadRoute, nearestRouteIndex } from '../lib/directions';
import { createBoltCarElement, setBoltCarHeading } from '../lib/mapMarkers';

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
const OFF_ROUTE_M = 80;
/** Don't hammer Mapbox Directions more often than this. */
const REROUTE_MIN_MS = 7000;

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
  const lastRerouteAtRef = useRef(0);
  const remainKeyRef = useRef('');
  const liveFetchingRef = useRef(false);
  const liveNavRef = useRef(liveNavigate);

  useEffect(() => {
    followRef.current = followDriver;
  }, [followDriver]);

  useEffect(() => {
    onRouteReadyRef.current = onRouteReady;
  }, [onRouteReady]);

  useEffect(() => {
    liveNavRef.current = liveNavigate;
  }, [liveNavigate]);

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

    if (onMapClick) {
      map.on('click', (e) => onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    }

    return () => {
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
      driverMarkerRef.current = null;
      stopMarkersRef.current = [];
      routeKeyRef.current = '';
      routeCoordsRef.current = [];
      hasZoomedToBusRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        const coordinates = await fetchRoadRoute(waypoints);
        if (cancelled || !mapRef.current) return;
        if (!coordinates?.length) return;

        remainKeyRef.current = remainKey;
        routeKeyRef.current = `live:${remainKey}`;
        lastRerouteAtRef.current = Date.now();
        routeCoordsRef.current = coordinates;
        onRouteReadyRef.current?.(coordinates);

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
    driverLocation,
    stops,
    direction,
    kids,
    events,
  ]);

  // Live driver marker (Bolt car) + optional progress on planned route
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!driverLocation?.lat || !driverLocation?.lng) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.remove();
        driverMarkerRef.current = null;
      }
      return;
    }

    const lngLat = [driverLocation.lng, driverLocation.lat];
    const heading = driverLocation.heading;

    const placeBus = () => {
      ensureLayers(map);

      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new mapboxgl.Marker({
          element: createBoltCarElement({ heading }),
          anchor: 'center',
        })
          .setLngLat(lngLat)
          .addTo(map);
      } else {
        driverMarkerRef.current.setLngLat(lngLat);
        setBoltCarHeading(driverMarkerRef.current.getElement(), heading);
      }

      const route = routeCoordsRef.current;
      if (route.length && !liveNavRef.current) {
        const idx = nearestRouteIndex(route, driverLocation);
        setLine(map, PROGRESS_SOURCE, route.slice(0, Math.max(idx + 1, 2)));
      }

      // Off-route while live: trigger a fresh fetch by clearing key after cooldown
      if (
        liveNavRef.current &&
        route.length &&
        distanceToRouteMeters(route, driverLocation) > OFF_ROUTE_M &&
        Date.now() - lastRerouteAtRef.current >= REROUTE_MIN_MS
      ) {
        routeKeyRef.current = 'live:stale';
      }

      if (!hasZoomedToBusRef.current) {
        hasZoomedToBusRef.current = true;
        map.flyTo({
          center: lngLat,
          zoom: BUS_ZOOM,
          speed: 1.15,
          curve: 1.25,
          essential: true,
        });
        return;
      }

      if (followRef.current) {
        map.easeTo({
          center: lngLat,
          zoom: Math.max(map.getZoom(), BUS_ZOOM - 0.4),
          duration: 650,
          essential: true,
        });
      }
    };

    if (map.isStyleLoaded()) placeBus();
    else map.once('load', placeBus);
  }, [driverLocation]);

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
