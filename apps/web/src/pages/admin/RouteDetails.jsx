import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';
import { fetchDrivingRoute, formatEtaMinutes } from '../../lib/directions';
import { orderedStopsForDirection } from '../../lib/geo';
import { fmtSchoolDate, tripStartLabel } from '../../lib/schoolTime';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'stops', label: 'Stops', icon: 'pin' },
  { id: 'schedule', label: 'Schedule', icon: 'clock' },
  { id: 'students', label: 'Students', icon: 'user' },
  { id: 'trips', label: 'Trips', icon: 'trips' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'notes', label: 'Notes', icon: 'note' },
  { id: 'activity', label: 'Activity Log', icon: 'log' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dash(value) {
  if (value == null || value === 0) return value === 0 ? '0' : '—';
  const s = String(value).trim();
  return s || '—';
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function prettySchool(name) {
  const raw = String(name || 'School').trim();
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(value) {
  return fmtSchoolDate(value);
}

function fmtDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
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

function addMinutes(hhmm, extraMin) {
  if (!hhmm || extraMin == null) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  const d = new Date();
  d.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  d.setMinutes(d.getMinutes() + Number(extraMin));
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function directionLabel(value) {
  if (value === 'to_school') return 'To school';
  if (value === 'to_home') return 'To home';
  return '';
}

function periodLabel(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function scheduleTypeLabel(type) {
  if (type === 'EVERY_DAY') return 'Every day';
  if (type === 'WEEKDAYS') return 'Weekdays';
  if (type === 'CUSTOM_DAYS') return 'Custom days';
  if (type === 'ONE_TIME') return 'One-time';
  return '';
}

function operatingDays(schedules) {
  const active = (schedules || []).filter((s) => s.active !== false);
  if (!active.length) return '';
  if (active.some((s) => s.scheduleType === 'EVERY_DAY')) return 'Every day';
  const set = new Set();
  for (const s of active) {
    if (s.scheduleType === 'WEEKDAYS') [1, 2, 3, 4, 5].forEach((d) => set.add(d));
    else if (s.scheduleType === 'CUSTOM_DAYS') (s.customDays || []).forEach((d) => set.add(d));
  }
  if (!set.size) {
    if (active.some((s) => s.scheduleType === 'ONE_TIME')) return 'One-time';
    return '';
  }
  return [...set]
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(', ');
}

function tripStatusMeta(status) {
  if (status === 'completed') return { key: 'active', label: 'Completed' };
  if (status === 'active') return { key: 'active', label: 'In progress' };
  if (status === 'scheduled') return { key: 'inactive', label: 'Scheduled' };
  if (status === 'cancelled') return { key: 'noroute', label: 'Cancelled' };
  return { key: 'muted', label: status || '—' };
}

function kmLabel(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return '';
  return `${(meters / 1000).toFixed(1)} km`;
}

function stopPlace(stop) {
  if (stop?.address) return stop.address;
  if (stop?.location?.lat != null && stop?.location?.lng != null) {
    return `${Number(stop.location.lat).toFixed(4)}, ${Number(stop.location.lng).toFixed(4)}`;
  }
  return '';
}

function stopKind(stop, startId, endId) {
  const id = String(stop?._id || '');
  if (startId && id === startId) return 'Start';
  if (endId && id === endId) return 'End';
  if (stop?.type === 'school') return 'School';
  return '';
}

function routeCode(route) {
  if (route?.code) return route.code;
  const id = String(route?._id || '');
  return id ? `RT-${id.slice(-4).toUpperCase()}` : '—';
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
  if (name === 'pin') return <svg {...common}><path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z" /><circle cx="12" cy="10" r="2.2" /></svg>;
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="8.2" /><path d="M12 8v4.2l2.6 1.6" /></svg>;
  if (name === 'user') return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5 19c.9-3.1 3.2-4.6 7-4.6S18.1 15.9 19 19" /></svg>;
  if (name === 'trips') return <svg {...common}><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M8 8c4 0 4 8 8 8" /></svg>;
  if (name === 'map') return <svg {...common}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></svg>;
  if (name === 'note') return <svg {...common}><path d="M6 4h9l5 5v11H6V4Z" /><path d="M15 4v5h5M8 13h8M8 17h5" /></svg>;
  if (name === 'check') return <svg {...common}><path d="M5 12.5 10 17.5 19 7" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></svg>;
}

function InfoGlyph({ name }) {
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
  if (name === 'route') return <svg {...common}><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M8 8c4 0 4 8 8 8" /></svg>;
  if (name === 'code') return <svg {...common}><path d="M8 8 4 12l4 4M16 8l4 4-4 4M13 5l-2 14" /></svg>;
  if (name === 'user') return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5 19c.9-3.1 3.2-4.6 7-4.6S18.1 15.9 19 19" /></svg>;
  if (name === 'cal') return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></svg>;
  if (name === 'status') return <svg {...common}><path d="M12 3 4.5 6.2v5.4c0 4.4 2.9 8.4 7.5 9.6 4.6-1.2 7.5-5.2 7.5-9.6V6.2L12 3Z" /></svg>;
  if (name === 'pin') return <svg {...common}><path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z" /><circle cx="12" cy="10" r="2.2" /></svg>;
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="8.2" /><path d="M12 8v4.2l2.6 1.6" /></svg>;
  if (name === 'users') return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 19c.8-2.8 2.8-4.2 6-4.2S14.2 16.2 15 19" /><circle cx="17" cy="9" r="2.2" /><path d="M16 19c.5-1.8 1.6-2.8 3.5-3.2" /></svg>;
  if (name === 'bus') return <svg {...common}><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 17v2M17 17v2M3 12h18" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
}

function buildActivity(data) {
  const route = data?.route;
  const items = [];
  if (route?.createdAt) {
    items.push({
      id: 'created',
      title: 'Route created',
      body: `${route.name} was added to the school routes.`,
      at: route.createdAt,
      kind: 'route',
    });
  }
  if (route?.updatedAt && route.updatedAt !== route.createdAt) {
    items.push({
      id: 'updated',
      title: 'Route updated',
      body: 'Route details were saved.',
      at: route.updatedAt,
      kind: 'note',
    });
  }
  (data?.stops || []).forEach((s) => {
    if (!s.createdAt) return;
    items.push({
      id: `stop-${s._id}`,
      title: 'Stop added',
      body: s.name,
      at: s.createdAt,
      kind: 'pin',
    });
  });
  (data?.students || []).forEach((s) => {
    items.push({
      id: `stu-${s.id}`,
      title: 'Student assigned',
      body: s.name,
      at: s.createdAt || route?.updatedAt,
      kind: 'user',
    });
  });
  (data?.schedules || []).forEach((s) => {
    items.push({
      id: `sch-${s.id}`,
      title: 'Schedule linked',
      body: [s.name, periodLabel(s.period), directionLabel(s.direction)].filter(Boolean).join(' · '),
      at: s.startDate || route?.createdAt,
      kind: 'clock',
    });
  });
  (data?.recentTrips || []).forEach((t) => {
    const meta = tripStatusMeta(t.status);
    items.push({
      id: `trip-${t.id}`,
      title: `${meta.label} trip`,
      body: [t.driverName, t.busLabel].filter(Boolean).join(' · ') || 'Trip recorded',
      at: t.serviceDate || t.scheduledFor || t.startedAt || t.endedAt,
      kind: 'trips',
    });
  });
  return items
    .filter((i) => i.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 20);
}

export default function RouteDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { schoolName: ctxSchool } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapEta, setMapEta] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', description: '', estimatedMinutes: '', active: true });
  const [note, setNote] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    setMapEta(null);
    try {
      const next = await api(`/admin/routes/${id}`);
      setData(next);
      setNote(next.route?.description || '');
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
    if (!menuOpen && !editOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setEditOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, editOpen]);

  const route = data?.route;
  const stops = data?.stops || [];
  const students = data?.students || [];
  const schedules = data?.schedules || [];
  const year = new Date().getFullYear();
  const active = route?.active !== false;
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const todaySchedule = useMemo(
    () => (schedules || []).find((s) => s.appliesToday && s.active !== false) || (schedules || []).find((s) => s.appliesToday) || null,
    [schedules]
  );

  useEffect(() => {
    const list = data?.stops || [];
    const ordered = orderedStopsForDirection(list, todaySchedule?.direction || 'to_school');
    const points = ordered.map((s) => s.location).filter((loc) => loc?.lat != null && loc?.lng != null);
    if (points.length < 2) {
      setMapEta(null);
      return undefined;
    }
    let cancelled = false;
    fetchDrivingRoute(points).then((result) => {
      if (!cancelled) setMapEta(result || null);
    });
    return () => {
      cancelled = true;
    };
  }, [data?.stops, todaySchedule?.direction]);

  const startStop = stops.find((s) => s.type === 'home') || stops[0] || null;
  const endStop = stops.find((s) => s.type === 'school') || stops[stops.length - 1] || null;
  const mapDistance = kmLabel(mapEta?.distanceM);
  const mapDuration = formatEtaMinutes(mapEta?.durationSec);
  const savedDuration = route?.estimatedMinutes > 0 ? `${route.estimatedMinutes} min` : '';
  const assignedStudents = students.filter((s) => s.active !== false);
  const distance = route?.distanceKm != null ? `${route.distanceKm} km` : mapDistance;
  const duration = savedDuration || mapDuration;
  const school = prettySchool(data?.schoolName || ctxSchool);
  const activity = useMemo(() => buildActivity(data), [data]);

  const openEdit = () => {
    setForm({
      name: route.name || '',
      code: route.code || '',
      description: route.description || '',
      estimatedMinutes: route.estimatedMinutes || '',
      active: route.active !== false,
    });
    setMenuOpen(false);
    setEditOpen(true);
  };

  const saveRoute = async (body) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api(`/admin/routes/${route._id}`, { method: 'PUT', body });
      setSuccess('Route updated.');
      setEditOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (next) => {
    try {
      await api(`/admin/routes/${route._id}`, { method: 'PUT', body: { active: next } });
      setMenuOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${route.name} and its stops?`)) return;
    try {
      await api(`/admin/routes/${route._id}`, { method: 'DELETE' });
      navigate('/school-admin/routes');
    } catch (e) {
      setError(e.message);
    }
  };

  const saveNote = async () => {
    await saveRoute({ description: note });
  };

  if (loading) {
    return (
      <div className="sa-vd sa-rd">
        <div className="sa-skeleton sa-skeleton-hero" />
      </div>
    );
  }

  if (error && !route) return <div className="alert">{error}</div>;
  if (!route) return <div className="sa-empty-panel"><h2>Route not found</h2></div>;

  const mapBlock = (className) => (
    <MapView
      center={startStop?.location || { lat: -1.3965, lng: 36.7542 }}
      stops={stops}
      direction={todaySchedule?.direction || 'to_school'}
      showRoute={stops.length >= 2}
      interactive={tab === 'map'}
      className={className}
    />
  );

  const bits = [
    { label: 'Total Stops', value: route.stopCount ?? stops.length, hint: '', icon: 'pin' },
    { label: 'Total Distance', value: distance || '—', hint: distance ? '' : 'Not tracked', icon: 'trips' },
    { label: 'Est. Duration', value: duration || '—', hint: duration ? '' : 'Not tracked', icon: 'clock' },
    { label: 'Students Assigned', value: route.studentCount ?? assignedStudents.length, hint: '', icon: 'users' },
    { label: 'Driver', value: dash(route.driver?.name), hint: route.driver?.phone || '', icon: 'user' },
    {
      label: 'Vehicle',
      value: dash(route.vehicle?.label || route.vehicle?.plate),
      hint: route.vehicle?.plate && route.vehicle?.label ? route.vehicle.plate : '',
      icon: 'bus',
    },
  ];

  const infoRows = [
    { label: 'Route Name', value: dash(route.name), icon: 'route' },
    { label: 'Route Code', value: routeCode(route), icon: 'code' },
    { label: 'Created By', value: 'Administrator', icon: 'user' },
    { label: 'Date Added', value: dash(fmtDate(route.createdAt)), icon: 'cal' },
    { label: 'Status', value: active ? 'Active' : 'Inactive', icon: 'status', status: true },
  ];

  return (
    <div className="sa-vd sa-rd">
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <div className="sa-vd-head">
        <div>
          <h2>Route Details</h2>
          <p className="sa-vd-crumbs">
            <Link to="/school-admin">Dashboard</Link>
            <span>›</span>
            <Link to="/school-admin/routes">Routes</Link>
            <span>›</span>
            <em>Route Details</em>
          </p>
        </div>
        <div className="sa-vd-head-actions">
          <button type="button" className="sa-btn sa-btn-outline sa-vd-edit" onClick={openEdit}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
            </svg>
            Edit Route
          </button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setMenuOpen(true)}>
            Actions ▾
          </button>
        </div>
      </div>

      <section className="sa-card sa-rd-hero">
        <div className="sa-rd-hero-id">
          <i className="sa-rd-hero-mark" aria-hidden="true">
            <InfoGlyph name="route" />
          </i>
          <div>
            <div className="sa-vd-hero-name">
              <h3>{route.name}</h3>
              <em className={`sa-stu-status is-${active ? 'active' : 'muted'}`}>{active ? 'Active' : 'Inactive'}</em>
            </div>
            <p>{route.path || route.description || '—'}</p>
            <p>{route.createdAt ? `Added ${fmtDate(route.createdAt)}` : ''}</p>
          </div>
        </div>
        <div className="sa-rd-hero-bits">
          {bits.map((b) => (
            <div key={b.label} className="sa-rd-bit">
              <i aria-hidden="true"><InfoGlyph name={b.icon} /></i>
              <div>
                <span>{b.label}</span>
                <strong>{b.value}</strong>
                {b.hint ? <small>{b.hint}</small> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <nav className="sa-vd-tabs" aria-label="Route sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            <TabGlyph name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
          <section className="sa-rd-overview">
            <article className="sa-card sa-rd-panel">
              <div className="sa-rd-card-head">
                <h3>Route Information</h3>
                <button type="button" className="sa-icon-ghost is-edit" aria-label="Edit" onClick={openEdit}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                  </svg>
                </button>
              </div>
              <ul className="sa-rd-info">
                {infoRows.map((row) => (
                  <li key={row.label}>
                    <i aria-hidden="true"><InfoGlyph name={row.icon} /></i>
                    <div>
                      <span>{row.label}</span>
                      {row.status ? (
                        <em className={`sa-stu-status is-${active ? 'active' : 'muted'}`}>{row.value}</em>
                      ) : (
                        <strong>{row.value}</strong>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="sa-card sa-rd-panel">
              <h3>Route Map</h3>
              {stops.length ? (
                <>
                  {mapBlock('map-canvas map-md sa-rd-map')}
                  <ul className="sa-rd-legend">
                    <li><i className="is-start" /> Start</li>
                    <li><i className="is-end" /> End</li>
                    <li><i className="is-line" /> Route</li>
                    <li><i className="is-stop" /> Stops</li>
                  </ul>
                </>
              ) : (
                <p className="sa-muted">Add stops to draw this route on the map.</p>
              )}
            </article>
          </section>

          <section className="sa-rd-bottom">
            <article className="sa-card sa-rd-panel">
              <h3>Today’s Schedule</h3>
              <p className="sa-rd-sub">{todayLabel}</p>
              {data.todayTrips?.length ? (
                <ul className="sa-rd-today-trips">
                  {data.todayTrips.map((t) => {
                    const meta = tripStatusMeta(t.status);
                    return (
                      <li key={t.id}>
                        <strong>{tripStartLabel(t) || periodLabel(t.period) || 'Trip'}</strong>
                        <span>{directionLabel(t.direction) || '—'}</span>
                        <em className={`sa-stu-status is-${meta.key}`}>{meta.label}</em>
                      </li>
                    );
                  })}
                </ul>
              ) : todaySchedule ? (
                <ol className="sa-rd-timeline">
                  <li>
                    <time>{fmtClock(todaySchedule.scheduledTime) || '—'}</time>
                    <div>
                      <strong>Depart {startStop?.name || 'start point'}</strong>
                      <small>
                        {[periodLabel(todaySchedule.period), directionLabel(todaySchedule.direction)]
                          .filter(Boolean)
                          .join(' · ') || 'Scheduled'}
                      </small>
                    </div>
                  </li>
                  {endStop && String(endStop._id) !== String(startStop?._id) ? (
                    <li>
                      <time>
                        {todaySchedule.scheduledTime && savedDuration
                          ? addMinutes(todaySchedule.scheduledTime, route.estimatedMinutes)
                          : todaySchedule.scheduledTime && mapEta?.durationSec
                            ? addMinutes(todaySchedule.scheduledTime, Math.round(mapEta.durationSec / 60))
                            : '—'}
                      </time>
                      <div>
                        <strong>Arrive {endStop.name}</strong>
                        <small>{savedDuration ? 'Saved estimate' : mapDuration ? 'Map estimate' : 'End point'}</small>
                      </div>
                    </li>
                  ) : null}
                </ol>
              ) : (
                <p className="sa-muted">No trip is scheduled for today.</p>
              )}
              <button type="button" className="sa-text-link" onClick={() => setTab('schedule')}>
                View Full Schedule
              </button>
            </article>

            <article className="sa-card sa-rd-panel">
              <h3>Stops on This Route</h3>
              {stops.length ? (
                <table className="sa-table sa-vd-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Stop Name</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stops.map((s, i) => (
                      <tr key={s._id}>
                        <td>{stopKind(s, String(startStop?._id || ''), String(endStop?._id || '')) || i + 1}</td>
                        <td>{s.name}</td>
                        <td>{dash(stopPlace(s))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="sa-muted">No stops saved on this route yet.</p>
              )}
              <button type="button" className="sa-text-link" onClick={() => setTab('stops')}>
                View All Stops
              </button>
            </article>

            <article className="sa-card sa-rd-panel">
              <h3>Route Statistics</h3>
              <ul className="sa-rd-stats">
                <li><span>Total Trips</span><strong>{data.monthStats?.trips ?? 0}</strong></li>
                <li><span>Completed</span><strong>{data.monthStats?.completed ?? 0}</strong></li>
                <li><span>Cancelled</span><strong>{data.monthStats?.cancelled ?? 0}</strong></li>
                <li><span>Students Assigned</span><strong>{data.monthStats?.studentsAssigned ?? 0}</strong></li>
              </ul>
              <button type="button" className="sa-text-link" onClick={() => setTab('trips')}>
                View trip history
              </button>
            </article>
          </section>
        </>
      )}

      {tab === 'stops' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Stops</h3>
              <p>{stops.length} stop{stops.length === 1 ? '' : 's'} on this route.</p>
            </div>
            <Link to={`/school-admin/routes?stops=${route._id}`} className="sa-btn sa-btn-outline">
              Manage stops
            </Link>
          </header>
          {stops.length ? (
            <table className="sa-table sa-vd-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Stop Name</th>
                  <th>Type</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {stops.map((s) => (
                  <tr key={s._id}>
                    <td>{s.order}</td>
                    <td>{s.name}</td>
                    <td>{s.type === 'school' ? 'School' : 'Home'}</td>
                    <td>{dash(stopPlace(s))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No stops saved on this route yet.</p>
          )}
        </section>
      )}

      {tab === 'schedule' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Schedule</h3>
              <p>{operatingDays(schedules) || 'No operating days set'}.</p>
            </div>
            <Link to="/school-admin/trip-instances?tab=schedules" className="sa-btn sa-btn-outline">
              Open scheduling
            </Link>
          </header>
          {schedules.length ? (
            <table className="sa-table sa-vd-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>When</th>
                  <th>Direction</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      <small className="sa-stu-phone">{s.scheduledTime ? fmtClock(s.scheduledTime) : '—'}</small>
                    </td>
                    <td>{[scheduleTypeLabel(s.scheduleType), periodLabel(s.period)].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{dash(directionLabel(s.direction))}</td>
                    <td>{dash(s.driverName)}</td>
                    <td>{dash(s.busLabel)}</td>
                    <td>
                      <em className={`sa-stu-status is-${s.active ? 'active' : 'muted'}`}>
                        {s.active ? (s.appliesToday ? 'Runs today' : 'Active') : 'Inactive'}
                      </em>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No trip schedules are linked to this route yet.</p>
          )}
        </section>
      )}

      {tab === 'students' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Students</h3>
              <p>{assignedStudents.length} student{assignedStudents.length === 1 ? '' : 's'} assigned.</p>
            </div>
            <Link to="/school-admin/students" className="sa-btn sa-btn-outline">All students</Link>
          </header>
          {students.length ? (
            <table className="sa-table sa-vd-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Admission no.</th>
                  <th>Home stop</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/school-admin/students/${s.id}`} className="sa-stu-person">
                        {s.photoUrl ? <img src={s.photoUrl} alt="" /> : <span>{initials(s.name)}</span>}
                        <strong>{s.name}</strong>
                      </Link>
                    </td>
                    <td>{dash([s.grade, s.section].filter(Boolean).join(' '))}</td>
                    <td>{dash(s.admissionNo)}</td>
                    <td>{dash(s.homeStopName)}</td>
                    <td>
                      <em className={`sa-stu-status is-${s.active ? 'active' : 'muted'}`}>
                        {s.active ? 'Active' : 'Inactive'}
                      </em>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No students are assigned to this route yet.</p>
          )}
        </section>
      )}

      {tab === 'trips' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Trips</h3>
              <p>Recent trips recorded for this route.</p>
            </div>
            <Link to="/school-admin/trip-instances" className="sa-btn sa-btn-outline">All trips</Link>
          </header>
          {data.recentTrips?.length ? (
            <table className="sa-table sa-vd-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Direction</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTrips.map((t) => {
                  const meta = tripStatusMeta(t.status);
                  return (
                    <tr key={t.id}>
                      <td>{fmtDate(t.serviceDate || t.scheduledFor || t.startedAt) || '—'}</td>
                      <td>{dash(directionLabel(t.direction))}</td>
                      <td>{dash(t.driverName)}</td>
                      <td>{dash(t.busLabel)}</td>
                      <td><em className={`sa-stu-status is-${meta.key}`}>{meta.label}</em></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No trips recorded for this route yet.</p>
          )}
        </section>
      )}

      {tab === 'map' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Map</h3>
              <p>{[distance, duration].filter(Boolean).join(' · ') || 'Add stops to draw this route.'}</p>
            </div>
          </header>
          {stops.length ? (
            <>
              {mapBlock('map-canvas sa-rd-map-lg')}
              <ul className="sa-rd-legend">
                <li><i className="is-start" /> Start</li>
                <li><i className="is-end" /> End</li>
                <li><i className="is-line" /> Route</li>
                <li><i className="is-stop" /> Stops</li>
              </ul>
            </>
          ) : (
            <p className="sa-muted">Add stops to draw this route on the map.</p>
          )}
        </section>
      )}

      {tab === 'notes' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Notes</h3>
              <p>Internal remarks stored on this route.</p>
            </div>
          </header>
          <textarea
            className="sa-rd-note"
            rows={5}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a description or operational note…"
          />
          <div className="sa-action-foot" style={{ borderTop: 0, paddingLeft: 0 }}>
            <button type="button" className="sa-btn sa-btn-primary" disabled={saving} onClick={saveNote}>
              Save note
            </button>
          </div>
        </section>
      )}

      {tab === 'activity' && (
        <section className="sa-card sa-vd-panel">
          <header>
            <div>
              <h3>Activity Log</h3>
              <p>Recent changes, assignments, and trips for this route.</p>
            </div>
          </header>
          {activity.length ? (
            <ul className="sa-vd-log">
              {activity.map((item) => (
                <li key={item.id}>
                  <i className={`tint-${item.kind === 'user' ? 'orange' : item.kind === 'trips' ? 'sky' : 'purple'}`}>
                    <TabGlyph name={item.kind === 'pin' ? 'pin' : item.kind === 'clock' ? 'clock' : item.kind === 'user' ? 'user' : item.kind === 'trips' ? 'trips' : 'log'} />
                  </i>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                  </div>
                  <time>{fmtDateTime(item.at)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No activity recorded for this route yet.</p>
          )}
        </section>
      )}

      <div className="sa-rd-nav">
        <span>
          {data.neighbors?.total ? `${(data.neighbors.index || 0) + 1} of ${data.neighbors.total}` : ''}
        </span>
        <div>
          <button
            type="button"
            className="sa-btn sa-btn-outline"
            disabled={!data.neighbors?.prevId}
            onClick={() => data.neighbors?.prevId && navigate(`/school-admin/routes/${data.neighbors.prevId}`)}
          >
            Previous Route
          </button>
          <button
            type="button"
            className="sa-btn sa-btn-outline"
            disabled={!data.neighbors?.nextId}
            onClick={() => data.neighbors?.nextId && navigate(`/school-admin/routes/${data.neighbors.nextId}`)}
          >
            Next Route
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="sa-action-overlay" onClick={() => setMenuOpen(false)} role="presentation">
          <div className="sa-action-modal" role="dialog" aria-modal="true" aria-labelledby="sa-rd-action-title" onClick={(e) => e.stopPropagation()}>
            <header className="sa-action-head">
              <div>
                <p className="sa-action-kicker">Route actions</p>
                <h3 id="sa-rd-action-title">{route.name}</h3>
                <small>{route.path || routeCode(route)} · {active ? 'Active' : 'Inactive'}</small>
              </div>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setMenuOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="sa-action-list">
              <button type="button" onClick={() => { setMenuOpen(false); openEdit(); }}>
                <i aria-hidden="true"><TabGlyph name="note" /></i>
                <span><strong>Edit route</strong><em>Update name, duration, or description</em></span>
              </button>
              <button type="button" onClick={() => navigate(`/school-admin/routes?stops=${route._id}`)}>
                <i aria-hidden="true"><TabGlyph name="pin" /></i>
                <span><strong>Manage stops</strong><em>Add or remove pickup points</em></span>
              </button>
              <button type="button" onClick={() => setActive(!active)}>
                <i aria-hidden="true"><TabGlyph name="check" /></i>
                <span>
                  <strong>{active ? 'Deactivate route' : 'Activate route'}</strong>
                  <em>{active ? 'Hide this route from active trips' : 'Make this route available again'}</em>
                </span>
              </button>
              <button type="button" onClick={() => navigate('/school-admin/trip-instances?tab=schedules')}>
                <i aria-hidden="true"><TabGlyph name="clock" /></i>
                <span><strong>Trip scheduling</strong><em>Open the scheduling calendar</em></span>
              </button>
              <button type="button" className="is-danger" onClick={() => { setMenuOpen(false); remove(); }}>
                <i aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
                  </svg>
                </i>
                <span><strong>Delete route</strong><em>Remove this route and its stops</em></span>
              </button>
            </div>
            <div className="sa-action-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMenuOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="sa-action-overlay" onClick={() => setEditOpen(false)} role="presentation">
          <div className="sa-action-modal sa-rd-edit-modal" role="dialog" aria-modal="true" aria-labelledby="sa-rd-edit-title" onClick={(e) => e.stopPropagation()}>
            <header className="sa-action-head">
              <div>
                <p className="sa-action-kicker">Edit route</p>
                <h3 id="sa-rd-edit-title">{route.name}</h3>
                <small>Changes apply immediately after save.</small>
              </div>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setEditOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="sa-rd-edit-form">
              <label className="sa-field">
                <span>Name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <div className="sa-stu-form-row">
                <label className="sa-field">
                  <span>Route code</span>
                  <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
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
              <label className="check">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Active
              </label>
            </div>
            <div className="sa-action-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setEditOpen(false)}>Cancel</button>
              <button
                type="button"
                className="sa-btn sa-btn-primary"
                disabled={saving || !form.name.trim()}
                onClick={() => saveRoute({
                  name: form.name,
                  code: form.code,
                  description: form.description,
                  estimatedMinutes: form.estimatedMinutes === '' ? null : Number(form.estimatedMinutes),
                  active: form.active,
                })}
              >
                Save route
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="sa-home-foot">
        <span>© {year} {school}. All rights reserved.</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
