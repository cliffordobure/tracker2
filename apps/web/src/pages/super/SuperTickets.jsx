import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, PageFoot, StatusDot, formatWhen } from './shared';

export default function SuperTickets() {
  const [tickets, setTickets] = useState([]);
  const [schools, setSchools] = useState([]);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({ schoolId: '', title: '', body: '', category: 'general' });
  const [error, setError] = useState('');

  const load = async () => {
    const query = status ? `?status=${status}` : '';
    const [t, s] = await Promise.all([api(`/admin/platform/tickets${query}`), api('/admin/platform/schools')]);
    setTickets(t.tickets || []);
    setSchools(s.schools || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [status]);

  const setTicketStatus = async (id, next) => {
    await api(`/admin/platform/tickets/${id}`, { method: 'PUT', body: { status: next } });
    await load();
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/platform/tickets', { method: 'POST', body: form });
      setForm({ schoolId: '', title: '', body: '', category: 'general' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="sa-page">
      {error && <div className="alert">{error}</div>}
      <div className="pa-split">
        <article className="sa-card">
          <div className="pa-toolbar">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          {tickets.length ? (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>School</th>
                    <th>From</th>
                    <th>Status</th>
                    <th>Opened</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t._id}>
                      <td>
                        <strong>{t.ticketNo}</strong>
                        <div>{t.title}</div>
                        <div className="muted">{t.body}</div>
                      </td>
                      <td>{t.schoolId?.name || '—'}</td>
                      <td>{t.parentId?.name || t.parentId?.email || 'Platform'}</td>
                      <td>
                        <StatusDot status={t.status} />
                      </td>
                      <td>{formatWhen(t.createdAt)}</td>
                      <td>
                        <select value={t.status} onChange={(e) => setTicketStatus(t._id, e.target.value)}>
                          <option value="open">Open</option>
                          <option value="pending">Pending</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No support tickets yet.</Empty>
          )}
        </article>
        <form className="sa-card card-form" onSubmit={create}>
          <h3>Log a ticket</h3>
          <label className="sa-field">
            <span>School (optional)</span>
            <select value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })}>
              <option value="">None</option>
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
            Create ticket
          </button>
        </form>
      </div>
      <PageFoot />
    </div>
  );
}
