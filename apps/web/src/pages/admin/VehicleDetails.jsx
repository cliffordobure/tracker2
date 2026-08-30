import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MediaPicker from '../../components/MediaPicker';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'maintenance', label: 'Maintenance', icon: 'wrench' },
  { id: 'documents', label: 'Documents', icon: 'doc' },
  { id: 'trips', label: 'Trips', icon: 'trips' },
  { id: 'fuel', label: 'Fuel & Costs', icon: 'fuel' },
  { id: 'insurance', label: 'Insurance', icon: 'shield' },
  { id: 'assignments', label: 'Assignments', icon: 'user' },
  { id: 'notes', label: 'Notes', icon: 'note' },
  { id: 'activity', label: 'Activity Log', icon: 'log' },
];

const TYPE_LABELS = {
  school_bus: 'School Bus',
  bus: 'Bus',
  minibus: 'Minibus',
  van: 'Van',
};

const FUEL_LABELS = {
  diesel: 'Diesel',
  petrol: 'Petrol',
  hybrid: 'Hybrid',
  electric: 'Electric',
};

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
  { value: 'all', label: 'All time' },
];

function dash(value) {
  if (value == null || value === 0) return value === 0 ? '0' : '—';
  const s = String(value).trim();
  return s || '—';
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'B';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function prettySchool(name) {
  const raw = String(name || 'School').trim();
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
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

function vehicleName(bus) {
  return bus?.label || bus?.plate || 'Vehicle';
}

function statusMeta(bus) {
  if (bus?.status === 'maintenance' || bus?.serviceStatus === 'maintenance') {
    return { key: 'inactive', label: 'Under Maintenance' };
  }
  if (bus?.status === 'out_of_service' || bus?.serviceStatus === 'out_of_service' || bus?.active === false) {
    return { key: 'noroute', label: 'Out of Service' };
  }
  return { key: 'active', label: 'Active' };
}

function tripStatusMeta(status) {
  if (status === 'completed') return { key: 'active', label: 'Completed' };
  if (status === 'active') return { key: 'active', label: 'In progress' };
  if (status === 'scheduled') return { key: 'inactive', label: 'Scheduled' };
  if (status === 'cancelled') return { key: 'noroute', label: 'Cancelled' };
  return { key: 'muted', label: status || '—' };
}

function daysTone(days) {
  if (days == null) return '';
  if (days < 0) return 'is-expired';
  if (days < 45) return 'is-soon';
  return 'is-ok';
}

function daysCopy(days, { expired, today }) {
  if (days == null) return '';
  if (days < 0) return expired || 'Expired';
  if (days === 0) return today || 'Today';
  return `${days} days left`;
}

function activityTint(kind) {
  if (kind === 'maintenance') return 'green';
  if (kind === 'fuel') return 'blue';
  if (kind === 'assignment') return 'orange';
  if (kind === 'insurance') return 'rose';
  if (kind === 'trip') return 'sky';
  if (kind === 'document') return 'violet';
  if (kind === 'note') return 'amber';
  return 'purple';
}

function TabGlyph({ name }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'overview') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
  if (name === 'wrench') return <svg {...common}><path d="M14.7 6.3a4.5 4.5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a4.5 4.5 0 0 0 6.4-6.4l-2.5 2.5-2.5-2.5 2.5-2.5Z" /></svg>;
  if (name === 'doc') return <svg {...common}><path d="M7 3h7l5 5v13H7V3Z" /><path d="M14 3v5h5" /></svg>;
  if (name === 'trips') return <svg {...common}><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M8 8c4 0 4 8 8 8" /></svg>;
  if (name === 'fuel') return <svg {...common}><path d="M5 21V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14" /><path d="M5 21h12M15 10h3l2 2v7a2 2 0 0 1-2 2h-1" /></svg>;
  if (name === 'shield') return <svg {...common}><path d="M12 3 4.5 6.2v5.4c0 4.4 2.9 8.4 7.5 9.6 4.6-1.2 7.5-5.2 7.5-9.6V6.2L12 3Z" /></svg>;
  if (name === 'user') return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5 19c.9-3.1 3.2-4.6 7-4.6S18.1 15.9 19 19" /></svg>;
  if (name === 'note') return <svg {...common}><path d="M6 4h9l5 5v11H6V4Z" /><path d="M15 4v5h5M8 13h8M8 17h5" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></svg>;
}

function ActivityGlyph({ kind }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (kind === 'maintenance') return <TabGlyph name="wrench" />;
  if (kind === 'fuel') return <TabGlyph name="fuel" />;
  if (kind === 'assignment') return <TabGlyph name="user" />;
  if (kind === 'insurance') return <TabGlyph name="shield" />;
  if (kind === 'trip') return <TabGlyph name="trips" />;
  if (kind === 'document') return <TabGlyph name="doc" />;
  if (kind === 'note') return <TabGlyph name="note" />;
  return (
    <svg {...common}>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

function emptyForm(kind) {
  return { kind, title: '', detail: '', occurredAt: '', liters: '', amount: '', file: null };
}

function buildActivity(data) {
  if (Array.isArray(data?.activity) && data.activity.length) return data.activity;
  const bus = data?.bus;
  const items = [];
  (data?.records || []).forEach((r) => {
    items.push({
      id: r.id,
      kind: r.kind,
      title: r.title,
      detail: r.detail,
      actorName: r.actorName,
      actorRole: r.actorRole,
      occurredAt: r.occurredAt,
    });
  });
  (data?.recentTrips || []).forEach((t) => {
    items.push({
      id: `trip:${t.id}`,
      kind: 'trip',
      title: t.status === 'completed' ? 'Trip completed' : t.status === 'active' ? 'Trip in progress' : 'Trip scheduled',
      detail: [t.routeName, t.driverName].filter(Boolean).join(' · ') || 'Trip recorded',
      actorName: t.driverName || '',
      actorRole: t.driverName ? 'Driver' : 'System',
      occurredAt: t.endedAt || t.startedAt || t.serviceDate || t.scheduledFor,
    });
  });
  if (bus?.createdAt) {
    items.push({
      id: `created:${bus._id}`,
      kind: 'activity',
      title: 'Vehicle added',
      detail: 'Vehicle was added to the fleet',
      actorRole: 'Administrator',
      occurredAt: bus.createdAt,
    });
  }
  if (bus?.updatedAt && bus.updatedAt !== bus.createdAt) {
    items.push({
      id: `updated:${bus._id}`,
      kind: 'activity',
      title: 'Vehicle updated',
      detail: 'Vehicle details were updated',
      actorRole: 'Administrator',
      occurredAt: bus.updatedAt,
    });
  }
  if (bus?.lastServiceAt) {
    items.push({
      id: `svc:${bus._id}`,
      kind: 'maintenance',
      title: 'Service completed',
      detail: 'Service date recorded on this vehicle',
      actorRole: 'Driver',
      occurredAt: bus.lastServiceAt,
    });
  }
  if (bus?.insuranceExpiry || bus?.insuranceProvider || bus?.insurancePolicyNo) {
    items.push({
      id: `ins:${bus._id}`,
      kind: 'insurance',
      title: 'Insurance updated',
      detail: [bus.insuranceProvider, bus.insurancePolicyNo ? `Policy ${bus.insurancePolicyNo}` : '']
        .filter(Boolean)
        .join(' · ') || 'Insurance details saved',
      actorRole: 'Administrator',
      occurredAt: bus.insuranceExpiry || bus.updatedAt,
    });
  }
  const driver = data?.drivers?.[0];
  if (driver) {
    items.push({
      id: `drv:${driver.id}`,
      kind: 'assignment',
      title: 'Driver assigned',
      detail: `Driver ${driver.name} was assigned to this vehicle`,
      actorRole: 'Administrator',
      occurredAt: driver.assignedAt || bus?.updatedAt || bus?.createdAt,
    });
  }
  items.sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0));
  return items;
}

export default function VehicleDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { schoolName: ctxSchool } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [range, setRange] = useState('30');
  const [kindFilter, setKindFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm('note'));

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api(`/admin/buses/${id}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    const kind =
      tab === 'maintenance' ? 'maintenance'
        : tab === 'fuel' ? 'fuel'
          : tab === 'documents' ? 'document'
            : tab === 'notes' ? 'note'
              : 'activity';
    setForm(emptyForm(kind));
    setSuccess('');
    setError('');
  }, [tab]);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const bus = data?.bus;
  const driver = data?.drivers?.[0];
  const records = data?.records || [];
  const year = new Date().getFullYear();
  const status = statusMeta(bus);
  const insDays = daysUntil(bus?.insuranceExpiry);
  const svcDays = daysUntil(bus?.nextServiceAt);

  const byKind = (kind) => records.filter((r) => r.kind === kind);

  const activity = useMemo(() => {
    const items = buildActivity(data);
    const now = Date.now();
    const days = range === 'all' ? null : Number(range);
    return items.filter((a) => {
      if (kindFilter && a.kind !== kindFilter) return false;
      if (!days) return true;
      const at = new Date(a.occurredAt).getTime();
      if (!Number.isFinite(at)) return true;
      return now - at <= days * 86400000;
    });
  }, [data, range, kindFilter]);

  const setStatus = async (serviceStatus) => {
    try {
      await api(`/admin/buses/${bus._id}`, { method: 'PUT', body: { serviceStatus } });
      setMenuOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${vehicleName(bus)}?`)) return;
    try {
      await api(`/admin/buses/${bus._id}`, { method: 'DELETE' });
      navigate('/school-admin/buses');
    } catch (e) {
      setError(e.message);
    }
  };

  const addRecord = async (payload) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api(`/admin/buses/${bus._id}/records`, { method: 'POST', body: payload });
      setForm(emptyForm(payload.kind));
      setSuccess('Saved.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="sa-vd">
        <div className="sa-skeleton sa-skeleton-hero" />
      </div>
    );
  }

  if (error && !bus) return <div className="alert">{error}</div>;
  if (!bus) return <div className="sa-empty-panel"><h2>Vehicle not found</h2></div>;

  const school = prettySchool(data.schoolName || ctxSchool);

  return (
    <div className="sa-vd">
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <div className="sa-vd-head">
        <div>
          <h2>Vehicle Details</h2>
          <p className="sa-vd-crumbs">
            <Link to="/school-admin">Dashboard</Link>
            <span>›</span>
            <Link to="/school-admin/buses">Buses / Vehicles</Link>
            <span>›</span>
            <em>Vehicle Details</em>
          </p>
        </div>
        <div className="sa-vd-head-actions">
          <Link to={`/school-admin/buses?edit=${bus._id}`} className="sa-btn sa-btn-outline sa-vd-edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
            </svg>
            Edit Vehicle
          </Link>
          <div className="sa-sd-menu-wrap">
            <button
              type="button"
              className="sa-btn sa-btn-primary"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              Actions ▾
            </button>
            {menuOpen && (
              <div className="sa-stu-menu sa-sd-menu" onClick={(e) => e.stopPropagation()}>
                {status.label !== 'Active' && (
                  <button type="button" onClick={() => setStatus('active')}>Mark active</button>
                )}
                {status.label !== 'Under Maintenance' && (
                  <button type="button" onClick={() => setStatus('maintenance')}>Under maintenance</button>
                )}
                {status.label !== 'Out of Service' && (
                  <button type="button" onClick={() => setStatus('out_of_service')}>Out of service</button>
                )}
                <button type="button" className="is-danger" onClick={remove}>Delete</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="sa-card sa-vd-hero">
        <div className="sa-vd-hero-id">
          {bus.photoUrl ? <img src={bus.photoUrl} alt="" /> : <span>{initials(vehicleName(bus))}</span>}
          <div>
            <div className="sa-vd-hero-name">
              <h3>{vehicleName(bus)}</h3>
              <em className={`sa-stu-status is-${status.key}`}>{status.label}</em>
            </div>
            <p>
              {bus.plate ? `Reg. ${bus.plate}` : 'No plate'}
              {bus.code ? ` · ID ${bus.code}` : ''}
            </p>
            <div className="sa-vd-chips">
              <i>{TYPE_LABELS[bus.vehicleType] || 'Vehicle'}</i>
              <i>{bus.seats ? `${bus.seats} Seats` : '—'}</i>
              <i>{FUEL_LABELS[bus.fuelType] || 'Fuel n/a'}</i>
            </div>
          </div>
        </div>
        <div className="sa-vd-hero-col">
          <strong>
            <TabGlyph name="shield" />
            Insurance
          </strong>
          <p><span>Provider</span> {dash(bus.insuranceProvider)}</p>
          <p><span>Policy No.</span> {bus.insurancePolicyNo ? `Policy ${bus.insurancePolicyNo}` : '—'}</p>
          <p>
            <span>Valid Until</span> {dash(fmtDate(bus.insuranceExpiry))}
            {insDays != null ? <b className={daysTone(insDays)}>{daysCopy(insDays, { expired: '(Expired)', today: '(Expires today)' })}</b> : null}
          </p>
        </div>
        <div className="sa-vd-hero-col">
          <strong>
            <TabGlyph name="wrench" />
            Service
          </strong>
          <p>
            <span>Next Service</span> {dash(fmtDate(bus.nextServiceAt))}
            {svcDays != null ? <b className={daysTone(svcDays)}>{daysCopy(svcDays, { expired: '(Overdue)', today: '(Due today)' })}</b> : null}
          </p>
          <p><span>Last Service</span> {dash(fmtDate(bus.lastServiceAt))}</p>
        </div>
        <div className="sa-vd-hero-col sa-vd-hero-driver">
          <strong>
            <TabGlyph name="user" />
            Assigned Driver
          </strong>
          {driver ? (
            <div className="sa-vd-driver">
              {driver.photoUrl ? <img src={driver.photoUrl} alt="" /> : <span>{initials(driver.name)}</span>}
              <div>
                <b>{driver.name}</b>
                <small>{driver.phone || '—'}</small>
                <small>{driver.employeeId || driver.licenseNumber || ''}</small>
              </div>
            </div>
          ) : (
            <p className="sa-muted">No driver assigned</p>
          )}
        </div>
      </section>

      <nav className="sa-vd-tabs" aria-label="Vehicle sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            <TabGlyph name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
          <section className="sa-vd-grid">
            <article className="sa-card">
              <h3>Vehicle Information</h3>
              <dl className="sa-vd-dl">
                <div><dt>Year</dt><dd>{dash(bus.year)}</dd></div>
                <div><dt>Model</dt><dd>{dash(bus.model)}</dd></div>
                <div><dt>Chassis no.</dt><dd>{dash(bus.chassisNumber)}</dd></div>
                <div><dt>Engine no.</dt><dd>{dash(bus.engineNumber)}</dd></div>
                <div><dt>Colour</dt><dd>{dash(bus.color)}</dd></div>
                <div><dt>Mileage</dt><dd>{bus.mileage != null ? `${Number(bus.mileage).toLocaleString()} km` : '—'}</dd></div>
              </dl>
            </article>
            <article className="sa-card">
              <h3>Vehicle Status</h3>
              <dl className="sa-vd-dl">
                <div><dt>Status</dt><dd><span className={`sa-stu-status is-${status.key}`}>{status.label}</span></dd></div>
                <div><dt>Availability</dt><dd>{status.label === 'Active' ? 'Available' : 'Not available'}</dd></div>
                <div><dt>Students</dt><dd>{bus.studentCount ?? 0}</dd></div>
                <div><dt>Assistant</dt><dd>{dash([bus.assistantName, bus.assistantPhone].filter(Boolean).join(' · '))}</dd></div>
                <div><dt>Last updated</dt><dd>{dash(fmtDate(bus.updatedAt))}</dd></div>
              </dl>
            </article>
            <article className="sa-card">
              <h3>Capacity & Features</h3>
              <dl className="sa-vd-dl">
                <div><dt>Seating</dt><dd>{bus.seats ? `${bus.seats} seats` : '—'}</dd></div>
                <div><dt>Type</dt><dd>{dash(TYPE_LABELS[bus.vehicleType])}</dd></div>
                <div><dt>Fuel</dt><dd>{dash(FUEL_LABELS[bus.fuelType])}</dd></div>
              </dl>
              {bus.safetyFeatures ? <p className="sa-vd-note">{bus.safetyFeatures}</p> : <p className="sa-muted">No equipment notes stored.</p>}
            </article>
            <article className="sa-card sa-vd-actions">
              <h3>Quick Actions</h3>
              <div className="sa-vd-quick">
                <Link to="/school-admin/drivers">Assign Driver</Link>
                <Link to="/school-admin/routes">Assign Route</Link>
                <Link to="/school-admin/trip-instances">View Trips</Link>
                <button type="button" onClick={() => setTab('maintenance')}>Add Service</button>
                <button type="button" onClick={() => setTab('fuel')}>Add Fuel Record</button>
                <button type="button" onClick={() => setTab('documents')}>Upload Document</button>
                <button type="button" onClick={() => setTab('notes')}>Add Note</button>
                <button type="button" className="is-danger" onClick={() => setStatus(status.label === 'Active' ? 'out_of_service' : 'active')}>
                  {status.label === 'Active' ? 'Mark Inactive' : 'Mark Active'}
                </button>
              </div>
            </article>
          </section>
          <section className="sa-vd-bottom">
            <article className="sa-card">
              <h3>Recent Trips</h3>
              {data.recentTrips?.length ? (
                <ul className="sa-vd-mini">
                  {data.recentTrips.slice(0, 5).map((t) => (
                    <li key={t.id}>
                      <strong>{t.routeName || 'Trip'}</strong>
                      <small>{fmtDate(t.serviceDate || t.scheduledFor || t.startedAt) || '—'}</small>
                      <em className={`sa-stu-status is-${tripStatusMeta(t.status).key}`}>{tripStatusMeta(t.status).label}</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">No trips recorded yet.</p>
              )}
            </article>
            <article className="sa-card">
              <h3>Service History</h3>
              {byKind('maintenance').length ? (
                <ul className="sa-vd-mini">
                  {byKind('maintenance').slice(0, 5).map((r) => (
                    <li key={r.id}>
                      <strong>{r.title}</strong>
                      <small>{fmtDate(r.occurredAt)}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">{bus.lastServiceAt ? `Last service ${fmtDate(bus.lastServiceAt)}.` : 'No service visits stored yet.'}</p>
              )}
            </article>
            <article className="sa-card">
              <h3>Fuel This Month</h3>
              <p className="sa-vd-fuel-stat">
                <strong>{data.fuelSummary?.liters || 0}</strong>
                <span>litres · {data.fuelSummary?.fills || 0} fills · {data.fuelSummary?.cost ? `KES ${Number(data.fuelSummary.cost).toLocaleString()}` : 'no cost'}</span>
              </p>
            </article>
            <article className="sa-card">
              <h3>Documents</h3>
              {byKind('document').length ? (
                <ul className="sa-vd-mini">
                  {byKind('document').slice(0, 4).map((r) => (
                    <li key={r.id}>
                      <strong>{r.fileName || r.title}</strong>
                      <small>{fmtDate(r.occurredAt)}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">{bus.photoUrl ? 'Vehicle photo on file. No other documents yet.' : 'No documents stored yet.'}</p>
              )}
            </article>
          </section>
        </>
      )}

      {tab === 'maintenance' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Maintenance</h3>
              <p>Service visits stored for this vehicle.</p>
            </div>
          </header>
          <form
            className="sa-vd-form"
            onSubmit={(e) => {
              e.preventDefault();
              addRecord({
                kind: 'maintenance',
                title: form.title || 'Service completed',
                detail: form.detail,
                occurredAt: form.occurredAt || undefined,
                amount: form.amount,
              });
            }}
          >
            <input placeholder="Service title" value={form.kind === 'maintenance' ? form.title : ''} onChange={(e) => setForm({ ...emptyForm('maintenance'), ...form, kind: 'maintenance', title: e.target.value })} />
            <input type="date" value={form.kind === 'maintenance' ? form.occurredAt : ''} onChange={(e) => setForm({ ...form, kind: 'maintenance', occurredAt: e.target.value })} />
            <input placeholder="Cost" type="number" min="0" value={form.kind === 'maintenance' ? form.amount : ''} onChange={(e) => setForm({ ...form, kind: 'maintenance', amount: e.target.value })} />
            <input placeholder="Notes" value={form.kind === 'maintenance' ? form.detail : ''} onChange={(e) => setForm({ ...form, kind: 'maintenance', detail: e.target.value })} />
            <button type="submit" className="sa-btn sa-btn-primary" disabled={saving}>Add service</button>
          </form>
          {byKind('maintenance').length ? (
            <ul className="sa-vd-list">
              {byKind('maintenance').map((r) => (
                <li key={r.id}>
                  <i className="tint-green"><ActivityGlyph kind="maintenance" /></i>
                  <div>
                    <strong>{r.title}</strong>
                    <p>{[r.detail, r.amount != null ? `KES ${Number(r.amount).toLocaleString()}` : ''].filter(Boolean).join(' · ') || 'Service recorded'}</p>
                  </div>
                  <time>{fmtDateTime(r.occurredAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">{bus.lastServiceAt ? `Last service on file: ${fmtDate(bus.lastServiceAt)}. Next: ${dash(fmtDate(bus.nextServiceAt))}.` : 'No workshop visits stored yet.'}</p>
          )}
        </section>
      )}

      {tab === 'documents' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Documents</h3>
              <p>Logbook, inspection and insurance files for this vehicle.</p>
            </div>
          </header>
          <form
            className="sa-vd-form is-doc"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.file?.url) return;
              addRecord({
                kind: 'document',
                title: form.title || form.file.originalName || 'Document uploaded',
                detail: form.detail,
                url: form.file.url,
                fileName: form.file.originalName || 'Document',
                publicId: form.file.publicId || '',
              });
            }}
          >
            <input placeholder="Document name" value={form.kind === 'document' ? form.title : ''} onChange={(e) => setForm({ ...form, kind: 'document', title: e.target.value })} />
            <MediaPicker
              label="File"
              folder="vehicles"
              value={form.kind === 'document' ? form.file : null}
              onChange={(file) => setForm({ ...form, kind: 'document', file })}
            />
            <button type="submit" className="sa-btn sa-btn-primary" disabled={saving || !form.file?.url}>Upload</button>
          </form>
          <ul className="sa-vd-list">
            {bus.photoUrl ? (
              <li>
                <i className="tint-violet"><ActivityGlyph kind="document" /></i>
                <div>
                  <strong>Vehicle photo</strong>
                  <p><a href={bus.photoUrl} target="_blank" rel="noreferrer">Open</a></p>
                </div>
              </li>
            ) : null}
            {byKind('document').map((r) => (
              <li key={r.id}>
                <i className="tint-violet"><ActivityGlyph kind="document" /></i>
                <div>
                  <strong>{r.fileName || r.title}</strong>
                  <p>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">Open file</a> : r.detail}</p>
                </div>
                <time>{fmtDateTime(r.occurredAt)}</time>
              </li>
            ))}
          </ul>
          {!bus.photoUrl && !byKind('document').length ? <p className="sa-muted">No documents stored yet.</p> : null}
        </section>
      )}

      {tab === 'trips' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Trips</h3>
              <p>Recent trips for this vehicle from the trip log.</p>
            </div>
            <Link to="/school-admin/trip-instances" className="sa-btn sa-btn-outline">All trips</Link>
          </header>
          {data.recentTrips?.length ? (
            <table className="sa-table sa-vd-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Route</th>
                  <th>Driver</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTrips.map((t) => {
                  const meta = tripStatusMeta(t.status);
                  return (
                    <tr key={t.id}>
                      <td>{fmtDate(t.serviceDate || t.scheduledFor || t.startedAt) || '—'}</td>
                      <td>{t.routeName || '—'}</td>
                      <td>{t.driverName || '—'}</td>
                      <td><em className={`sa-stu-status is-${meta.key}`}>{meta.label}</em></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No trips recorded for this vehicle.</p>
          )}
        </section>
      )}

      {tab === 'fuel' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Fuel & Costs</h3>
              <p>{FUEL_LABELS[bus.fuelType] || 'Fuel type not set'} · {data.fuelSummary?.liters || 0} litres this month</p>
            </div>
          </header>
          <form
            className="sa-vd-form"
            onSubmit={(e) => {
              e.preventDefault();
              addRecord({
                kind: 'fuel',
                title: form.title || 'Fuel added',
                detail: form.detail || (form.liters ? `${form.liters} litres of ${FUEL_LABELS[bus.fuelType] || 'fuel'} added` : ''),
                occurredAt: form.occurredAt || undefined,
                liters: form.liters,
                amount: form.amount,
              });
            }}
          >
            <input type="number" min="0" step="0.1" placeholder="Litres" value={form.kind === 'fuel' ? form.liters : ''} onChange={(e) => setForm({ ...form, kind: 'fuel', liters: e.target.value })} required />
            <input type="number" min="0" placeholder="Cost" value={form.kind === 'fuel' ? form.amount : ''} onChange={(e) => setForm({ ...form, kind: 'fuel', amount: e.target.value })} />
            <input type="date" value={form.kind === 'fuel' ? form.occurredAt : ''} onChange={(e) => setForm({ ...form, kind: 'fuel', occurredAt: e.target.value })} />
            <input placeholder="Note" value={form.kind === 'fuel' ? form.detail : ''} onChange={(e) => setForm({ ...form, kind: 'fuel', detail: e.target.value })} />
            <button type="submit" className="sa-btn sa-btn-primary" disabled={saving}>Add fill</button>
          </form>
          {byKind('fuel').length ? (
            <ul className="sa-vd-list">
              {byKind('fuel').map((r) => (
                <li key={r.id}>
                  <i className="tint-blue"><ActivityGlyph kind="fuel" /></i>
                  <div>
                    <strong>{r.title}</strong>
                    <p>{[r.liters != null ? `${r.liters} litres` : '', r.amount != null ? `KES ${Number(r.amount).toLocaleString()}` : '', r.detail].filter(Boolean).join(' · ')}</p>
                  </div>
                  <time>{fmtDateTime(r.occurredAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No fuel fills stored yet.</p>
          )}
        </section>
      )}

      {tab === 'insurance' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Insurance</h3>
              <p>Current cover and saved policy updates.</p>
            </div>
            <Link to={`/school-admin/buses?edit=${bus._id}`} className="sa-btn sa-btn-outline">Edit</Link>
          </header>
          <dl className="sa-vd-dl sa-vd-dl-wide">
            <div><dt>Provider</dt><dd>{dash(bus.insuranceProvider)}</dd></div>
            <div><dt>Policy no.</dt><dd>{dash(bus.insurancePolicyNo)}</dd></div>
            <div>
              <dt>Expiry</dt>
              <dd>
                {dash(fmtDate(bus.insuranceExpiry))}
                {insDays != null ? <small className={daysTone(insDays)}>{daysCopy(insDays, { expired: 'Expired', today: 'Expires today' })}</small> : null}
              </dd>
            </div>
          </dl>
          {byKind('insurance').length ? (
            <ul className="sa-vd-list">
              {byKind('insurance').map((r) => (
                <li key={r.id}>
                  <i className="tint-rose"><ActivityGlyph kind="insurance" /></i>
                  <div>
                    <strong>{r.title}</strong>
                    <p>{r.detail || 'Insurance details updated'}</p>
                  </div>
                  <time>{fmtDateTime(r.occurredAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No insurance change history beyond the current policy.</p>
          )}
        </section>
      )}

      {tab === 'assignments' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Assignments</h3>
              <p>Drivers and routes currently linked to this vehicle.</p>
            </div>
            <Link to="/school-admin/drivers" className="sa-btn sa-btn-outline">Drivers</Link>
          </header>
          <div className="sa-vd-assign">
            <article>
              <h4>Drivers</h4>
              {data.drivers?.length ? (
                <ul className="sa-vd-people">
                  {data.drivers.map((d) => (
                    <li key={d.id}>
                      {d.photoUrl ? <img src={d.photoUrl} alt="" /> : <span>{initials(d.name)}</span>}
                      <div>
                        <Link to={`/school-admin/drivers/${d.id}`}>{d.name}</Link>
                        <small>{[d.phone, d.licenseNumber].filter(Boolean).join(' · ') || '—'}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">No driver is assigned.</p>
              )}
            </article>
            <article>
              <h4>Routes</h4>
              {data.routes?.length ? (
                <ul className="sa-vd-people">
                  {data.routes.map((r) => (
                    <li key={r.id}>
                      <i className="tint-sky"><TabGlyph name="trips" /></i>
                      <div>
                        {r.name ? <Link to={`/school-admin/routes/${r.id}`}>{r.name}</Link> : r.id}
                        <small>{bus.studentCount ? `${bus.studentCount} students` : 'No students linked'}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">No routes are linked through assigned drivers.</p>
              )}
            </article>
          </div>
        </section>
      )}

      {tab === 'notes' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Notes</h3>
              <p>Internal remarks and safety notes for this vehicle.</p>
            </div>
          </header>
          {bus.safetyFeatures ? <p className="sa-vd-note">{bus.safetyFeatures}</p> : null}
          <form
            className="sa-vd-form is-note"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.detail.trim()) return;
              addRecord({ kind: 'note', title: form.title || 'Note added', detail: form.detail });
            }}
          >
            <input placeholder="Title" value={form.kind === 'note' ? form.title : ''} onChange={(e) => setForm({ ...form, kind: 'note', title: e.target.value })} />
            <textarea rows={2} placeholder="Write a note..." value={form.kind === 'note' ? form.detail : ''} onChange={(e) => setForm({ ...form, kind: 'note', detail: e.target.value })} />
            <button type="submit" className="sa-btn sa-btn-primary" disabled={saving || !form.detail.trim()}>Add note</button>
          </form>
          {byKind('note').length ? (
            <ul className="sa-vd-list">
              {byKind('note').map((r) => (
                <li key={r.id}>
                  <i className="tint-amber"><ActivityGlyph kind="note" /></i>
                  <div>
                    <strong>{r.title}</strong>
                    <p>{r.detail}</p>
                  </div>
                  <time>{fmtDateTime(r.occurredAt)}</time>
                </li>
              ))}
            </ul>
          ) : !bus.safetyFeatures ? (
            <p className="sa-muted">No notes stored on this vehicle.</p>
          ) : null}
        </section>
      )}

      {tab === 'activity' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Activity Log</h3>
              <p>Updates, services, fuel, trips and assignments from the database.</p>
            </div>
            <div className="sa-vd-log-tools">
              <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} aria-label="Filter">
                <option value="">Filter</option>
                <option value="activity">Updates</option>
                <option value="maintenance">Service</option>
                <option value="fuel">Fuel</option>
                <option value="assignment">Drivers</option>
                <option value="insurance">Insurance</option>
                <option value="trip">Trips</option>
                <option value="document">Documents</option>
                <option value="note">Notes</option>
              </select>
              <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range">
                {RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </header>
          {activity.length ? (
            <ul className="sa-vd-log">
              {activity.map((a) => (
                <li key={a.id}>
                  <i className={`tint-${activityTint(a.kind)}`}><ActivityGlyph kind={a.kind} /></i>
                  <div>
                    <div className="sa-vd-log-title">
                      <strong>{a.title}</strong>
                      {a.actorRole ? <em className={`sa-vd-role is-${a.actorRole.toLowerCase()}`}>{a.actorRole}</em> : null}
                    </div>
                    <p>{a.detail || '—'}</p>
                  </div>
                  <time>{fmtDateTime(a.occurredAt) || '—'}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No activity in this range.</p>
          )}
        </section>
      )}

      <footer className="sa-home-foot">
        <span>© {year} {school}. All rights reserved.</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
