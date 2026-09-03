import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, PageFoot, PlanBadge, StatusDot } from './shared';

const empty = { schoolId: '', name: '', email: '', phone: '', password: '' };

export default function SuperAdmins() {
  const [admins, setAdmins] = useState([]);
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = async () => {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    const [a, s] = await Promise.all([api(`/admin/platform/admins${query}`), api('/admin/platform/schools')]);
    setAdmins(a.admins || []);
    setSchools(s.schools || []);
    setForm((f) => ({ ...f, schoolId: f.schoolId || s.schools[0]?._id || '' }));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [q]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/platform/admins', { method: 'POST', body: form });
      setForm((f) => ({ ...empty, schoolId: f.schoolId }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = async (admin) => {
    await api(`/admin/platform/admins/${admin.id}`, { method: 'PUT', body: { active: !admin.active } });
    await load();
  };

  return (
    <div className="sa-page">
      {error && <div className="alert">{error}</div>}
      <div className="pa-split">
        <article className="sa-card">
          <div className="pa-toolbar">
            <input value={q} placeholder="Search admins..." onChange={(e) => setQ(e.target.value)} />
          </div>
          {admins.length ? (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>School</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td>{a.email}</td>
                      <td>
                        {a.schoolName || '—'}
                        <div>
                          <StatusDot status={a.schoolStatus || 'active'} />
                        </div>
                      </td>
                      <td>
                        <PlanBadge plan={a.schoolPlan} />
                      </td>
                      <td>{a.active ? 'Active' : 'Disabled'}</td>
                      <td>
                        <button type="button" className="sa-btn sa-btn-outline" onClick={() => toggle(a)}>
                          {a.active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No school admins yet. Create one when you admit a school.</Empty>
          )}
        </article>
        <form className="sa-card card-form" onSubmit={submit}>
          <h3>Create school admin</h3>
          <label className="sa-field">
            <span>School</span>
            <select required value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })}>
              <option value="">Select school</option>
              {schools.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="sa-field">
            <span>Name</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Email</span>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Phone</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>
              Password <em className="sa-req">*</em>
            </span>
            <input
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Enter a password"
            />
          </label>
          <button className="sa-btn sa-btn-primary" type="submit">
            Create admin
          </button>
        </form>
      </div>
      <PageFoot />
    </div>
  );
}
