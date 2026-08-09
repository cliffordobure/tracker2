import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

function todayInput() {
  const d = new Date();
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

export default function TripScheduling() {
  const [schedules, setSchedules] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [kids, setKids] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, r, b, d, k] = await Promise.all([
      api('/admin/trip-schedules'),
      api('/admin/routes'),
      api('/admin/buses'),
      api('/admin/drivers'),
      api('/admin/kids'),
    ]);
    setSchedules(s.schedules);
    setRoutes(r.routes);
    setBuses((b.buses || []).filter((x) => x.active !== false));
    setDrivers((d.drivers || []).filter((x) => x.active !== false));
    setKids((k.kids || []).filter((x) => x.active !== false));
    setForm((f) => ({
      ...f,
      routeId: f.routeId || r.routes[0]?._id || '',
      busId: f.busId || b.buses[0]?._id || '',
      driverId: f.driverId || d.drivers[0]?.id || d.drivers[0]?._id || '',
    }));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

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

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const body = {
        ...form,
        endDate: form.endDate || null,
        kidIds: form.kidIds.length ? form.kidIds : routeKids.map((k) => k._id),
        generate: true,
      };
      const res = await api('/admin/trip-schedules', { method: 'POST', body });
      const g = res.generation;
      let msg = `Schedule created.`;
      if (g) {
        msg += ` Generated ${g.created} instance(s)`;
        if (g.skipped) msg += `, skipped ${g.skipped}`;
        if (g.conflicts?.length) {
          msg += `. ${g.conflicts.length} conflict(s) (same bus/driver period).`;
          setError(
            g.conflicts
              .map(
                (c) =>
                  `Conflict on ${new Date(c.serviceDate).toLocaleDateString()}: ${c.conflictTripCode || 'existing trip'}`
              )
              .join(' · ')
          );
        }
      }
      setInfo(msg);
      setForm({ ...empty, routeId: form.routeId, busId: form.busId, driverId: form.driverId });
      await load();
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

  return (
    <div className="split">
      <div className="stack">
        <h2>Trip scheduling</h2>
        <p className="lede">
          Define recurring or one-time trip templates. Instances are generated for the next two weeks.
        </p>
        {error && <div className="alert">{error}</div>}
        {info && <div className="alert alert-success">{info}</div>}
        <div className="table-wrap">
          <table>
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
              {schedules.map((s) => (
                <tr key={s._id}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="muted">
                      {s.scheduledTime} · {s.active === false ? 'inactive' : 'active'}
                    </div>
                  </td>
                  <td>{s.scheduleType}</td>
                  <td>
                    {s.period}
                    <div className="muted">
                      {s.direction === 'to_school' ? 'to school' : 'to home'}
                    </div>
                  </td>
                  <td>
                    {s.routeId?.name}
                    <div className="muted">
                      {s.busId?.label || s.busId?.plate} · {s.driverId?.name}
                    </div>
                  </td>
                  <td className="row-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => generate(s._id)}>
                      Generate
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => deactivate(s._id)}>
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
              {!schedules.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    No schedules yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form className="card-form" onSubmit={submit}>
        <h3>New schedule</h3>
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
            <option value="WEEKDAYS">Weekdays (Mon–Fri)</option>
            <option value="EVERY_DAY">Every day</option>
            <option value="ONE_TIME">One time</option>
            <option value="CUSTOM_DAYS">Custom days</option>
          </select>
        </label>
        {form.scheduleType === 'CUSTOM_DAYS' && (
          <div className="row-actions" style={{ flexWrap: 'wrap' }}>
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
            <select
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value })}
            >
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </label>
          <label>
            Direction
            <select
              value={form.direction}
              onChange={(e) => setForm({ ...form, direction: e.target.value })}
            >
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
          <select
            required
            value={form.busId}
            onChange={(e) => setForm({ ...form, busId: e.target.value })}
          >
            {buses.map((b) => (
              <option key={b._id} value={b._id}>
                {b.label || b.plate} ({b.seats} seats)
              </option>
            ))}
          </select>
        </label>
        <label>
          Driver
          <select
            required
            value={form.driverId}
            onChange={(e) => setForm({ ...form, driverId: e.target.value })}
          >
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
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </label>
        </div>
        <fieldset>
          <legend>Students (optional — defaults to all on route)</legend>
          <div className="stack" style={{ maxHeight: 160, overflow: 'auto' }}>
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
            {!routeKids.length && <span className="muted">No students on this route.</span>}
          </div>
        </fieldset>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Create & generate instances'}
        </button>
      </form>
    </div>
  );
}
