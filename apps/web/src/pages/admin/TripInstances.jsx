import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';
import { TRIP_TABS, useTripTab, writeTripTab } from '../../lib/tripTabs';
import { fmtSchoolDate, fmtSchoolTime, tripStartLabel } from '../../lib/schoolTime';
import MapView from '../../components/MapView';
import TripScheduling from './TripScheduling';
import TripOutings from './TripOutings';

const PAGE_SIZES = [10, 25, 50];
const DONUT_COLORS = {
  completed: '#16a34a',
  active: '#f97316',
  scheduled: '#2563eb',
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
  return fmtSchoolDate(value);
}

function fmtTime(value) {
  return fmtSchoolTime(value);
}

function tripId(t) {
  return String(t._id || t.id);
}

function tripCodeOf(t) {
  if (t?.tripCode) return t.tripCode;
  const id = tripId(t);
  return id && id !== 'undefined' ? `TRP-${id.slice(-4).toUpperCase()}` : '—';
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
  return tripStartLabel(t);
}

function statusMeta(status) {
  if (status === 'completed') return { key: 'completed', label: 'Completed' };
  if (status === 'active') return { key: 'progress', label: 'In Progress' };
  if (status === 'cancelled') return { key: 'cancelled', label: 'Cancelled' };
  if (status === 'scheduled') return { key: 'scheduled', label: 'Scheduled' };
  return { key: 'muted', label: status || '—' };
}

function prettySchool(name) {
  const raw = String(name || 'School').trim();
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function pctBar(part, total) {
  if (!total) return 0;
  return Math.min(100, Math.round(((Number(part) || 0) / total) * 100));
}

function TripKpiGlyph({ name }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'trips') return <svg {...common}><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 17v2M17 17v2M3 12h18" /></svg>;
  if (name === 'check') return <svg {...common}><circle cx="12" cy="12" r="8.2" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></svg>;
  if (name === 'play') return <svg {...common}><circle cx="12" cy="12" r="8.2" /><path d="m10 9 6 3-6 3V9Z" /></svg>;
  if (name === 'x') return <svg {...common}><circle cx="12" cy="12" r="8.2" /><path d="m9 9 6 6M15 9l-6 6" /></svg>;
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="8.2" /><path d="M12 8v4.2l2.6 1.6" /></svg>;
  return <svg {...common}><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" /></svg>;
}

function TripKpiMark({ name }) {
  const common = {
    width: 11,
    height: 11,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'up') return <svg {...common}><path d="M12 18V6M7 11l5-5 5 5" /></svg>;
  if (name === 'check') return <svg {...common}><path d="M5 12.5 10 17.5 19 7" /></svg>;
  if (name === 'dot') return <svg {...common}><circle cx="12" cy="12" r="3.2" /></svg>;
  if (name === 'x') return <svg {...common}><path d="M7 7l10 10M17 7 7 17" /></svg>;
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.4 1.4" /></svg>;
  return <svg {...common}><path d="M4 12h16" /></svg>;
}

function ActionGlyph({ name }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'view') return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
  if (name === 'edit') return <svg {...common}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>;
  if (name === 'live') return <svg {...common}><path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z" /><circle cx="12" cy="10" r="2.2" /></svg>;
  return (
    <svg {...common}>
      <circle cx="12" cy="5" r="1.35" />
      <circle cx="12" cy="12" r="1.35" />
      <circle cx="12" cy="19" r="1.35" />
    </svg>
  );
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
      <polyline fill="none" stroke="#c7d2fe" strokeWidth="6" points={coords.join(' ')} />
      <polyline fill="none" stroke="#6366f1" strokeWidth="2.5" points={coords.join(' ')} />
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
  const { globalSearch = '', schoolName } = useOutletContext() || {};
  const navigate = useNavigate();
  const tab = useTripTab();
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
  const [openScheduleCreate, setOpenScheduleCreate] = useState(null);
  const bindCreate = useCallback((fn) => {
    setOpenScheduleCreate(() => fn);
  }, []);

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
    if (!menuId && panel !== 'create' && panel !== 'edit' && !detail) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (menuId) setMenuId('');
      else if (detail) setDetail(null);
      else {
        setPanel(null);
        setEditing(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuId, panel, detail]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = !needle
      ? trips
      : trips.filter((t) => {
          const driver = driverOf(t);
          const bus = busOf(t);
          const route = routeOf(t);
          const hay = [
            t.tripCode || tripCodeOf(t),
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
    return [...list].sort((a, b) => {
      const created = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (created !== 0) return created;
      const at = new Date(b.serviceDate || b.scheduledFor || 0) - new Date(a.serviceDate || a.scheduledFor || 0);
      if (at !== 0) return at;
      return String(b.scheduledTime || '').localeCompare(String(a.scheduledTime || ''))
        || String(b.tripCode || '').localeCompare(String(a.tripCode || ''));
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
      const next = data.trip || t;
      setDetail({
        ...t,
        ...next,
        routeId: typeof next.routeId === 'object' ? next.routeId : t.routeId,
        driverId: typeof next.driverId === 'object' ? next.driverId : t.driverId,
        busId: typeof next.busId === 'object' ? next.busId : t.busId,
      });
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

  const deleteTrip = async (t) => {
    if (!confirm(`Delete ${tripCodeOf(t)}? This cannot be undone.`)) return;
    setError('');
    try {
      await api(`/admin/trip-instances/${tripId(t)}`, { method: 'DELETE' });
      setInfo('Trip deleted.');
      if (detail && tripId(detail) === tripId(t)) setDetail(null);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(tripId(t));
        return next;
      });
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
      scheduledTime: t.scheduledTime || t.scheduleId?.scheduledTime || '06:30',
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
          csvEscape(tripCodeOf(t)),
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
      key: 'total',
      label: 'Total Trips',
      value: stats?.total ?? 0,
      hint: total ? `↑ ${total} this month` : 'This month',
      tint: 'purple',
      icon: 'trips',
      mark: 'up',
      bar: 100,
    },
    {
      key: 'completed',
      label: 'Completed',
      value: stats?.completed ?? 0,
      hint: `${pct(stats?.completed ?? 0, total)} of total`,
      tint: 'green',
      icon: 'check',
      mark: 'check',
      bar: pctBar(stats?.completed ?? 0, total),
    },
    {
      key: 'active',
      label: 'In Progress',
      value: stats?.active ?? 0,
      hint: `${pct(stats?.active ?? 0, total)} of total`,
      tint: 'orange',
      icon: 'play',
      mark: 'dot',
      bar: pctBar(stats?.active ?? 0, total),
    },
    {
      key: 'cancelled',
      label: 'Cancelled',
      value: stats?.cancelled ?? 0,
      hint: `${pct(stats?.cancelled ?? 0, total)} of total`,
      tint: 'rose',
      icon: 'x',
      mark: 'x',
      bar: pctBar(stats?.cancelled ?? 0, total),
    },
    {
      key: 'duration',
      label: 'Avg. Duration',
      value: stats?.avgDurationMinutes != null ? `${stats.avgDurationMinutes} min` : '—',
      hint: stats?.avgDurationMinutes != null ? 'Completed trips' : 'Not tracked',
      tint: 'violet',
      icon: 'clock',
      mark: 'clock',
      bar: stats?.avgDurationMinutes != null ? 70 : 0,
    },
    {
      key: 'distance',
      label: 'Total Distance',
      value: '—',
      hint: 'Not tracked',
      tint: 'sky',
      icon: 'distance',
      mark: 'dot',
      bar: 0,
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
  const menuTrip = trips.find((t) => tripId(t) === menuId);
  const peakHour = (analytics?.byHour || []).reduce((best, h) => (!best || h.count > best.count ? h : best), null);
  const insight = peakHour?.count
    ? peakHour.label === '6–8 AM'
      ? 'Most trips are scheduled in the morning between 6 AM – 8 AM.'
      : `Most trips are scheduled during ${peakHour.label}.`
    : '';

  return (
    <div className="sa-buses sa-trips">
      {tab === 'daily' && error && <div className="alert">{error}</div>}
      {tab === 'daily' && info && <div className="alert alert-ok">{info}</div>}

      <div className="sa-bus-head">
        <div>
          <h2>Trips</h2>
          <p className="sa-vd-crumbs">
            <Link to="/school-admin">Dashboard</Link>
            <span>›</span>
            <em>Trips</em>
            {tab !== 'daily' ? (
              <>
                <span>›</span>
                <em>{tab === 'schedules' ? 'Scheduling' : 'Tours & outings'}</em>
              </>
            ) : null}
          </p>
        </div>
        {tab === 'daily' && (
          <div className="sa-bus-head-actions">
            <button type="button" className="sa-btn sa-btn-outline sa-bus-export" onClick={exportRows}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 4v10M8 10l4 4 4-4" />
                <path d="M5 18h14" />
              </svg>
              Export
            </button>
            <button
              type="button"
              className="sa-btn sa-btn-primary"
              onClick={() => {
                setCreateForm({ ...emptyCreate, routeId: '' });
                setPanel('create');
              }}
            >
              + New Trip
            </button>
          </div>
        )}
      </div>

      <div className="sa-trips-tabs-row">
        <nav className="sa-trips-tabs" aria-label="Trip sections">
          {TRIP_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'is-on' : ''}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => writeTripTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {tab === 'schedules' && (
          <button type="button" className="sa-btn sa-btn-primary sa-trips-tab-action" onClick={() => openScheduleCreate?.()}>
            + Add schedule
          </button>
        )}
      </div>

      {tab === 'schedules' && (
        <TripScheduling embedded onBindCreate={bindCreate} />
      )}
      {tab === 'tours' && <TripOutings />}

      {tab === 'daily' && (
      <>
      <section className="sa-bus-kpis sa-trips-kpis" aria-label="Trip metrics">
        {kpis.map((m) => (
          <article key={m.key} className={`sa-bus-kpi tint-${m.tint}`}>
            <i className="sa-bus-kpi-icon" aria-hidden="true">
              <TripKpiGlyph name={m.icon} />
            </i>
            <div className="sa-bus-kpi-copy">
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em className={String(m.hint).startsWith('↑') ? 'is-up' : ''}>{m.hint}</em>
            </div>
            <b className="sa-bus-kpi-mark" aria-hidden="true">
              <TripKpiMark name={m.mark} />
            </b>
            <div className="sa-bus-kpi-bar" aria-hidden="true">
              <i style={{ width: `${m.bar}%` }} />
            </div>
          </article>
        ))}
      </section>

      <section className="sa-trips-layout">
        <article className="sa-card sa-bus-table-card">
          <div className="sa-bus-toolbar sa-trips-toolbar">
            <label className="sa-stu-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.2-3.2" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by trip ID, route, driver or vehicle..."
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
            <button type="button" className="sa-btn sa-btn-outline sa-bus-more-btn" onClick={() => setMoreFilters((v) => !v)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M4 5h16l-6.2 7.2V18l-3.6 2v-7.8L4 5Z" />
              </svg>
              More Filters
            </button>
          </div>
          {moreFilters && (
            <div className="sa-bus-more">
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
            <table className="sa-table sa-bus-table sa-trips-table">
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
                    <tr key={id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleRow(id)}
                          aria-label={`Select ${tripCodeOf(t)}`}
                        />
                      </td>
                      <td>
                        <div className="sa-rt-name">
                          <strong>
                            <button type="button" className="sa-text-link" onClick={() => openDetail(t)}>
                              {tripCodeOf(t)}
                            </button>
                          </strong>
                          <small>{fmtDate(t.serviceDate || t.scheduledFor) || '—'}</small>
                        </div>
                      </td>
                      <td>
                        <div className="sa-rt-name">
                          {t.kind === 'outing' ? (
                            <strong className="sa-rt-link">
                              {t.outing?.title || route?.name || 'Educational tour'}
                            </strong>
                          ) : route?._id ? (
                            <Link to={`/school-admin/routes/${route._id}`} className="sa-rt-link" style={{ fontSize: '0.75rem' }}>
                              {route.name}
                            </Link>
                          ) : (
                            <strong>{route?.name || '—'}</strong>
                          )}
                          <small>{t.kind === 'outing' ? (t.outing?.location || t.path || 'Tour') : (t.path || '—')}</small>
                        </div>
                      </td>
                      <td>
                        {driver?.name ? (
                          <div className="sa-bus-driver">
                            {driver.photoUrl ? <img src={driver.photoUrl} alt="" /> : <span>{initials(driver.name)}</span>}
                            <div>
                              <strong>{driver.name}</strong>
                              {driver.phone ? <small>{driver.phone}</small> : null}
                            </div>
                          </div>
                        ) : (
                          <span className="sa-bus-muted">—</span>
                        )}
                      </td>
                      <td>
                        {bus ? (
                          <div className="sa-rt-vehicle">
                            <i className="sa-rt-vehicle-icon" aria-hidden="true">
                              <TripKpiGlyph name="trips" />
                            </i>
                            <div>
                              <strong>{bus.label || 'Vehicle'}</strong>
                              <small>{bus.plate || '—'}</small>
                            </div>
                          </div>
                        ) : (
                          <span className="sa-bus-muted">—</span>
                        )}
                      </td>
                      <td>{startTime(t) || '—'}</td>
                      <td>{fmtTime(t.endedAt) || '—'}</td>
                      <td>
                        <div className="sa-trips-status-cell">
                          <span className={`sa-stu-status is-${meta.key}`}>{meta.label}</span>
                          {t.kind === 'outing' ? <em className="sa-tour-pill">Tour</em> : null}
                        </div>
                      </td>
                      <td>
                        <strong>{t.studentCount ?? (t.kidIds || []).length}</strong>
                      </td>
                      <td className="sa-trips-sched-actions">
                        {t.status === 'scheduled' ? (
                          <button type="button" className="sa-text-link" onClick={() => openEdit(t)}>
                            Edit
                          </button>
                        ) : null}
                        {t.status === 'scheduled' || t.status === 'cancelled' ? (
                          <button type="button" className="sa-text-link is-danger" onClick={() => deleteTrip(t)}>
                            Delete
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="sa-icon-ghost"
                          aria-label="More"
                          onClick={() => setMenuId((cur) => (cur === id ? '' : id))}
                        >
                          <ActionGlyph name="more" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!slice.length && (
                  <tr>
                    <td colSpan={10} className="sa-stu-empty">
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

      </section>

      <section className="sa-trips-charts">
        <article className="sa-card sa-trips-widget">
          <h3>Trips Trend (This Month)</h3>
          {analytics?.trend?.length ? <TrendChart points={analytics.trend} /> : <p className="sa-muted">No trips this month.</p>}
        </article>
        <article className="sa-card sa-trips-widget">
          <h3>Trips by Status</h3>
          {donutTotal ? (
            <div className="sa-stops-donut-wrap">
              <div className="sa-stops-donut" style={donutStyle(statusDonut, donutTotal)} />
              <ul className="sa-stops-donut-key">
                {statusDonut.map((item) => (
                  <li key={item.key}>
                    <i style={{ background: item.color }} />
                    {item.label}
                    <strong>{pct(item.count, donutTotal)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="sa-muted">No trips this month.</p>
          )}
        </article>
        <article className="sa-card sa-trips-widget">
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
        <article className="sa-card sa-trips-widget sa-trips-duration">
          <h3>Avg. Trip Duration</h3>
          {stats?.avgDurationMinutes != null ? (
            <p className="sa-trips-gauge">
              <i aria-hidden="true"><TripKpiGlyph name="clock" /></i>
              <strong>{stats.avgDurationMinutes} min</strong>
              <span>Completed trips</span>
            </p>
          ) : (
            <p className="sa-muted">Start and end times are not saved on enough trips yet.</p>
          )}
        </article>
        <article className="sa-card sa-trips-widget">
          <h3>Trips by Time of Day</h3>
          {analytics?.byHour?.some((h) => h.count) ? (
            <ul className="sa-trips-hours">
              {analytics.byHour.map((h) => (
                <li key={h.label}>
                  <i style={{ height: `${Math.max(6, (h.count / hourMax) * 56)}px` }} />
                  <span>{h.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No scheduled times this month.</p>
          )}
        </article>
        <article className="sa-card sa-trips-widget sa-trips-insight">
          <i aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 18h6M10 21h4" />
              <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.2 2.2h4.8c.1-.9.6-1.7 1.2-2.2A6 6 0 0 0 12 3Z" />
            </svg>
          </i>
          <div>
            <h3>Insights</h3>
            <p>{insight || 'Trip patterns will appear here once more trips are scheduled.'}</p>
          </div>
        </article>
      </section>

      {detailTrip && (
        <div className="sa-action-overlay" onClick={() => setDetail(null)} role="presentation">
          <div className="sa-action-modal sa-stop-detail sa-trip-detail" role="dialog" aria-modal="true" aria-labelledby="sa-trip-detail-title" onClick={(e) => e.stopPropagation()}>
            <header className="sa-stop-detail-bar">
              <h2>Trip Details</h2>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setDetail(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="sa-stop-detail-id">
              <i aria-hidden="true"><TripKpiGlyph name="trips" /></i>
              <div>
                <h3 id="sa-trip-detail-title">{tripCodeOf(detailTrip)}</h3>
                <em className={`sa-stu-status is-${detailMeta.key}`}>{detailMeta.label}</em>
              </div>
            </div>
            <dl className="sa-stop-detail-grid">
              <div className="sa-stop-detail-field"><div><dt>Route</dt><dd>{routeOf(detailTrip)?.name || '—'}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Date</dt><dd>{fmtDate(detailTrip.serviceDate || detailTrip.scheduledFor) || '—'}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Driver</dt><dd>{driverOf(detailTrip)?.name || '—'}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Vehicle</dt><dd>{vehicleLabel(busOf(detailTrip)) || '—'}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Start</dt><dd>{startTime(detailTrip) || '—'}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>End</dt><dd>{fmtTime(detailTrip.endedAt) || '—'}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Students</dt><dd>{studentCount}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Duration</dt><dd>{detailTrip.durationMinutes != null ? `${detailTrip.durationMinutes} min` : '—'}</dd></div></div>
            </dl>
            {detailExtra?.stops?.length ? (
              <div className="sa-trip-detail-map">
                <MapView
                  center={detailExtra.stops[0]?.location || { lat: -1.3965, lng: 36.7542 }}
                  stops={detailExtra.stops}
                  direction={detailTrip.direction}
                  showRoute={detailExtra.stops.length >= 2}
                  driverLocation={detailTrip.status === 'active' ? detailTrip.latestLocation : null}
                  interactive={false}
                  className="map-canvas sa-trips-mini-map"
                />
              </div>
            ) : null}
            <div className="sa-trips-rings">
              <div>
                <strong>{studentCount ? pct(picked, studentCount) : '—'}</strong>
                <small>Picked up {picked}/{studentCount}</small>
              </div>
              <div>
                <strong>{studentCount ? pct(dropped, studentCount) : '—'}</strong>
                <small>Dropped off {dropped}/{studentCount}</small>
              </div>
            </div>
            <div className="sa-stop-detail-foot">
              {detailTrip.status === 'active' ? (
                <Link to="/school-admin/live-tracking" className="sa-btn sa-btn-primary">Live map</Link>
              ) : routeOf(detailTrip)?._id ? (
                <Link to={`/school-admin/routes/${routeOf(detailTrip)._id}`} className="sa-btn sa-btn-outline">View route</Link>
              ) : (
                <button type="button" className="sa-btn sa-btn-outline" onClick={() => setDetail(null)}>Close</button>
              )}
              {detailTrip.status === 'scheduled' ? (
                <button type="button" className="sa-btn sa-btn-primary" onClick={() => { setDetail(null); openEdit(detailTrip); }}>Edit trip</button>
              ) : null}
              {detailTrip.status === 'scheduled' || detailTrip.status === 'cancelled' ? (
                <button type="button" className="sa-btn sa-btn-outline" onClick={() => { setDetail(null); deleteTrip(detailTrip); }}>Delete</button>
              ) : (
                <button type="button" className="sa-btn sa-btn-outline" onClick={() => setDetail(null)}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}

      {menuTrip && (
        <div className="sa-action-overlay" onClick={() => setMenuId('')} role="presentation">
          <div className="sa-action-modal" role="dialog" aria-modal="true" aria-labelledby="sa-trip-action-title" onClick={(e) => e.stopPropagation()}>
            <header className="sa-action-head">
              <div>
                <p className="sa-action-kicker">Trip actions</p>
                <h3 id="sa-trip-action-title">{tripCodeOf(menuTrip)}</h3>
                <small>{routeOf(menuTrip)?.name || 'Unassigned'} · {statusMeta(menuTrip.status).label}</small>
              </div>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setMenuId('')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="sa-action-list">
              <button type="button" onClick={() => { setMenuId(''); openDetail(menuTrip); }}>
                <i aria-hidden="true"><ActionGlyph name="view" /></i>
                <span><strong>View details</strong><em>See route, students, and times</em></span>
              </button>
              {menuTrip.status === 'scheduled' ? (
                <button type="button" onClick={() => { setMenuId(''); openEdit(menuTrip); }}>
                  <i aria-hidden="true"><ActionGlyph name="edit" /></i>
                  <span><strong>Edit trip</strong><em>Change driver, vehicle, or time</em></span>
                </button>
              ) : null}
              {menuTrip.status === 'active' ? (
                <button type="button" onClick={() => navigate('/school-admin/live-tracking')}>
                  <i aria-hidden="true"><ActionGlyph name="live" /></i>
                  <span><strong>Live map</strong><em>Watch this trip in real time</em></span>
                </button>
              ) : null}
              {menuTrip.status === 'scheduled' ? (
                <button type="button" className="is-danger" onClick={() => { setMenuId(''); cancelTrip(menuTrip); }}>
                  <i aria-hidden="true"><TripKpiGlyph name="x" /></i>
                  <span><strong>Cancel trip</strong><em>Stop this instance from running</em></span>
                </button>
              ) : null}
              {menuTrip.status === 'scheduled' || menuTrip.status === 'cancelled' ? (
                <button type="button" className="is-danger" onClick={() => { setMenuId(''); deleteTrip(menuTrip); }}>
                  <i aria-hidden="true"><TripKpiGlyph name="x" /></i>
                  <span><strong>Delete trip</strong><em>Remove this trip from the list</em></span>
                </button>
              ) : null}
            </div>
            <div className="sa-action-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMenuId('')}>Close</button>
            </div>
          </div>
        </div>
      )}

      {panel === 'create' && (
        <div className="sa-action-overlay" onClick={() => setPanel(null)} role="presentation">
          <div className="sa-action-modal sa-stop-form" role="dialog" aria-modal="true" aria-labelledby="sa-trip-create-title" onClick={(e) => e.stopPropagation()}>
            <header className="sa-stop-detail-bar">
              <h2 id="sa-trip-create-title">New Trip</h2>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setPanel(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="sa-stop-form-body">
              {error && <div className="alert">{error}</div>}
              <label className="sa-field">
                <span>Route <b className="sa-req">*</b></span>
                <select value={createForm.routeId} onChange={(e) => setCreateForm({ ...createForm, routeId: e.target.value })}>
                  <option value="">Select a route</option>
                  {routes.map((r) => (
                    <option key={r._id} value={r._id}>{r.name}</option>
                  ))}
                </select>
              </label>
              <label className="sa-field">
                <span>Driver <b className="sa-req">*</b></span>
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
            </div>
            <div className="sa-stop-form-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setPanel(null)}>Cancel</button>
              <button type="button" className="sa-btn sa-btn-primary" disabled={!createForm.routeId || !createForm.driverId} onClick={createTrip}>
                Create trip
              </button>
            </div>
          </div>
        </div>
      )}

      {panel === 'edit' && editing && (
        <div className="sa-action-overlay" onClick={() => { setPanel(null); setEditing(null); }} role="presentation">
          <div className="sa-action-modal sa-stop-form" role="dialog" aria-modal="true" aria-labelledby="sa-trip-edit-title" onClick={(e) => e.stopPropagation()}>
            <header className="sa-stop-detail-bar">
              <h2 id="sa-trip-edit-title">Edit {tripCodeOf(editing)}</h2>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => { setPanel(null); setEditing(null); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="sa-stop-form-body">
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
            </div>
            <div className="sa-stop-form-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => { setPanel(null); setEditing(null); }}>Cancel</button>
              <button type="button" className="sa-btn sa-btn-primary" onClick={saveEdit}>Save override</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      <footer className="sa-home-foot">
        <span>© {year} {prettySchool(schoolName)}. All rights reserved.</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
