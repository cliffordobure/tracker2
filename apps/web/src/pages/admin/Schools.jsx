import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';

const emptySchool = { name: '', address: '', location: { lat: -1.3965, lng: 36.7542 } };
const emptyAdmin = { name: '', email: '', phone: '', password: '', schoolId: '' };

export default function Schools() {
  const [schools, setSchools] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [form, setForm] = useState(emptySchool);
  const [adminForm, setAdminForm] = useState(emptyAdmin);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    const [s, a] = await Promise.all([api('/admin/schools'), api('/admin/school-admins')]);
    setSchools(s.schools);
    setAdmins(a.schoolAdmins);
    setAdminForm((f) => ({ ...f, schoolId: f.schoolId || s.schools[0]?._id || '' }));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submitSchool = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api(`/admin/schools/${editingId}`, { method: 'PUT', body: form });
      } else {
        await api('/admin/schools', { method: 'POST', body: form });
      }
      setForm(emptySchool);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const submitAdmin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/school-admins', { method: 'POST', body: adminForm });
      setAdminForm((f) => ({ ...emptyAdmin, schoolId: f.schoolId }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (school) => {
    setEditingId(school._id);
    setForm({
      name: school.name,
      address: school.address || '',
      location: { ...school.location },
    });
  };

  const remove = async (id) => {
    if (!confirm('Delete this school?')) return;
    await api(`/admin/schools/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="stack">
      {error && <div className="alert">{error}</div>}
      <p className="lede">Create schools and assign a school admin who manages day-to-day transport.</p>

      <div className="split">
        <div className="stack">
          <h2>Schools</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {schools.map((s) => (
                  <tr key={s._id}>
                    <td>{s.name}</td>
                    <td>{s.address}</td>
                    <td className="row-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => edit(s)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => remove(s._id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>School admins</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>School</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.email}</td>
                    <td>{schools.find((s) => s._id === a.schoolId)?.name || a.schoolId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <form className="card-form" onSubmit={submitSchool}>
            <h3>{editingId ? 'Edit school' : 'Add school'}</h3>
            <label>
              Name
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Address
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </label>
            <div className="inline-fields">
              <label>
                Lat
                <input
                  type="number"
                  step="any"
                  value={form.location.lat}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      location: { ...form.location, lat: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Lng
                <input
                  type="number"
                  step="any"
                  value={form.location.lng}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      location: { ...form.location, lng: Number(e.target.value) },
                    })
                  }
                />
              </label>
            </div>
            <p className="hint">Click the map to set school location.</p>
            <MapView
              center={form.location}
              zoom={13}
              onMapClick={(loc) => setForm({ ...form, location: loc })}
              stops={[{ name: form.name || 'School', type: 'school', location: form.location }]}
              className="map-canvas map-sm"
            />
            <div className="row-actions">
              <button className="btn btn-primary" type="submit">
                {editingId ? 'Save' : 'Create'}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptySchool);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <form className="card-form" onSubmit={submitAdmin}>
            <h3>Create school admin</h3>
            <label>
              School
              <select
                required
                value={adminForm.schoolId}
                onChange={(e) => setAdminForm({ ...adminForm, schoolId: e.target.value })}
              >
                <option value="">Select school</option>
                {schools.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input
                required
                value={adminForm.name}
                onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={adminForm.email}
                onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
              />
            </label>
            <label>
              Phone
              <input
                value={adminForm.phone}
                onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
              />
            </label>
            <label>
              Password <em className="sa-req">*</em>
              <input
                required
                value={adminForm.password}
                onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                placeholder="Enter a password"
              />
            </label>
            <button className="btn btn-primary" type="submit">
              Create school admin
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
