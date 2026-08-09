import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const empty = { name: '', email: '', phone: '', password: 'parent123' };

export default function Parents() {
  const [parents, setParents] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  const load = () => api('/admin/parents').then((d) => setParents(d.parents));

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/parents', { method: 'POST', body: form });
      setForm(empty);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="split">
      <div className="stack">
        <h2>Parents</h2>
        {error && <div className="alert">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {parents.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.email}</td>
                  <td>{p.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <form className="card-form" onSubmit={submit}>
        <h3>Add parent</h3>
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
        <button className="btn btn-primary" type="submit">
          Create parent
        </button>
      </form>
    </div>
  );
}
