import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const empty = {
  name: '',
  email: '',
  phone: '',
  password: 'driver123',
  vehiclePlate: '',
  vehicleModel: '',
  vehicleColor: '',
  assignedRouteIds: [],
};

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  const load = async () => {
    const [d, r] = await Promise.all([api('/admin/drivers'), api('/admin/routes')]);
    setDrivers(d.drivers);
    setRoutes(r.routes);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/drivers', { method: 'POST', body: form });
      setForm(empty);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleRoute = (routeId) => {
    setForm((f) => {
      const has = f.assignedRouteIds.includes(routeId);
      return {
        ...f,
        assignedRouteIds: has
          ? f.assignedRouteIds.filter((id) => id !== routeId)
          : [...f.assignedRouteIds, routeId],
      };
    });
  };

  return (
    <div className="split">
      <div className="stack">
        <h2>Drivers</h2>
        {error && <div className="alert">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Vehicle</th>
                <th>Routes</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.name}</strong>
                    <div className="muted">{d.email}</div>
                  </td>
                  <td>
                    {d.profile?.vehiclePlate || '—'}
                    <div className="muted">{d.profile?.vehicleModel}</div>
                  </td>
                  <td>
                    {(d.profile?.assignedRouteIds || [])
                      .map((r) => (typeof r === 'object' ? r.name : r))
                      .join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <form className="card-form" onSubmit={submit}>
        <h3>Add driver</h3>
        <label>
          Name
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Email
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label>
          Plate
          <input
            value={form.vehiclePlate}
            onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
          />
        </label>
        <label>
          Model
          <input
            value={form.vehicleModel}
            onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })}
          />
        </label>
        <fieldset className="checkbox-set">
          <legend>Assigned routes</legend>
          {routes.map((r) => (
            <label key={r._id} className="check">
              <input
                type="checkbox"
                checked={form.assignedRouteIds.includes(r._id)}
                onChange={() => toggleRoute(r._id)}
              />
              {r.name}
            </label>
          ))}
        </fieldset>
        <button className="btn btn-primary" type="submit">
          Create driver
        </button>
      </form>
    </div>
  );
}
