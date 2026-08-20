import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

function fmt(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function ymd(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const empty = { title: '', subject: '', grade: '', description: '', dueDate: '', teacherId: '', status: 'published' };

export default function AssignmentsAdmin() {
  const { schoolName = '' } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

  const load = async () => {
    setData(await api('/admin/assignments'));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const startCreate = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const startEdit = (row) => {
    setEditing(row);
    setForm({
      title: row.title,
      subject: row.subject,
      grade: row.grade,
      description: row.description,
      dueDate: ymd(row.dueDate),
      teacherId: row.teacherId,
      status: row.status,
    });
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) await api(`/admin/assignments/${editing.id}`, { method: 'PUT', body: form });
      else await api('/admin/assignments', { method: 'POST', body: form });
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.title}?`)) return;
    try {
      await api(`/admin/assignments/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const rows = data?.assignments || [];

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      <div className="sa-users-head">
        <p className="sa-muted">Assignments teachers have published for this school.</p>
        <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>
          + Add assignment
        </button>
      </div>
      <section className="sa-stu-kpis sa-users-kpis">
        <article className="sa-stu-kpi tint-purple">
          <div>
            <span>Total</span>
            <strong>{data?.stats?.total ?? '…'}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-green">
          <div>
            <span>Published</span>
            <strong>{data?.stats?.published ?? '…'}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-orange">
          <div>
            <span>Overdue</span>
            <strong>{data?.stats?.overdue ?? '…'}</strong>
            <em>Past due date, still published</em>
          </div>
        </article>
      </section>
      <article className="sa-card">
        <div className="sa-table-wrap">
          <table className="sa-table sa-users-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Subject</th>
                <th>Grade</th>
                <th>Teacher</th>
                <th>Due</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.title}</strong>
                  </td>
                  <td>{r.subject || '—'}</td>
                  <td>{r.grade || '—'}</td>
                  <td>{r.teacherName}</td>
                  <td>{fmt(r.dueDate)}</td>
                  <td>
                    {r.status}
                    {r.overdue ? ' · overdue' : ''}
                  </td>
                  <td>
                    <button type="button" className="sa-text-link" onClick={() => startEdit(r)}>
                      Edit
                    </button>{' '}
                    <button type="button" className="sa-text-link" onClick={() => remove(r)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="sa-home-empty">No assignments stored yet.</p>}
      </article>
      {open && (
        <div className="sa-reports-modal" role="dialog">
          <form className="sa-card" onSubmit={save}>
            <h3>{editing ? 'Edit assignment' : 'Add assignment'}</h3>
            <label>
              Title
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              Subject
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </label>
            <label>
              Grade
              <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                <option value="">All / unspecified</option>
                {(data?.grades || []).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Teacher
              <select required={!editing} value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                <option value="">Select…</option>
                {(data?.teachers || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label>
              Description
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="sa-btn sa-btn-primary" type="submit" disabled={saving}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}
      <footer className="sa-home-foot">
        <span>
          © {year} {schoolName || 'School'}. All rights reserved.
        </span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
