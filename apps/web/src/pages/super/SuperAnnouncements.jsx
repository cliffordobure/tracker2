import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, PageFoot, formatWhen } from './shared';

export default function SuperAnnouncements() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', audience: 'all' });
  const [error, setError] = useState('');

  const load = () =>
    api('/admin/platform/announcements')
      .then((d) => setItems(d.announcements || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/platform/announcements', { method: 'POST', body: form });
      setForm({ title: '', body: '', audience: 'all' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const archive = async (id) => {
    await api(`/admin/platform/announcements/${id}`, { method: 'PUT', body: { active: false } });
    await load();
  };

  return (
    <div className="sa-page">
      {error && <div className="alert">{error}</div>}
      <div className="pa-split">
        <article className="sa-card">
          {items.length ? (
            <ul className="sa-notice-list">
              {items.map((n) => (
                <li key={n._id} className="sa-notice-item">
                  <div className="sa-notice-top">
                    <strong>{n.title}</strong>
                    <span className={`sa-pill${n.active ? '' : ' sa-pill-urgent'}`}>{n.active ? n.audience : 'archived'}</span>
                  </div>
                  <p>{n.body}</p>
                  <small>{formatWhen(n.createdAt)}</small>
                  {n.active && (
                    <button type="button" className="sa-btn sa-btn-ghost" onClick={() => archive(n._id)}>
                      Archive
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No platform announcements yet.</Empty>
          )}
        </article>
        <form className="sa-card card-form" onSubmit={submit}>
          <h3>Post announcement</h3>
          <p className="muted">This also posts to the noticeboard of every active or trial school.</p>
          <label className="sa-field">
            <span>Title</span>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Body</span>
            <textarea required rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Audience</span>
            <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              <option value="all">All</option>
              <option value="school_admins">School admins</option>
              <option value="parents">Parents</option>
              <option value="drivers">Drivers</option>
              <option value="teachers">Teachers</option>
            </select>
          </label>
          <button className="sa-btn sa-btn-primary" type="submit">
            Publish
          </button>
        </form>
      </div>
      <PageFoot />
    </div>
  );
}
