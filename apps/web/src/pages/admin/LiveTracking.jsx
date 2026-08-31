import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { api } from '../../lib/api';
import { setBoltCarSelected } from '../../lib/mapMarkers';
import {
  attachFleetPlates,
  busMapLocation,
  dedupeLiveFleet,
  startSmoothFleetLoop,
  subscribeFleetLocations,
  syncFleetVehicles,
} from '../../lib/smoothFleet';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const DONUT = {
  live: '#16a34a',
  stopped: '#e11d48',
  stale: '#f97316',
  no_gps: '#94a3b8',
};

function fmtTime(v) {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ago(v) {
  if (!v) return 'No GPS';
  const ms = Date.now() - new Date(v).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Just now';
  if (ms < 20000) return 'Just now';
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr ago`;
}

function pct(part, total) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function tripLabel(t) {
  return t?.busId?.label || t?.busId?.plate || 'Bus';
}

function directionLabel(value) {
  if (value === 'to_school') return 'To school';
  if (value === 'to_home') return 'To home';
  return '';
}

function gpsMeta(status, phase) {
  if (phase === 'boarding') return { key: 'muted', label: 'Boarding' };
  if (status === 'live') return { key: 'active', label: 'On Route' };
  if (status === 'stopped') return { key: 'noroute', label: 'Stopped' };
  if (status === 'stale') return { key: 'inactive', label: 'GPS stale' };
  return { key: 'muted', label: 'No GPS' };
}

function LiveKpiGlyph({ name }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'online') {
    return (
      <svg {...common}>
        <rect x="3" y="7" width="18" height="10" rx="2" />
        <path d="M7 17v2M17 17v2M3 12h18" />
      </svg>
    );
  }
  if (name === 'route') {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="18" cy="18" r="2.4" />
        <path d="M8 8c4 0 4 8 8 8" />
      </svg>
    );
  }
  if (name === 'eta') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </svg>
    );
  }
  if (name === 'students') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19c.9-3.1 3.2-4.6 7-4.6S18.1 15.9 19 19" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3 4.8 19h14.4L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

function busLocation(item) {
  return busMapLocation(item);
}

function donutStyle(items, total) {
  if (!total) return { background: '#e2e8f0' };
  let acc = 0;
  const parts = items.filter((i) => i.count > 0).map((item) => {
    const start = acc;
    acc += (item.count / total) * 100;
    return `${item.color} ${start}% ${acc}%`;
  });
  return { background: parts.length ? `conic-gradient(${parts.join(', ')})` : '#e2e8f0' };
}

function LiveFleetMap({ buses, selectedId, onSelect, className, showLegend }) {
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const targetsRef = useRef(new Map());
  const containerRef = useRef(null);
  const selectedRef = useRef(null);
  const fittedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

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
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    mapRef.current = map;

    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    ro?.observe(containerRef.current);
    requestAnimationFrame(onResize);
    const markReady = () => setMapReady(true);
    if (map.loaded()) markReady();
    else map.once('load', markReady);

    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      markersRef.current.forEach((entry) => entry.marker.remove());
      markersRef.current.clear();
      targetsRef.current.clear();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return undefined;
    return startSmoothFleetLoop({
      mapRef,
      markersRef,
      targetsRef,
      selectedRef,
      followSelected: false,
    });
  }, [mapReady]);

  const tripIdsKey = buses.map((item) => String(item?.trip?._id || '')).filter(Boolean).sort().join(',');

  useEffect(() => {
    return subscribeFleetLocations(tripIdsKey ? tripIdsKey.split(',') : [], targetsRef);
  }, [tripIdsKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const coords = syncFleetVehicles({
      map,
      buses,
      markersRef,
      targetsRef,
      selectedId,
      onSelect,
    });

    if (coords.length && !selectedRef.current && !fittedRef.current) {
      fittedRef.current = true;
      const bounds = new mapboxgl.LngLatBounds(coords[0], coords[0]);
      coords.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 80, maxZoom: 14.5, duration: 600 });
    }
  }, [buses, onSelect, selectedId, mapReady]);

  useEffect(() => {
    if (!selectedId || !mapRef.current) return;
    const entry =
      [...markersRef.current.values()].find((row) => row.tripId === selectedId) ||
      markersRef.current.get(selectedId);
    const pos = entry?.marker?.getLngLat();
    if (pos) {
      mapRef.current.easeTo({ center: [pos.lng, pos.lat], zoom: 15.2, duration: 700 });
    } else {
      const item = buses.find((b) => String(b.trip._id) === selectedId);
      const loc = busLocation(item);
      if (loc?.lat != null) {
        mapRef.current.easeTo({ center: [loc.lng, loc.lat], zoom: 15.2, duration: 700 });
      }
    }
    for (const [id, entry] of markersRef.current) {
      setBoltCarSelected(entry.marker.getElement(), id === selectedId || entry.tripId === selectedId);
    }
  }, [selectedId, buses]);

  return (
    <div className={`sa-live-map-wrap ${className || ''}`}>
      <div ref={containerRef} className="sa-live-map-canvas">
        {(!TOKEN || TOKEN.includes('your_mapbox')) && (
          <div className="map-fallback">
            <p>
              Set <code>VITE_MAPBOX_TOKEN</code> to enable the map.
            </p>
          </div>
        )}
      </div>
      {showLegend ? (
        <ul className="sa-live-legend">
          <li><i className="is-live" /> On Route (live GPS)</li>
          <li><i className="is-stopped" /> Stopped</li>
          <li><i className="is-stale" /> GPS stale</li>
          <li><i className="is-off" /> Boarding / no GPS</li>
        </ul>
      ) : null}
    </div>
  );
}

export default function LiveTracking({ endpoint = '/admin/live-tracking' } = {}) {
  const { globalSearch = '' } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const full = params.get('full') === '1';
  const focusTrip = params.get('trip');
  const focusDriver = params.get('driver');
  const [buses, setBuses] = useState([]);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState('');

  const fleetRef = useRef(null);
  const load = useCallback(async () => {
    try {
      const [data, fleet] = await Promise.all([
        api(endpoint),
        fleetRef.current
          ? Promise.resolve(fleetRef.current)
          : api('/admin/buses')
              .then((d) => {
                fleetRef.current = d;
                return d;
              })
              .catch(() => ({ buses: [] })),
      ]);
      setBuses(dedupeLiveFleet(attachFleetPlates(data.buses || [], fleet.buses || [])));
      setStats(data.stats || null);
      setAlerts(data.alerts || []);
      setActivity(data.activity || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load, autoRefresh]);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    if (focusTrip && buses.some((b) => String(b.trip._id) === focusTrip)) {
      setSelectedId(focusTrip);
      return;
    }
    if (!focusDriver) return;
    const match = buses.find((b) => {
      const driverId = b.trip?.driverId?._id || b.trip?.driverId?.id || b.trip?.driverId;
      return String(driverId || '') === String(focusDriver);
    });
    if (match?.trip?._id) setSelectedId(String(match.trip._id));
  }, [focusTrip, focusDriver, buses]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return buses.filter((item) => {
      if (statusFilter && item.gpsStatus !== statusFilter) return false;
      if (!needle) return true;
      const t = item.trip;
      const hay = [
        tripLabel(t),
        t.busId?.plate,
        t.routeId?.name,
        t.driverId?.name,
        item.path,
        t.tripCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [buses, q, statusFilter]);

  const select = useCallback((id) => setSelectedId(id), []);
  const year = new Date().getFullYear();
  const fleet = stats?.fleetTotal || 0;
  const kpis = [
    {
      label: 'Vehicles Online',
      value: stats?.online ?? 0,
      hint: fleet ? `${pct(stats?.online ?? 0, fleet)} of ${fleet}` : 'Live GPS',
      tint: 'green',
      icon: 'online',
    },
    {
      label: 'On Route',
      value: stats?.onRoute ?? buses.length,
      hint: fleet ? `${pct(stats?.onRoute ?? 0, fleet)} of ${fleet}` : 'Active trips',
      tint: 'blue',
      icon: 'route',
    },
    {
      label: 'Arriving Soon',
      value: '—',
      hint: 'ETA not tracked',
      tint: 'orange',
      icon: 'eta',
    },
    {
      label: 'Students On Board',
      value: stats?.studentsOnBoard ?? 0,
      hint: 'Checked in, not dropped',
      tint: 'violet',
      icon: 'students',
    },
    {
      label: 'Avg. Speed',
      value: stats?.avgSpeedKmh != null ? `${stats.avgSpeedKmh}` : '—',
      hint: stats?.avgSpeedKmh != null ? 'km/h live GPS' : 'Not tracked',
      tint: 'pink',
      icon: 'speed',
    },
  ];
  const gpsDonut = [
    { key: 'live', label: 'Live GPS', count: stats?.gps?.live || 0, color: DONUT.live },
    { key: 'stopped', label: 'Stopped', count: stats?.gps?.stopped || 0, color: DONUT.stopped },
    { key: 'stale', label: 'GPS stale', count: stats?.gps?.stale || 0, color: DONUT.stale },
    { key: 'no_gps', label: 'No GPS', count: stats?.gps?.no_gps || 0, color: DONUT.no_gps },
  ];
  const donutTotal = gpsDonut.reduce((a, i) => a + i.count, 0);
  const selected = buses.find((b) => String(b.trip._id) === selectedId);

  const mapBlock = (
    <LiveFleetMap
      buses={buses}
      selectedId={selectedId}
      onSelect={select}
      className={full ? 'is-full' : ''}
      showLegend
    />
  );

  const listBlock = (
    <article className={`sa-home-card sa-live-list${full ? ' is-overlay' : ''}`}>
      <header>
        <div>
          <h3>Live Vehicles</h3>
          <p>{filtered.length} active {filtered.length === 1 ? 'vehicle' : 'vehicles'}</p>
        </div>
        <div className="sa-live-list-tools">
          <button type="button" className="sa-home-link-btn" onClick={() => setShowFilters((v) => !v)}>
            Filters
          </button>
          <label className="sa-live-refresh">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto refresh {autoRefresh ? 'On' : 'Off'}
          </label>
          <Link to="/school-admin/trip-instances" className="sa-text-link">
            View All
          </Link>
        </div>
      </header>
      {showFilters && (
        <div className="sa-live-filter-row">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="GPS status">
            <option value="">All GPS states</option>
            <option value="live">On Route</option>
            <option value="stopped">Stopped</option>
            <option value="stale">GPS stale</option>
            <option value="no_gps">No GPS</option>
          </select>
        </div>
      )}
      <div className="sa-table-wrap">
        <table className="sa-table sa-live-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Route</th>
              <th>Last Update</th>
              <th>Status</th>
              <th>Speed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const t = item.trip;
              const id = String(t._id);
              const meta = gpsMeta(item.gpsStatus, item.phase);
              return (
                <tr
                  key={id}
                  className={id === selectedId ? 'is-selected' : ''}
                  onClick={() => setSelectedId(id)}
                >
                  <td>
                    <strong>{tripLabel(t)}</strong>
                    <small className="sa-stu-phone">{t.busId?.plate || t.tripCode || '—'}</small>
                  </td>
                  <td>
                    <strong>{t.routeId?.name || '—'}</strong>
                    <small className="sa-stu-phone">{item.path || directionLabel(t.direction) || '—'}</small>
                  </td>
                  <td>{ago(item.lastGpsAt)}</td>
                  <td>
                    <span className={`sa-stu-status is-${meta.key}`}>{meta.label}</span>
                  </td>
                  <td>{item.speedKmh != null ? `${item.speedKmh} km/h` : '—'}</td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={5} className="sa-stu-empty">
                  No active or boarding trips right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="sa-live-selected">
          <strong>{tripLabel(selected.trip)}</strong>
          <p>
            {selected.trip.driverId?.name || 'Driver'}
            {selected.trip.driverId?.phone ? ` · ${selected.trip.driverId.phone}` : ''}
          </p>
          <p className="sa-muted">
            Started {selected.trip.startedAt ? fmtTime(selected.trip.startedAt) : 'not started'} · On board {selected.checkedIn}/{selected.studentCount}
            {selected.phase === 'boarding' ? ' · Check-in at school' : ''}
          </p>
        </div>
      )}
    </article>
  );

  if (full) {
    return (
      <div className="live-tracking live-tracking--fullscreen">
        {error && <div className="alert live-tracking-alert">{error}</div>}
        {mapBlock}
        <div className="sa-live-full-tools">
          <Link to="/school-admin/live-tracking" className="sa-btn sa-btn-outline">
            Back to dashboard
          </Link>
        </div>
        {listBlock}
      </div>
    );
  }

  return (
    <div className="sa-live">
      {error && <div className="alert">{error}</div>}

      <section className="sa-home-kpis sa-live-kpis" aria-label="Live tracking metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-home-kpi tint-${m.tint}`}>
            <span className="sa-home-kpi-icon" aria-hidden="true">
              <LiveKpiGlyph name={m.icon} />
            </span>
            <div className="sa-home-kpi-copy">
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em>{m.hint}</em>
            </div>
          </article>
        ))}
      </section>

      <section className="sa-live-mid">
        <article className="sa-home-card sa-live-map-card">
          <header>
            <div>
              <h3>Live Map</h3>
              <p>Follow buses in real time</p>
            </div>
            <button type="button" className="sa-home-link-btn" onClick={() => setParams({ full: '1' })}>
              View Full Map
            </button>
          </header>
          {mapBlock}
        </article>
        {listBlock}
      </section>

      <section className="sa-live-widgets">
        <article className="sa-home-card">
          <header>
            <div>
              <h3>GPS Summary</h3>
              <p>Current vehicle GPS state</p>
            </div>
          </header>
          {donutTotal ? (
            <div className="sa-live-donut">
              <div className="sa-live-donut-ring">
                <div className="sa-stops-donut" style={donutStyle(gpsDonut, donutTotal)} />
                <div className="sa-live-donut-center">
                  <strong>{donutTotal}</strong>
                  <span>Total</span>
                </div>
              </div>
              <ul className="sa-home-legend">
                {gpsDonut.map((item) => (
                  <li key={item.key}>
                    <i style={{ background: item.color }} />
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="sa-home-empty sa-home-empty-compact">No active trips right now.</p>
          )}
        </article>

        <article className="sa-home-card">
          <header>
            <div>
              <h3>Delays &amp; Alerts ({alerts.length})</h3>
              <p>Incidents on live trips</p>
            </div>
          </header>
          {alerts.length ? (
            <ul className="sa-live-activity">
              {alerts.map((a, i) => (
                <li key={`${a.text}-${i}`} className={`is-${a.tone}`}>
                  <strong>{a.text}</strong>
                  <small>{ago(a.at)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-home-empty sa-home-empty-compact">No incident reports on active trips.</p>
          )}
          <Link to="/school-admin/incidents" className="sa-home-link-btn">
            View All Alerts
          </Link>
        </article>

        <article className="sa-home-card">
          <header>
            <div>
              <h3>Speed Overview</h3>
              <p>Live GPS average</p>
            </div>
          </header>
          {stats?.avgSpeedKmh != null ? (
            <p className="sa-live-speed-stat">
              <strong>{stats.avgSpeedKmh}</strong>
              <span>km/h</span>
            </p>
          ) : (
            <p className="sa-home-empty sa-home-empty-compact">No live speed readings right now.</p>
          )}
          <Link to="/school-admin/reports" className="sa-home-link-btn">
            View Report
          </Link>
        </article>

        <article className="sa-home-card">
          <header>
            <div>
              <h3>Tracking Activity</h3>
              <p>Latest trip events</p>
            </div>
          </header>
          {activity.length ? (
            <ul className="sa-live-activity">
              {activity.map((a, i) => (
                <li key={`${a.text}-${i}`} className={`is-${a.tone}`}>
                  <strong>{a.text}</strong>
                  <small>{ago(a.at)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-home-empty sa-home-empty-compact">No live trip events yet.</p>
          )}
          <Link to="/school-admin/trip-instances" className="sa-home-link-btn">
            View Logs
          </Link>
        </article>
      </section>

      <footer className="sa-home-foot">
        <span>© {year} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
