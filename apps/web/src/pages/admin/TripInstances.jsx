import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TripInstances() {
  const [trips, setTrips] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [date, setDate] = useState(todayInput());
  const [status, setStatus] = useState('');
  const [routeId, setRouteId] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (status) params.set('status', status);
    if (routeId) params.set('routeId', routeId);
    const data = await api(`/admin/trip-instances?${params}`);
    setTrips(data.trips);
  };

  useEffect(() => {
    api('/admin/routes')
      .then((d) => setRoutes(d.routes))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, status, routeId]);

  const cancel = async (id) => {
    if (!confirm('Cancel this trip instance?')) return;
    setError('');
    try {
      await api(`/admin/trip-instances/${id}/cancel`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack">
      <h2>Trip instances</h2>
      <p className="lede">Generated trips for a service day. Cancel scheduled trips before they start.</p>
      {error && <div className="alert">{error}</div>}

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
                    <button type="button" className="btn btn-ghost" onClick={() => cancel(t._id)}>
                      Cancel
                    </button>
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
