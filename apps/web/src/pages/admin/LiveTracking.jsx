import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { api } from '../../lib/api';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function busEl(selected) {
  const el = document.createElement('div');
  el.className = `marker-bus ${selected ? 'is-selected' : ''}`;
  el.innerHTML = `
    <div class="marker-bus-bubble" title="Bus">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="10" y="14" width="44" height="30" rx="8" fill="${selected ? '#0c6b57' : '#1d4ed8'}"/>
        <rect x="14" y="18" width="16" height="12" rx="2" fill="#dbeafe"/>
        <rect x="34" y="18" width="16" height="12" rx="2" fill="#dbeafe"/>
        <rect x="12" y="36" width="40" height="6" fill="#1e3a8a"/>
        <circle cx="20" cy="46" r="5" fill="#111827"/>
        <circle cx="44" cy="46" r="5" fill="#111827"/>
      </svg>
    </div>
  `;
  return el;
}

function fmtTime(v) {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    const id = setInterval(load, 6000);
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
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;

    return () => {
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
      const id = trip._id;
      seen.add(id);
      coords.push([loc.lng, loc.lat]);

      let marker = markersRef.current.get(id);
      if (!marker) {
        const el = busEl(selectedRef.current === id);
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => setSelectedId(id));
        marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([loc.lng, loc.lat])
          .addTo(map);
        markersRef.current.set(id, marker);
      } else {
        marker.setLngLat([loc.lng, loc.lat]);
        const el = marker.getElement();
        el.classList.toggle('is-selected', selectedRef.current === id);
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
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
    }
  }, [buses]);

  useEffect(() => {
    if (!selectedId || !mapRef.current) return;
    const item = buses.find((b) => b.trip._id === selectedId);
    const loc = item?.trip?.latestLocation || item?.trip?.startLocation;
    if (loc?.lat != null) {
      mapRef.current.easeTo({ center: [loc.lng, loc.lat], zoom: 14.5, duration: 700 });
    }
  }, [selectedId, buses]);

  const selected = buses.find((b) => b.trip._id === selectedId);

  return (
    <div className="live-tracking">
      <div className="stack" style={{ marginBottom: '1rem' }}>
        <h2>Live tracking</h2>
        <p className="lede">Active buses only. List refreshes every few seconds.</p>
        {error && <div className="alert">{error}</div>}
      </div>

      <div className="live-tracking-grid">
        <div ref={containerRef} className="map-canvas live-map" />
        <aside className="live-side">
          {!buses.length && <p className="muted">No active trips right now.</p>}
          {buses.map((item) => {
            const t = item.trip;
            const active = t._id === selectedId;
            return (
              <button
                key={t._id}
                type="button"
                className={`live-card ${active ? 'is-active' : ''}`}
                onClick={() => setSelectedId(t._id)}
              >
                <strong>{t.busId?.label || t.busId?.plate || 'Bus'}</strong>
                <span className="muted">
                  {t.tripCode || '—'} · {t.period || '—'} ·{' '}
                  {t.direction === 'to_school' ? 'to school' : 'to home'}
                </span>
                <span>
                  {t.driverId?.name || 'Driver'} · {t.routeId?.name || 'Route'}
                </span>
                <span className="muted">
                  Started {fmtTime(t.startedAt)} · GPS {fmtTime(item.lastGpsAt)} · in{' '}
                  {item.checkedIn}/{item.studentCount} · out {item.checkedOut}
                </span>
              </button>
            );
          })}

          {selected && (
            <div className="live-detail">
              <h3>Selected trip</h3>
              <p>
                <strong>{selected.trip.tripCode}</strong> — {selected.trip.routeId?.name}
              </p>
              <p className="muted">
                Driver {selected.trip.driverId?.name}
                {selected.trip.driverId?.phone ? ` · ${selected.trip.driverId.phone}` : ''}
              </p>
              <p>
                Check-in {selected.checkedIn} · Check-out {selected.checkedOut} · Students{' '}
                {selected.studentCount}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
