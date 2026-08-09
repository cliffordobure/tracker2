import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TripInstances() {
  const [trips, setTrips] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [date, setDate] = useState(todayInput());
  const [status, setStatus] = useState('');
  const [routeId, setRouteId] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ busId: '', driverId: '', scheduledTime: '06:30' });

  const load = async () => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (status) params.set('status', status);
    if (routeId) params.set('routeId', routeId);
    const data = await api(`/admin/trip-instances?${params}`);
    setTrips(data.trips);
  };

  useEffect(() => {
    Promise.all([api('/admin/routes'), api('/admin/buses'), api('/admin/drivers')])
      .then(([r, b, d]) => {
        setRoutes(r.routes);
        setBuses((b.buses || []).filter((x) => x.active !== false));
        setDrivers((d.drivers || []).filter((x) => x.active !== false));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, status, routeId]);

  const cancel = async (id) => {
    if (!confirm('Cancel this trip instance? It will be skipped on regenerate.')) return;
    setError('');
    try {
      await api(`/admin/trip-instances/${id}/cancel`, { method: 'POST', body: {} });
      setInfo('Trip cancelled (SKIP exception saved).');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const openEdit = (t) => {
    setEditing(t);
    setEditForm({
      busId: t.busId?._id || t.busId || '',
      driverId: t.driverId?._id || t.driverId || '',
      scheduledTime: t.scheduleId?.scheduledTime || '06:30',
    });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setError('');
    try {
      await api(`/admin/trip-instances/${editing._id}`, {
        method: 'PUT',
        body: editForm,
      });
      setInfo('Instance updated (OVERRIDE exception).');
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack">
      <h2>Trip instances</h2>
      <p className="lede">
        Filter by day. Edit scheduled trips (override) or cancel (skip on regenerate).
      </p>
      {error && <div className="alert">{error}</div>}
      {info && <div className="alert alert-success">{info}</div>}

      <div className="row-actions" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="scheduled">Scheduled</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          Route
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">All routes</option>
            {routes.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {editing && (
        <form className="card-form" onSubmit={saveEdit}>
          <h3>Edit {editing.tripCode}</h3>
          <p className="muted">Creates an OVERRIDE for this service date only.</p>
          <label>
            Bus
            <select
              required
              value={editForm.busId}
              onChange={(e) => setEditForm({ ...editForm, busId: e.target.value })}
            >
              {buses.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.label || b.plate}
                </option>
              ))}
            </select>
          </label>
          <label>
            Driver
            <select
              required
              value={editForm.driverId}
              onChange={(e) => setEditForm({ ...editForm, driverId: e.target.value })}
            >
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
              value={editForm.scheduledTime}
              onChange={(e) => setEditForm({ ...editForm, scheduledTime: e.target.value })}
            />
          </label>
          <div className="row-actions">
            <button type="submit" className="btn btn-primary">
              Save override
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Trip code</th>
              <th>Period</th>
              <th>Route</th>
              <th>Bus</th>
              <th>Driver</th>
              <th>Students</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t._id}>
                <td>
                  <strong>{t.tripCode || t._id.slice(-6)}</strong>
                  <div className="muted">
                    {t.serviceDate
                      ? new Date(t.serviceDate).toLocaleDateString()
                      : t.scheduledFor
                        ? new Date(t.scheduledFor).toLocaleDateString()
                        : '—'}
                  </div>
                  {t.exception && (
                    <div>
                      <span className="pill">{t.exception.type}</span>
                    </div>
                  )}
                </td>
                <td>
                  {t.period || '—'}
                  <div className="muted">
                    {t.direction === 'to_school' ? 'to school' : 'to home'}
                  </div>
                </td>
                <td>{t.routeId?.name || '—'}</td>
                <td>{t.busId?.label || t.busId?.plate || '—'}</td>
                <td>{t.driverId?.name || '—'}</td>
                <td>{(t.kidIds || []).length}</td>
                <td>
                  <span className={`pill status-${t.status}`}>{t.status}</span>
                </td>
                <td className="row-actions">
                  {t.status === 'scheduled' && (
                    <>
                      <button type="button" className="btn btn-ghost" onClick={() => openEdit(t)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => cancel(t._id)}>
                        Cancel
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!trips.length && (
              <tr>
                <td colSpan={8} className="muted">
                  No trip instances for these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
