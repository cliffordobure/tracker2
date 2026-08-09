import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { api } from '../../lib/api';
import {
  createBoltCarElement,
  setBoltCarHeading,
  setBoltCarSelected,
} from '../../lib/mapMarkers';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function fmtTime(v) {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function tripLabel(t) {
  return t.busId?.label || t.busId?.plate || 'Bus';
}

export default function LiveTracking() {
  const [buses, setBuses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const containerRef = useRef(null);
  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const load = useCallback(async () => {
    try {
      const data = await api('/admin/live-tracking');
      setBuses(data.buses || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!TOKEN || TOKEN.includes('your_mapbox')) return;

    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [36.7542, -1.3965],
      zoom: 12.5,
    });
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right');
    mapRef.current = map;

    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    requestAnimationFrame(onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set();
    const coords = [];

    for (const item of buses) {
      const trip = item.trip;
      const loc = trip.latestLocation || trip.startLocation;
      if (loc?.lat == null || loc?.lng == null) continue;
      const id = String(trip._id);
      seen.add(id);
      coords.push([loc.lng, loc.lat]);

      const label = tripLabel(trip);
      const selected = selectedRef.current === id;
      const heading = loc.heading;

      let marker = markersRef.current.get(id);
      if (!marker) {
        const el = createBoltCarElement({ heading, selected, label, pulse: true });
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          setSelectedId(id);
        });
        marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([loc.lng, loc.lat])
          .addTo(map);
        markersRef.current.set(id, marker);
      } else {
        marker.setLngLat([loc.lng, loc.lat]);
        const el = marker.getElement();
        setBoltCarHeading(el, heading);
        setBoltCarSelected(el, selected);
        const labelEl = el.querySelector('.marker-bolt-label');
        if (labelEl) labelEl.textContent = label;
      }
    }

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    if (coords.length && !selectedRef.current) {
      const bounds = new mapboxgl.LngLatBounds(coords[0], coords[0]);
      coords.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 80, maxZoom: 14.5, duration: 600 });
    }
  }, [buses]);

  useEffect(() => {
    if (!selectedId || !mapRef.current) return;
    const item = buses.find((b) => String(b.trip._id) === selectedId);
    const loc = item?.trip?.latestLocation || item?.trip?.startLocation;
    if (loc?.lat != null) {
      mapRef.current.easeTo({ center: [loc.lng, loc.lat], zoom: 15.2, duration: 700 });
    }
    for (const [id, marker] of markersRef.current) {
      setBoltCarSelected(marker.getElement(), id === selectedId);
    }
  }, [selectedId, buses]);

  const selected = buses.find((b) => String(b.trip._id) === selectedId);

  return (
    <div className="live-tracking live-tracking--fullscreen">
      {error && <div className="alert live-tracking-alert">{error}</div>}

      <div ref={containerRef} className="live-map-full">
        {(!TOKEN || TOKEN.includes('your_mapbox')) && (
          <div className="map-fallback">
            <p>
              Set <code>VITE_MAPBOX_TOKEN</code> to enable the map.
            </p>
          </div>
        )}
      </div>

      <div className="live-fleet-bar">
        <div className="live-fleet-head">
          <strong>Live buses</strong>
          <span className="muted">{buses.length} active</span>
        </div>
        <div className="live-fleet-scroll">
          {!buses.length && <p className="muted live-fleet-empty">No active trips right now.</p>}
          {buses.map((item) => {
            const t = item.trip;
            const id = String(t._id);
            const active = id === selectedId;
            return (
              <button
                key={id}
                type="button"
                className={`live-card ${active ? 'is-active' : ''}`}
                onClick={() => setSelectedId(id)}
              >
                <strong>{tripLabel(t)}</strong>
                <span className="muted">
                  {t.tripCode || '—'} · {t.period || '—'} ·{' '}
                  {t.direction === 'to_school' ? 'to school' : 'to home'}
                </span>
                <span>
                  {t.driverId?.name || 'Driver'} · {t.routeId?.name || 'Route'}
                </span>
                <span className="muted">
                  GPS {fmtTime(item.lastGpsAt)} · in {item.checkedIn}/{item.studentCount}
                </span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="live-detail">
            <h3>{tripLabel(selected.trip)}</h3>
            <p>
              <strong>{selected.trip.tripCode}</strong> — {selected.trip.routeId?.name}
            </p>
            <p className="muted">
              Driver {selected.trip.driverId?.name}
              {selected.trip.driverId?.phone ? ` · ${selected.trip.driverId.phone}` : ''}
            </p>
            <p>
              Started {fmtTime(selected.trip.startedAt)} · Check-in {selected.checkedIn} · Out{' '}
              {selected.checkedOut}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
