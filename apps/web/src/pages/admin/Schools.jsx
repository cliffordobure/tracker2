import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';

const empty = { name: '', address: '', location: { lat: -1.3965, lng: 36.7542 } };

export default function Schools() {
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/admin/schools').then((d) => setSchools(d.schools));

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api(`/admin/schools/${editingId}`, { method: 'PUT', body: form });
      } else {
        await api('/admin/schools', { method: 'POST', body: form });
      }
      setForm(empty);
      setEditingId(null);
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
    <div className="split">
      <div className="stack">
        <h2>Schools</h2>
        {error && <div className="alert">{error}</div>}
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
      </div>

      <form className="card-form" onSubmit={submit}>
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
                setForm({ ...form, location: { ...form.location, lat: Number(e.target.value) } })
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
                setForm({ ...form, location: { ...form.location, lng: Number(e.target.value) } })
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
                setForm(empty);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
