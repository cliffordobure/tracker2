import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, PageFoot, StatusDot, formatWhen } from './shared';

export default function SuperFeatureRequests() {
  const [items, setItems] = useState([]);
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', schoolId: '' });
  const [error, setError] = useState('');

  const load = async () => {
    const [r, s] = await Promise.all([api('/admin/platform/feature-requests'), api('/admin/platform/schools')]);
    setItems(r.requests || []);
    setSchools(s.schools || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/platform/feature-requests', { method: 'POST', body: form });
      setForm({ title: '', body: '', schoolId: '' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const setStatus = async (id, status) => {
    await api(`/admin/platform/feature-requests/${id}`, { method: 'PUT', body: { status } });
    await load();
  };

  return (
    <div className="sa-page">
      {error && <div className="alert">{error}</div>}
      <div className="pa-split">
        <article className="sa-card">
          {items.length ? (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>School</th>
                    <th>Status</th>
                    <th>Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <strong>{item.title}</strong>
                        <div className="muted">{item.body}</div>
                      </td>
                      <td>{item.schoolId?.name || 'Platform'}</td>
                      <td>
                        <select value={item.status} onChange={(e) => setStatus(item._id, e.target.value)}>
                          <option value="open">Open</option>
                          <option value="planned">Planned</option>
                          <option value="done">Done</option>
                          <option value="declined">Declined</option>
                        </select>
                        <div>
                          <StatusDot status={item.status} />
                        </div>
                      </td>
                      <td>{formatWhen(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No feature requests yet.</Empty>
          )}
        </article>
        <form className="sa-card card-form" onSubmit={submit}>
          <h3>Log a request</h3>
          <label className="sa-field">
            <span>School (optional)</span>
            <select value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })}>
              <option value="">Platform</option>
              {schools.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="sa-field">
            <span>Title</span>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Details</span>
            <textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <button className="sa-btn sa-btn-primary" type="submit">
            Add request
          </button>
        </form>
      </div>
      <PageFoot />
    </div>
  );
}
