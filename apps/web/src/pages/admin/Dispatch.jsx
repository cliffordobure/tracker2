import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

function todayInput() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function Dispatch() {
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [trips, setTrips] = useState([]);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    date: todayInput(),
    routeId: '',
    busId: '',
    driverId: '',
    direction: 'to_home',
  });

  const loadLists = async () => {
    const [r, b, d] = await Promise.all([
      api('/admin/routes'),
      api('/admin/buses'),
      api('/admin/drivers'),
    ]);
    setRoutes(r.routes);
    setBuses(b.buses.filter((x) => x.active !== false));
    setDrivers(d.drivers.filter((x) => x.active !== false));
    setForm((f) => ({
      ...f,
      routeId: f.routeId || r.routes[0]?._id || '',
      busId: f.busId || b.buses[0]?._id || '',
      driverId: f.driverId || d.drivers[0]?.id || '',
    }));
  };

  const loadTrips = async (date) => {
    const data = await api(`/admin/dispatch?date=${date}`);
    setTrips(data.trips);
  };

  useEffect(() => {
    loadLists()
      .then(() => loadTrips(form.date))
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!form.routeId || !form.busId) {
      setPreview(null);
      return;
    }
    api('/admin/dispatch/preview', {
      method: 'POST',
      body: { routeId: form.routeId, busId: form.busId },
    })
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [form.routeId, form.busId]);

  const summaryText = useMemo(() => {
    if (!preview) return '';
    if (preview.kidCount === 0) return 'No active students on this route.';
    return `${preview.kidCount} students / ${preview.seats} seats → ${preview.tripCount} trip${
      preview.tripCount === 1 ? '' : 's'
    }`;
  }, [preview]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const data = await api('/admin/dispatch', {
        method: 'POST',
        body: {
          ...form,
          date: form.date,
        },
      });
      setSuccess(
        `Created ${data.summary.tripCount} trip(s) for ${data.summary.kidCount} students.`
      );
      await loadTrips(form.date);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="split">
      <div className="stack">
        <h2>Daily dispatch</h2>
        <p className="lede">
          Assign any bus and driver to any route for the day. Over-capacity routes split into
          sequenced trips.
        </p>
        {error && <div className="alert">{error}</div>}
        {success && <div className="alert alert-ok">{success}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Route</th>
                <th>Bus</th>
                <th>Driver</th>
                <th>Direction</th>
                <th>Students</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t._id}>
                  <td>{t.sequence}</td>
                  <td>{t.routeId?.name}</td>
                  <td>
                    {t.busId?.label || t.busId?.plate}
                    <div className="muted">{t.busId?.seats} seats</div>
                  </td>
                  <td>{t.driverId?.name}</td>
                  <td>{t.direction === 'to_school' ? 'To school' : 'To home'}</td>
                  <td>{(t.kidIds || []).length}</td>
                  <td>{t.status}</td>
                </tr>
              ))}
              {!trips.length && (
                <tr>
                  <td colSpan={7} className="muted">
                    No dispatched trips for this date yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form className="card-form" onSubmit={submit}>
        <h3>Create dispatch</h3>
        <label>
          Date
          <input
            type="date"
            required
            value={form.date}
            onChange={(e) => {
              const date = e.target.value;
              setForm({ ...form, date });
              loadTrips(date).catch((err) => setError(err.message));
            }}
          />
        </label>
        <label>
          Route
          <select
            required
            value={form.routeId}
            onChange={(e) => setForm({ ...form, routeId: e.target.value })}
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
                {(b.label || b.plate) + ` (${b.seats} seats)`}
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
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Direction
          <select
            value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value })}
          >
            <option value="to_home">To home</option>
            <option value="to_school">To school</option>
          </select>
        </label>
        {summaryText && <p className="hint dispatch-preview">{summaryText}</p>}
        <button className="btn btn-primary" type="submit" disabled={!preview?.tripCount}>
          Create trip{preview?.tripCount > 1 ? 's' : ''}
        </button>
      </form>
    </div>
  );
}
