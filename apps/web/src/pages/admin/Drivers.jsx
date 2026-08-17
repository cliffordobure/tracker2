import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MediaPicker from '../../components/MediaPicker';

const empty = {
  name: '',
  email: '',
  phone: '',
  password: 'driver123',
  vehiclePlate: '',
  vehicleModel: '',
  vehicleColor: '',
  busId: '',
  assignedRouteIds: [],
  photoUrl: '',
  photoPublicId: '',
};

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  const load = async () => {
    const [d, r, b] = await Promise.all([
      api('/admin/drivers'),
      api('/admin/routes'),
      api('/admin/buses'),
    ]);
    setDrivers(d.drivers);
    setRoutes(r.routes);
    setBuses(b.buses);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/drivers', {
        method: 'POST',
        body: {
          ...form,
          busId: form.busId || null,
        },
      });
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
        <p className="lede">
          Preferred routes/buses are optional. Daily dispatch can assign any bus to any route.
        </p>
        {error && <div className="alert">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Default bus</th>
                <th>Preferred routes</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.photoUrl ? <img src={d.photoUrl} alt="" className="table-thumb" /> : null}
                    <strong>{d.name}</strong>
                    <div className="muted">{d.email}</div>
                  </td>
                  <td>
                    {d.profile?.busId
                      ? typeof d.profile.busId === 'object'
                        ? d.profile.busId.label || d.profile.busId.plate
                        : d.profile.busId
                      : d.profile?.vehiclePlate || '—'}
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
        <MediaPicker
          label="Driver photo"
          folder="drivers"
          accept="image/*"
          value={form.photoUrl ? { url: form.photoUrl, publicId: form.photoPublicId } : null}
          onChange={(file) =>
            setForm({
              ...form,
              photoUrl: file?.url || '',
              photoPublicId: file?.publicId || '',
            })
          }
        />
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
          Temp password
          <input
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label>
          Default bus
          <select value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })}>
            <option value="">None</option>
            {buses.map((b) => (
              <option key={b._id} value={b._id}>
                {(b.label || b.plate) + ` (${b.seats} seats)`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plate (optional note)
          <input
            value={form.vehiclePlate}
            onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
          />
        </label>
        <fieldset className="checkbox-set">
          <legend>Preferred routes (optional)</legend>
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
