import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';
import LocationSearch from '../../components/LocationSearch';

const PAGE_SIZES = [10, 25, 50];
const VEHICLE_TYPES = [
  { value: 'school_bus', label: 'School Bus' },
  { value: 'bus', label: 'Bus' },
  { value: 'minibus', label: 'Minibus' },
  { value: 'van', label: 'Van' },
];
const emptyForm = {
  name: '',
  code: '',
  description: '',
  estimatedMinutes: '',
  active: true,
};
const emptyStop = {
  name: '',
  type: 'home',
  order: 1,
  location: { lat: -1.39, lng: 36.74 },
};

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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

function routeId(r) {
  return String(r._id || r.id);
}

function vehicleLabel(v) {
  if (!v) return '';
  return [v.label, v.plate].filter(Boolean).join(' · ');
}

function typeLabel(value) {
  return VEHICLE_TYPES.find((t) => t.value === value)?.label || '';
}

function periodLabel(period) {
  if (!period) return '';
  const map = { morning: 'Morning Route', afternoon: 'Afternoon Route', evening: 'Evening Route' };
  return map[period] || `${String(period)[0].toUpperCase()}${String(period).slice(1)} Route`;
}

function inferPeriod(r) {
  const hay = `${r?.name || ''} ${r?.description || ''} ${r?.code || ''}`.toLowerCase();
  if (hay.includes('morning')) return 'Morning Route';
  if (hay.includes('afternoon')) return 'Afternoon Route';
  if (hay.includes('evening')) return 'Evening Route';
  return '';
}

function prettySchool(name) {
  const raw = String(name || 'School').trim();
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function pctBar(part, total) {
  if (!total) return 0;
  return Math.min(100, Math.round(((Number(part) || 0) / total) * 100));
}

function RouteKpiGlyph({ name }) {
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
  if (name === 'route') {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="18" cy="18" r="2.4" />
        <path d="M8.2 7.6 15.8 16.4M14 6h4v4" />
      </svg>
    );
  }
  if (name === 'pin') {
    return (
      <svg {...common}>
        <path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z" />
        <circle cx="12" cy="10" r="2.2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 8v4.2l2.6 1.6" />
    </svg>
  );
}

function RouteKpiMark({ name }) {
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
  if (name === 'check') return <svg {...common}><path d="M5 12.5 10 17.5 19 7" /></svg>;
  if (name === 'pin') {
    return (
      <svg {...common}>
        <path d="M12 21s6-5.6 6-10a6 6 0 1 0-12 0c0 4.4 6 10 6 10Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.4 1.4" />
    </svg>
  );
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
  if (name === 'edit') {
    return (
      <svg {...common}>
        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
      </svg>
    );
  }
  if (name === 'details') {
    return (
      <svg {...common}>
        <path d="M7 3h8l5 5v13H7V3Z" />
        <path d="M15 3v5h5M10 13h6M10 17h4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="5" r="1.35" />
      <circle cx="12" cy="12" r="1.35" />
      <circle cx="12" cy="19" r="1.35" />
    </svg>
  );
}

export default function RoutesPage() {
  const { globalSearch = '', schoolName } = useOutletContext() || {};
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openedEdit = useRef('');
  const [routes, setRoutes] = useState([]);
  const [stats, setStats] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [buses, setBuses] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [busFilter, setBusFilter] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);
  const [hasStops, setHasStops] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [menuId, setMenuId] = useState('');
  const [panel, setPanel] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [stopRoute, setStopRoute] = useState(null);
  const [stops, setStops] = useState([]);
  const [stopForm, setStopForm] = useState(emptyStop);
  const [mapFocus, setMapFocus] = useState(null);

  const load = async () => {
    const [r, d, b] = await Promise.all([
      api('/admin/routes'),
      api('/admin/drivers').catch(() => ({ drivers: [] })),
      api('/admin/buses').catch(() => ({ buses: [] })),
    ]);
    setRoutes(r.routes || []);
    setStats(r.stats || null);
    setDrivers(d.drivers || []);
    setBuses(b.buses || []);
  };

  const loadStops = async (id) => {
    const data = await api(`/admin/routes/${id}/stops`);
    setStops(data.stops || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    if (!menuId) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuId('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return routes.filter((r) => {
      if (statusFilter === 'active' && r.active === false) return false;
      if (statusFilter === 'inactive' && r.active !== false) return false;
      if (driverFilter && String(r.driver?.id || '') !== String(driverFilter)) return false;
      if (busFilter && String(r.vehicle?._id || '') !== String(busFilter)) return false;
      if (hasStops === 'yes' && !(r.stopCount > 0)) return false;
      if (hasStops === 'no' && r.stopCount > 0) return false;
      if (!needle) return true;
      const hay = [r.name, r.code, r.description, r.path, r.driver?.name, vehicleLabel(r.vehicle)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [routes, q, statusFilter, driverFilter, busFilter, hasStops]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, driverFilter, busFilter, hasStops, pageSize]);

  const closePanel = () => {
    setPanel(null);
    setEditingId(null);
    setForm(emptyForm);
    setStopRoute(null);
    setStops([]);
    setStopForm(emptyStop);
    if (params.get('edit') || params.get('stops')) {
      openedEdit.current = '';
      navigate('/school-admin/routes', { replace: true });
    }
  };

  const startCreate = () => {
    setError('');
    setSuccess('');
    setEditingId(null);
    setForm(emptyForm);
    setPanel('form');
  };

  const startEdit = (r) => {
    setError('');
    setSuccess('');
    setEditingId(routeId(r));
    setForm({
      name: r.name || '',
      code: r.code || '',
      description: r.description || '',
      estimatedMinutes: r.estimatedMinutes || '',
      active: r.active !== false,
    });
    setPanel('form');
  };

  useEffect(() => {
    const editId = params.get('edit');
    if (!editId || !routes.length || openedEdit.current === editId) return;
    const route = routes.find((r) => routeId(r) === editId);
    if (route) {
      openedEdit.current = editId;
      startEdit(route);
    }
  }, [params, routes]);

  useEffect(() => {
    const stopsId = params.get('stops');
    if (!stopsId || !routes.length || openedEdit.current === `stops:${stopsId}`) return;
    const route = routes.find((r) => routeId(r) === stopsId);
    if (route) {
      openedEdit.current = `stops:${stopsId}`;
      openStops(route);
    }
  }, [params, routes]);

  const openStops = async (r) => {
    setError('');
    setStopRoute(r);
    setStopForm({ ...emptyStop, order: (r.stopCount || 0) + 1 });
    setPanel('stops');
    try {
      await loadStops(routeId(r));
    } catch (e) {
      setError(e.message);
    }
  };

  const submit = async () => {
    setError('');
    setSuccess('');
    try {
      const body = {
        name: form.name,
        code: form.code,
        description: form.description,
        estimatedMinutes: form.estimatedMinutes === '' ? null : Number(form.estimatedMinutes),
        active: form.active,
      };
      if (editingId) {
        await api(`/admin/routes/${editingId}`, { method: 'PUT', body });
        setSuccess(`${form.name} updated.`);
      } else {
        await api('/admin/routes', { method: 'POST', body });
        setSuccess(`${form.name} added.`);
      }
      closePanel();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const setActive = async (r, next) => {
    try {
      await api(`/admin/routes/${routeId(r)}`, { method: 'PUT', body: { active: next } });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (r) => {
    if (!confirm(`Remove ${r.name} and its stops?`)) return;
    try {
      await api(`/admin/routes/${routeId(r)}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const addStop = async (e) => {
    e.preventDefault();
    if (!stopRoute) return;
    setError('');
    try {
      await api(`/admin/routes/${routeId(stopRoute)}/stops`, { method: 'POST', body: stopForm });
      setStopForm((f) => ({ ...emptyStop, order: Number(f.order) + 1, location: f.location }));
      await loadStops(routeId(stopRoute));
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeStop = async (id) => {
    if (!stopRoute) return;
    await api(`/admin/stops/${id}`, { method: 'DELETE' });
    await loadStops(routeId(stopRoute));
    await load();
  };

  const exportRows = () => {
    const rows = filtered;
    const header = ['Name', 'Code', 'Path', 'Stops', 'Students', 'Driver', 'Vehicle', 'Duration', 'Status'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          csvEscape(r.name),
          csvEscape(r.code),
          csvEscape(r.path),
          csvEscape(r.stopCount),
          csvEscape(r.studentCount),
          csvEscape(r.driver?.name),
          csvEscape(vehicleLabel(r.vehicle)),
          csvEscape(r.estimatedMinutes),
          csvEscape(r.active === false ? 'Inactive' : 'Active'),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'routes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const year = new Date().getFullYear();
  const menuRoute = routes.find((r) => routeId(r) === menuId);
  const canSave = Boolean(form.name.trim());
  const total = stats?.total ?? routes.length;
  const activeCount = stats?.active ?? routes.filter((r) => r.active !== false).length;
  const stopCount = stats?.totalStops ?? 0;
  const kpis = [
    {
      key: 'active',
      label: 'Active Routes',
      value: activeCount,
      hint: `${pct(activeCount, total)} of total`,
      tint: 'purple',
      icon: 'route',
      mark: 'check',
      bar: pctBar(activeCount, total),
    },
    {
      key: 'stops',
      label: 'Total Stops',
      value: stopCount,
      hint: stats?.addedStopsThisMonth ? `↑ ${stats.addedStopsThisMonth} this month` : 'Saved stops',
      tint: 'green',
      icon: 'pin',
      mark: 'pin',
      bar: pctBar(stopCount, Math.max(stopCount, 1)),
    },
    {
      key: 'duration',
      label: 'Avg. Duration',
      value: stats?.avgDurationMinutes != null ? `${stats.avgDurationMinutes} min` : '—',
      hint: stats?.avgDurationMinutes != null ? 'Per trip (saved estimates)' : 'Not tracked',
      tint: 'rose',
      icon: 'timer',
      mark: 'clock',
      bar: stats?.avgDurationMinutes != null ? 55 : 0,
    },
  ];

  return (
    <div className="sa-buses sa-routes">
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <div className="sa-bus-head">
        <div>
          <h2>Routes</h2>
          <p>Manage and monitor all school routes and their performance.</p>
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
            + Add Route
          </button>
        </div>
      </div>

      <section className="sa-bus-kpis" aria-label="Route metrics">
        {kpis.map((m) => (
          <article key={m.key} className={`sa-bus-kpi tint-${m.tint}`}>
            <i className="sa-bus-kpi-icon" aria-hidden="true">
              <RouteKpiGlyph name={m.icon} />
            </i>
            <div className="sa-bus-kpi-copy">
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em className={m.hint.startsWith('↑') ? 'is-up' : ''}>{m.hint}</em>
            </div>
            <b className="sa-bus-kpi-mark" aria-hidden="true">
              <RouteKpiMark name={m.mark} />
            </b>
            <div className="sa-bus-kpi-bar" aria-hidden="true">
              <i style={{ width: `${m.bar}%` }} />
            </div>
          </article>
        ))}
      </section>

      <section className="sa-card sa-bus-table-card">
        <div className="sa-bus-toolbar sa-rt-toolbar">
          <label className="sa-stu-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by route name or description..."
            />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={busFilter} onChange={(e) => setBusFilter(e.target.value)} aria-label="Vehicle">
            <option value="">All Vehicles</option>
            {buses.map((b) => (
              <option key={b._id} value={b._id}>
                {[b.label, b.plate].filter(Boolean).join(' · ')}
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
            <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} aria-label="Driver">
              <option value="">All Drivers</option>
              {drivers.map((d) => (
                <option key={d.id || d._id} value={d.id || d._id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select value={hasStops} onChange={(e) => setHasStops(e.target.value)} aria-label="Stops">
              <option value="">All stop states</option>
              <option value="yes">Has stops</option>
              <option value="no">No stops yet</option>
            </select>
          </div>
        )}

        <div className="sa-table-wrap">
          <table className="sa-table sa-bus-table sa-rt-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Stops</th>
                <th>Students</th>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => {
                const id = routeId(r);
                const active = r.active !== false;
                const period = periodLabel(r.period) || inferPeriod(r);
                const vType = typeLabel(r.vehicle?.vehicleType) || (r.vehicle ? 'School Bus' : '');
                return (
                  <tr key={id}>
                    <td>
                      <div className="sa-rt-name">
                        <strong>
                          <Link to={`/school-admin/routes/${id}`}>{r.name}</Link>
                        </strong>
                        {period ? <em>{period}</em> : null}
                        <small>{r.path || r.description || '—'}</small>
                      </div>
                    </td>
                    <td>
                      <div className="sa-bus-cell">
                        <strong>{r.stopCount ?? 0} Stop{(r.stopCount === 1) ? '' : 's'}</strong>
                        <button type="button" className="sa-rt-link" onClick={() => openStops(r)}>
                          View stops
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="sa-bus-cell">
                        <strong>{r.studentCount ?? 0} Student{(r.studentCount === 1) ? '' : 's'}</strong>
                        <Link className="sa-rt-link" to={`/school-admin/routes/${id}`}>
                          View students
                        </Link>
                      </div>
                    </td>
                    <td>
                      {r.driver?.name ? (
                        <div className="sa-bus-driver">
                          {r.driver.photoUrl ? <img src={r.driver.photoUrl} alt="" /> : <span>{initials(r.driver.name)}</span>}
                          <div>
                            <strong>{r.driver.name}</strong>
                            <small>{r.driver.phone || (r.extraDrivers ? `+${r.extraDrivers} more` : '—')}</small>
                          </div>
                        </div>
                      ) : (
                        <span className="sa-bus-muted">Unassigned</span>
                      )}
                    </td>
                    <td>
                      {r.vehicle ? (
                        <div className="sa-rt-vehicle">
                          <i className="sa-rt-vehicle-icon" aria-hidden="true">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <rect x="3" y="7" width="18" height="10" rx="2" />
                              <path d="M7 17v2M17 17v2M3 12h18" />
                            </svg>
                          </i>
                          <div>
                            <strong>{r.vehicle.plate || r.vehicle.label || 'Vehicle'}</strong>
                            {vType ? <em>{vType}</em> : null}
                          </div>
                        </div>
                      ) : (
                        <span className="sa-bus-muted">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <div className="sa-bus-cell">
                        <strong>{r.estimatedMinutes ? `${r.estimatedMinutes} min` : '—'}</strong>
                        <small>{r.distanceKm != null ? `${r.distanceKm} km` : '—'}</small>
                      </div>
                    </td>
                    <td>
                      <span className={`sa-stu-status is-${active ? 'active' : 'muted'}`}>{active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td>
                      <div className="sa-stu-actions sa-bus-actions">
                        <button type="button" className="sa-icon-ghost is-edit" aria-label="Edit" onClick={() => startEdit(r)}>
                          <ActionGlyph name="edit" />
                        </button>
                        <button
                          type="button"
                          className="sa-icon-ghost is-view"
                          aria-label="Details"
                          onClick={() => navigate(`/school-admin/routes/${id}`)}
                        >
                          <ActionGlyph name="details" />
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
                  <td colSpan={8} className="sa-stu-empty">
                    No routes match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sa-table-foot sa-stu-foot">
          <span>
            Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} route{filtered.length === 1 ? '' : 's'}
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
      </section>

      {panel === 'form' && (
        <aside className="sa-drawer sa-drawer-wide" aria-label={editingId ? 'Edit route' : 'Add route'}>
          <div className="sa-drawer-head">
            <h2>{editingId ? 'Edit route' : 'Add route'}</h2>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={closePanel}>
              Close
            </button>
          </div>
          {error && <div className="alert">{error}</div>}
          <label className="sa-field">
            <span>Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Route code</span>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Optional" />
            </label>
            <label className="sa-field">
              <span>Estimated duration (min)</span>
              <input
                type="number"
                min={0}
                max={300}
                value={form.estimatedMinutes}
                onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })}
              />
            </label>
          </div>
          <label className="sa-field">
            <span>Description</span>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          {editingId && (
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
          )}
          <div className="row-actions">
            <button type="button" className="sa-btn sa-btn-outline" onClick={closePanel}>
              Cancel
            </button>
            <button type="button" className="sa-btn sa-btn-primary" disabled={!canSave} onClick={submit}>
              {editingId ? 'Save route' : 'Create route'}
            </button>
          </div>
        </aside>
      )}

      {panel === 'stops' && stopRoute && (
        <aside className="sa-drawer sa-drawer-wide" aria-label="Manage stops">
          <div className="sa-drawer-head">
            <h2>Stops — {stopRoute.name}</h2>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={closePanel}>
              Close
            </button>
          </div>
          {error && <div className="alert">{error}</div>}
          <LocationSearch
            proximity={stops[0]?.location || { lat: -1.3965, lng: 36.7542 }}
            placeholder="Search an area to zoom the map…"
            onSelect={(place) => {
              setStopForm((f) => ({
                ...f,
                location: { lat: place.lat, lng: place.lng },
                name: f.name.trim() ? f.name : place.name,
              }));
              setMapFocus({ lat: place.lat, lng: place.lng, zoom: 16.4, at: Date.now() });
            }}
          />
          <MapView
            center={stops[0]?.location || { lat: -1.3965, lng: 36.7542 }}
            stops={stops}
            focus={mapFocus}
            onMapClick={(loc) => setStopForm((f) => ({ ...f, location: loc }))}
            className="map-canvas map-md"
          />
          <div className="table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {stops.map((s) => (
                  <tr key={s._id}>
                    <td>{s.order}</td>
                    <td>{s.name}</td>
                    <td>{s.type}</td>
                    <td>
                      <button type="button" className="sa-btn sa-btn-ghost" onClick={() => removeStop(s._id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!stops.length && (
                  <tr>
                    <td colSpan={4} className="sa-stu-empty">No stops yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <form className="card-form" onSubmit={addStop}>
            <h3>Add stop (click map for coordinates)</h3>
            <label className="sa-field">
              <span>Name</span>
              <input required value={stopForm.name} onChange={(e) => setStopForm({ ...stopForm, name: e.target.value })} />
            </label>
            <div className="sa-stu-form-row">
              <label className="sa-field">
                <span>Type</span>
                <select value={stopForm.type} onChange={(e) => setStopForm({ ...stopForm, type: e.target.value })}>
                  <option value="home">Home</option>
                  <option value="school">School</option>
                </select>
              </label>
              <label className="sa-field">
                <span>Order</span>
                <input type="number" value={stopForm.order} onChange={(e) => setStopForm({ ...stopForm, order: Number(e.target.value) })} />
              </label>
            </div>
            <button className="sa-btn sa-btn-primary" type="submit">
              Add stop
            </button>
          </form>
        </aside>
      )}

      {menuRoute && (
        <div className="sa-action-overlay" onClick={() => setMenuId('')} role="presentation">
          <div
            className="sa-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sa-rt-action-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sa-action-head">
              <div>
                <p className="sa-action-kicker">Route actions</p>
                <h3 id="sa-rt-action-title">{menuRoute.name}</h3>
                <small>
                  {menuRoute.path || menuRoute.code || 'School route'} · {menuRoute.active === false ? 'Inactive' : 'Active'}
                </small>
              </div>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setMenuId('')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="sa-action-list">
              <button
                type="button"
                onClick={() => {
                  setMenuId('');
                  navigate(`/school-admin/routes/${routeId(menuRoute)}`);
                }}
              >
                <i aria-hidden="true">
                  <ActionGlyph name="details" />
                </i>
                <span>
                  <strong>View details</strong>
                  <em>Open stops, students, and assignments</em>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuId('');
                  startEdit(menuRoute);
                }}
              >
                <i aria-hidden="true">
                  <ActionGlyph name="edit" />
                </i>
                <span>
                  <strong>Edit route</strong>
                  <em>Update name, duration, or description</em>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuId('');
                  openStops(menuRoute);
                }}
              >
                <i aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z" />
                    <circle cx="12" cy="10" r="2.2" />
                  </svg>
                </i>
                <span>
                  <strong>Manage stops</strong>
                  <em>Add, reorder, or remove pickup points</em>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActive(menuRoute, menuRoute.active === false);
                  setMenuId('');
                }}
              >
                <i aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="8" />
                    <path d="M8 12h8" />
                  </svg>
                </i>
                <span>
                  <strong>{menuRoute.active === false ? 'Activate route' : 'Deactivate route'}</strong>
                  <em>{menuRoute.active === false ? 'Make this route available again' : 'Hide this route from active trips'}</em>
                </span>
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  setMenuId('');
                  remove(menuRoute);
                }}
              >
                <i aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
                  </svg>
                </i>
                <span>
                  <strong>Delete route</strong>
                  <em>Remove this route and its stops</em>
                </span>
              </button>
            </div>
            <div className="sa-action-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMenuId('')}>
                Close
              </button>
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
