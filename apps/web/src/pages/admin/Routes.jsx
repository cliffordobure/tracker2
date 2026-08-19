import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';
import LocationSearch from '../../components/LocationSearch';

const PAGE_SIZES = [10, 25, 50];
const PIN_COLORS = ['#5d3fd3', '#0ea5e9', '#16a34a', '#f97316', '#e11d48', '#14b8a6'];
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

export default function RoutesPage() {
  const { globalSearch = '' } = useOutletContext() || {};
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
  const [selected, setSelected] = useState(() => new Set());
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
    const close = () => setMenuId('');
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

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

  const allOnPageSelected = slice.length > 0 && slice.every((r) => selected.has(routeId(r)));

  const toggleAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) slice.forEach((r) => next.delete(routeId(r)));
      else slice.forEach((r) => next.add(routeId(r)));
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
    const rows = selected.size ? filtered.filter((r) => selected.has(routeId(r))) : filtered;
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
  const canSave = Boolean(form.name.trim());
  const kpis = [
    {
      label: 'Total Routes',
      value: stats?.total ?? routes.length,
      hint: stats?.addedThisMonth ? `↑ ${stats.addedThisMonth} this month` : 'No change this month',
      up: Boolean(stats?.addedThisMonth),
      tint: 'purple',
    },
    {
      label: 'Active Routes',
      value: stats?.active ?? routes.filter((r) => r.active !== false).length,
      hint: pct(stats?.active ?? 0, stats?.total || routes.length),
      tint: 'green',
    },
    {
      label: 'Total Stops',
      value: stats?.totalStops ?? 0,
      hint: stats?.addedStopsThisMonth ? `↑ ${stats.addedStopsThisMonth} this month` : 'Saved stops',
      up: Boolean(stats?.addedStopsThisMonth),
      tint: 'orange',
    },
    {
      label: 'Students Assigned',
      value: stats?.studentsAssigned ?? 0,
      hint: stats?.addedStudentsThisMonth ? `↑ ${stats.addedStudentsThisMonth} this month` : 'On a route',
      up: Boolean(stats?.addedStudentsThisMonth),
      tint: 'violet',
    },
    {
      label: 'Avg. Duration',
      value: stats?.avgDurationMinutes != null ? `${stats.avgDurationMinutes} min` : '—',
      hint: stats?.avgDurationMinutes != null ? 'Per trip (saved estimates)' : 'Not tracked',
      tint: 'rose',
    },
  ];

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <div className="sa-sd-top">
        <span />
        <div className="sa-sd-top-actions">
          <button type="button" className="sa-btn sa-btn-outline sa-stu-export" onClick={exportRows}>
            Export
          </button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>
            + Add Route
          </button>
        </div>
      </div>

      <section className="sa-stu-kpis sa-tch-kpis sa-route-kpis" aria-label="Route metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em className={m.up ? 'is-up' : ''}>{m.hint}</em>
            </div>
            <i className="sa-stu-kpi-icon" aria-hidden="true" />
          </article>
        ))}
      </section>

      <section className="sa-card sa-stu-table-card">
        <div className="sa-stu-toolbar sa-drv-toolbar">
          <label className="sa-stu-search">
            <span aria-hidden="true">⌕</span>
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
          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} aria-label="Driver">
            <option value="">All Drivers</option>
            {drivers.map((d) => (
              <option key={d.id || d._id} value={d.id || d._id}>
                {d.name}
              </option>
            ))}
          </select>
          <select value={busFilter} onChange={(e) => setBusFilter(e.target.value)} aria-label="Bus">
            <option value="">All Vehicles</option>
            {buses.map((b) => (
              <option key={b._id} value={b._id}>
                {[b.label, b.plate].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
          <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMoreFilters((v) => !v)}>
            More Filters
          </button>
        </div>
        {moreFilters && (
          <div className="sa-tch-more">
            <select value={hasStops} onChange={(e) => setHasStops(e.target.value)} aria-label="Stops">
              <option value="">All stop states</option>
              <option value="yes">Has stops</option>
              <option value="no">No stops yet</option>
            </select>
          </div>
        )}

        <div className="sa-table-wrap">
          <table className="sa-table sa-stu-table sa-drv-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllPage} aria-label="Select page" />
                </th>
                <th>Route Name</th>
                <th>Route Code</th>
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
              {slice.map((r, i) => {
                const id = routeId(r);
                const active = r.active !== false;
                return (
                  <tr key={id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggleRow(id)}
                        aria-label={`Select ${r.name}`}
                      />
                    </td>
                    <td>
                      <div className="sa-stu-person">
                        <span className="sa-route-pin" style={{ background: PIN_COLORS[i % PIN_COLORS.length] }} />
                        <div>
                          <strong>
                            <Link to={`/school-admin/routes/${id}`}>{r.name}</Link>
                          </strong>
                          <small>{r.path || r.description || '—'}</small>
                        </div>
                      </div>
                    </td>
                    <td>{r.code || '—'}</td>
                    <td>{r.stopCount ?? 0}</td>
                    <td>{r.studentCount ?? 0}</td>
                    <td>
                      {r.driver?.name ? (
                        <div className="sa-stu-person">
                          {r.driver.photoUrl ? <img src={r.driver.photoUrl} alt="" /> : <span>{initials(r.driver.name)}</span>}
                          <div>
                            <strong>{r.driver.name}</strong>
                            {r.driver.phone ? <small>{r.driver.phone}</small> : null}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {r.vehicle ? (
                        <div>
                          <strong>{r.vehicle.label || 'Vehicle'}</strong>
                          <small className="sa-stu-phone">{r.vehicle.plate || '—'}</small>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{r.estimatedMinutes ? `${r.estimatedMinutes} min` : '—'}</td>
                    <td>
                      <span className={`sa-stu-status is-${active ? 'active' : 'muted'}`}>{active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td>
                      <div className="sa-stu-actions">
                        <button
                          type="button"
                          className="sa-icon-ghost is-view"
                          aria-label="View"
                          onClick={() => navigate(`/school-admin/routes/${id}`)}
                        >
                          ◉
                        </button>
                        <button type="button" className="sa-icon-ghost is-edit" aria-label="Edit" onClick={() => startEdit(r)}>
                          ✎
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
                              <button type="button" onClick={() => { setMenuId(''); openStops(r); }}>
                                Manage stops
                              </button>
                              <button type="button" onClick={() => { setActive(r, !active); setMenuId(''); }}>
                                {active ? 'Deactivate' : 'Activate'}
                              </button>
                              <button type="button" className="is-danger" onClick={() => { setMenuId(''); remove(r); }}>
                                Delete
                              </button>
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
                  <td colSpan={10} className="sa-stu-empty">
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
            {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} routes
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

      <footer className="sa-home-foot">
        <span>© {year} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
