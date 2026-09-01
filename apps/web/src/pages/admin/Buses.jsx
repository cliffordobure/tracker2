import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import CampusSelect, { campusRefId } from '../../components/CampusSelect';
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
  campusId: '',
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
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

function prettySchool(name) {
  const raw = String(name || 'School').trim();
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function pctBar(part, total) {
  if (!total) return 0;
  return Math.min(100, Math.round(((Number(part) || 0) / total) * 100));
}

function daysTone(days, warnAt = 45) {
  if (days == null) return '';
  if (days < 0) return 'is-expired';
  if (days < warnAt) return 'is-soon';
  return 'is-ok';
}

function daysLabel(days, { expired, today, unit }) {
  if (days == null) return '';
  if (days < 0) return `${expired} ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return today;
  return `${days} ${unit}${days === 1 ? '' : 's'} left`;
}

function BusKpiGlyph({ name }) {
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
  if (name === 'bus') {
    return (
      <svg {...common}>
        <rect x="3" y="7" width="18" height="10" rx="2" />
        <path d="M7 17v2M17 17v2M3 12h18" />
      </svg>
    );
  }
  if (name === 'wrench') {
    return (
      <svg {...common}>
        <path d="M14.7 6.3a4.5 4.5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a4.5 4.5 0 0 0 6.4-6.4l-2.5 2.5-2.5-2.5 2.5-2.5Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3 4.5 6.2v5.4c0 4.4 2.9 8.4 7.5 9.6 4.6-1.2 7.5-5.2 7.5-9.6V6.2L12 3Z" />
    </svg>
  );
}

function BusKpiMark({ name }) {
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
  if (name === 'pause') return <svg {...common}><path d="M9 6v12M15 6v12" /></svg>;
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5h.01" />
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
  if (name === 'view') {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (name === 'edit') {
    return (
      <svg {...common}>
        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
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

export default function Buses() {
  const { globalSearch = '', schoolName, campusFilter = '', campuses } = useOutletContext() || {};
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
  const [routeFilter, setRouteFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [menuId, setMenuId] = useState('');
  const [panel, setPanel] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const load = async () => {
    const data = await api(`/admin/buses${campusFilter ? `?campusId=${campusFilter}` : ''}`);
    setBuses(data.buses || []);
    setStats(data.stats || null);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [campusFilter]);

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

  const colors = useMemo(
    () => [...new Set(buses.map((b) => b.color).filter(Boolean))].sort(),
    [buses]
  );

  const routeOptions = useMemo(() => {
    const map = new Map();
    buses.forEach((b) => {
      (b.routes || []).forEach((r) => {
        if (r?.id) map.set(r.id, r.name || 'Route');
      });
    });
    return [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [buses]);

  const driverOptions = useMemo(() => {
    const map = new Map();
    buses.forEach((b) => {
      const key = b.driver?.id || b.driver?.name;
      if (key) map.set(key, b.driver.name);
    });
    return [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [buses]);

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
      if (routeFilter && !(b.routes || []).some((r) => r.id === routeFilter)) return false;
      if (driverFilter && (b.driver?.id || b.driver?.name) !== driverFilter) return false;
      if (!needle) return true;
      const hay = [
        b.label,
        b.plate,
        b.model,
        b.code,
        b.color,
        typeLabel(b.vehicleType),
        b.driver?.name,
        b.routeName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [buses, q, statusFilter, typeFilter, capacityFilter, fuelFilter, colorFilter, routeFilter, driverFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, typeFilter, capacityFilter, fuelFilter, colorFilter, routeFilter, driverFilter, pageSize]);

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
      campusId: campusRefId(b.campusId),
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
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
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
        campusId: form.campusId || null,
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
    } finally {
      savingRef.current = false;
      setSaving(false);
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
    const rows = filtered;
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
  const menuBus = buses.find((b) => busId(b) === menuId);
  const menuStatus = menuBus ? busStatus(menuBus) : null;
  const canSave = Boolean(
    String(form.plate).trim() &&
      Number(form.seats) >= 1 &&
      (editingId || form.campusId)
  );
  const total = stats?.total ?? buses.length;
  const activeCount = stats?.active ?? buses.filter((b) => busStatus(b).label === 'Active').length;
  const maintenanceCount = stats?.maintenance ?? 0;
  const insuranceCount = stats?.insuranceValid ?? 0;
  const kpis = [
    {
      key: 'active',
      label: 'Active Vehicles',
      value: activeCount,
      hint: `${pct(activeCount, total)} of total`,
      tint: 'green',
      icon: 'bus',
      mark: 'check',
      bar: pctBar(activeCount, total),
    },
    {
      key: 'maint',
      label: 'Under Maintenance',
      value: maintenanceCount,
      hint: `${pct(maintenanceCount, total)} of total`,
      tint: 'orange',
      icon: 'wrench',
      mark: 'pause',
      bar: pctBar(maintenanceCount, total),
    },
    {
      key: 'ins',
      label: 'Insurance Valid',
      value: insuranceCount,
      hint: `${pct(insuranceCount, total)} of total`,
      tint: 'rose',
      icon: 'shield',
      mark: 'alert',
      bar: pctBar(insuranceCount, total),
    },
  ];

  return (
    <div className="sa-buses">
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <div className="sa-bus-head">
        <div>
          <h2>Buses / Vehicles</h2>
          <p>Manage and monitor all school buses and their status.</p>
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
            + Add Vehicle
          </button>
        </div>
      </div>

      <section className="sa-bus-kpis" aria-label="Vehicle metrics">
        {kpis.map((m) => (
          <article key={m.key} className={`sa-bus-kpi tint-${m.tint}`}>
            <i className="sa-bus-kpi-icon" aria-hidden="true">
              <BusKpiGlyph name={m.icon} />
            </i>
            <div className="sa-bus-kpi-copy">
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em>{m.hint}</em>
            </div>
            <b className="sa-bus-kpi-mark" aria-hidden="true">
              <BusKpiMark name={m.mark} />
            </b>
            <div className="sa-bus-kpi-bar" aria-hidden="true">
              <i style={{ width: `${m.bar}%` }} />
            </div>
          </article>
        ))}
      </section>

      <section className="sa-card sa-bus-table-card">
        <div className="sa-bus-toolbar">
          <label className="sa-stu-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by bus name..."
            />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="maintenance">Under Maintenance</option>
            <option value="out_of_service">Out of Service</option>
          </select>
          <select value={capacityFilter} onChange={(e) => setCapacityFilter(e.target.value)} aria-label="Capacity">
            <option value="">All Capacity</option>
            <option value="1-20">1–20 seats</option>
            <option value="21-40">21–40 seats</option>
            <option value="41+">41+ seats</option>
          </select>
          <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} aria-label="Route">
            <option value="">All Routes</option>
            {routeOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} aria-label="Driver">
            <option value="">All Driver</option>
            {driverOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" className="sa-btn sa-btn-outline sa-bus-more-btn" onClick={() => setMoreFilters((v) => !v)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            More Filters
          </button>
        </div>
        {moreFilters && (
          <div className="sa-bus-more">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type">
              <option value="">All Types</option>
              {VEHICLE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select value={fuelFilter} onChange={(e) => setFuelFilter(e.target.value)} aria-label="Fuel type">
              <option value="">All Fuel Types</option>
              {FUEL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
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
          <table className="sa-table sa-bus-table">
            <thead>
              <tr>
                <th>Vehicle No.</th>
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
                      <div className="sa-bus-id">
                        <i className="sa-bus-id-icon" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="3" y="7" width="18" height="10" rx="2" />
                            <path d="M7 17v2M17 17v2M3 12h18" />
                          </svg>
                        </i>
                        <div>
                          <strong>{b.plate || vehicleName(b)}</strong>
                          <em>{typeLabel(b.vehicleType) || 'School Bus'}</em>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="sa-bus-cell">
                        <strong>{b.model || '—'}</strong>
                        <small>{b.year ? `${b.year} Model` : '—'}</small>
                      </div>
                    </td>
                    <td>
                      <div className="sa-bus-cell">
                        <strong>{b.seats ? `${b.seats} Seats` : '—'}</strong>
                        <small className="is-students">{Number(b.studentCount) || 0} Students</small>
                      </div>
                    </td>
                    <td>
                      {b.driver?.name ? (
                        <div className="sa-bus-driver">
                          {b.driver.photoUrl ? <img src={b.driver.photoUrl} alt="" /> : <span>{initials(b.driver.name)}</span>}
                          <div>
                            <strong>{b.driver.name}</strong>
                            <small>{b.driver.phone || (b.extraDrivers ? `+${b.extraDrivers} more` : '—')}</small>
                          </div>
                        </div>
                      ) : (
                        <span className="sa-bus-muted">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span className={`sa-stu-status is-${status.key}`}>{status.label === 'Under Maintenance' ? 'Maintenance' : status.label}</span>
                    </td>
                    <td>
                      {b.insuranceExpiry ? (
                        <div className={`sa-bus-date ${daysTone(insDays, 60)}`}>
                          <i aria-hidden="true">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <rect x="3" y="5" width="18" height="16" rx="2" />
                              <path d="M8 3v4M16 3v4M3 11h18" />
                            </svg>
                          </i>
                          <div>
                            <strong>{fmtDate(b.insuranceExpiry)}</strong>
                            <small>{daysLabel(insDays, { expired: 'Expired', today: 'Expires today', unit: 'day' })}</small>
                          </div>
                        </div>
                      ) : (
                        <span className="sa-bus-muted">—</span>
                      )}
                    </td>
                    <td>
                      {b.nextServiceAt ? (
                        <div className={`sa-bus-date ${daysTone(svcDays, 45)}`}>
                          <i aria-hidden="true">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M14.7 6.3a4.5 4.5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a4.5 4.5 0 0 0 6.4-6.4l-2.5 2.5-2.5-2.5 2.5-2.5Z" />
                            </svg>
                          </i>
                          <div>
                            <strong>{fmtDate(b.nextServiceAt)}</strong>
                            <small>{daysLabel(svcDays, { expired: 'Overdue', today: 'Due today', unit: 'day' })}</small>
                          </div>
                        </div>
                      ) : (
                        <span className="sa-bus-muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="sa-stu-actions sa-bus-actions">
                        <button
                          type="button"
                          className="sa-icon-ghost is-view"
                          aria-label="View"
                          onClick={() => navigate(`/school-admin/buses/${id}`)}
                        >
                          <ActionGlyph name="view" />
                        </button>
                        <button type="button" className="sa-icon-ghost is-edit" aria-label="Edit" onClick={() => startEdit(b)}>
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
                  <td colSpan={8} className="sa-stu-empty">
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
            {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} vehicle{filtered.length === 1 ? '' : 's'}
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
          <CampusSelect
            campuses={campuses}
            value={form.campusId}
            onChange={(campusId) => setForm({ ...form, campusId })}
            required={!editingId}
            emptyLabel="Select campus"
          />
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
            <button type="button" className="sa-btn sa-btn-primary" disabled={!canSave || saving} onClick={submit}>
              {saving ? 'Saving…' : editingId ? 'Save vehicle' : 'Create vehicle'}
            </button>
          </div>
        </aside>
      )}

      {menuBus && (
        <div className="sa-action-overlay" onClick={() => setMenuId('')} role="presentation">
          <div
            className="sa-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sa-bus-action-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sa-action-head">
              <div>
                <p className="sa-action-kicker">Vehicle actions</p>
                <h3 id="sa-bus-action-title">{menuBus.plate || vehicleName(menuBus)}</h3>
                <small>
                  {typeLabel(menuBus.vehicleType) || 'School Bus'} · {menuStatus.label}
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
                  navigate(`/school-admin/buses/${busId(menuBus)}`);
                }}
              >
                <i aria-hidden="true">
                  <ActionGlyph name="view" />
                </i>
                <span>
                  <strong>View details</strong>
                  <em>Open the full vehicle profile</em>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuId('');
                  startEdit(menuBus);
                }}
              >
                <i aria-hidden="true">
                  <ActionGlyph name="edit" />
                </i>
                <span>
                  <strong>Edit vehicle</strong>
                  <em>Update registration, capacity, or insurance</em>
                </span>
              </button>
              {menuStatus.label !== 'Active' && (
                <button
                  type="button"
                  onClick={() => {
                    setStatus(menuBus, 'active');
                    setMenuId('');
                  }}
                >
                  <i aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M5 12.5 10 17.5 19 7" />
                    </svg>
                  </i>
                  <span>
                    <strong>Mark active</strong>
                    <em>Return this vehicle to service</em>
                  </span>
                </button>
              )}
              {menuStatus.label !== 'Under Maintenance' && (
                <button
                  type="button"
                  onClick={() => {
                    setStatus(menuBus, 'maintenance');
                    setMenuId('');
                  }}
                >
                  <i aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M14.7 6.3a4.5 4.5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a4.5 4.5 0 0 0 6.4-6.4l-2.5 2.5-2.5-2.5 2.5-2.5Z" />
                    </svg>
                  </i>
                  <span>
                    <strong>Under maintenance</strong>
                    <em>Temporarily take this vehicle offline</em>
                  </span>
                </button>
              )}
              {menuStatus.label !== 'Out of Service' && (
                <button
                  type="button"
                  onClick={() => {
                    setStatus(menuBus, 'out_of_service');
                    setMenuId('');
                  }}
                >
                  <i aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="12" r="8" />
                      <path d="M8 8l8 8" />
                    </svg>
                  </i>
                  <span>
                    <strong>Out of service</strong>
                    <em>Remove this vehicle from the active fleet</em>
                  </span>
                </button>
              )}
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  setMenuId('');
                  remove(menuBus);
                }}
              >
                <i aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
                  </svg>
                </i>
                <span>
                  <strong>Delete vehicle</strong>
                  <em>Permanently remove this record</em>
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
