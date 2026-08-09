import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const empty = {
  plate: '',
  label: '',
  model: '',
  color: '',
  seats: 14,
};

export default function Buses() {
  const [buses, setBuses] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/admin/buses').then((d) => setBuses(d.buses));

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const body = { ...form, seats: Number(form.seats) };
      if (editingId) {
        await api(`/admin/buses/${editingId}`, { method: 'PUT', body });
      } else {
        await api('/admin/buses', { method: 'POST', body });
      }
      setForm(empty);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (bus) => {
    setEditingId(bus._id);
    setForm({
      plate: bus.plate || '',
      label: bus.label || '',
      model: bus.model || '',
      color: bus.color || '',
      seats: bus.seats,
    });
  };

  const remove = async (id) => {
    if (!confirm('Delete this bus?')) return;
    await api(`/admin/buses/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="split">
      <div className="stack">
        <h2>Buses</h2>
        <p className="lede">Seat capacity drives how many trips a route needs on a given day.</p>
        {error && <div className="alert">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Plate</th>
                <th>Seats</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {buses.map((b) => (
                <tr key={b._id}>
                  <td>
                    <strong>{b.label || 'Bus'}</strong>
                    <div className="muted">{b.model}</div>
                  </td>
                  <td>{b.plate}</td>
                  <td>{b.seats}</td>
                  <td className="row-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => edit(b)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => remove(b._id)}>
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
        <h3>{editingId ? 'Edit bus' : 'Add bus'}</h3>
        <label>
          Label
          <input
            placeholder="Bus 1"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </label>
        <label>
          Plate
          <input
            required
            value={form.plate}
            onChange={(e) => setForm({ ...form, plate: e.target.value })}
          />
        </label>
        <label>
          Model
          <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        </label>
        <label>
          Color
          <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </label>
        <label>
          Seats
          <input
            required
            type="number"
            min={1}
            value={form.seats}
            onChange={(e) => setForm({ ...form, seats: e.target.value })}
          />
        </label>
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
