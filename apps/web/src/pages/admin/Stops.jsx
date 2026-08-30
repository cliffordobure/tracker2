import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';
import LocationSearch from '../../components/LocationSearch';

const PAGE_SIZES = [10, 25, 50];
const DONUT_COLORS = ['#5d3fd3', '#0ea5e9', '#16a34a', '#f97316', '#e11d48', '#14b8a6'];
const emptyForm = {
  name: '',
  routeId: '',
  type: 'home',
  area: '',
  address: '',
  order: 1,
  active: true,
  location: { lat: -1.3965, lng: 36.7542 },
};

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

function stopId(s) {
  return String(s._id || s.id);
}

function kindLabel(s) {
  if (s.kind === 'start') return 'Start Point';
  if (s.kind === 'end') return 'End Point';
  if (s.type === 'school') return 'School';
  return 'Intermediate';
}

function prettySchool(name) {
  const raw = String(name || 'School').trim();
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function pctBar(part, total) {
  if (!total) return 0;
  return Math.min(100, Math.round(((Number(part) || 0) / total) * 100));
}

function StopKpiGlyph({ name }) {
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
  if (name === 'pin') return <svg {...common}><path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z" /><circle cx="12" cy="10" r="2.2" /></svg>;
  if (name === 'shield') return <svg {...common}><path d="M12 3 4.5 6.2v5.4c0 4.4 2.9 8.4 7.5 9.6 4.6-1.2 7.5-5.2 7.5-9.6V6.2L12 3Z" /></svg>;
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="8.2" /><path d="M12 8v4.2l2.6 1.6" /></svg>;
  if (name === 'users') return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 19c.8-2.8 2.8-4.2 6-4.2S14.2 16.2 15 19" /><circle cx="17" cy="9" r="2.2" /></svg>;
  return <svg {...common}><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 17v2M17 17v2M3 12h18" /></svg>;
}

function StopKpiMark({ name }) {
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
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.4 1.4" /></svg>;
  return <svg {...common}><rect x="3" y="7" width="18" height="10" rx="2" /></svg>;
}

function fmtStopStamp(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} - ${time}`;
}

function StopDetailGlyph({ name }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'bus') return <svg {...common}><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 17v2M17 17v2M3 12h18" /></svg>;
  if (name === 'area') return <svg {...common}><path d="M9 4h6l4 6-7 10L5 10 9 4Z" /><path d="M8.2 10h7.6" /></svg>;
  if (name === 'pin') return <svg {...common}><path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z" /><circle cx="12" cy="10" r="2.2" /></svg>;
  if (name === 'users') return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 19c.8-2.8 2.8-4.2 6-4.2S14.2 16.2 15 19" /><circle cx="17" cy="9" r="2.2" /></svg>;
  if (name === 'type') return <svg {...common}><circle cx="6" cy="12" r="2.1" /><circle cx="18" cy="7" r="2.1" /><circle cx="18" cy="17" r="2.1" /><path d="M8 12h7.2M16.2 8.7 8.7 11.2M16.2 15.3 8.7 12.8" /></svg>;
  if (name === 'shield') return <svg {...common}><path d="M12 3 4.5 6.2v5.4c0 4.4 2.9 8.4 7.5 9.6 4.6-1.2 7.5-5.2 7.5-9.6V6.2L12 3Z" /></svg>;
  if (name === 'cal') return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
  if (name === 'note') return <svg {...common}><path d="M7 3h8l5 5v13H7V3Z" /><path d="M15 3v5h5M9 13h6M9 17h4" /></svg>;
  if (name === 'edit') return <svg {...common}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>;
  return <svg {...common}><circle cx="6" cy="12" r="2.1" /><circle cx="18" cy="7" r="2.1" /><circle cx="18" cy="17" r="2.1" /><path d="M8 12h7.2M16.2 8.7 8.7 11.2M16.2 15.3 8.7 12.8" /></svg>;
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
  if (name === 'edit') return <svg {...common}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>;
  if (name === 'view') return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
  return (
    <svg {...common}>
      <circle cx="12" cy="5" r="1.35" />
      <circle cx="12" cy="12" r="1.35" />
      <circle cx="12" cy="19" r="1.35" />
    </svg>
  );
}

function isActive(s) {
  return s.active !== false && s.routeActive !== false;
}

function place(s) {
  if (s.address) return s.address;
  if (s.location?.lat != null && s.location?.lng != null) {
    return `${Number(s.location.lat).toFixed(4)}, ${Number(s.location.lng).toFixed(4)}`;
  }
  return '';
}

function geoCenter(list) {
  const pts = (list || []).filter((s) => s.location?.lat != null && s.location?.lng != null);
  if (!pts.length) return { lat: -1.3965, lng: 36.7542 };
  return {
    lat: pts.reduce((a, s) => a + Number(s.location.lat), 0) / pts.length,
    lng: pts.reduce((a, s) => a + Number(s.location.lng), 0) / pts.length,
  };
}

function donutStyle(items, total) {
  if (!total) return { background: '#e2e8f0' };
  let acc = 0;
  const parts = items.map((item, i) => {
    const start = acc;
    acc += (item.count / total) * 100;
    return `${item.color || DONUT_COLORS[i % DONUT_COLORS.length]} ${start}% ${acc}%`;
  });
  return { background: `conic-gradient(${parts.join(', ')})` };
}

export default function StopsPage() {
  const { globalSearch = '', schoolName } = useOutletContext() || {};
  const navigate = useNavigate();
  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [stats, setStats] = useState(null);
  const [busiest, setBusiest] = useState([]);
  const [breakdown, setBreakdown] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);
  const [hasStudents, setHasStudents] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [menuId, setMenuId] = useState('');
  const [panel, setPanel] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [mapFocus, setMapFocus] = useState(null);

  const load = async () => {
    const data = await api('/admin/stops');
    setStops(data.stops || []);
    setRoutes(data.routes || []);
    setStats(data.stats || null);
    setBusiest(data.busiest || []);
    setBreakdown(data.breakdown || null);
    setAlerts(data.alerts || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    if (!menuId && panel !== 'view' && panel !== 'form') return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (menuId) setMenuId('');
      else closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuId, panel]);

  const areas = useMemo(() => {
    const set = new Set();
    stops.forEach((s) => {
      if (s.area) set.add(s.area);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [stops]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return stops.filter((s) => {
      if (statusFilter === 'active' && !isActive(s)) return false;
      if (statusFilter === 'inactive' && isActive(s)) return false;
      if (routeFilter && String(s.routeId) !== routeFilter) return false;
      if (areaFilter === '__none' && s.area) return false;
      if (areaFilter && areaFilter !== '__none' && s.area !== areaFilter) return false;
      if (typeFilter && s.type !== typeFilter) return false;
      if (hasStudents === 'yes' && !(s.studentCount > 0)) return false;
      if (hasStudents === 'no' && s.studentCount > 0) return false;
      if (!needle) return true;
      const hay = [s.name, s.address, s.area, s.routeName, kindLabel(s)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [stops, q, statusFilter, routeFilter, areaFilter, typeFilter, hasStudents]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, routeFilter, areaFilter, typeFilter, hasStudents, pageSize]);

  const allOnPageSelected = slice.length > 0 && slice.every((s) => selected.has(stopId(s)));

  const toggleAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) slice.forEach((s) => next.delete(stopId(s)));
      else slice.forEach((s) => next.add(stopId(s)));
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

  const closePanel = () => {
    setPanel(null);
    setViewing(null);
    setEditingId(null);
    setForm(emptyForm);
    setMapFocus(null);
  };

  const startCreate = () => {
    setError('');
    setSuccess('');
    setEditingId(null);
    setForm({ ...emptyForm, routeId: '', type: '' });
    setViewing(null);
    setPanel('form');
  };

  const startEdit = (s) => {
    setError('');
    setSuccess('');
    setEditingId(stopId(s));
    setForm({
      name: s.name || '',
      routeId: String(s.routeId || ''),
      type: s.type === 'school' ? 'school' : 'home',
      area: s.area || '',
      address: s.address || '',
      order: s.order || 1,
      active: s.active !== false,
      location: s.location || emptyForm.location,
    });
    setViewing(null);
    setPanel('form');
  };

  const submit = async () => {
    setError('');
    setSuccess('');
    try {
      const body = {
        name: form.name,
        routeId: form.routeId,
        type: form.type,
        area: form.area,
        address: form.address,
        order: form.order,
        active: form.active,
        location: form.location,
      };
      if (editingId) {
        await api(`/admin/stops/${editingId}`, { method: 'PUT', body });
        setSuccess(`${form.name} updated.`);
      } else {
        await api('/admin/stops', { method: 'POST', body });
        setSuccess(`${form.name} added.`);
      }
      closePanel();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const setActive = async (s, next) => {
    try {
      await api(`/admin/stops/${stopId(s)}`, { method: 'PUT', body: { active: next } });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (s) => {
    if (!confirm(`Remove ${s.name}?`)) return;
    try {
      await api(`/admin/stops/${stopId(s)}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const exportRows = () => {
    const rows = selected.size ? filtered.filter((s) => selected.has(stopId(s))) : filtered;
    const header = ['Name', 'Type', 'Route', 'Students', 'Area', 'Address', 'Status'];
    const lines = [
      header.join(','),
      ...rows.map((s) =>
        [
          csvEscape(s.name),
          csvEscape(s.type),
          csvEscape(s.routeName),
          csvEscape(s.studentCount),
          csvEscape(s.area),
          csvEscape(s.address),
          csvEscape(isActive(s) ? 'Active' : 'Inactive'),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stops.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const year = new Date().getFullYear();
  const canSave = Boolean(form.name.trim() && form.routeId && form.type && form.location?.lat != null);
  const mapStops = filtered.map((s) => ({ ...s, pinLabel: '' }));
  const breakdownItems = (breakdown?.items || []).map((item, i) => ({
    ...item,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));
  const breakdownTotal = breakdownItems.reduce((a, i) => a + i.count, 0);
  const legendRoutes = [];
  const seen = new Set();
  for (const s of filtered) {
    const rid = String(s.routeId);
    if (seen.has(rid)) continue;
    seen.add(rid);
    legendRoutes.push({ id: rid, name: s.routeName || 'Route', color: s.pinColor });
    if (legendRoutes.length >= 6) break;
  }
  const extraRoutes = seen.size - legendRoutes.length;

  const total = stats?.total ?? stops.length;
  const activeCount = stats?.active ?? 0;
  const studentCount = stats?.studentsAssigned ?? 0;
  const withBus = stats?.withBus ?? 0;
  const kpis = [
    {
      key: 'total',
      label: 'Total Stops',
      value: total,
      hint: stats?.addedThisMonth ? `↑ ${stats.addedThisMonth} this month` : 'Saved stops',
      tint: 'purple',
      icon: 'pin',
      mark: 'up',
      bar: 100,
    },
    {
      key: 'active',
      label: 'Active Stops',
      value: `${activeCount}`,
      hint: total ? `${pct(activeCount, total)} of total` : 'No stops yet',
      tint: 'green',
      icon: 'shield',
      mark: 'check',
      bar: pctBar(activeCount, total),
    },
    {
      key: 'wait',
      label: 'Avg. Wait Time',
      value: '—',
      hint: 'Not tracked',
      tint: 'orange',
      icon: 'clock',
      mark: 'clock',
      bar: 0,
    },
    {
      key: 'students',
      label: 'Total Students',
      value: studentCount,
      hint: stats?.addedStudentsThisMonth ? `↑ ${stats.addedStudentsThisMonth} this month` : 'On a stop or route',
      tint: 'violet',
      icon: 'users',
      mark: 'up',
      bar: pctBar(studentCount, Math.max(studentCount, 1)),
    },
    {
      key: 'buses',
      label: 'Stops with Buses',
      value: withBus,
      hint: total ? `${pct(withBus, total)} of total` : 'No stops yet',
      tint: 'sky',
      icon: 'bus',
      mark: 'check',
      bar: pctBar(withBus, total),
    },
  ];
  const menuStop = stops.find((s) => stopId(s) === menuId);

  return (
    <div className="sa-buses sa-stops">
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <div className="sa-bus-head">
        <div>
          <h2>Stops</h2>
          <p className="sa-vd-crumbs">
            <Link to="/school-admin">Dashboard</Link>
            <span>›</span>
            <em>Stops</em>
          </p>
        </div>
        <div className="sa-bus-head-actions">
          <button type="button" className="sa-btn sa-btn-outline sa-bus-export" onClick={exportRows}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 4v10M8 10l4 4 4-4" />
              <path d="M5 18h14" />
            </svg>
            Export
          </button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>
            + Add Stop
          </button>
        </div>
      </div>

      <section className="sa-bus-kpis sa-stops-kpis" aria-label="Stop metrics">
        {kpis.map((m) => (
          <article key={m.key} className={`sa-bus-kpi tint-${m.tint}`}>
            <i className="sa-bus-kpi-icon" aria-hidden="true">
              <StopKpiGlyph name={m.icon} />
            </i>
            <div className="sa-bus-kpi-copy">
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em className={String(m.hint).startsWith('↑') ? 'is-up' : ''}>{m.hint}</em>
            </div>
            <b className="sa-bus-kpi-mark" aria-hidden="true">
              <StopKpiMark name={m.mark} />
            </b>
            <div className="sa-bus-kpi-bar" aria-hidden="true">
              <i style={{ width: `${m.bar}%` }} />
            </div>
          </article>
        ))}
      </section>

      <section className="sa-stops-layout">
        <article className="sa-card sa-bus-table-card">
          <div className="sa-bus-toolbar sa-stops-toolbar">
            <label className="sa-stu-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.2-3.2" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by stop name..."
              />
            </label>
            <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} aria-label="Route">
              <option value="">All Routes</option>
              {routes.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type">
              <option value="">All Types</option>
              <option value="home">Home</option>
              <option value="school">School</option>
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
              <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Area">
                <option value="">All Areas</option>
                <option value="__none">No area set</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <select value={hasStudents} onChange={(e) => setHasStudents(e.target.value)} aria-label="Students">
                <option value="">All student states</option>
                <option value="yes">Has students</option>
                <option value="no">No students yet</option>
              </select>
            </div>
          )}

          <div className="sa-table-wrap">
            <table className="sa-table sa-bus-table sa-stops-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllPage} aria-label="Select page" />
                  </th>
                  <th>Stop Name</th>
                  <th>Route</th>
                  <th>Students</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((s) => {
                  const id = stopId(s);
                  const active = isActive(s);
                  const extra = kindLabel(s);
                  return (
                    <tr key={id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleRow(id)}
                          aria-label={`Select ${s.name}`}
                        />
                      </td>
                      <td>
                        <div className="sa-stops-name">
                          <i className="sa-stops-pin" aria-hidden="true">
                            <StopKpiGlyph name="pin" />
                          </i>
                          <div className="sa-rt-name">
                            <strong>
                              <button type="button" className="sa-text-link" onClick={() => { setViewing(s); setPanel('view'); }}>
                                {s.name}
                              </button>
                            </strong>
                            <small>{extra}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {s.routeId ? (
                          <Link to={`/school-admin/routes/${s.routeId}`} className="sa-rt-link" style={{ fontSize: '0.75rem' }}>
                            {s.routeName || 'Route'}
                          </Link>
                        ) : (
                          <span className="sa-bus-muted">—</span>
                        )}
                      </td>
                      <td>
                        <strong>{s.studentCount ?? 0}</strong>
                      </td>
                      <td>
                        <em className="sa-stops-type">{s.type === 'school' ? 'School' : 'Home'}</em>
                      </td>
                      <td>
                        <span className={`sa-stu-status is-${active ? 'active' : 'muted'}`}>{active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td>
                        <div className="sa-stu-actions sa-bus-actions">
                          <button type="button" className="sa-icon-ghost is-edit" aria-label="Edit" onClick={() => startEdit(s)}>
                            <ActionGlyph name="edit" />
                          </button>
                          <button
                            type="button"
                            className="sa-icon-ghost"
                            aria-label="More"
                            onClick={() => setMenuId((cur) => (cur === id ? '' : id))}
                          >
                            <ActionGlyph name="more" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!slice.length && (
                  <tr>
                    <td colSpan={7} className="sa-stu-empty">
                      No stops match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="sa-table-foot sa-stu-foot">
            <span>
              Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0} to{' '}
              {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} stops
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

        <aside className="sa-stops-side">
          <article className="sa-card sa-stops-widget">
            <h3>All Stops Map</h3>
            {mapStops.length ? (
              <MapView
                center={geoCenter(mapStops)}
                zoom={11.4}
                stops={mapStops}
                showRoute={false}
                className="map-canvas sa-stops-map"
              />
            ) : (
              <p className="sa-muted">No stops to plot for these filters.</p>
            )}
            {legendRoutes.length ? (
              <ul className="sa-stops-legend">
                {legendRoutes.map((r) => (
                  <li key={r.id}>
                    <i style={{ background: r.color }} />
                    {r.name}
                  </li>
                ))}
                {extraRoutes > 0 ? <li>Other routes ({extraRoutes})</li> : null}
              </ul>
            ) : null}
          </article>

          <article className="sa-card sa-stops-widget">
            <h3>Top 5 Busiest Stops</h3>
            {busiest.length ? (
              <ol className="sa-stops-busy">
                {busiest.map((s, i) => (
                  <li key={s.id}>
                    <b>{i + 1}</b>
                    <div>
                      <strong>{s.name}</strong>
                      <small>{s.routeName || '—'}</small>
                    </div>
                    <span>{s.studentCount} {s.studentCount === 1 ? 'student' : 'students'}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="sa-muted">No students assigned yet.</p>
            )}
            <button type="button" className="sa-text-link" onClick={() => { setQ(''); setRouteFilter(''); }}>
              View all stops
            </button>
          </article>

          <article className="sa-card sa-stops-widget">
            <h3>{breakdown?.kind === 'area' ? 'Stops by Area' : 'Stops by Type'}</h3>
            {breakdownTotal ? (
              <div className="sa-stops-donut-wrap">
                <div className="sa-stops-donut" style={donutStyle(breakdownItems, breakdownTotal)} />
                <ul className="sa-stops-donut-key">
                  {breakdownItems.map((item) => (
                    <li key={item.label}>
                      <i style={{ background: item.color }} />
                      {item.label}
                      <strong>{pct(item.count, breakdownTotal)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="sa-muted">No stops to summarise yet.</p>
            )}
          </article>

          <article className="sa-card sa-stops-widget sa-stops-facility">
            <i aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 21V7l8-4 8 4v14M9 21v-6h6v6" />
              </svg>
            </i>
            <div>
              <h3>Facilities at Stops</h3>
              <p className="sa-muted">Shelter, CCTV, lighting, and seating are not stored yet.</p>
            </div>
          </article>

          <article className="sa-card sa-stops-widget sa-stops-alert-card">
            <i aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0Z" />
              </svg>
            </i>
            <div>
              <h3>Alerts &amp; Issues</h3>
              {alerts.length ? (
                <ul className="sa-stops-alerts">
                  {alerts.map((a) => (
                    <li key={a.text} className={`is-${a.tone}`}>{a.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">No stop issues from saved records.</p>
              )}
            </div>
          </article>
        </aside>
      </section>

      {panel === 'view' && viewing && (
        <div className="sa-action-overlay" onClick={closePanel} role="presentation">
          <div
            className="sa-action-modal sa-stop-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sa-stop-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sa-stop-detail-bar">
              <h2>Stop Details</h2>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={closePanel}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="sa-stop-detail-id">
              <i aria-hidden="true">
                <StopKpiGlyph name="pin" />
              </i>
              <div>
                <h3 id="sa-stop-detail-title">{viewing.name}</h3>
                <em>{kindLabel(viewing)}</em>
              </div>
            </div>
            <dl className="sa-stop-detail-grid">
              {[
                { icon: 'bus', label: 'Route', value: viewing.routeName || '—' },
                { icon: 'type', label: 'Type', value: kindLabel(viewing) },
                { icon: 'area', label: 'Area', value: viewing.area || '—' },
                { icon: 'shield', label: 'Status', value: isActive(viewing) ? 'Active' : 'Inactive', status: isActive(viewing) },
                { icon: 'pin', label: 'Address', value: place(viewing) || '—' },
                { icon: 'cal', label: 'Created', value: fmtStopStamp(viewing.createdAt) },
                { icon: 'users', label: 'Students', value: viewing.studentCount ?? 0 },
                { icon: 'cal', label: 'Updated', value: fmtStopStamp(viewing.updatedAt) },
                { icon: 'bus', label: 'Vehicle on route', value: viewing.hasBus ? 'Yes' : 'No' },
                { icon: 'note', label: 'Description', value: viewing.description || '—' },
              ].map((row) => (
                <div key={row.label} className="sa-stop-detail-field">
                  <i aria-hidden="true">
                    <StopDetailGlyph name={row.icon} />
                  </i>
                  <div>
                    <dt>{row.label}</dt>
                    <dd>
                      {row.status != null ? (
                        <span className={`sa-stu-status is-${row.status ? 'active' : 'muted'}`}>{row.value}</span>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
            <div className="sa-stop-detail-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => startEdit(viewing)}>
                <StopDetailGlyph name="edit" />
                Edit stop
              </button>
              {viewing.routeId ? (
                <Link to={`/school-admin/routes/${viewing.routeId}`} className="sa-btn sa-btn-primary">
                  <StopDetailGlyph name="type" />
                  View route
                </Link>
              ) : (
                <button type="button" className="sa-btn sa-btn-primary" disabled>
                  <StopDetailGlyph name="type" />
                  View route
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {panel === 'form' && (
        <div className="sa-action-overlay" onClick={closePanel} role="presentation">
          <div
            className="sa-action-modal sa-stop-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sa-stop-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sa-stop-detail-bar">
              <h2 id="sa-stop-form-title">{editingId ? 'Edit Stop' : 'Add Stop'}</h2>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={closePanel}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="sa-stop-form-body">
              <div className="sa-stop-form-intro">
                <i aria-hidden="true">
                  <StopKpiGlyph name="pin" />
                </i>
                <div>
                  <strong>{editingId ? 'Edit Stop' : 'Add Stop'}</strong>
                  <small>
                    {editingId
                      ? 'Update this stop for your school transport routes.'
                      : 'Create a new stop for your school transport routes.'}
                  </small>
                </div>
              </div>
              {error && <div className="alert">{error}</div>}
              <label className="sa-field">
                <span>Stop Name <b className="sa-req">*</b></span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter stop name"
                  required
                />
              </label>
              <div className="sa-stu-form-row">
                <label className="sa-field">
                  <span>Route <b className="sa-req">*</b></span>
                  <select value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })} required>
                    <option value="">Select route</option>
                    {routes.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sa-field">
                  <span>Type <b className="sa-req">*</b></span>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required>
                    <option value="">Select type</option>
                    <option value="home">Home</option>
                    <option value="school">School</option>
                  </select>
                </label>
              </div>
              <div className="sa-stu-form-row">
                <label className="sa-field">
                  <span>Area</span>
                  <input
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    placeholder="Select area (optional)"
                  />
                </label>
                <label className="sa-field">
                  <span>Order</span>
                  <div className="sa-stop-order">
                    <input
                      type="number"
                      min="0"
                      value={form.order}
                      onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
                      placeholder="Stop order"
                    />
                    <i title="The sequence of this stop on the selected route." aria-label="Order help">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="12" cy="12" r="8.2" />
                        <path d="M12 11v5M12 8h.01" />
                      </svg>
                    </i>
                  </div>
                </label>
              </div>
              <label className="sa-field">
                <span>Address</span>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Enter address"
                />
              </label>
              <div className="sa-field">
                <span>Location <b className="sa-req">*</b></span>
                <LocationSearch
                  proximity={form.location}
                  placeholder="Search for a location..."
                  onSelect={(place) => {
                    setForm((f) => ({
                      ...f,
                      location: { lat: place.lat, lng: place.lng },
                      name: f.name.trim() ? f.name : place.name,
                      address: f.address.trim() ? f.address : place.name,
                    }));
                    setMapFocus({ lat: place.lat, lng: place.lng, zoom: 16.4, at: Date.now() });
                  }}
                />
                <p className="sa-stop-map-hint">
                  <StopKpiGlyph name="pin" />
                  Click on the map to set the exact location of the stop
                </p>
                <MapView
                  center={form.location}
                  stops={[{ _id: 'draft', name: form.name || 'New stop', type: form.type || 'home', location: form.location, pinLabel: '' }]}
                  focus={mapFocus}
                  onMapClick={(loc) => setForm((f) => ({ ...f, location: loc }))}
                  className="map-canvas sa-stop-form-map"
                />
              </div>
              <label className="sa-stop-toggle">
                <span>
                  <strong>Active</strong>
                  <small>This stop will be active and available for selection.</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Active"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
              </label>
            </div>
            <div className="sa-stop-form-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={closePanel}>
                Cancel
              </button>
              <button type="button" className="sa-btn sa-btn-primary" disabled={!canSave} onClick={submit}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M5 12.5 10 17.5 19 7" />
                </svg>
                {editingId ? 'Save Stop' : 'Add Stop'}
              </button>
            </div>
          </div>
        </div>
      )}

      {menuStop && (
        <div className="sa-action-overlay" onClick={() => setMenuId('')} role="presentation">
          <div className="sa-action-modal" role="dialog" aria-modal="true" aria-labelledby="sa-stop-action-title" onClick={(e) => e.stopPropagation()}>
            <header className="sa-action-head">
              <div>
                <p className="sa-action-kicker">Stop actions</p>
                <h3 id="sa-stop-action-title">{menuStop.name}</h3>
                <small>{menuStop.routeName || 'Unassigned'} · {kindLabel(menuStop)}</small>
              </div>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setMenuId('')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="sa-action-list">
              <button type="button" onClick={() => { setMenuId(''); setViewing(menuStop); setPanel('view'); }}>
                <i aria-hidden="true"><ActionGlyph name="view" /></i>
                <span><strong>View details</strong><em>See location, students, and route</em></span>
              </button>
              <button type="button" onClick={() => { setMenuId(''); startEdit(menuStop); }}>
                <i aria-hidden="true"><ActionGlyph name="edit" /></i>
                <span><strong>Edit stop</strong><em>Update name, type, or coordinates</em></span>
              </button>
              {menuStop.routeId ? (
                <button type="button" onClick={() => navigate(`/school-admin/routes/${menuStop.routeId}`)}>
                  <i aria-hidden="true"><StopKpiGlyph name="pin" /></i>
                  <span><strong>View route</strong><em>Open {menuStop.routeName || 'the linked route'}</em></span>
                </button>
              ) : null}
              <button type="button" onClick={() => { setActive(menuStop, menuStop.active === false); setMenuId(''); }}>
                <i aria-hidden="true"><StopKpiGlyph name="shield" /></i>
                <span>
                  <strong>{menuStop.active === false ? 'Activate stop' : 'Deactivate stop'}</strong>
                  <em>{menuStop.active === false ? 'Make this stop available again' : 'Hide this stop from active trips'}</em>
                </span>
              </button>
              <button type="button" className="is-danger" onClick={() => { setMenuId(''); remove(menuStop); }}>
                <i aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
                  </svg>
                </i>
                <span><strong>Delete stop</strong><em>Permanently remove this pickup point</em></span>
              </button>
            </div>
            <div className="sa-action-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMenuId('')}>Close</button>
            </div>
          </div>
        </div>
      )}

      <footer className="sa-home-foot">
        <span>© {year} {prettySchool(schoolName)}. All rights reserved.</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
