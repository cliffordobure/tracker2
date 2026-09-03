import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MediaPicker from '../../components/MediaPicker';
import CampusSelect, { campusRefId } from '../../components/CampusSelect';

const PAGE_SIZES = [10, 25, 50];
const emptyForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  employeeId: '',
  licenseNumber: '',
  licenseExpiry: '',
  active: true,
  busId: '',
  vehiclePlate: '',
  vehicleModel: '',
  vehicleColor: '',
  assignedRouteIds: [],
  campusId: '',
  photo: null,
};

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
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

function driverId(d) {
  return d.id || d._id;
}

function busIdOf(profile) {
  const bus = profile?.busId;
  if (!bus) return '';
  return String(typeof bus === 'object' ? bus._id : bus);
}

function busLabel(profile) {
  const bus = profile?.busId;
  if (bus && typeof bus === 'object') {
    return [bus.plate, bus.label].filter(Boolean).join(' · ');
  }
  return profile?.vehiclePlate || '';
}

function routeIdsOf(profile) {
  return (profile?.assignedRouteIds || []).map((r) => String(typeof r === 'object' ? r._id : r));
}

function routeNames(profile) {
  return (profile?.assignedRouteIds || [])
    .map((r) => (typeof r === 'object' ? r.name : ''))
    .filter(Boolean);
}

function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function licenseKey(d) {
  if (d.licenseStatus) return d.licenseStatus;
  const days = daysUntil(d.profile?.licenseExpiry);
  if (days == null) return 'missing';
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'valid';
}

function driverStatus(d) {
  if (d.active === false) return { key: 'inactive', label: 'Inactive' };
  return { key: 'active', label: 'Active' };
}

function liveMapHref(id) {
  return `/school-admin/live-tracking?driver=${encodeURIComponent(id)}`;
}

function LiveMapGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  );
}

export default function Drivers() {
  const { globalSearch = '', campusFilter = '', campuses } = useOutletContext() || {};
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openedEdit = useRef('');
  const [drivers, setDrivers] = useState([]);
  const [stats, setStats] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [licenseFilter, setLicenseFilter] = useState('');
  const [busFilter, setBusFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);
  const [genderFilter, setGenderFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [menuId, setMenuId] = useState('');
  const [panel, setPanel] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const [d, r, b] = await Promise.all([
      api(`/admin/drivers${campusFilter ? `?campusId=${campusFilter}` : ''}`),
      api('/admin/routes'),
      api('/admin/buses'),
    ]);
    setDrivers(d.drivers || []);
    setStats(d.stats || null);
    setRoutes(r.routes || []);
    setBuses(b.buses || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [campusFilter]);

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
    return drivers.filter((d) => {
      const status = driverStatus(d).key;
      if (statusFilter && status !== statusFilter) return false;
      if (licenseFilter && licenseKey(d) !== licenseFilter) return false;
      if (busFilter && busIdOf(d.profile) !== busFilter) return false;
      if (routeFilter && !routeIdsOf(d.profile).includes(routeFilter)) return false;
      if (genderFilter && d.gender !== genderFilter) return false;
      if (!needle) return true;
      const hay = [
        d.name,
        d.email,
        d.phone,
        d.employeeId,
        d.profile?.licenseNumber,
        busLabel(d.profile),
        ...routeNames(d.profile),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [drivers, q, statusFilter, licenseFilter, busFilter, routeFilter, genderFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, licenseFilter, busFilter, routeFilter, genderFilter, pageSize]);

  const allOnPageSelected = slice.length > 0 && slice.every((d) => selected.has(driverId(d)));

  const toggleAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) slice.forEach((d) => next.delete(driverId(d)));
      else slice.forEach((d) => next.add(driverId(d)));
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
    if (params.get('edit')) {
      openedEdit.current = '';
      navigate('/school-admin/drivers', { replace: true });
    }
  };

  const startCreate = () => {
    setError('');
    setSuccess('');
    setEditingId(null);
    setForm(emptyForm);
    setPanel('form');
  };

  const startEdit = (d) => {
    setError('');
    setSuccess('');
    setEditingId(driverId(d));
    setForm({
      name: d.name || '',
      email: d.email || '',
      phone: d.phone || '',
      password: '',
      employeeId: d.employeeId || '',
      licenseNumber: d.profile?.licenseNumber || '',
      licenseExpiry: toDateInput(d.profile?.licenseExpiry),
      active: d.active !== false,
      busId: busIdOf(d.profile),
      vehiclePlate: d.profile?.vehiclePlate || '',
      vehicleModel: d.profile?.vehicleModel || '',
      vehicleColor: d.profile?.vehicleColor || '',
      assignedRouteIds: routeIdsOf(d.profile),
      campusId: campusRefId(d.campusId),
      photo: d.photoUrl ? { url: d.photoUrl, publicId: d.photoPublicId || '' } : null,
    });
    setPanel('form');
  };

  useEffect(() => {
    const editId = params.get('edit');
    if (!editId || !drivers.length || openedEdit.current === editId) return;
    const driver = drivers.find((d) => driverId(d) === editId);
    if (driver) {
      openedEdit.current = editId;
      startEdit(driver);
    }
  }, [params, drivers]);

  const toggleRoute = (routeId) => {
    const id = String(routeId);
    setForm((f) => {
      const has = f.assignedRouteIds.includes(id);
      return {
        ...f,
        assignedRouteIds: has
          ? f.assignedRouteIds.filter((item) => item !== id)
          : [...f.assignedRouteIds, id],
      };
    });
  };

  const submit = async () => {
    setError('');
    setSuccess('');
    try {
      const body = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        employeeId: form.employeeId,
        licenseNumber: form.licenseNumber,
        licenseExpiry: form.licenseExpiry || null,
        active: form.active,
        busId: form.busId || null,
        vehiclePlate: form.vehiclePlate,
        vehicleModel: form.vehicleModel,
        vehicleColor: form.vehicleColor,
        assignedRouteIds: form.assignedRouteIds,
        campusId: form.campusId || null,
        photoUrl: form.photo?.url || '',
        photoPublicId: form.photo?.publicId || '',
      };
      if (form.password) body.password = form.password;
      if (editingId) {
        await api(`/admin/drivers/${editingId}`, { method: 'PUT', body });
        setSuccess(`${form.name} updated.`);
      } else {
        if (!form.campusId) {
          setError('Campus is required');
          return;
        }
        if (!String(form.password || '').trim()) {
          setError('Password is required');
          return;
        }
        if (!form.assignedRouteIds.length) {
          setError('Preferred routes are required');
          return;
        }
        body.campusId = form.campusId;
        body.password = form.password.trim();
        await api('/admin/drivers', { method: 'POST', body });
        setSuccess(`${form.name} added.`);
      }
      closePanel();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const setActive = async (d, next) => {
    try {
      await api(`/admin/drivers/${driverId(d)}`, { method: 'PUT', body: { active: next } });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (d) => {
    if (!confirm(`Remove ${d.name}?`)) return;
    try {
      await api(`/admin/drivers/${driverId(d)}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const exportRows = () => {
    const rows = selected.size ? filtered.filter((d) => selected.has(driverId(d))) : filtered;
    const header = ['Name', 'Employee ID', 'License No.', 'Phone', 'Email', 'Bus', 'Routes', 'Status', 'License Expiry'];
    const lines = [
      header.join(','),
      ...rows.map((d) =>
        [
          csvEscape(d.name),
          csvEscape(d.employeeId),
          csvEscape(d.profile?.licenseNumber),
          csvEscape(d.phone),
          csvEscape(d.email),
          csvEscape(busLabel(d.profile)),
          csvEscape(routeNames(d.profile).join('; ')),
          csvEscape(driverStatus(d).label),
          csvEscape(fmtDate(d.profile?.licenseExpiry)),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drivers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const year = new Date().getFullYear();
  const canSave = Boolean(
    form.name.trim() &&
      form.email.trim() &&
      (editingId || (form.password.trim() && form.campusId && form.assignedRouteIds.length))
  );
  const kpis = [
    {
      label: 'Total Drivers',
      value: stats?.total ?? drivers.length,
      hint: stats?.addedThisMonth ? `↑ ${stats.addedThisMonth} this month` : 'No change this month',
      up: Boolean(stats?.addedThisMonth),
      tint: 'purple',
    },
    {
      label: 'Active Drivers',
      value: stats?.active ?? drivers.filter((d) => d.active !== false).length,
      hint: pct(stats?.active ?? 0, stats?.total || drivers.length),
      tint: 'green',
    },
    {
      label: 'On Duty Today',
      value: stats?.onDutyToday ?? 0,
      hint: `${pct(stats?.onDutyToday ?? 0, stats?.total || drivers.length)} with a trip today`,
      tint: 'orange',
    },
    {
      label: 'With Valid License',
      value: stats?.withValidLicense ?? 0,
      hint: pct(stats?.withValidLicense ?? 0, stats?.total || drivers.length),
      tint: 'violet',
    },
    {
      label: 'License Expiring Soon',
      value: stats?.licenseExpiringSoon ?? 0,
      hint: 'Next 30 days',
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
            + Add Driver
          </button>
        </div>
      </div>

      <section className="sa-stu-kpis sa-tch-kpis" aria-label="Driver metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <i className="sa-stu-kpi-icon" aria-hidden="true" />
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em className={m.up ? 'is-up' : ''}>{m.hint}</em>
            </div>
            <svg className="sa-stu-spark" viewBox="0 0 120 18" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 12 C12 12 14 6 24 6 S36 14 48 11 S64 4 76 7 S96 16 120 8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </article>
        ))}
      </section>

      <section className={`sa-card sa-stu-table-card${menuId ? ' is-menu-open' : ''}`}>
        <div className="sa-stu-toolbar sa-drv-toolbar">
          <label className="sa-stu-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, phone or license no..."
            />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={licenseFilter} onChange={(e) => setLicenseFilter(e.target.value)} aria-label="License status">
            <option value="">All License Status</option>
            <option value="valid">Valid</option>
            <option value="expiring">Expiring soon</option>
            <option value="expired">Expired</option>
            <option value="missing">Not on file</option>
          </select>
          <select value={busFilter} onChange={(e) => setBusFilter(e.target.value)} aria-label="Bus">
            <option value="">All Vehicles</option>
            {buses.map((b) => (
              <option key={b._id} value={b._id}>
                {[b.plate, b.label].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
          <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} aria-label="Route">
            <option value="">All Routes</option>
            {routes.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </select>
          <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMoreFilters((v) => !v)}>
            More Filters
          </button>
        </div>
        {moreFilters && (
          <div className="sa-tch-more">
            <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} aria-label="Gender">
              <option value="">All genders</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
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
                <th>Driver</th>
                <th>License No.</th>
                <th>Phone</th>
                <th>Assigned Bus</th>
                <th>Route</th>
                <th>Status</th>
                <th>License Expiry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((d, i) => {
                const status = driverStatus(d);
                const id = driverId(d);
                const days = daysUntil(d.profile?.licenseExpiry);
                const routesLabel = routeNames(d.profile);
                return (
                  <tr key={id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggleRow(id)}
                        aria-label={`Select ${d.name}`}
                      />
                    </td>
                    <td>
                      <div className="sa-stu-person">
                        {d.photoUrl ? <img src={d.photoUrl} alt="" /> : <span>{initials(d.name)}</span>}
                        <div>
                          <strong>{d.name}</strong>
                          <small>{d.employeeId || d.email || '—'}</small>
                        </div>
                      </div>
                    </td>
                    <td>{d.profile?.licenseNumber || '—'}</td>
                    <td>{d.phone || '—'}</td>
                    <td>{busLabel(d.profile) || '—'}</td>
                    <td>
                      {routesLabel.length ? (
                        <span>
                          {routesLabel[0]}
                          {routesLabel.length > 1 ? <small className="sa-stu-phone">+{routesLabel.length - 1} more</small> : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`sa-stu-status is-${status.key}`}>{status.label}</span>
                    </td>
                    <td>
                      {d.profile?.licenseExpiry ? (
                        <span className={days != null && days < 0 ? 'sa-drv-expiry is-expired' : 'sa-drv-expiry'}>
                          {days != null && days < 0 ? `Expired ${fmtDate(d.profile.licenseExpiry)}` : fmtDate(d.profile.licenseExpiry)}
                          {days != null && days >= 0 ? (
                            <small className="sa-stu-phone">
                              {days === 0 ? 'Expires today' : `${days} day${days === 1 ? '' : 's'} left`}
                            </small>
                          ) : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="sa-stu-actions">
                        <button
                          type="button"
                          className="sa-icon-ghost is-view"
                          aria-label="View"
                          onClick={() => navigate(`/school-admin/drivers/${id}`)}
                        >
                          ◉
                        </button>
                        <button type="button" className="sa-icon-ghost is-edit" aria-label="Edit" onClick={() => startEdit(d)}>
                          ✎
                        </button>
                        <button
                          type="button"
                          className="sa-icon-ghost is-live"
                          aria-label="Live map"
                          title="Live map"
                          onClick={() => navigate(liveMapHref(id))}
                        >
                          <LiveMapGlyph />
                        </button>
                        <div className={`sa-stu-more${menuId === id ? ' is-open' : ''}${i >= slice.length - 1 ? ' is-up' : ''}`}>
                          <button
                            type="button"
                            className="sa-icon-ghost"
                            aria-label="More"
                            aria-expanded={menuId === id}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.nativeEvent.stopImmediatePropagation();
                              setMenuId((cur) => (cur === id ? '' : id));
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <circle cx="12" cy="5" r="1.6" />
                              <circle cx="12" cy="12" r="1.6" />
                              <circle cx="12" cy="19" r="1.6" />
                            </svg>
                          </button>
                          {menuId === id && (
                            <div className="sa-stu-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                              <button type="button" role="menuitem" onClick={() => { setMenuId(''); navigate(liveMapHref(id)); }}>
                                <i aria-hidden="true"><LiveMapGlyph /></i>
                                Live map
                              </button>
                              <button type="button" role="menuitem" onClick={() => { setActive(d, d.active === false); setMenuId(''); }}>
                                <i aria-hidden="true">
                                  {d.active === false ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M10 9v6M14 9v6" /></svg>
                                  )}
                                </i>
                                {d.active === false ? 'Activate' : 'Deactivate'}
                              </button>
                              <span className="sa-stu-menu-sep" />
                              <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuId(''); remove(d); }}>
                                <i aria-hidden="true">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" /></svg>
                                </i>
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
                  <td colSpan={9} className="sa-stu-empty">
                    No drivers match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sa-table-foot sa-stu-foot">
          <span>
            Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} drivers
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
        <div className="sa-action-overlay" onClick={closePanel} role="presentation">
        <aside className="sa-action-modal sa-people-modal" aria-label={editingId ? 'Edit driver' : 'Add driver'} onClick={(e) => e.stopPropagation()}>
          <header className="sa-stop-detail-bar">
            <h2>{editingId ? 'Edit driver' : 'Add driver'}</h2>
            <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={closePanel}>×</button>
          </header>
          <div className="sa-people-body">
          {error && <div className="alert">{error}</div>}
          <label className="sa-field">
            <span>Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="sa-field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <CampusSelect
            campuses={campuses}
            value={form.campusId}
            onChange={(campusId) => setForm({ ...form, campusId })}
            required={!editingId}
            emptyLabel="Select campus"
          />
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Phone</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Employee ID</span>
              <input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>License No.</span>
              <input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>License expiry</span>
              <input
                type="date"
                value={form.licenseExpiry}
                onChange={(e) => setForm({ ...form, licenseExpiry: e.target.value })}
              />
            </label>
          </div>
          <label className="sa-field">
            <span>Default bus</span>
            <select value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })}>
              <option value="">None</option>
              {buses.map((b) => (
                <option key={b._id} value={b._id}>
                  {[b.label || b.plate, b.seats ? `${b.seats} seats` : ''].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          </label>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Plate note</span>
              <input value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Vehicle model</span>
              <input value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} />
            </label>
          </div>
          <fieldset className="checkbox-set">
            <legend>
              Preferred routes
              {!editingId ? <em className="sa-req"> *</em> : null}
            </legend>
            {routes.length ? (
              routes.map((r) => (
                <label key={r._id} className="check">
                  <input
                    type="checkbox"
                    checked={form.assignedRouteIds.includes(String(r._id))}
                    onChange={() => toggleRoute(r._id)}
                  />
                  {r.name}
                </label>
              ))
            ) : (
              <p className="sa-muted">Add a route first — at least one preferred route is required.</p>
            )}
          </fieldset>
          <label className="sa-field">
            <span>
              {editingId ? (
                'New password (optional)'
              ) : (
                <>
                  Password <em className="sa-req">*</em>
                </>
              )}
            </span>
            <input
              required={!editingId}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={editingId ? 'Leave blank to keep current' : 'Enter a password'}
            />
          </label>
          <MediaPicker
            label="Photo"
            folder="drivers"
            accept="image/*"
            value={form.photo}
            onChange={(photo) => setForm({ ...form, photo })}
          />
          {editingId && (
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
          )}
          </div>
          <div className="sa-people-foot">
            <button type="button" className="sa-btn sa-btn-outline" onClick={closePanel}>
              Cancel
            </button>
            <button type="button" className="sa-btn sa-btn-primary" disabled={!canSave} onClick={submit}>
              {editingId ? 'Save driver' : 'Create driver'}
            </button>
          </div>
        </aside>
        </div>
      )}

      <footer className="sa-home-foot">
        <span>© {year} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
