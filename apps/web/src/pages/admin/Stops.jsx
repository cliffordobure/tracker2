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
  return '';
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
  const { globalSearch = '' } = useOutletContext() || {};
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
    const close = () => setMenuId('');
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

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
    setForm({ ...emptyForm, routeId: routes[0]?._id || '' });
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
  const canSave = Boolean(form.name.trim() && form.routeId && form.location?.lat != null);
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

  const kpis = [
    {
      label: 'Total Stops',
      value: stats?.total ?? stops.length,
      hint: stats?.addedThisMonth ? `↑ ${stats.addedThisMonth} this month` : 'Saved stops',
      up: Boolean(stats?.addedThisMonth),
      tint: 'purple',
    },
    {
      label: 'Active Stops',
      value: stats?.active ?? 0,
      hint: pct(stats?.active ?? 0, stats?.total || stops.length),
      tint: 'green',
    },
    {
      label: 'Avg. Wait Time',
      value: '—',
      hint: 'Not tracked',
      tint: 'orange',
    },
    {
      label: 'Total Students',
      value: stats?.studentsAssigned ?? 0,
      hint: stats?.addedStudentsThisMonth ? `↑ ${stats.addedStudentsThisMonth} this month` : 'On a stop or route',
      up: Boolean(stats?.addedStudentsThisMonth),
      tint: 'violet',
    },
    {
      label: 'Stops with Buses',
      value: stats?.withBus ?? 0,
      hint: pct(stats?.withBus ?? 0, stats?.total || stops.length),
      tint: 'sky',
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
            + Add Stop
          </button>
        </div>
      </div>

      <section className="sa-stu-kpis sa-tch-kpis sa-stops-kpis" aria-label="Stop metrics">
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

      <section className="sa-stops-layout">
        <article className="sa-card sa-stu-table-card">
          <div className="sa-stu-toolbar sa-drv-toolbar sa-stops-toolbar">
            <label className="sa-stu-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by stop name or location..."
              />
            </label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} aria-label="Route">
              <option value="">All Routes</option>
              {routes.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Area">
              <option value="">All Areas</option>
              <option value="__none">No area set</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type">
              <option value="">All Types</option>
              <option value="home">Home</option>
              <option value="school">School</option>
            </select>
            <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMoreFilters((v) => !v)}>
              More Filters
            </button>
          </div>
          {moreFilters && (
            <div className="sa-tch-more">
              <select value={hasStudents} onChange={(e) => setHasStudents(e.target.value)} aria-label="Students">
                <option value="">All student states</option>
                <option value="yes">Has students</option>
                <option value="no">No students yet</option>
              </select>
            </div>
          )}

          <div className="sa-table-wrap">
            <table className="sa-table sa-stu-table sa-stops-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllPage} aria-label="Select page" />
                  </th>
                  <th>Stop Name</th>
                  <th>Route</th>
                  <th>Students</th>
                  <th>Area</th>
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
                        <div className="sa-stu-person">
                          <span className="sa-route-pin" style={{ background: s.pinColor || '#5d3fd3' }} />
                          <div>
                            <strong>
                              <button type="button" className="sa-text-link" onClick={() => { setViewing(s); setPanel('view'); }}>
                                {s.name}
                              </button>
                            </strong>
                            <small>{extra || s.address || '—'}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {s.routeId ? (
                          <Link to={`/school-admin/routes/${s.routeId}`}>{s.routeName || 'Route'}</Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{s.studentCount ?? 0}</td>
                      <td>{s.area || '—'}</td>
                      <td>
                        <span className={`sa-stu-status is-${active ? 'active' : 'muted'}`}>{active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td>
                        <div className="sa-stu-actions">
                          <button
                            type="button"
                            className="sa-icon-ghost is-view"
                            aria-label="View"
                            onClick={() => {
                              setViewing(s);
                              setPanel('view');
                            }}
                          >
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
                                <button type="button" onClick={() => { setMenuId(''); startEdit(s); }}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuId('');
                                    navigate(`/school-admin/routes/${s.routeId}`);
                                  }}
                                >
                                  View route
                                </button>
                                <button type="button" onClick={() => { setActive(s, s.active === false); setMenuId(''); }}>
                                  {s.active === false ? 'Activate' : 'Deactivate'}
                                </button>
                                <button type="button" className="is-danger" onClick={() => { setMenuId(''); remove(s); }}>
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

        <article className="sa-card sa-stops-map-card">
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
      </section>

      <section className="sa-stops-widgets">
        <article className="sa-card">
          <h3>Top 5 Busiest Stops</h3>
          <p className="sa-rd-sub">By students assigned</p>
          {busiest.length ? (
            <ol className="sa-stops-busy">
              {busiest.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{s.name}</strong>
                    <small>{s.routeName || '—'}</small>
                  </div>
                  <span>{s.studentCount} students</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="sa-muted">No students are assigned to stops yet.</p>
          )}
        </article>

        <article className="sa-card">
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
          {breakdown?.kind === 'type' ? (
            <p className="sa-muted">Area is optional. Set it on a stop to group by neighbourhood.</p>
          ) : null}
        </article>

        <article className="sa-card">
          <h3>Facilities at Stops</h3>
          <p className="sa-muted">Shelter, CCTV, lighting, and seating are not stored for stops yet.</p>
        </article>

        <article className="sa-card">
          <h3>Alerts &amp; Issues</h3>
          {alerts.length ? (
            <ul className="sa-stops-alerts">
              {alerts.map((a) => (
                <li key={a.text} className={`is-${a.tone}`}>
                  {a.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No stop issues from saved records.</p>
          )}
        </article>
      </section>

      {panel === 'view' && viewing && (
        <aside className="sa-drawer" aria-label="Stop details">
          <div className="sa-drawer-head">
            <h2>Stop details</h2>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={closePanel}>
              Close
            </button>
          </div>
          <dl className="sa-drawer-fields">
            <div><dt>Name</dt><dd>{viewing.name}</dd></div>
            <div><dt>Type</dt><dd>{kindLabel(viewing) || (viewing.type === 'school' ? 'School' : 'Home')}</dd></div>
            <div><dt>Route</dt><dd>{viewing.routeName || '—'}</dd></div>
            <div><dt>Area</dt><dd>{viewing.area || '—'}</dd></div>
            <div><dt>Address</dt><dd>{place(viewing) || '—'}</dd></div>
            <div><dt>Students</dt><dd>{viewing.studentCount ?? 0}</dd></div>
            <div><dt>Vehicle on route</dt><dd>{viewing.hasBus ? 'Yes' : 'No'}</dd></div>
            <div><dt>Status</dt><dd>{isActive(viewing) ? 'Active' : 'Inactive'}</dd></div>
          </dl>
          <div className="sa-drawer-actions">
            <button type="button" className="sa-btn sa-btn-outline" onClick={() => startEdit(viewing)}>
              Edit stop
            </button>
            {viewing.routeId ? (
              <Link to={`/school-admin/routes/${viewing.routeId}`} className="sa-btn sa-btn-primary">
                View route
              </Link>
            ) : null}
          </div>
        </aside>
      )}

      {panel === 'form' && (
        <aside className="sa-drawer sa-drawer-wide" aria-label={editingId ? 'Edit stop' : 'Add stop'}>
          <div className="sa-drawer-head">
            <h2>{editingId ? 'Edit stop' : 'Add stop'}</h2>
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
              <span>Route</span>
              <select value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })} required>
                <option value="">Select a route</option>
                {routes.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sa-field">
              <span>Type</span>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="home">Home</option>
                <option value="school">School</option>
              </select>
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Area</span>
              <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Optional" />
            </label>
            <label className="sa-field">
              <span>Order</span>
              <input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
            </label>
          </div>
          <label className="sa-field">
            <span>Address</span>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Optional" />
          </label>
          {editingId && (
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
          )}
          <LocationSearch
            proximity={form.location}
            placeholder="Search an area to zoom the map…"
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
          <MapView
            center={form.location}
            stops={[{ _id: 'draft', name: form.name || 'New stop', type: form.type, location: form.location, pinLabel: '' }]}
            focus={mapFocus}
            onMapClick={(loc) => setForm((f) => ({ ...f, location: loc }))}
            className="map-canvas map-md"
          />
          <p className="sa-muted">Click the map to set coordinates.</p>
          <div className="row-actions">
            <button type="button" className="sa-btn sa-btn-outline" onClick={closePanel}>
              Cancel
            </button>
            <button type="button" className="sa-btn sa-btn-primary" disabled={!canSave} onClick={submit}>
              {editingId ? 'Save stop' : 'Create stop'}
            </button>
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
