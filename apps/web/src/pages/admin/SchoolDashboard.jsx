import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { api } from '../../lib/api';
import {
  attachFleetPlates,
  startSmoothFleetLoop,
  subscribeFleetLocations,
  syncFleetVehicles,
} from '../../lib/smoothFleet';
import { notificationHref } from '../../lib/notificationLinks';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const TRANSPORT_COLORS = {
  onTime: '#22c55e',
  delayed: '#f59e0b',
  notStarted: '#94a3b8',
  completed: '#3b82f6',
  inProgress: '#38bdf8',
};

const CHECKIN_COLORS = {
  picked: '#16a34a',
  pending: '#94a3b8',
  absent: '#ef4444',
};

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="sa-chart-tooltip">
      {payload.map((p) => (
        <div key={p.name}>
          <span>{p.name}</span>
          <em>{p.value}</em>
        </div>
      ))}
    </div>
  );
}

function prettySchool(name) {
  const raw = String(name || 'School').trim();
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function monthHint(added) {
  const n = Number(added) || 0;
  if (n <= 0) return { text: 'No change', up: false };
  return { text: `+ ${n} this month`, up: true };
}

function Sparkline({ color, up }) {
  const d = up
    ? 'M2 20 C 10 18, 16 14, 24 13 C 34 11, 42 8, 50 10 C 58 12, 64 6, 70 4'
    : 'M2 12 C 12 14, 18 16, 26 13 C 34 10, 42 18, 52 16 C 60 20, 66 17, 70 19';
  return (
    <svg className="sa-home-spark" viewBox="0 0 72 28" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function KpiGlyph({ name }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'teachers':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 19c.9-3.1 3.2-4.6 7-4.6S18.1 15.9 19 19" />
        </svg>
      );
    case 'buses':
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="10" rx="2" />
          <path d="M7 17v2M17 17v2M3 12h18" />
        </svg>
      );
    case 'routes':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="2.4" />
          <circle cx="18" cy="18" r="2.4" />
          <path d="M8 8c4 0 4 8 8 8" />
        </svg>
      );
    case 'stops':
      return (
        <svg {...common}>
          <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.1" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4v2.4M12 17.6V20M4 12h2.4M17.6 12H20" />
        </svg>
      );
  }
}

function TripGlyph({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'progress') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </svg>
    );
  }
  if (name === 'done') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12.5 2.3 2.3 4.7-5" />
      </svg>
    );
  }
  if (name === 'cancel') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="m9 9 6 6M15 9l-6 6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 4.8 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function pct(part, total) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function formatClock(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatAlertTime(value) {
  if (!value) return '';
  const d = new Date(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return formatClock(d);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function alertTone(type, important) {
  const t = String(type || '').toLowerCase();
  if (t.includes('cancel') || t.includes('incident') || t.includes('attendance')) return 'alert';
  if (t.includes('late') || t.includes('delay') || important) return 'warning';
  return 'info';
}

function MiniLiveMap({ buses }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const targetsRef = useRef(new Map());
  const fittedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const hasToken = TOKEN && !String(TOKEN).includes('your_mapbox');

  useEffect(() => {
    if (!hasToken || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [36.7542, -1.3965],
      zoom: 11.8,
      attributionControl: false,
      scrollZoom: false,
      dragRotate: false,
    });
    mapRef.current = map;
    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    requestAnimationFrame(onResize);
    const markReady = () => setMapReady(true);
    if (map.loaded()) markReady();
    else map.once('load', markReady);
    return () => {
      window.removeEventListener('resize', onResize);
      markersRef.current.forEach((entry) => entry.marker.remove());
      markersRef.current.clear();
      targetsRef.current.clear();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [hasToken]);

  useEffect(() => {
    if (!mapReady) return undefined;
    return startSmoothFleetLoop({
      mapRef,
      markersRef,
      targetsRef,
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
      scale: 0.72,
    });
    if (!coords.length || fittedRef.current) return;
    fittedRef.current = true;
    if (coords.length === 1) {
      map.easeTo({ center: coords[0], zoom: Math.max(map.getZoom(), 12.5), duration: 400 });
    } else {
      const bounds = new mapboxgl.LngLatBounds(coords[0], coords[0]);
      coords.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 36, maxZoom: 14, duration: 400 });
    }
  }, [buses, mapReady]);

  if (!hasToken) {
    return (
      <div className="sa-home-map-empty">
        Map preview needs a Mapbox token.
        <Link to="/school-admin/live-tracking">Open live tracking</Link>
      </div>
    );
  }

  return <div ref={containerRef} className="sa-home-map" />;
}

export default function SchoolDashboard() {
  const [stats, setStats] = useState(null);
  const [liveBuses, setLiveBuses] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dash, live, fleet] = await Promise.all([
          api('/admin/dashboard'),
          api('/admin/live-tracking').catch(() => ({ buses: [] })),
          api('/admin/buses').catch(() => ({ buses: [] })),
        ]);
        if (cancelled) return;
        setStats(dash);
        setLiveBuses(attachFleetPlates(live.buses || [], fleet.buses || []));
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const id = setInterval(() => {
      Promise.all([
        api('/admin/live-tracking'),
        api('/admin/buses').catch(() => ({ buses: [] })),
      ])
        .then(([d, fleet]) => {
          if (!cancelled) setLiveBuses(attachFleetPlates(d.buses || [], fleet.buses || []));
        })
        .catch(() => {});
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const added = stats?.addedThisMonth || {};
  const today = stats?.today || {};
  const transport = today.transport || {};
  const trips = today.trips || {};
  const checkins = today.checkins || {};

  const kpis = useMemo(() => {
    if (!stats) return [];
    return [
      { key: 'teachers', label: 'Total Teachers', value: stats.teachers, hint: monthHint(added.teachers), icon: 'teachers', tint: 'green', spark: '#22c55e' },
      { key: 'buses', label: 'Total Buses', value: stats.buses, hint: monthHint(added.buses), icon: 'buses', tint: 'blue', spark: '#3b82f6' },
      { key: 'routes', label: 'Total Routes', value: stats.routes, hint: monthHint(added.routes), icon: 'routes', tint: 'violet', spark: '#8b5cf6' },
      { key: 'stops', label: 'Total Stops', value: stats.stops, hint: monthHint(added.stops), icon: 'stops', tint: 'orange', spark: '#f59e0b' },
      { key: 'drivers', label: 'Total Drivers', value: stats.drivers, hint: monthHint(added.drivers), icon: 'drivers', tint: 'pink', spark: '#ec4899' },
    ];
  }, [stats, added]);

  const transportChart = useMemo(() => {
    const rows = [
      { key: 'onTime', name: 'On Time', value: transport.onTime || 0, color: TRANSPORT_COLORS.onTime },
      { key: 'delayed', name: 'Delayed', value: transport.delayed || 0, color: TRANSPORT_COLORS.delayed },
      { key: 'notStarted', name: 'Not Started', value: transport.notStarted || 0, color: TRANSPORT_COLORS.notStarted },
      { key: 'completed', name: 'Completed', value: transport.completed || 0, color: TRANSPORT_COLORS.completed },
    ];
    return rows;
  }, [transport]);

  const transportTotal = transportChart.reduce((sum, r) => sum + r.value, 0);

  const checkinChart = useMemo(() => {
    return [
      { key: 'picked', name: 'Checked In', value: checkins.picked || 0, color: CHECKIN_COLORS.picked },
      { key: 'pending', name: 'Not Checked In', value: checkins.pending || 0, color: CHECKIN_COLORS.pending },
      { key: 'absent', name: 'Absent', value: checkins.absent || 0, color: CHECKIN_COLORS.absent },
    ];
  }, [checkins]);

  const checkTotal = checkins.total || 0;
  const checkPicked = checkins.picked || 0;
  const busTotal = today.busTotal || stats?.buses || 0;
  const busesOnRoute = today.busesOnRoute || 0;
  const year = new Date().getFullYear();

  if (loading) {
    return (
      <div className="sa-home">
        <div className="sa-home-kpis">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="sa-skeleton sa-skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error) return <div className="alert">{error}</div>;

  const checkinShare = checkTotal ? checkPicked / checkTotal : 0;

  return (
    <div className="sa-home">
      <section className="sa-home-kpis" aria-label="Key metrics">
        {kpis.map((m) => (
          <article key={m.key} className={`sa-home-kpi tint-${m.tint}`}>
            <span className="sa-home-kpi-icon" aria-hidden="true">
              <KpiGlyph name={m.icon} />
            </span>
            <div className="sa-home-kpi-copy">
              <span>{m.label}</span>
              <strong>{m.value ?? 0}</strong>
              <div className="sa-home-kpi-meta">
                <em className={m.hint.up ? 'is-up' : ''}>{m.hint.up ? '↑ ' : ''}{m.hint.text}</em>
                <Sparkline color={m.spark} up={m.hint.up} />
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="sa-home-mid">
        <article className="sa-home-card">
          <header>
            <div>
              <h3>Transport Overview</h3>
              <p>Today&apos;s trip status{busTotal ? ` · ${busTotal} buses in fleet` : ''}</p>
            </div>
            <Link to="/school-admin/reports" className="sa-home-link-btn">
              View full report
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M14 5h5v5M19 5l-8 8M11 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
              </svg>
            </Link>
          </header>
          <div className="sa-home-donut">
            <div className="sa-home-donut-chart">
                <ResponsiveContainer width="100%" height={156}>
                  <PieChart>
                    <Pie
                    data={transportTotal ? transportChart : [{ key: 'empty', name: 'None', value: 1, color: '#e5e7eb' }]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={44}
                    outerRadius={64}
                    paddingAngle={transportTotal ? 3 : 0}
                    stroke="none"
                  >
                    {(transportTotal ? transportChart : [{ key: 'empty', color: '#e5e7eb' }]).map((row) => (
                      <Cell key={row.key} fill={row.color} />
                    ))}
                  </Pie>
                  {transportTotal > 0 && <Tooltip content={<ChartTooltip />} />}
                </PieChart>
              </ResponsiveContainer>
              <div className="sa-home-donut-label">
                <strong>{transportTotal}</strong>
                <span>Total Trips</span>
              </div>
            </div>
            <ul className="sa-home-legend">
              {transportChart.map((row) => (
                <li key={row.key}>
                  <i style={{ background: row.color }} />
                  <span>{row.name}</span>
                  <strong>
                    {row.value} <small>{pct(row.value, transportTotal)}</small>
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="sa-home-card sa-home-card-map">
          <header>
            <div>
              <h3>Live Tracking</h3>
              <p>Follow today&apos;s buses on the map</p>
            </div>
            <Link to="/school-admin/live-tracking" className="sa-home-link-btn">
              Open map
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M14 5h5v5M19 5l-8 8M11 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
              </svg>
            </Link>
          </header>
          <div className="sa-home-live">
            <MiniLiveMap buses={liveBuses} />
            <ul className="sa-home-bars">
              <li>
                <span>Buses On Route</span>
                <strong>
                  {busesOnRoute}/{busTotal || 0}
                </strong>
                <b>
                  <i style={{ width: `${busTotal ? Math.min(100, (busesOnRoute / busTotal) * 100) : 0}%`, background: '#2563eb' }} />
                </b>
              </li>
              <li>
                <span>On Time</span>
                <strong>{transport.onTime || 0}</strong>
                <b>
                  <i style={{ width: `${pctBar(transport.onTime, transportTotal)}%`, background: '#16a34a' }} />
                </b>
              </li>
              <li>
                <span>Delayed</span>
                <strong>{transport.delayed || 0}</strong>
                <b>
                  <i style={{ width: `${pctBar(transport.delayed, transportTotal)}%`, background: '#f59e0b' }} />
                </b>
              </li>
              <li>
                <span>Not Started</span>
                <strong>{transport.notStarted || 0}</strong>
                <b>
                  <i style={{ width: `${pctBar(transport.notStarted, transportTotal)}%`, background: '#94a3b8' }} />
                </b>
              </li>
            </ul>
          </div>
        </article>
      </section>

      <section className="sa-home-bottom">
        <article className="sa-home-card">
          <header>
            <div>
              <h3>Today&apos;s Trips</h3>
              <p>Open a trip to follow the bus</p>
            </div>
            <Link to="/school-admin/trip-instances" className="sa-text-link">
              View trips
            </Link>
          </header>
          <div className="sa-home-trip-pills">
            <div className="is-live">
              <i><TripGlyph name="progress" /></i>
              <div>
                <span>In Progress</span>
                <strong>{trips.inProgress || 0}</strong>
              </div>
            </div>
            <div className="is-done">
              <i><TripGlyph name="done" /></i>
              <div>
                <span>Completed</span>
                <strong>{trips.completed || 0}</strong>
              </div>
            </div>
            <div className="is-cancel">
              <i><TripGlyph name="cancel" /></i>
              <div>
                <span>Cancelled</span>
                <strong>{trips.cancelled || 0}</strong>
              </div>
            </div>
            <div className="is-next">
              <i><TripGlyph name="noshow" /></i>
              <div>
                <span>No Show</span>
                <strong>{trips.noShow || 0}</strong>
              </div>
            </div>
          </div>
          <Link className="sa-btn sa-btn-primary sa-home-live-btn" to="/school-admin/live-tracking">
            Open live tracking
          </Link>
        </article>

        <article className="sa-home-card">
          <header>
            <div>
              <h3>Student Check-ins</h3>
              <p>Students on today&apos;s trips</p>
            </div>
          </header>
          <div className="sa-home-donut sa-home-donut-sm">
            <div className="sa-home-donut-chart">
              <ResponsiveContainer width="100%" height={136}>
                <PieChart>
                  <Pie
                    data={checkTotal ? checkinChart : [{ key: 'empty', name: 'None', value: 1, color: '#e5e7eb' }]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={38}
                    outerRadius={54}
                    paddingAngle={checkTotal ? 3 : 0}
                    stroke="none"
                  >
                    {(checkTotal ? checkinChart : [{ key: 'empty', color: '#e5e7eb' }]).map((row) => (
                      <Cell key={row.key} fill={row.color} />
                    ))}
                  </Pie>
                  {checkTotal > 0 && <Tooltip content={<ChartTooltip />} />}
                </PieChart>
              </ResponsiveContainer>
              <div className="sa-home-donut-label">
                <strong>{Math.round(checkinShare * 100)}%</strong>
                <span>Checked In</span>
              </div>
            </div>
            <ul className="sa-home-legend">
              {checkinChart.map((row) => (
                <li key={row.key}>
                  <i style={{ background: row.color }} />
                  <span>{row.name}</span>
                  <strong>{row.value}</strong>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="sa-home-card">
          <header>
            <div>
              <h3>Recent Alerts</h3>
              <p>Your latest notifications</p>
            </div>
            <Link to="/school-admin/notifications" className="sa-text-link">
              Inbox
            </Link>
          </header>
          {stats?.alerts?.length ? (
            <ul className="sa-home-alerts">
              {stats.alerts.map((n) => {
                const href = notificationHref(n);
                const body = (
                  <>
                    <div>
                      <strong>{n.title}</strong>
                      <p>{n.body}</p>
                    </div>
                    <time>{formatAlertTime(n.at)}</time>
                  </>
                );
                return (
                  <li key={n._id} className={`tone-${alertTone(n.type, n.important)}`}>
                    {href ? <Link className="sa-home-alert-link" to={href}>{body}</Link> : body}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="sa-home-empty">No alerts yet.</div>
          )}
        </article>
      </section>

      <section className="sa-home-announce">
        <div className="sa-home-announce-copy">
          <i aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 10v4h3l6 4V6L7 10H4Z" />
              <path d="M16 9.2a3.6 3.6 0 0 1 0 5.6M18.4 7a6.4 6.4 0 0 1 0 10" />
            </svg>
          </i>
          <p>
            <strong>Noticeboard:</strong>{' '}
            {stats?.announcements?.[0]?.title || 'No announcements published yet.'}
          </p>
        </div>
        <Link to="/school-admin/noticeboard" className="sa-home-link-btn">
          View noticeboard
        </Link>
      </section>

      <footer className="sa-home-foot">
        <span>© {year} {prettySchool(stats?.school?.name)}. All rights reserved.</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}

function pctBar(part, total) {
  if (!total) return 0;
  return Math.min(100, Math.round(((Number(part) || 0) / total) * 100));
}
