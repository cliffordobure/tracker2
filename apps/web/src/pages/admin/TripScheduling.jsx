import { useEffect, useMemo, useState } from 'react';
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

export default function TripScheduling() {
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
    type: 'SKIP',
    busId: '',
    driverId: '',
    scheduledTime: '06:30',
  });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
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
    if (!selectedScheduleId) return;
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
    if (!needle) return schedules;
    return schedules.filter((s) =>
      [s.name, s.routeId?.name, s.busId?.label, s.busId?.plate, s.driverId?.name, s.period]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [schedules, q]);

  const activeCount = schedules.filter((s) => s.active !== false).length;

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      {info && <div className="alert alert-ok">{info}</div>}
      <div className="sa-users-head">
        <p className="sa-muted">
          Recurring trip templates, holidays, and one-day exceptions. Saving a template can generate trip instances.
        </p>
        <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>
          + Add schedule
        </button>
      </div>
      <section className="sa-stu-kpis sa-users-kpis">
        <article className="sa-stu-kpi tint-purple">
          <div>
            <span>Schedules</span>
            <strong>{schedules.length}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-green">
          <div>
            <span>Active</span>
            <strong>{activeCount}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-orange">
          <div>
            <span>Holidays</span>
            <strong>{holidays.length}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-sky">
          <div>
            <span>Exceptions</span>
            <strong>{exceptions.length}</strong>
            <em>For the selected schedule</em>
          </div>
        </article>
      </section>
      <article className="sa-card sa-stu-table-card">
        <div className="sa-stu-toolbar">
          <label className="sa-stu-search">
            <span aria-hidden="true">⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search schedules, routes, drivers..." />
          </label>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table sa-users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Period</th>
                <th>Route / Bus / Driver</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s._id}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="sa-muted">
                      {s.scheduledTime} · {s.active === false ? 'Inactive' : 'Active'}
                    </div>
                  </td>
                  <td>{typeLabel(s.scheduleType)}</td>
                  <td>
                    {periodLabel(s.period)}
                    <div className="sa-muted">{s.direction === 'to_school' ? 'To school' : 'To home'}</div>
                  </td>
                  <td>
                    {s.routeId?.name || '-'}
                    <div className="sa-muted">
                      {[s.busId?.label || s.busId?.plate, s.driverId?.name].filter(Boolean).join(' · ') || '-'}
                    </div>
                  </td>
                  <td>
                    <button type="button" className="sa-text-link" onClick={() => startEdit(s)}>
                      Edit
                    </button>{' '}
                    <button type="button" className="sa-text-link" onClick={() => generate(s._id)}>
                      Generate
                    </button>{' '}
                    <button type="button" className="sa-text-link" onClick={() => deactivate(s._id)}>
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="sa-home-empty">No schedules in this view.</p>}
      </article>

      <div className="sa-sched-grid">
        <article className="sa-card">
          <h3>School holidays</h3>
          <p className="sa-muted">No trips are generated on these dates for any schedule.</p>
          <form className="sa-stu-toolbar" onSubmit={addHoliday}>
            <input
              type="date"
              required
              value={holidayForm.date}
              onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
            />
            <input
              required
              placeholder="Holiday name"
              value={holidayForm.name}
              onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
            />
            <button type="submit" className="sa-btn sa-btn-outline">
              Add holiday
            </button>
          </form>
          {holidays.length ? (
            <ul className="sa-activity">
              {holidays.map((h) => (
                <li key={h._id}>
                  <strong>{h.name}</strong>
                  <small>{new Date(h.date).toLocaleDateString()}</small>
                  <button type="button" className="sa-text-link" onClick={() => removeHoliday(h._id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No holidays stored.</p>
          )}
        </article>

        <article className="sa-card">
          <h3>Schedule exceptions</h3>
          <label>
            Schedule
            <select value={selectedScheduleId} onChange={(e) => setSelectedScheduleId(e.target.value)}>
              {!schedules.length && <option value="">No schedules</option>}
              {schedules.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <form className="sa-note-form sa-ex-form" onSubmit={addException}>
            <div className="form-row">
              <label>
                Date
                <input
                  type="date"
                  required
                  value={exForm.serviceDate}
                  onChange={(e) => setExForm({ ...exForm, serviceDate: e.target.value })}
                />
              </label>
              <label>
                Type
                <select value={exForm.type} onChange={(e) => setExForm({ ...exForm, type: e.target.value })}>
                  <option value="SKIP">Skip day</option>
                  <option value="OVERRIDE">Override bus/driver/time</option>
                </select>
              </label>
            </div>
            {exForm.type === 'OVERRIDE' && (
              <>
                <label>
                  Bus
                  <select value={exForm.busId} onChange={(e) => setExForm({ ...exForm, busId: e.target.value })}>
                    <option value="">Keep schedule bus</option>
                    {buses.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.label || b.plate}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Driver
                  <select value={exForm.driverId} onChange={(e) => setExForm({ ...exForm, driverId: e.target.value })}>
                    <option value="">Keep schedule driver</option>
                    {drivers.map((d) => (
                      <option key={d.id || d._id} value={d.id || d._id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Time
                  <input
                    type="time"
                    value={exForm.scheduledTime}
                    onChange={(e) => setExForm({ ...exForm, scheduledTime: e.target.value })}
                  />
                </label>
              </>
            )}
            <button type="submit" className="sa-btn sa-btn-outline" disabled={!selectedScheduleId}>
              Save exception
            </button>
          </form>
          {exceptions.length ? (
            <ul className="sa-activity">
              {exceptions.map((ex) => (
                <li key={ex._id}>
                  <strong>{ex.type === 'SKIP' ? 'Skip' : 'Override'}</strong>
                  <span>
                    {new Date(ex.serviceDate).toLocaleDateString()}
                    {ex.type === 'OVERRIDE'
                      ? ` · ${ex.busId?.label || ex.busId?.plate || 'bus'} · ${ex.driverId?.name || 'driver'}`
                      : ''}
                  </span>
                  <button type="button" className="sa-text-link" onClick={() => removeException(ex._id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No exceptions for this schedule.</p>
          )}
        </article>
      </div>

      {formOpen && (
        <div className="sa-reports-modal sa-wide" role="dialog">
          <form className="sa-card" onSubmit={submit}>
            <h3>{editingId ? 'Edit schedule' : 'New schedule'}</h3>
            {editingId && (
              <>
                <label>
                  Edit scope
                  <select value={scope} onChange={(e) => setScope(e.target.value)}>
                    <option value="THIS_OCCURRENCE">This occurrence only</option>
                    <option value="THIS_AND_FUTURE">This and future</option>
                    <option value="ENTIRE_SERIES">Entire series</option>
                  </select>
                </label>
                {(scope === 'THIS_OCCURRENCE' || scope === 'THIS_AND_FUTURE') && (
                  <label>
                    {scope === 'THIS_OCCURRENCE' ? 'Occurrence date' : 'From date'}
                    <input
                      type="date"
                      required
                      value={scopeDate}
                      onChange={(e) => setScopeDate(e.target.value)}
                    />
                  </label>
                )}
              </>
            )}
            <label>
              Name
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Morning Route A"
              />
            </label>
            <label>
              Schedule type
              <select
                value={form.scheduleType}
                onChange={(e) => setForm({ ...form, scheduleType: e.target.value })}
              >
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
            <div className="form-row">
              <label>
                Period
                <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </label>
              <label>
                Direction
                <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                  <option value="to_school">To school</option>
                  <option value="to_home">To home</option>
                </select>
              </label>
            </div>
            <label>
              Time
              <input
                type="time"
                value={form.scheduledTime}
                onChange={(e) => setForm({ ...form, scheduledTime: e.target.value })}
              />
            </label>
            <label>
              Route
              <select
                required
                value={form.routeId}
                onChange={(e) => setForm({ ...form, routeId: e.target.value, kidIds: [] })}
              >
                {routes.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bus
              <select required value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })}>
                {buses.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.label || b.plate} ({b.seats} seats)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Driver
              <select required value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                {drivers.map((d) => (
                  <option key={d.id || d._id} value={d.id || d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                Start date
                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </label>
              <label>
                End date
                <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </label>
            </div>
            <fieldset>
              <legend>Students (optional - defaults to all on route)</legend>
              <div className="sa-sched-kids">
                {routeKids.map((k) => (
                  <label key={k._id} className="chip-check">
                    <input
                      type="checkbox"
                      checked={form.kidIds.includes(k._id)}
                      onChange={() => toggleKid(k._id)}
                    />
                    {k.name}
                  </label>
                ))}
                {!routeKids.length && <span className="sa-muted">No students on this route.</span>}
              </div>
            </fieldset>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={cancelEdit}>
                Cancel
              </button>
              <button className="sa-btn sa-btn-primary" type="submit" disabled={busy}>
                {busy ? 'Saving...' : editingId ? 'Save with scope' : 'Create & generate'}
              </button>
            </div>
          </form>
        </div>
      )}
      <footer className="sa-home-foot">
        <span>
          © {year} {schoolName || 'School'}. All rights reserved.
        </span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
