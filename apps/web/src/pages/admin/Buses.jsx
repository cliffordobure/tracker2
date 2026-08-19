import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MediaPicker from '../../components/MediaPicker';

const PAGE_SIZES = [10, 25, 50];
const VEHICLE_TYPES = [
  { value: 'school_bus', label: 'School Bus' },
  { value: 'bus', label: 'Bus' },
  { value: 'minibus', label: 'Minibus' },
  { value: 'van', label: 'Van' },
];
const FUEL_TYPES = [
  { value: 'diesel', label: 'Diesel' },
  { value: 'petrol', label: 'Petrol' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'electric', label: 'Electric' },
];
const emptyForm = {
  label: '',
  code: '',
  plate: '',
  model: '',
  vehicleType: '',
  seats: 14,
  color: '',
  year: '',
  fuelType: '',
  serviceStatus: 'active',
  insuranceExpiry: '',
  insuranceProvider: '',
  insurancePolicyNo: '',
  nextServiceAt: '',
  lastServiceAt: '',
  chassisNumber: '',
  engineNumber: '',
  mileage: '',
  safetyFeatures: '',
  assistantName: '',
  assistantPhone: '',
  photo: null,
};

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'B';
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

function busId(b) {
  return String(b._id || b.id);
}

function typeLabel(value) {
  return VEHICLE_TYPES.find((t) => t.value === value)?.label || '';
}

function fuelLabel(value) {
  return FUEL_TYPES.find((t) => t.value === value)?.label || '';
}

function capacityBucket(seats) {
  const n = Number(seats);
  if (!Number.isFinite(n)) return '';
  if (n <= 20) return '1-20';
  if (n <= 40) return '21-40';
  return '41+';
}

function busStatus(b) {
  if (b.status === 'maintenance' || b.serviceStatus === 'maintenance') {
    return { key: 'inactive', label: 'Under Maintenance' };
  }
  if (b.status === 'out_of_service' || b.serviceStatus === 'out_of_service' || b.active === false) {
    return { key: 'noroute', label: 'Out of Service' };
  }
  return { key: 'active', label: 'Active' };
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

function vehicleName(b) {
  return b.label || b.plate || 'Vehicle';
}

export default function Buses() {
  const { globalSearch = '' } = useOutletContext() || {};
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openedEdit = useRef('');
  const [buses, setBuses] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [capacityFilter, setCapacityFilter] = useState('');
  const [fuelFilter, setFuelFilter] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);
  const [colorFilter, setColorFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [menuId, setMenuId] = useState('');
  const [panel, setPanel] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const data = await api('/admin/buses');
    setBuses(data.buses || []);
    setStats(data.stats || null);
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

  const colors = useMemo(
    () => [...new Set(buses.map((b) => b.color).filter(Boolean))].sort(),
    [buses]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return buses.filter((b) => {
      const st = b.status
        || (b.serviceStatus === 'maintenance' ? 'maintenance' : '')
        || (b.serviceStatus === 'out_of_service' || b.active === false ? 'out_of_service' : 'active');
      if (statusFilter && st !== statusFilter) return false;
      if (typeFilter && b.vehicleType !== typeFilter) return false;
      if (capacityFilter && capacityBucket(b.seats) !== capacityFilter) return false;
      if (fuelFilter && b.fuelType !== fuelFilter) return false;
      if (colorFilter && b.color !== colorFilter) return false;
      if (!needle) return true;
      const hay = [
        b.label,
        b.plate,
        b.model,
        b.code,
        b.color,
        typeLabel(b.vehicleType),
        b.driver?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [buses, q, statusFilter, typeFilter, capacityFilter, fuelFilter, colorFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, typeFilter, capacityFilter, fuelFilter, colorFilter, pageSize]);

  const allOnPageSelected = slice.length > 0 && slice.every((b) => selected.has(busId(b)));

  const toggleAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) slice.forEach((b) => next.delete(busId(b)));
      else slice.forEach((b) => next.add(busId(b)));
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
    if (params.get('edit')) {
      openedEdit.current = '';
      navigate('/school-admin/buses', { replace: true });
    }
  };

  const startCreate = () => {
    setError('');
    setSuccess('');
    setEditingId(null);
    setForm(emptyForm);
    setViewing(null);
    setPanel('form');
  };

  const startEdit = (b) => {
    setError('');
    setSuccess('');
    setEditingId(busId(b));
    setForm({
      label: b.label || '',
      code: b.code || '',
      plate: b.plate || '',
      model: b.model || '',
      vehicleType: b.vehicleType || '',
      seats: b.seats || 14,
      color: b.color || '',
      year: b.year || '',
      fuelType: b.fuelType || '',
      serviceStatus: b.status || b.serviceStatus || (b.active === false ? 'out_of_service' : 'active'),
      insuranceExpiry: toDateInput(b.insuranceExpiry),
      insuranceProvider: b.insuranceProvider || '',
      insurancePolicyNo: b.insurancePolicyNo || '',
      nextServiceAt: toDateInput(b.nextServiceAt),
      lastServiceAt: toDateInput(b.lastServiceAt),
      chassisNumber: b.chassisNumber || '',
      engineNumber: b.engineNumber || '',
      mileage: b.mileage ?? '',
      safetyFeatures: b.safetyFeatures || '',
      assistantName: b.assistantName || '',
      assistantPhone: b.assistantPhone || '',
      photo: b.photoUrl ? { url: b.photoUrl, publicId: b.photoPublicId || '' } : null,
    });
    setViewing(null);
    setPanel('form');
  };

  useEffect(() => {
    const editId = params.get('edit');
    if (!editId || !buses.length || openedEdit.current === editId) return;
    const bus = buses.find((b) => busId(b) === editId);
    if (bus) {
      openedEdit.current = editId;
      startEdit(bus);
    }
  }, [params, buses]);

  const submit = async () => {
    setError('');
    setSuccess('');
    try {
      const body = {
        label: form.label,
        code: form.code,
        plate: form.plate,
        model: form.model,
        vehicleType: form.vehicleType,
        seats: Number(form.seats),
        color: form.color,
        year: form.year === '' ? null : Number(form.year),
        fuelType: form.fuelType,
        serviceStatus: form.serviceStatus,
        insuranceExpiry: form.insuranceExpiry || null,
        insuranceProvider: form.insuranceProvider,
        insurancePolicyNo: form.insurancePolicyNo,
        nextServiceAt: form.nextServiceAt || null,
        lastServiceAt: form.lastServiceAt || null,
        chassisNumber: form.chassisNumber,
        engineNumber: form.engineNumber,
        mileage: form.mileage === '' ? null : Number(form.mileage),
        safetyFeatures: form.safetyFeatures,
        assistantName: form.assistantName,
        assistantPhone: form.assistantPhone,
        photoUrl: form.photo?.url || '',
        photoPublicId: form.photo?.publicId || '',
      };
      if (editingId) {
        await api(`/admin/buses/${editingId}`, { method: 'PUT', body });
        setSuccess(`${vehicleName(form)} updated.`);
      } else {
        await api('/admin/buses', { method: 'POST', body });
        setSuccess(`${vehicleName(form)} added.`);
      }
      closePanel();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const setStatus = async (b, serviceStatus) => {
    try {
      await api(`/admin/buses/${busId(b)}`, { method: 'PUT', body: { serviceStatus } });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (b) => {
    if (!confirm(`Remove ${vehicleName(b)}?`)) return;
    try {
      await api(`/admin/buses/${busId(b)}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const exportRows = () => {
    const rows = selected.size ? filtered.filter((b) => selected.has(busId(b))) : filtered;
    const header = ['Label', 'Code', 'Plate', 'Type', 'Model', 'Seats', 'Driver', 'Status', 'Insurance Expiry', 'Next Service'];
    const lines = [
      header.join(','),
      ...rows.map((b) =>
        [
          csvEscape(b.label),
          csvEscape(b.code),
          csvEscape(b.plate),
          csvEscape(typeLabel(b.vehicleType)),
          csvEscape(b.model),
          csvEscape(b.seats),
          csvEscape(b.driver?.name),
          csvEscape(busStatus(b).label),
          csvEscape(fmtDate(b.insuranceExpiry)),
          csvEscape(fmtDate(b.nextServiceAt)),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vehicles.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const year = new Date().getFullYear();
  const canSave = Boolean(String(form.plate).trim() && Number(form.seats) >= 1);
  const kpis = [
    {
      label: 'Total Vehicles',
      value: stats?.total ?? buses.length,
      hint: stats?.addedThisMonth ? `↑ ${stats.addedThisMonth} this month` : 'No change this month',
      up: Boolean(stats?.addedThisMonth),
      tint: 'purple',
    },
    {
      label: 'Active Vehicles',
      value: stats?.active ?? buses.filter((b) => busStatus(b).label === 'Active').length,
      hint: pct(stats?.active ?? 0, stats?.total || buses.length),
      tint: 'green',
    },
    {
      label: 'Under Maintenance',
      value: stats?.maintenance ?? 0,
      hint: pct(stats?.maintenance ?? 0, stats?.total || buses.length),
      tint: 'orange',
    },
    {
      label: 'Out of Service',
      value: stats?.outOfService ?? 0,
      hint: pct(stats?.outOfService ?? 0, stats?.total || buses.length),
      tint: 'rose',
    },
    {
      label: 'Insurance Valid',
      value: stats?.insuranceValid ?? 0,
      hint: pct(stats?.insuranceValid ?? 0, stats?.total || buses.length),
      tint: 'violet',
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
            + Add Vehicle
          </button>
        </div>
      </div>

      <section className="sa-stu-kpis sa-tch-kpis" aria-label="Vehicle metrics">
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
              placeholder="Search by bus number, plate no. or model..."
            />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="maintenance">Under Maintenance</option>
            <option value="out_of_service">Out of Service</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type">
            <option value="">All Types</option>
            {VEHICLE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <select value={capacityFilter} onChange={(e) => setCapacityFilter(e.target.value)} aria-label="Capacity">
            <option value="">All Capacity</option>
            <option value="1-20">1–20 seats</option>
            <option value="21-40">21–40 seats</option>
            <option value="41+">41+ seats</option>
          </select>
          <select value={fuelFilter} onChange={(e) => setFuelFilter(e.target.value)} aria-label="Fuel type">
            <option value="">All Fuel Types</option>
            {FUEL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMoreFilters((v) => !v)}>
            More Filters
          </button>
        </div>
        {moreFilters && (
          <div className="sa-tch-more">
            <select value={colorFilter} onChange={(e) => setColorFilter(e.target.value)} aria-label="Color">
              <option value="">All colours</option>
              {colors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
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
                <th>Vehicle</th>
                <th>Registration No.</th>
                <th>Type / Model</th>
                <th>Capacity</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Insurance Expiry</th>
                <th>Next Service</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((b) => {
                const status = busStatus(b);
                const id = busId(b);
                const insDays = daysUntil(b.insuranceExpiry);
                const svcDays = daysUntil(b.nextServiceAt);
                return (
                  <tr key={id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggleRow(id)}
                        aria-label={`Select ${vehicleName(b)}`}
                      />
                    </td>
                    <td>
                      <div className="sa-stu-person">
                        {b.photoUrl ? <img src={b.photoUrl} alt="" /> : <span>{initials(vehicleName(b))}</span>}
                        <div>
                          <strong>{vehicleName(b)}</strong>
                          <small>{b.code || '—'}</small>
                        </div>
                      </div>
                    </td>
                    <td>{b.plate || '—'}</td>
                    <td>
                      <span>
                        {b.model || '—'}
                        {typeLabel(b.vehicleType) ? <small className="sa-stu-phone">{typeLabel(b.vehicleType)}</small> : null}
                      </span>
                    </td>
                    <td>{b.seats ? `${b.seats} seats` : '—'}</td>
                    <td>
                      {b.driver?.name ? (
                        <span>
                          {b.driver.name}
                          {b.extraDrivers ? <small className="sa-stu-phone">+{b.extraDrivers} more</small> : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`sa-stu-status is-${status.key}`}>{status.label}</span>
                    </td>
                    <td>
                      {b.insuranceExpiry ? (
                        <span className={insDays != null && insDays < 0 ? 'sa-drv-expiry is-expired' : 'sa-drv-expiry'}>
                          {insDays != null && insDays < 0 ? `Expired ${fmtDate(b.insuranceExpiry)}` : fmtDate(b.insuranceExpiry)}
                          {insDays != null && insDays >= 0 ? (
                            <small className="sa-stu-phone">
                              {insDays === 0 ? 'Expires today' : `${insDays} day${insDays === 1 ? '' : 's'} left`}
                            </small>
                          ) : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {b.nextServiceAt ? (
                        <span className={`sa-bus-service${svcDays != null && svcDays < 0 ? ' is-overdue' : ''}`}>
                          {svcDays != null && svcDays < 0 ? `Overdue ${fmtDate(b.nextServiceAt)}` : fmtDate(b.nextServiceAt)}
                          {svcDays != null && svcDays >= 0 ? (
                            <small className="sa-stu-phone">
                              {svcDays === 0 ? 'Due today' : `${svcDays} day${svcDays === 1 ? '' : 's'} left`}
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
                          onClick={() => navigate(`/school-admin/buses/${id}`)}
                        >
                          ◉
                        </button>
                        <button type="button" className="sa-icon-ghost is-edit" aria-label="Edit" onClick={() => startEdit(b)}>
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
                              {status.label !== 'Active' && (
                                <button type="button" onClick={() => { setStatus(b, 'active'); setMenuId(''); }}>
                                  Mark active
                                </button>
                              )}
                              {status.label !== 'Under Maintenance' && (
                                <button type="button" onClick={() => { setStatus(b, 'maintenance'); setMenuId(''); }}>
                                  Under maintenance
                                </button>
                              )}
                              {status.label !== 'Out of Service' && (
                                <button type="button" onClick={() => { setStatus(b, 'out_of_service'); setMenuId(''); }}>
                                  Out of service
                                </button>
                              )}
                              <button type="button" className="is-danger" onClick={() => { setMenuId(''); remove(b); }}>
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
                    No vehicles match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sa-table-foot sa-stu-foot">
          <span>
            Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} vehicles
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

      {panel === 'view' && viewing && (
        <aside className="sa-drawer" aria-label="Vehicle details">
          <div className="sa-drawer-head">
            <h2>Vehicle details</h2>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={closePanel}>
              Close
            </button>
          </div>
          <div className="sa-drawer-student">
            {viewing.photoUrl ? (
              <img src={viewing.photoUrl} alt="" />
            ) : (
              <span className="sa-user-avatar">{initials(vehicleName(viewing))}</span>
            )}
            <div>
              <strong>{vehicleName(viewing)}</strong>
              <small>{viewing.plate || viewing.code || '—'}</small>
            </div>
          </div>
          <dl className="sa-drawer-fields">
            <div><dt>Internal ID</dt><dd>{viewing.code || '—'}</dd></div>
            <div><dt>Registration</dt><dd>{viewing.plate || '—'}</dd></div>
            <div><dt>Type</dt><dd>{typeLabel(viewing.vehicleType) || '—'}</dd></div>
            <div><dt>Model</dt><dd>{viewing.model || '—'}</dd></div>
            <div><dt>Capacity</dt><dd>{viewing.seats ? `${viewing.seats} seats` : '—'}</dd></div>
            <div><dt>Fuel</dt><dd>{fuelLabel(viewing.fuelType) || '—'}</dd></div>
            <div><dt>Driver</dt><dd>{viewing.driver?.name || '—'}</dd></div>
            <div><dt>Insurance expiry</dt><dd>{fmtDate(viewing.insuranceExpiry) || '—'}</dd></div>
            <div><dt>Next service</dt><dd>{fmtDate(viewing.nextServiceAt) || '—'}</dd></div>
            <div><dt>Status</dt><dd>{busStatus(viewing).label}</dd></div>
          </dl>
          <div className="sa-drawer-actions">
            <button type="button" className="sa-btn sa-btn-primary" onClick={() => startEdit(viewing)}>
              Edit vehicle
            </button>
          </div>
        </aside>
      )}

      {panel === 'form' && (
        <aside className="sa-drawer sa-drawer-wide" aria-label={editingId ? 'Edit vehicle' : 'Add vehicle'}>
          <div className="sa-drawer-head">
            <h2>{editingId ? 'Edit vehicle' : 'Add vehicle'}</h2>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={closePanel}>
              Close
            </button>
          </div>
          {error && <div className="alert">{error}</div>}
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Label</span>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Bus 01" />
            </label>
            <label className="sa-field">
              <span>Internal ID</span>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Optional" />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Registration / plate</span>
              <input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} required />
            </label>
            <label className="sa-field">
              <span>Model</span>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Type</span>
              <select value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
                <option value="">Not set</option>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sa-field">
              <span>Seats</span>
              <input type="number" min={1} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} required />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Fuel</span>
              <select value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value })}>
                <option value="">Not set</option>
                {FUEL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sa-field">
              <span>Status</span>
              <select value={form.serviceStatus} onChange={(e) => setForm({ ...form, serviceStatus: e.target.value })}>
                <option value="active">Active</option>
                <option value="maintenance">Under Maintenance</option>
                <option value="out_of_service">Out of Service</option>
              </select>
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Insurance expiry</span>
              <input type="date" value={form.insuranceExpiry} onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Next service</span>
              <input type="date" value={form.nextServiceAt} onChange={(e) => setForm({ ...form, nextServiceAt: e.target.value })} />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Insurer</span>
              <input value={form.insuranceProvider} onChange={(e) => setForm({ ...form, insuranceProvider: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Policy no.</span>
              <input value={form.insurancePolicyNo} onChange={(e) => setForm({ ...form, insurancePolicyNo: e.target.value })} />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Last service</span>
              <input type="date" value={form.lastServiceAt} onChange={(e) => setForm({ ...form, lastServiceAt: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Mileage (km)</span>
              <input type="number" min={0} value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Chassis no.</span>
              <input value={form.chassisNumber} onChange={(e) => setForm({ ...form, chassisNumber: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Engine no.</span>
              <input value={form.engineNumber} onChange={(e) => setForm({ ...form, engineNumber: e.target.value })} />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Colour</span>
              <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Year</span>
              <input type="number" min={1980} max={2100} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Assistant name</span>
              <input value={form.assistantName} onChange={(e) => setForm({ ...form, assistantName: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Assistant phone</span>
              <input value={form.assistantPhone} onChange={(e) => setForm({ ...form, assistantPhone: e.target.value })} />
            </label>
          </div>
          <label className="sa-field">
            <span>Safety notes / features</span>
            <textarea
              rows={2}
              value={form.safetyFeatures}
              onChange={(e) => setForm({ ...form, safetyFeatures: e.target.value })}
            />
          </label>
          <MediaPicker
            label="Photo"
            folder="general"
            accept="image/*"
            value={form.photo}
            onChange={(photo) => setForm({ ...form, photo })}
          />
          <div className="row-actions">
            <button type="button" className="sa-btn sa-btn-outline" onClick={closePanel}>
              Cancel
            </button>
            <button type="button" className="sa-btn sa-btn-primary" disabled={!canSave} onClick={submit}>
              {editingId ? 'Save vehicle' : 'Create vehicle'}
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
