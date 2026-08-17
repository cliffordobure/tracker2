import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MediaPicker from '../../components/MediaPicker';

const empty = {
  role: 'driver',
  name: '',
  email: '',
  phone: '',
  password: '',
  active: true,
  vehiclePlate: '',
  vehicleModel: '',
  vehicleColor: '',
  busId: '',
  assignedRouteIds: [],
  photoUrl: '',
  photoPublicId: '',
};

function routeIds(profile) {
  return (profile?.assignedRouteIds || []).map((r) => (typeof r === 'object' ? r._id : r));
}

function busIdOf(profile) {
  const bus = profile?.busId;
  if (!bus) return '';
  return typeof bus === 'object' ? bus._id : bus;
}

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [form, setForm] = useState({ ...empty, password: 'password123' });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const staff = [
    ...drivers.map((d) => ({ ...d, staffRole: 'driver' })),
    ...teachers.map((t) => ({ ...t, staffRole: 'teacher' })),
  ].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const load = async () => {
    const [d, t, r, b] = await Promise.all([
      api('/admin/drivers'),
      api('/admin/teachers').catch(() => ({ teachers: [] })),
      api('/admin/routes'),
      api('/admin/buses'),
    ]);
    setDrivers(d.drivers);
    setTeachers(t.teachers || []);
    setRoutes(r.routes);
    setBuses(b.buses);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...empty, password: 'password123' });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const isDriver = form.role === 'driver';
      const body = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        active: form.active,
        photoUrl: form.photoUrl,
        photoPublicId: form.photoPublicId,
        ...(form.password ? { password: form.password } : {}),
        ...(isDriver
          ? {
              busId: form.busId || null,
              vehiclePlate: form.vehiclePlate,
              vehicleModel: form.vehicleModel,
              vehicleColor: form.vehicleColor,
              assignedRouteIds: form.assignedRouteIds,
            }
          : {}),
      };

      if (editingId) {
        await api(isDriver ? `/admin/drivers/${editingId}` : `/admin/teachers/${editingId}`, {
          method: 'PUT',
          body,
        });
      } else {
        await api(isDriver ? '/admin/drivers' : '/admin/teachers', {
          method: 'POST',
          body: { ...body, password: form.password || 'password123' },
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (person) => {
    const isDriver = person.staffRole === 'driver';
    setEditingId(person.id);
    setForm({
      role: isDriver ? 'driver' : 'teacher',
      name: person.name || '',
      email: person.email || '',
      phone: person.phone || '',
      password: '',
      active: person.active !== false,
      vehiclePlate: person.profile?.vehiclePlate || '',
      vehicleModel: person.profile?.vehicleModel || '',
      vehicleColor: person.profile?.vehicleColor || '',
      busId: busIdOf(person.profile),
      assignedRouteIds: routeIds(person.profile),
      photoUrl: person.photoUrl || '',
      photoPublicId: person.photoPublicId || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        <h2>Staff</h2>
        <p className="lede">
          Teachers and drivers for your school. Click Edit to update details, photo, or password.
        </p>
        {error && <div className="alert">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Contact</th>
                <th>Details</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No staff yet.
                  </td>
                </tr>
              ) : (
                staff.map((person) => (
                  <tr key={`${person.staffRole}-${person.id}`}>
                    <td>
                      {person.photoUrl ? <img src={person.photoUrl} alt="" className="table-thumb" /> : null}
                      <strong>{person.name}</strong>
                      {person.active === false ? <div className="muted">Inactive</div> : null}
                    </td>
                    <td>{person.staffRole === 'driver' ? 'Driver' : 'Teacher'}</td>
                    <td>
                      <div>{person.email}</div>
                      <div className="muted">{person.phone || '—'}</div>
                    </td>
                    <td>
                      {person.staffRole === 'driver' ? (
                        <>
                          {person.profile?.busId
                            ? typeof person.profile.busId === 'object'
                              ? person.profile.busId.label || person.profile.busId.plate
                              : person.profile.busId
                            : person.profile?.vehiclePlate || '—'}
                          <div className="muted">
                            {(person.profile?.assignedRouteIds || [])
                              .map((r) => (typeof r === 'object' ? r.name : r))
                              .join(', ') || 'No preferred routes'}
                          </div>
                        </>
                      ) : (
                        'Classroom'
                      )}
                    </td>
                    <td className="row-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => edit(person)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <form className="card-form" onSubmit={submit}>
        <h3>{editingId ? 'Edit staff' : 'Add staff'}</h3>
        <label>
          Role
          <select
            value={form.role}
            disabled={Boolean(editingId)}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="driver">Driver</option>
            <option value="teacher">Teacher</option>
          </select>
        </label>
        <MediaPicker
          label="Photo"
          folder={form.role === 'driver' ? 'drivers' : 'users'}
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
          {editingId ? 'New password (optional)' : 'Temp password'}
          <input
            value={form.password}
            placeholder={editingId ? 'Leave blank to keep current password' : ''}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {editingId && (
          <label className="check">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>
        )}
        {form.role === 'driver' && (
          <>
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
          </>
        )}
        <div className="row-actions">
          <button className="btn btn-primary" type="submit">
            {editingId ? 'Save changes' : form.role === 'teacher' ? 'Create teacher' : 'Create driver'}
          </button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
