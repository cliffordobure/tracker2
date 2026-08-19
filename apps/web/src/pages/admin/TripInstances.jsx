import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';

const PAGE_SIZES = [10, 25, 50];
const DONUT_COLORS = {
  completed: '#16a34a',
  active: '#f97316',
  scheduled: '#64748b',
  cancelled: '#e11d48',
};

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pct(part, total) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function pageItems(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const items = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) items.push('…');
  for (let i = start; i <= end; i += 1) items.push(i);
  if (end < pages - 1) items.push('…');
  items.push(pages);
  return items;
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fmtClock(hhmm) {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return String(hhmm);
  const d = new Date();
  d.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function tripId(t) {
  return String(t._id || t.id);
}

function routeOf(t) {
  return t.routeId && typeof t.routeId === 'object' ? t.routeId : null;
}

function driverOf(t) {
  return t.driverId && typeof t.driverId === 'object' ? t.driverId : null;
}

function busOf(t) {
  return t.busId && typeof t.busId === 'object' ? t.busId : null;
}

function startTime(t) {
  return fmtTime(t.startedAt || t.scheduledFor) || fmtClock(t.scheduleId?.scheduledTime);
}

function statusMeta(status) {
  if (status === 'completed') return { key: 'active', label: 'Completed' };
  if (status === 'active') return { key: 'inactive', label: 'In Progress' };
  if (status === 'cancelled') return { key: 'noroute', label: 'Cancelled' };
  if (status === 'scheduled') return { key: 'muted', label: 'Scheduled' };
  return { key: 'muted', label: status || '—' };
}

function vehicleLabel(b) {
  if (!b) return '';
  return [b.label, b.plate].filter(Boolean).join(' · ');
}

function donutStyle(items, total) {
  if (!total) return { background: '#e2e8f0' };
  let acc = 0;
  const parts = items.filter((i) => i.count > 0).map((item) => {
    const start = acc;
    acc += (item.count / total) * 100;
    return `${item.color} ${start}% ${acc}%`;
  });
  return { background: `conic-gradient(${parts.join(', ')})` };
}

function TrendChart({ points }) {
  const max = Math.max(...points.map((p) => p.count), 1);
  const w = 280;
  const h = 88;
  const coords = points.map((p, i) => {
    const x = points.length <= 1 ? w / 2 : (i / (points.length - 1)) * w;
    const y = h - 6 - (p.count / max) * (h - 14);
    return `${x},${y}`;
  });
  return (
    <svg className="sa-trips-trend" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Trips this month">
      <polyline fill="none" stroke="#93c5fd" strokeWidth="6" points={coords.join(' ')} />
      <polyline fill="none" stroke="#2563eb" strokeWidth="2.5" points={coords.join(' ')} />
    </svg>
  );
}

const emptyCreate = {
  routeId: '',
  driverId: '',
  busId: '',
  serviceDate: todayInput(),
  scheduledTime: '06:30',
  period: 'morning',
  direction: 'to_school',
};

export default function TripInstances() {
  const { globalSearch = '' } = useOutletContext() || {};
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [q, setQ] = useState('');
  const [date, setDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);
  const [periodFilter, setPeriodFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [menuId, setMenuId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailExtra, setDetailExtra] = useState(null);
  const [panel, setPanel] = useState(null);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ busId: '', driverId: '', scheduledTime: '06:30' });

  const loadLookups = async () => {
    const [r, b, d] = await Promise.all([
      api('/admin/routes'),
      api('/admin/buses'),
      api('/admin/drivers'),
    ]);
    setRoutes(r.routes || []);
    setBuses(b.buses || []);
    setDrivers(d.drivers || []);
  };

  const load = async () => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (statusFilter) params.set('status', statusFilter);
    if (routeFilter) params.set('routeId', routeFilter);
    if (driverFilter) params.set('driverId', driverFilter);
    if (periodFilter) params.set('period', periodFilter);
    const data = await api(`/admin/trip-instances?${params}`);
    setTrips(data.trips || []);
    setStats(data.stats || null);
    setAnalytics(data.analytics || null);
  };

  useEffect(() => {
    loadLookups().catch(() => {});
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [date, statusFilter, routeFilter, driverFilter, periodFilter]);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    const close = () => setMenuId('');
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return trips;
    return trips.filter((t) => {
      const driver = driverOf(t);
      const bus = busOf(t);
      const route = routeOf(t);
      const hay = [
        t.tripCode,
        route?.name,
        t.path,
        driver?.name,
        driver?.phone,
        bus?.label,
        bus?.plate,
        t.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [trips, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, date, statusFilter, routeFilter, driverFilter, periodFilter, pageSize]);

  const allOnPageSelected = slice.length > 0 && slice.every((t) => selected.has(tripId(t)));

  const toggleAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) slice.forEach((t) => next.delete(tripId(t)));
      else slice.forEach((t) => next.add(tripId(t)));
      return next;
    });
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openDetail = async (t) => {
    setDetail(t);
    setDetailExtra(null);
    try {
      const data = await api(`/admin/trip-instances/${tripId(t)}`);
      setDetail(data.trip || t);
      setDetailExtra(data);
    } catch (e) {
      setError(e.message);
    }
  };

  const cancelTrip = async (t) => {
    if (!confirm('Cancel this trip instance?')) return;
    setError('');
    try {
      await api(`/admin/trip-instances/${tripId(t)}/cancel`, { method: 'POST', body: {} });
      setInfo('Trip cancelled.');
      if (detail && tripId(detail) === tripId(t)) setDetail(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const openEdit = (t) => {
    setEditing(t);
    setEditForm({
      busId: busOf(t)?._id || t.busId || '',
      driverId: driverOf(t)?._id || driverOf(t)?.id || t.driverId || '',
      scheduledTime: t.scheduleId?.scheduledTime || '06:30',
    });
    setPanel('edit');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setError('');
    try {
      await api(`/admin/trip-instances/${tripId(editing)}`, { method: 'PUT', body: editForm });
      setInfo('Trip updated.');
      setPanel(null);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const createTrip = async () => {
    setError('');
    try {
      await api('/admin/trip-instances', { method: 'POST', body: createForm });
      setInfo('Trip created.');
      setPanel(null);
      setCreateForm(emptyCreate);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const exportRows = () => {
    const rows = selected.size ? filtered.filter((t) => selected.has(tripId(t))) : filtered;
    const header = ['Trip ID', 'Date', 'Route', 'Driver', 'Vehicle', 'Start', 'End', 'Status', 'Students', 'Duration'];
    const lines = [
      header.join(','),
      ...rows.map((t) =>
        [
          csvEscape(t.tripCode),
          csvEscape(fmtDate(t.serviceDate || t.scheduledFor)),
          csvEscape(routeOf(t)?.name),
          csvEscape(driverOf(t)?.name),
          csvEscape(vehicleLabel(busOf(t))),
          csvEscape(startTime(t)),
          csvEscape(fmtTime(t.endedAt)),
          csvEscape(statusMeta(t.status).label),
          csvEscape(t.studentCount ?? (t.kidIds || []).length),
          csvEscape(t.durationMinutes != null ? `${t.durationMinutes} min` : ''),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trips.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const year = new Date().getFullYear();
  const total = stats?.total || 0;
  const kpis = [
    {
      label: 'Total Trips',
      value: stats?.total ?? 0,
      hint: 'This month',
      tint: 'purple',
    },
    {
      label: 'Completed',
      value: stats?.completed ?? 0,
      hint: pct(stats?.completed ?? 0, total),
      tint: 'green',
    },
    {
      label: 'In Progress',
      value: stats?.active ?? 0,
      hint: pct(stats?.active ?? 0, total),
      tint: 'orange',
    },
    {
      label: 'Cancelled',
      value: stats?.cancelled ?? 0,
      hint: pct(stats?.cancelled ?? 0, total),
      tint: 'rose',
    },
    {
      label: 'Avg. Duration',
      value: stats?.avgDurationMinutes != null ? `${stats.avgDurationMinutes} min` : '—',
      hint: stats?.avgDurationMinutes != null ? 'Completed trips' : 'Not tracked',
      tint: 'violet',
    },
    {
      label: 'Total Distance',
      value: '—',
      hint: 'Not tracked',
      tint: 'sky',
    },
  ];

  const statusDonut = [
    { label: 'Completed', key: 'completed', count: analytics?.byStatus?.completed || 0, color: DONUT_COLORS.completed },
    { label: 'In Progress', key: 'active', count: analytics?.byStatus?.active || 0, color: DONUT_COLORS.active },
    { label: 'Scheduled', key: 'scheduled', count: analytics?.byStatus?.scheduled || 0, color: DONUT_COLORS.scheduled },
    { label: 'Cancelled', key: 'cancelled', count: analytics?.byStatus?.cancelled || 0, color: DONUT_COLORS.cancelled },
  ];
  const donutTotal = statusDonut.reduce((a, i) => a + i.count, 0);
  const topMax = Math.max(...(analytics?.topRoutes || []).map((r) => r.count), 1);
  const hourMax = Math.max(...(analytics?.byHour || []).map((h) => h.count), 1);
  const detailTrip = detail;
  const detailMeta = statusMeta(detailTrip?.status);
  const studentCount = detailTrip?.studentCount ?? (detailTrip?.kidIds || []).length;
  const picked = detailExtra?.pickedUp ?? 0;
  const dropped = detailExtra?.droppedOff ?? 0;

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      {info && <div className="alert alert-ok">{info}</div>}

      <div className="sa-sd-top">
        <span />
        <div className="sa-sd-top-actions">
          <button type="button" className="sa-btn sa-btn-outline sa-stu-export" onClick={exportRows}>
            Export
          </button>
          <button
            type="button"
            className="sa-btn sa-btn-primary"
            onClick={() => {
              setCreateForm({ ...emptyCreate, routeId: routes[0]?._id || '' });
              setPanel('create');
            }}
          >
            + New Trip
          </button>
        </div>
      </div>

      <section className="sa-stu-kpis sa-trips-kpis" aria-label="Trip metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em>{m.hint}</em>
            </div>
            <i className="sa-stu-kpi-icon" aria-hidden="true" />
          </article>
        ))}
      </section>

      <section className={`sa-trips-layout${detailTrip ? ' has-detail' : ''}`}>
        <article className="sa-card sa-stu-table-card">
          <div className="sa-stu-toolbar sa-drv-toolbar sa-trips-toolbar">
            <label className="sa-stu-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by trip ID, route or driver..."
              />
            </label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="active">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} aria-label="Route">
              <option value="">All Routes</option>
              {routes.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} aria-label="Driver">
              <option value="">All Drivers</option>
              {drivers.map((d) => (
                <option key={d.id || d._id} value={d.id || d._id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMoreFilters((v) => !v)}>
              More Filters
            </button>
          </div>
          {moreFilters && (
            <div className="sa-tch-more">
              <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} aria-label="Period">
                <option value="">All periods</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setDate('')}>
                Whole month
              </button>
            </div>
          )}

          <div className="sa-table-wrap">
            <table className="sa-table sa-stu-table sa-trips-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllPage} aria-label="Select page" />
                  </th>
                  <th>Trip ID</th>
                  <th>Route</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Status</th>
                  <th>Students</th>
                  <th>Distance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((t) => {
                  const id = tripId(t);
                  const meta = statusMeta(t.status);
                  const driver = driverOf(t);
                  const bus = busOf(t);
                  const route = routeOf(t);
                  return (
                    <tr key={id} className={detailTrip && tripId(detailTrip) === id ? 'is-selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleRow(id)}
                          aria-label={`Select ${t.tripCode || 'trip'}`}
                        />
                      </td>
                      <td>
                        <strong>{t.tripCode || '—'}</strong>
                        <small className="sa-stu-phone">{fmtDate(t.serviceDate || t.scheduledFor) || '—'}</small>
                      </td>
                      <td>
                        <strong>{route?.name || '—'}</strong>
                        <small className="sa-stu-phone">{t.path || '—'}</small>
                      </td>
                      <td>
                        {driver?.name ? (
                          <div className="sa-stu-person">
                            {driver.photoUrl ? <img src={driver.photoUrl} alt="" /> : <span>{initials(driver.name)}</span>}
                            <div>
                              <strong>{driver.name}</strong>
                              {driver.phone ? <small>{driver.phone}</small> : null}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {bus ? (
                          <span>
                            <strong>{bus.label || 'Vehicle'}</strong>
                            <small className="sa-stu-phone">{bus.plate || '—'}</small>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{startTime(t) || '—'}</td>
                      <td>{fmtTime(t.endedAt) || '—'}</td>
                      <td>
                        <span className={`sa-stu-status is-${meta.key}`}>{meta.label}</span>
                      </td>
                      <td>{t.studentCount ?? (t.kidIds || []).length}</td>
                      <td>—</td>
                      <td>
                        <div className="sa-stu-actions">
                          <button type="button" className="sa-icon-ghost is-view" aria-label="View" onClick={() => openDetail(t)}>
                            ◉
                          </button>
                          <div className="sa-stu-more">
                            <button
                              type="button"
                              className="sa-icon-ghost"
                              aria-label="More"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.nativeEvent.stopImmediatePropagation();
                                setMenuId((cur) => (cur === id ? '' : id));
                              }}
                            >
                              ⋮
                            </button>
                            {menuId === id && (
                              <div className="sa-stu-menu" onClick={(e) => e.stopPropagation()}>
                                {t.status === 'scheduled' && (
                                  <button type="button" onClick={() => { setMenuId(''); openEdit(t); }}>
                                    Edit
                                  </button>
                                )}
                                {t.status === 'active' && (
                                  <button type="button" onClick={() => { setMenuId(''); navigate('/school-admin/live-tracking'); }}>
                                    Live map
                                  </button>
                                )}
                                {t.status === 'scheduled' && (
                                  <button type="button" className="is-danger" onClick={() => { setMenuId(''); cancelTrip(t); }}>
                                    Cancel trip
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!slice.length && (
                  <tr>
                    <td colSpan={11} className="sa-stu-empty">
                      No trips match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="sa-table-foot sa-stu-foot">
            <span>
              Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0} to{' '}
              {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} trips
            </span>
            <label className="sa-stu-pagesize">
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
            </label>
            <div className="sa-pager">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                ‹
              </button>
              {pageItems(safePage, pages).map((item, i) =>
                item === '…' ? (
                  <span key={`e${i}`}>…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={item === safePage ? 'is-current' : ''}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                )
              )}
              <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>
                ›
              </button>
            </div>
          </div>
        </article>

        {detailTrip && (
          <aside className="sa-card sa-trips-detail" aria-label="Trip details">
            <div className="sa-rd-card-head">
              <h3>Trip Details</h3>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
            <em className={`sa-stu-status is-${detailMeta.key}`}>{detailMeta.label}</em>
            <dl className="sa-sd-dl">
              <div><dt>ID</dt><dd>{detailTrip.tripCode || '—'}</dd></div>
              <div><dt>Route</dt><dd>{routeOf(detailTrip)?.name || '—'}</dd></div>
              <div><dt>Date</dt><dd>{fmtDate(detailTrip.serviceDate || detailTrip.scheduledFor) || '—'}</dd></div>
              <div>
                <dt>Driver</dt>
                <dd>
                  {driverOf(detailTrip)?.name || '—'}
                  {driverOf(detailTrip)?.phone ? <small className="sa-stu-phone">{driverOf(detailTrip).phone}</small> : null}
                </dd>
              </div>
              <div><dt>Vehicle</dt><dd>{vehicleLabel(busOf(detailTrip)) || '—'}</dd></div>
              <div><dt>Start</dt><dd>{startTime(detailTrip) || '—'}</dd></div>
              <div><dt>End</dt><dd>{fmtTime(detailTrip.endedAt) || '—'}</dd></div>
              <div><dt>Students</dt><dd>{studentCount}</dd></div>
              <div><dt>Distance</dt><dd>—</dd></div>
              <div>
                <dt>Duration</dt>
                <dd>{detailTrip.durationMinutes != null ? `${detailTrip.durationMinutes} min` : '—'}</dd>
              </div>
            </dl>

            <h4>Trip Map</h4>
            {detailExtra?.stops?.length ? (
              <MapView
                center={detailExtra.stops[0]?.location || { lat: -1.3965, lng: 36.7542 }}
                stops={detailExtra.stops}
                direction={detailTrip.direction}
                showRoute={detailExtra.stops.length >= 2}
                driverLocation={detailTrip.status === 'active' ? detailTrip.latestLocation : null}
                interactive={false}
                className="map-canvas sa-trips-mini-map"
              />
            ) : (
              <p className="sa-muted">No stops saved on this route.</p>
            )}
            {detailTrip.status === 'active' ? (
              <Link to="/school-admin/live-tracking" className="sa-text-link">View full map</Link>
            ) : routeOf(detailTrip)?._id ? (
              <Link to={`/school-admin/routes/${routeOf(detailTrip)._id}`} className="sa-text-link">View route</Link>
            ) : null}

            <h4>Pickup &amp; Drop</h4>
            <div className="sa-trips-rings">
              <div>
                <span className="sa-stops-donut" style={donutStyle([{ count: picked, color: '#16a34a' }, { count: Math.max(studentCount - picked, 0), color: '#e2e8f0' }], Math.max(studentCount, 1))} />
                <strong>{studentCount ? pct(picked, studentCount) : '—'}</strong>
                <small>Picked up {picked}/{studentCount}</small>
              </div>
              <div>
                <span className="sa-stops-donut" style={donutStyle([{ count: dropped, color: '#2563eb' }, { count: Math.max(studentCount - dropped, 0), color: '#e2e8f0' }], Math.max(studentCount, 1))} />
                <strong>{studentCount ? pct(dropped, studentCount) : '—'}</strong>
                <small>Dropped off {dropped}/{studentCount}</small>
              </div>
            </div>
            {detailTrip.kidIds?.length ? (
              <ul className="sa-trips-kids">
                {(detailTrip.kidIds || []).slice(0, 8).map((k) => (
                  <li key={k._id || k}>
                    <Link to={`/school-admin/students/${k._id || k}`}>{k.name || 'Student'}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sa-muted">No students listed on this trip.</p>
            )}
          </aside>
        )}
      </section>

      <section className="sa-trips-charts">
        <article className="sa-card">
          <h3>Trips Trend (This Month)</h3>
          {analytics?.trend?.length ? <TrendChart points={analytics.trend} /> : <p className="sa-muted">No trips this month.</p>}
        </article>
        <article className="sa-card">
          <h3>Trips by Status</h3>
          {donutTotal ? (
            <div className="sa-stops-donut-wrap">
              <div className="sa-stops-donut" style={donutStyle(statusDonut, donutTotal)} />
              <ul className="sa-stops-donut-key">
                {statusDonut.map((item) => (
                  <li key={item.key}>
                    <i style={{ background: item.color }} />
                    {item.label}
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="sa-muted">No trips this month.</p>
          )}
        </article>
        <article className="sa-card">
          <h3>Top Routes by Trips</h3>
          {analytics?.topRoutes?.length ? (
            <ul className="sa-trips-bars">
              {analytics.topRoutes.map((r) => (
                <li key={r.id}>
                  <span>{r.name}</span>
                  <i style={{ width: `${Math.max(8, (r.count / topMax) * 100)}%` }} />
                  <strong>{r.count}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No route trips this month.</p>
          )}
        </article>
        <article className="sa-card">
          <h3>Avg. Trip Duration</h3>
          {stats?.avgDurationMinutes != null ? (
            <p className="sa-trips-gauge">
              <strong>{stats.avgDurationMinutes}</strong>
              <span>min on completed trips</span>
            </p>
          ) : (
            <p className="sa-muted">Start and end times are not saved on enough trips yet.</p>
          )}
        </article>
        <article className="sa-card">
          <h3>Trips by Time of Day</h3>
          {analytics?.byHour?.some((h) => h.count) ? (
            <ul className="sa-trips-hours">
              {analytics.byHour.map((h) => (
                <li key={h.label}>
                  <span>{h.label}</span>
                  <i style={{ height: `${Math.max(6, (h.count / hourMax) * 72)}px` }} />
                  <small>{h.count}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No scheduled times this month.</p>
          )}
        </article>
      </section>

      {panel === 'create' && (
        <aside className="sa-drawer" aria-label="New trip">
          <div className="sa-drawer-head">
            <h2>New trip</h2>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setPanel(null)}>Close</button>
          </div>
          {error && <div className="alert">{error}</div>}
          <label className="sa-field">
            <span>Route</span>
            <select value={createForm.routeId} onChange={(e) => setCreateForm({ ...createForm, routeId: e.target.value })}>
              <option value="">Select a route</option>
              {routes.map((r) => (
                <option key={r._id} value={r._id}>{r.name}</option>
              ))}
            </select>
          </label>
          <label className="sa-field">
            <span>Driver</span>
            <select value={createForm.driverId} onChange={(e) => setCreateForm({ ...createForm, driverId: e.target.value })}>
              <option value="">Select a driver</option>
              {drivers.filter((d) => d.active !== false).map((d) => (
                <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="sa-field">
            <span>Vehicle</span>
            <select value={createForm.busId} onChange={(e) => setCreateForm({ ...createForm, busId: e.target.value })}>
              <option value="">Optional</option>
              {buses.filter((b) => b.active !== false).map((b) => (
                <option key={b._id} value={b._id}>{[b.label, b.plate].filter(Boolean).join(' · ')}</option>
              ))}
            </select>
          </label>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Date</span>
              <input type="date" value={createForm.serviceDate} onChange={(e) => setCreateForm({ ...createForm, serviceDate: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Time</span>
              <input type="time" value={createForm.scheduledTime} onChange={(e) => setCreateForm({ ...createForm, scheduledTime: e.target.value })} />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Period</span>
              <select value={createForm.period} onChange={(e) => setCreateForm({ ...createForm, period: e.target.value })}>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </label>
            <label className="sa-field">
              <span>Direction</span>
              <select value={createForm.direction} onChange={(e) => setCreateForm({ ...createForm, direction: e.target.value })}>
                <option value="to_school">To school</option>
                <option value="to_home">To home</option>
              </select>
            </label>
          </div>
          <p className="sa-muted">Students on the selected route are added automatically.</p>
          <div className="row-actions">
            <button type="button" className="sa-btn sa-btn-outline" onClick={() => setPanel(null)}>Cancel</button>
            <button
              type="button"
              className="sa-btn sa-btn-primary"
              disabled={!createForm.routeId || !createForm.driverId}
              onClick={createTrip}
            >
              Create trip
            </button>
          </div>
        </aside>
      )}

      {panel === 'edit' && editing && (
        <aside className="sa-drawer" aria-label="Edit trip">
          <div className="sa-drawer-head">
            <h2>Edit {editing.tripCode || 'trip'}</h2>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={() => { setPanel(null); setEditing(null); }}>Close</button>
          </div>
          {error && <div className="alert">{error}</div>}
          <p className="sa-muted">Changes apply to this service date only.</p>
          <label className="sa-field">
            <span>Vehicle</span>
            <select value={editForm.busId} onChange={(e) => setEditForm({ ...editForm, busId: e.target.value })}>
              {buses.map((b) => (
                <option key={b._id} value={b._id}>{[b.label, b.plate].filter(Boolean).join(' · ')}</option>
              ))}
            </select>
          </label>
          <label className="sa-field">
            <span>Driver</span>
            <select value={editForm.driverId} onChange={(e) => setEditForm({ ...editForm, driverId: e.target.value })}>
              {drivers.map((d) => (
                <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="sa-field">
            <span>Time</span>
            <input type="time" value={editForm.scheduledTime} onChange={(e) => setEditForm({ ...editForm, scheduledTime: e.target.value })} />
          </label>
          <div className="row-actions">
            <button type="button" className="sa-btn sa-btn-outline" onClick={() => { setPanel(null); setEditing(null); }}>Cancel</button>
            <button type="button" className="sa-btn sa-btn-primary" onClick={saveEdit}>Save override</button>
          </div>
        </aside>
      )}

      <footer className="sa-home-foot">
        <span>© {year} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
