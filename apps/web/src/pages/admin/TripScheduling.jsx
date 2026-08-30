import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDateInput(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const empty = {
  name: '',
  scheduleType: 'WEEKDAYS',
  customDays: [],
  period: 'morning',
  direction: 'to_school',
  routeId: '',
  busId: '',
  driverId: '',
  scheduledTime: '06:30',
  startDate: todayInput(),
  endDate: '',
  kidIds: [],
};

const WEEKDAY_LABELS = [
  { v: 0, l: 'Sun' },
  { v: 1, l: 'Mon' },
  { v: 2, l: 'Tue' },
  { v: 3, l: 'Wed' },
  { v: 4, l: 'Thu' },
  { v: 5, l: 'Fri' },
  { v: 6, l: 'Sat' },
];

function typeLabel(value) {
  if (value === 'WEEKDAYS') return 'Weekdays';
  if (value === 'EVERY_DAY') return 'Every day';
  if (value === 'ONE_TIME') return 'One time';
  if (value === 'CUSTOM_DAYS') return 'Custom days';
  return value || '-';
}

function periodLabel(value) {
  if (!value) return '-';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SchedGlyph({ name }) {
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
  if (name === 'calendar') return <svg {...common}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M8 3.5v3M16 3.5v3M3.5 10h17" /></svg>;
  if (name === 'check') return <svg {...common}><circle cx="12" cy="12" r="8.2" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></svg>;
  if (name === 'sun') return <svg {...common}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M8 3.5v3M16 3.5v3M8 14h3M8 17h8" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8.2" /><path d="M12 8v4.2l2.4 1.6" /></svg>;
}

function Spark({ color }) {
  return (
    <svg className="sa-sched-spark" viewBox="0 0 120 18" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 12 C12 12 14 6 24 6 S36 14 48 11 S64 4 76 7 S96 16 120 8" fill="none" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

export default function TripScheduling({ embedded = false, onBindCreate }) {
  const { schoolName = '', globalSearch = '' } = useOutletContext() || {};
  const [schedules, setSchedules] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [kids, setKids] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('ENTIRE_SERIES');
  const [scopeDate, setScopeDate] = useState(todayInput());
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [holidayForm, setHolidayForm] = useState({ date: todayInput(), name: '' });
  const [exForm, setExForm] = useState({
    serviceDate: todayInput(),
    type: '',
    busId: '',
    driverId: '',
    scheduledTime: '06:30',
  });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAllHolidays, setShowAllHolidays] = useState(false);
  const year = new Date().getFullYear();

  const load = async () => {
    const [s, r, b, d, k, h] = await Promise.all([
      api('/admin/trip-schedules'),
      api('/admin/routes'),
      api('/admin/buses'),
      api('/admin/drivers'),
      api('/admin/kids'),
      api('/admin/holidays'),
    ]);
    setSchedules(s.schedules);
    setRoutes(r.routes);
    setBuses((b.buses || []).filter((x) => x.active !== false));
    setDrivers((d.drivers || []).filter((x) => x.active !== false));
    setKids((k.kids || []).filter((x) => x.active !== false));
    setHolidays(h.holidays || []);
    setForm((f) => ({
      ...f,
      routeId: f.routeId || r.routes[0]?._id || '',
      busId: f.busId || b.buses[0]?._id || '',
      driverId: f.driverId || d.drivers[0]?.id || d.drivers[0]?._id || '',
    }));
    if (!selectedScheduleId && s.schedules[0]) {
      setSelectedScheduleId(s.schedules[0]._id);
    }
  };

  const loadExceptions = async (scheduleId) => {
    if (!scheduleId) {
      setExceptions([]);
      return;
    }
    const data = await api(`/admin/trip-schedules/${scheduleId}/exceptions`);
    setExceptions(data.exceptions || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    loadExceptions(selectedScheduleId).catch(() => setExceptions([]));
  }, [selectedScheduleId]);

  useEffect(() => {
    if (!formOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') cancelEdit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formOpen]);

  const routeKids = kids.filter((k) => (k.routeId?._id || k.routeId) === form.routeId);

  const toggleKid = (id) => {
    setForm((f) => {
      const set = new Set(f.kidIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...f, kidIds: [...set] };
    });
  };

  const toggleDay = (day) => {
    setForm((f) => {
      const set = new Set(f.customDays);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return { ...f, customDays: [...set].sort() };
    });
  };

  const startCreate = () => {
    setEditingId(null);
    setScope('ENTIRE_SERIES');
    setForm({
      ...empty,
      routeId: routes[0]?._id || '',
      busId: buses[0]?._id || '',
      driverId: drivers[0]?.id || drivers[0]?._id || '',
    });
    setInfo('');
    setFormOpen(true);
  };

  const bindCreateRef = useRef(onBindCreate);
  bindCreateRef.current = onBindCreate;
  useEffect(() => {
    bindCreateRef.current?.(startCreate);
    return () => bindCreateRef.current?.(null);
  }, [routes, buses, drivers]);

  const startEdit = (s) => {
    setEditingId(s._id);
    setSelectedScheduleId(s._id);
    setScope('ENTIRE_SERIES');
    setScopeDate(todayInput());
    setForm({
      name: s.name || '',
      scheduleType: s.scheduleType || 'WEEKDAYS',
      customDays: s.customDays || [],
      period: s.period || 'morning',
      direction: s.direction || 'to_school',
      routeId: s.routeId?._id || s.routeId || '',
      busId: s.busId?._id || s.busId || '',
      driverId: s.driverId?._id || s.driverId?.id || s.driverId || '',
      scheduledTime: s.scheduledTime || '06:30',
      startDate: toDateInput(s.startDate) || todayInput(),
      endDate: toDateInput(s.endDate),
      kidIds: (s.kidIds || []).map((k) => k._id || k),
    });
    setInfo('');
    setFormOpen(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormOpen(false);
    setForm({
      ...empty,
      routeId: routes[0]?._id || '',
      busId: buses[0]?._id || '',
      driverId: drivers[0]?.id || drivers[0]?._id || '',
    });
    setInfo('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const baseBody = {
        ...form,
        endDate: form.endDate || null,
        kidIds: form.kidIds.length ? form.kidIds : routeKids.map((k) => k._id),
      };

      if (editingId) {
        const body = {
          ...baseBody,
          scope,
          regenerate: true,
        };
        if (scope === 'THIS_OCCURRENCE') body.serviceDate = scopeDate;
        if (scope === 'THIS_AND_FUTURE') body.fromDate = scopeDate;
        const res = await api(`/admin/trip-schedules/${editingId}`, { method: 'PUT', body });
        let msg = `Updated (${scope}). ${res.updatedCount || 0} instance(s) changed.`;
        if (res.generation) msg += ` Generated ${res.generation.created}.`;
        setInfo(msg);
        if (res.conflicts?.length) {
          setError(
            res.conflicts
              .map(
                (c) =>
                  `Conflict ${new Date(c.serviceDate).toLocaleDateString()}: ${c.conflictTripCode || 'trip'}`
              )
              .join(' · ')
          );
        }
        cancelEdit();
      } else {
        const res = await api('/admin/trip-schedules', {
          method: 'POST',
          body: { ...baseBody, generate: true },
        });
        const g = res.generation;
        let msg = 'Schedule created.';
        if (g) {
          msg += ` Generated ${g.created} instance(s)`;
          if (g.skipped) msg += `, skipped ${g.skipped}`;
        }
        setInfo(msg);
        if (g?.conflicts?.length) {
          setError(
            g.conflicts
              .map(
                (c) =>
                  `Conflict on ${new Date(c.serviceDate).toLocaleDateString()}: ${c.conflictTripCode || 'existing trip'}`
              )
              .join(' · ')
          );
        }
        setForm({ ...empty, routeId: form.routeId, busId: form.busId, driverId: form.driverId });
        setFormOpen(false);
      }
      await load();
      if (selectedScheduleId) await loadExceptions(selectedScheduleId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const generate = async (id) => {
    setError('');
    setInfo('');
    try {
      const res = await api(`/admin/trip-schedules/${id}/generate`, { method: 'POST', body: {} });
      setInfo(`Generated ${res.created} new instance(s); skipped ${res.skipped}.`);
      if (res.conflicts?.length) {
        setError(
          res.conflicts
            .map(
              (c) =>
                `Conflict on ${new Date(c.serviceDate).toLocaleDateString()}: ${c.conflictTripCode || 'existing'}`
            )
            .join(' · ')
        );
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deactivate = async (id) => {
    if (!confirm('Deactivate this schedule and cancel future instances?')) return;
    await api(`/admin/trip-schedules/${id}`, { method: 'DELETE' });
    await load();
  };

  const addHoliday = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/holidays', { method: 'POST', body: holidayForm });
      setHolidayForm({ date: todayInput(), name: '' });
      setInfo('Holiday saved. Scheduled trips on that day were cancelled.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeHoliday = async (id) => {
    await api(`/admin/holidays/${id}`, { method: 'DELETE' });
    await load();
  };

  const addException = async (e) => {
    e.preventDefault();
    if (!selectedScheduleId || !exForm.type) return;
    setError('');
    try {
      const body = {
        serviceDate: exForm.serviceDate,
        type: exForm.type,
      };
      if (exForm.type === 'OVERRIDE') {
        body.busId = exForm.busId || undefined;
        body.driverId = exForm.driverId || undefined;
        body.scheduledTime = exForm.scheduledTime;
      }
      await api(`/admin/trip-schedules/${selectedScheduleId}/exceptions`, {
        method: 'POST',
        body,
      });
      setInfo(`Exception (${exForm.type}) saved.`);
      await loadExceptions(selectedScheduleId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeException = async (exceptionId) => {
    await api(`/admin/trip-schedules/${selectedScheduleId}/exceptions/${exceptionId}`, {
      method: 'DELETE',
    });
    await loadExceptions(selectedScheduleId);
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? schedules.filter((s) =>
          [s.name, s.routeId?.name, s.busId?.label, s.busId?.plate, s.driverId?.name, s.period]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(needle)
        )
      : schedules;
    return [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  }, [schedules, q]);

  const activeCount = schedules.filter((s) => s.active !== false).length;
  const today = todayInput();
  const byDate = (a, b, key) => new Date(a[key] || 0) - new Date(b[key] || 0);
  const upcomingHolidays = holidays.filter((h) => toDateInput(h.date) >= today).sort((a, b) => byDate(a, b, 'date'));
  const holidayRows = (showAllHolidays ? [...holidays].sort((a, b) => byDate(a, b, 'date')) : upcomingHolidays);
  const exceptionRows = [...exceptions].sort((a, b) => byDate(a, b, 'serviceDate'));
  const schedKpis = [
    { key: 'schedules', label: 'Schedules', value: schedules.length, hint: 'Recurring templates', tint: 'purple', icon: 'calendar', spark: '#6366f1', bar: 72 },
    { key: 'active', label: 'Active', value: activeCount, hint: 'Will generate trips', tint: 'green', icon: 'check', spark: '#22c55e', bar: activeCount ? 80 : 18 },
    { key: 'holidays', label: 'Holidays', value: holidays.length, hint: 'No trips generated', tint: 'orange', icon: 'sun', spark: '#f97316', bar: holidays.length ? 64 : 16 },
    { key: 'exceptions', label: 'Exceptions', value: exceptions.length, hint: 'Selected schedule', tint: 'rose', icon: 'clock', spark: '#e11d48', bar: exceptions.length ? 58 : 14 },
  ];

  return (
    <div className={embedded ? 'sa-trips-sched' : 'sa-buses sa-trips sa-trips-sched'}>
      {error && <div className="alert">{error}</div>}
      {info && <div className="alert alert-ok">{info}</div>}
      {!embedded && (
        <div className="sa-bus-head">
          <div>
            <h2>Trip Scheduling</h2>
            <p className="sa-vd-crumbs">Recurring templates that generate daily trips.</p>
          </div>
          <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>+ Add schedule</button>
        </div>
      )}
      <section className="sa-bus-kpis sa-trips-sched-kpis" aria-label="Schedule metrics">
        {schedKpis.map((m) => (
          <article key={m.key} className={`sa-bus-kpi tint-${m.tint}`}>
            <i className="sa-bus-kpi-icon" aria-hidden="true"><SchedGlyph name={m.icon} /></i>
            <div className="sa-bus-kpi-copy">
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em>{m.hint}</em>
            </div>
            <Spark color={m.spark} />
          </article>
        ))}
      </section>

      <article className="sa-card sa-bus-table-card sa-sched-table-card">
        <div className="sa-sched-table-head">
          <h3>Schedules</h3>
          <label className="sa-stu-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search schedules, routes, drivers..." />
          </label>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table sa-trips-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Period</th>
                <th>Route / Bus / Driver</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s._id}>
                  <td>
                    <div className="sa-rt-name">
                      <strong>{s.name}</strong>
                      <small>{s.scheduledTime || '—'}</small>
                    </div>
                  </td>
                  <td>{typeLabel(s.scheduleType)}</td>
                  <td>
                    <div className="sa-rt-name">
                      <strong>{periodLabel(s.period)}</strong>
                      <small>{s.direction === 'to_school' ? 'To school' : 'To home'}</small>
                    </div>
                  </td>
                  <td>
                    <div className="sa-rt-name">
                      <strong>{s.routeId?.name || '—'}</strong>
                      <small>{[s.busId?.label || s.busId?.plate, s.driverId?.name].filter(Boolean).join(' · ') || '—'}</small>
                    </div>
                  </td>
                  <td>
                    <span className={`sa-stu-status ${s.active === false ? 'is-cancelled' : 'is-completed'}`}>
                      {s.active === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="sa-trips-sched-actions">
                    <button type="button" className="sa-text-link" onClick={() => startEdit(s)}>Edit</button>
                    <button type="button" className="sa-text-link" onClick={() => generate(s._id)}>Generate</button>
                    <button type="button" className="sa-text-link" onClick={() => deactivate(s._id)}>Deactivate</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="sa-sched-empty">
                      <i aria-hidden="true">
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                          <rect x="9" y="10" width="30" height="28" rx="4" fill="#eef2ff" stroke="#6366f1" strokeWidth="1.6" />
                          <path d="M16 8.5h16v6a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2v-6Z" fill="#c7d2fe" stroke="#6366f1" strokeWidth="1.4" />
                          <path d="M17 24h6M17 29h14M27 24h4" stroke="#818cf8" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      </i>
                      <strong>No schedules found</strong>
                      <p>Create your first schedule to automate trip generation.</p>
                      <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>+ Add schedule</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <div className="sa-sched-grid">
        <article className="sa-card sa-sched-panel">
          <h3>School holidays</h3>
          <p className="sa-muted">No trips are generated on these dates for any schedule.</p>
          <form className="sa-sched-inline" onSubmit={addHoliday}>
            <input type="date" required value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} />
            <input required placeholder="Holiday name" value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} />
            <button type="submit" className="sa-btn sa-btn-primary">Add holiday</button>
          </form>
          <div className="sa-sched-list-head">
            <span>Upcoming holidays</span>
            <button type="button" className="sa-text-link" onClick={() => setShowAllHolidays((v) => !v)}>
              {showAllHolidays ? 'Upcoming' : 'View all'}
            </button>
          </div>
          {holidayRows.length ? (
            <ul className="sa-sched-list">
              {holidayRows.map((h) => (
                <li key={h._id}>
                  <div>
                    <strong>{h.name}</strong>
                    <small>{new Date(h.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small>
                  </div>
                  <button type="button" className="sa-text-link" onClick={() => removeHoliday(h._id)}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="sa-sched-mini-empty">
              <i aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.7">
                  <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
                  <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
                </svg>
              </i>
              <div>
                <strong>No holidays added yet.</strong>
                <p>Add school holidays to prevent trips on those dates.</p>
              </div>
            </div>
          )}
        </article>

        <article className="sa-card sa-sched-panel">
          <h3>Schedule exceptions</h3>
          <p className="sa-muted">Exclude specific dates or modify schedules when needed.</p>
          <form className="sa-sched-ex-form" onSubmit={addException}>
            <label>
              <span>Schedule</span>
              <select value={selectedScheduleId} onChange={(e) => setSelectedScheduleId(e.target.value)}>
                {!schedules.length && <option value="">No schedules</option>}
                {schedules.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Date</span>
              <input type="date" required value={exForm.serviceDate} onChange={(e) => setExForm({ ...exForm, serviceDate: e.target.value })} />
            </label>
            <label>
              <span>Type</span>
              <select value={exForm.type} onChange={(e) => setExForm({ ...exForm, type: e.target.value })} required>
                <option value="">Select type</option>
                <option value="SKIP">Skip day</option>
                <option value="OVERRIDE">Override bus/driver/time</option>
              </select>
            </label>
            <button type="submit" className="sa-btn sa-btn-primary" disabled={!selectedScheduleId || !exForm.type}>Add exception</button>
            {exForm.type === 'OVERRIDE' && (
              <>
                <label>
                  <span>Bus</span>
                  <select value={exForm.busId} onChange={(e) => setExForm({ ...exForm, busId: e.target.value })}>
                    <option value="">Keep schedule bus</option>
                    {buses.map((b) => (
                      <option key={b._id} value={b._id}>{b.label || b.plate}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Driver</span>
                  <select value={exForm.driverId} onChange={(e) => setExForm({ ...exForm, driverId: e.target.value })}>
                    <option value="">Keep schedule driver</option>
                    {drivers.map((d) => (
                      <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Time</span>
                  <input type="time" value={exForm.scheduledTime} onChange={(e) => setExForm({ ...exForm, scheduledTime: e.target.value })} />
                </label>
              </>
            )}
          </form>
          {exceptionRows.length ? (
            <ul className="sa-sched-list">
              {exceptionRows.map((ex) => (
                <li key={ex._id}>
                  <div>
                    <strong>{ex.type === 'SKIP' ? 'Skip' : 'Override'}</strong>
                    <small>
                      {new Date(ex.serviceDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      {ex.type === 'OVERRIDE' ? ` · ${ex.busId?.label || ex.busId?.plate || 'bus'} · ${ex.driverId?.name || 'driver'}` : ''}
                    </small>
                  </div>
                  <button type="button" className="sa-text-link" onClick={() => removeException(ex._id)}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="sa-sched-mini-empty">
              <i aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.7">
                  <circle cx="12" cy="12" r="8.2" />
                  <path d="M12 8v4.2l2.4 1.6" />
                </svg>
              </i>
              <div>
                <strong>No exceptions added yet.</strong>
                <p>Add exceptions to skip or modify trips on specific dates.</p>
              </div>
            </div>
          )}
        </article>
      </div>

      {formOpen && (
        <div className="sa-action-overlay" onClick={cancelEdit} role="presentation">
          <form className="sa-action-modal sa-stop-form" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <header className="sa-stop-detail-bar">
              <h2>{editingId ? 'Edit schedule' : 'New schedule'}</h2>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={cancelEdit}>×</button>
            </header>
            <div className="sa-stop-form-body">
            {editingId && (
              <>
                <label className="sa-field">
                  <span>Edit scope</span>
                  <select value={scope} onChange={(e) => setScope(e.target.value)}>
                    <option value="THIS_OCCURRENCE">This occurrence only</option>
                    <option value="THIS_AND_FUTURE">This and future</option>
                    <option value="ENTIRE_SERIES">Entire series</option>
                  </select>
                </label>
                {(scope === 'THIS_OCCURRENCE' || scope === 'THIS_AND_FUTURE') && (
                  <label className="sa-field">
                    <span>{scope === 'THIS_OCCURRENCE' ? 'Occurrence date' : 'From date'}</span>
                    <input type="date" required value={scopeDate} onChange={(e) => setScopeDate(e.target.value)} />
                  </label>
                )}
              </>
            )}
            <label className="sa-field">
              <span>Name <b className="sa-req">*</b></span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Morning Route A" />
            </label>
            <label className="sa-field">
              <span>Schedule type</span>
              <select value={form.scheduleType} onChange={(e) => setForm({ ...form, scheduleType: e.target.value })}>
                <option value="WEEKDAYS">Weekdays (Mon-Fri)</option>
                <option value="EVERY_DAY">Every day</option>
                <option value="ONE_TIME">One time</option>
                <option value="CUSTOM_DAYS">Custom days</option>
              </select>
            </label>
            {form.scheduleType === 'CUSTOM_DAYS' && (
              <div className="chip-row">
                {WEEKDAY_LABELS.map((d) => (
                  <label key={d.v} className="chip-check">
                    <input
                      type="checkbox"
                      checked={form.customDays.includes(d.v)}
                      onChange={() => toggleDay(d.v)}
                    />
                    {d.l}
                  </label>
                ))}
              </div>
            )}
            <div className="sa-stu-form-row">
              <label className="sa-field">
                <span>Period</span>
                <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </label>
              <label className="sa-field">
                <span>Direction</span>
                <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                  <option value="to_school">To school</option>
                  <option value="to_home">To home</option>
                </select>
              </label>
            </div>
            <label className="sa-field">
              <span>Time</span>
              <input type="time" value={form.scheduledTime} onChange={(e) => setForm({ ...form, scheduledTime: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Route <b className="sa-req">*</b></span>
              <select required value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value, kidIds: [] })}>
                {routes.map((r) => (
                  <option key={r._id} value={r._id}>{r.name}</option>
                ))}
              </select>
            </label>
            <label className="sa-field">
              <span>Bus <b className="sa-req">*</b></span>
              <select required value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })}>
                {buses.map((b) => (
                  <option key={b._id} value={b._id}>{b.label || b.plate} ({b.seats} seats)</option>
                ))}
              </select>
            </label>
            <label className="sa-field">
              <span>Driver <b className="sa-req">*</b></span>
              <select required value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                {drivers.map((d) => (
                  <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>
                ))}
              </select>
            </label>
            <div className="sa-stu-form-row">
              <label className="sa-field">
                <span>Start date <b className="sa-req">*</b></span>
                <input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </label>
              <label className="sa-field">
                <span>End date</span>
                <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </label>
            </div>
            <fieldset className="sa-tour-kids">
              <legend>Students (optional — defaults to all on route)</legend>
              <div className="sa-sched-kids">
                {routeKids.map((k) => (
                  <label key={k._id} className="chip-check">
                    <input type="checkbox" checked={form.kidIds.includes(k._id)} onChange={() => toggleKid(k._id)} />
                    {k.name}
                  </label>
                ))}
                {!routeKids.length && <span className="sa-muted">No students on this route.</span>}
              </div>
            </fieldset>
            </div>
            <div className="sa-stop-form-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={cancelEdit}>Cancel</button>
              <button className="sa-btn sa-btn-primary" type="submit" disabled={busy}>
                {busy ? 'Saving...' : editingId ? 'Save with scope' : 'Create & generate'}
              </button>
            </div>
          </form>
        </div>
      )}
      {!embedded && (
        <footer className="sa-home-foot">
          <span>© {year} {schoolName || 'School'}. All rights reserved.</span>
          <span>Transport Management System v1.0.0</span>
        </footer>
      )}
    </div>
  );
}
