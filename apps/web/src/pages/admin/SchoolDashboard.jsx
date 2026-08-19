import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { api } from '../../lib/api';
import { createBoltCarElement, setBoltCarHeading } from '../../lib/mapMarkers';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const TRANSPORT_COLORS = {
  onTime: '#16a34a',
  delayed: '#f59e0b',
  notStarted: '#94a3b8',
  completed: '#2563eb',
  inProgress: '#0ea5e9',
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

function monthHint(added) {
  const n = Number(added) || 0;
  if (n <= 0) return { text: 'No change', up: false };
  return { text: `+${n} this month`, up: true };
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

function nextTripLabel(next) {
  if (!next) return null;
  const mins = Number(next.minutesUntil);
  if (!Number.isFinite(mins)) return formatClock(next.startsAt);
  if (mins > 0) return `Starting in ${mins} min`;
  if (mins === 0) return 'Starting now';
  return `Scheduled start was ${Math.abs(mins)} min ago`;
}

function MiniLiveMap({ buses }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
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
    return () => {
      window.removeEventListener('resize', onResize);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [hasToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set();
    const coords = [];
    for (const item of buses) {
      const trip = item.trip;
      const loc = trip?.latestLocation || trip?.startLocation;
      if (loc?.lat == null || loc?.lng == null) continue;
      const id = String(trip._id);
      seen.add(id);
      coords.push([loc.lng, loc.lat]);
      const label = trip.busId?.plate || trip.busId?.label || 'Bus';
      let marker = markersRef.current.get(id);
      if (!marker) {
        const el = createBoltCarElement({ heading: loc.heading, label, pulse: true });
        el.style.transform = 'scale(0.72)';
        marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([loc.lng, loc.lat])
          .addTo(map);
        markersRef.current.set(id, marker);
      } else {
        marker.setLngLat([loc.lng, loc.lat]);
        setBoltCarHeading(marker.getElement(), loc.heading);
      }
    }
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    if (coords.length === 1) {
      map.easeTo({ center: coords[0], zoom: Math.max(map.getZoom(), 12.5), duration: 400 });
    } else if (coords.length > 1) {
      const bounds = new mapboxgl.LngLatBounds(coords[0], coords[0]);
      coords.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 36, maxZoom: 14, duration: 400 });
    }
  }, [buses]);

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
        const [dash, live] = await Promise.all([
          api('/admin/dashboard'),
          api('/admin/live-tracking').catch(() => ({ buses: [] })),
        ]);
        if (cancelled) return;
        setStats(dash);
        setLiveBuses(live.buses || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const id = setInterval(() => {
      api('/admin/live-tracking')
        .then((d) => {
          if (!cancelled) setLiveBuses(d.buses || []);
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
  const next = today.nextTrip || null;

  const kpis = useMemo(() => {
    if (!stats) return [];
    return [
      { key: 'kids', label: 'Total Students', value: stats.kids, hint: monthHint(added.kids), icon: 'students', tint: 'blue' },
      { key: 'teachers', label: 'Total Teachers', value: stats.teachers, hint: monthHint(added.teachers), icon: 'teachers', tint: 'violet' },
      { key: 'buses', label: 'Total Buses', value: stats.buses, hint: monthHint(added.buses), icon: 'buses', tint: 'sky' },
      { key: 'routes', label: 'Total Routes', value: stats.routes, hint: monthHint(added.routes), icon: 'routes', tint: 'amber' },
      { key: 'stops', label: 'Total Stops', value: stats.stops, hint: monthHint(added.stops), icon: 'stops', tint: 'rose' },
      { key: 'drivers', label: 'Total Drivers', value: stats.drivers, hint: monthHint(added.drivers), icon: 'drivers', tint: 'green' },
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
          {Array.from({ length: 6 }).map((_, i) => (
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
            <div>
              <span>{m.label}</span>
              <strong>{m.value ?? 0}</strong>
              <em className={m.hint.up ? 'is-up' : ''}>{m.hint.up ? '↑ ' : ''}{m.hint.text}</em>
            </div>
            <i className="sa-home-kpi-icon" aria-hidden="true" />
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
          </header>
          {transportTotal ? (
            <div className="sa-home-donut">
              <div className="sa-home-donut-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={transportChart} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={3}>
                      {transportChart.map((row) => (
                        <Cell key={row.key} fill={row.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="sa-home-donut-label">
                  <strong>{transportTotal}</strong>
                  <span>today&apos;s trips</span>
                </div>
              </div>
              <ul className="sa-home-legend">
                {transportChart.map((row) => (
                  <li key={row.key}>
                    <i style={{ background: row.color }} />
                    <span>{row.name}</span>
                    <strong>
                      {row.value} · {pct(row.value, transportTotal)}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="sa-home-empty">No trips are scheduled for today yet.</div>
          )}
        </article>

        <article className="sa-home-card sa-home-card-map">
          <header>
            <div>
              <h3>Live Tracking</h3>
              <p>Buses currently sending a location</p>
            </div>
            <Link to="/school-admin/live-tracking" className="sa-text-link">
              Open map
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
              <p>Counts from today&apos;s dispatch</p>
            </div>
            <Link to="/school-admin/trip-instances" className="sa-text-link">
              View trips
            </Link>
          </header>
          <div className="sa-home-trip-pills">
            <div className="is-done">
              <span>Completed</span>
              <strong>{trips.completed || 0}</strong>
            </div>
            <div className="is-live">
              <span>In Progress</span>
              <strong>{trips.inProgress || 0}</strong>
            </div>
            <div className="is-next">
              <span>Upcoming</span>
              <strong>{trips.upcoming || 0}</strong>
            </div>
            <div className="is-cancel">
              <span>Cancelled</span>
              <strong>{trips.cancelled || 0}</strong>
            </div>
          </div>
          {next ? (
            <div className="sa-home-next">
              <span>Next trip</span>
              <strong>{nextTripLabel(next)}</strong>
              <p>
                {next.routeName || 'Route'}
                {next.driverName ? ` · ${next.driverName}` : ''}
                {next.plate ? ` · ${next.plate}` : ''}
              </p>
            </div>
          ) : (
            <div className="sa-home-empty sa-home-empty-compact">No upcoming trips left today.</div>
          )}
        </article>

        <article className="sa-home-card">
          <header>
            <div>
              <h3>Student Check-ins</h3>
              <p>Students on today&apos;s trips</p>
            </div>
          </header>
          {checkTotal ? (
            <>
              <div className="sa-home-donut">
                <div className="sa-home-donut-chart">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={checkinChart} dataKey="value" nameKey="name" innerRadius={56} outerRadius={80} paddingAngle={3}>
                        {checkinChart.map((row) => (
                          <Cell key={row.key} fill={row.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="sa-home-donut-label">
                    <strong>{Math.round(checkinShare * 100)}%</strong>
                    <span>checked in</span>
                  </div>
                </div>
                <ul className="sa-home-legend">
                  {checkinChart.map((row) => (
                    <li key={row.key}>
                      <i style={{ background: row.color }} />
                      <span>{row.name}</span>
                      <strong>
                        {row.value} · {pct(row.value, checkTotal)}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
              <p className={`sa-home-check-note${checkinShare >= 0.9 ? ' is-good' : ''}`}>
                {checkinShare >= 0.9
                  ? 'Most students on today\'s trips have been picked up.'
                  : `${checkPicked} of ${checkTotal} students on today's trips are checked in.`}
              </p>
            </>
          ) : (
            <div className="sa-home-empty">No students are assigned to today&apos;s trips yet.</div>
          )}
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
              {stats.alerts.map((n) => (
                <li key={n._id} className={`tone-${alertTone(n.type, n.important)}`}>
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.body}</p>
                  </div>
                  <time>{formatAlertTime(n.at)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <div className="sa-home-empty">No alerts yet.</div>
          )}
        </article>
      </section>

      <section className="sa-home-announce">
        <h3>Recent Announcements</h3>
        {stats?.announcements?.length ? (
          <ul>
            {stats.announcements.map((a) => (
              <li key={a._id}>
                <i aria-hidden="true">{announceGlyph(a.category)}</i>
                <div>
                  <strong>{a.title}</strong>
                  <span>{a.at ? new Date(a.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sa-home-empty sa-home-empty-compact">No announcements published yet.</p>
        )}
        <Link to="/school-admin/noticeboard" className="sa-text-link">
          Noticeboard
        </Link>
      </section>

      <footer className="sa-home-foot">
        <span>© {year} {stats?.school?.name || 'School'} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}

function pctBar(part, total) {
  if (!total) return 0;
  return Math.min(100, Math.round(((Number(part) || 0) / total) * 100));
}

function announceGlyph(category) {
  switch (category) {
    case 'events':
      return '📅';
    case 'transport':
      return '🚌';
    case 'urgent':
      return '⚠️';
    case 'class':
      return '📚';
    default:
      return '📢';
  }
}
