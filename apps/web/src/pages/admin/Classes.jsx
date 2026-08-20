import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

const empty = {
  grade: '',
  classCode: '',
  classroom: '',
  section: '',
  academicYear: '',
  teacherId: '',
  assistantName: '',
  capacity: 30,
  description: '',
};

export default function Classes() {
  const { schoolName = '', globalSearch = '' } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

  const load = async () => {
    const next = await api('/admin/classes');
    setData(next);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  const rows = useMemo(() => {
    const list = data?.classes || [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (c) =>
        c.grade.toLowerCase().includes(s) ||
        (c.classCode || '').toLowerCase().includes(s) ||
        (c.teacherName || '').toLowerCase().includes(s) ||
        (c.classroom || '').toLowerCase().includes(s)
    );
  }, [data, q]);

  const startCreate = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const startEdit = (c) => {
    setEditing(c);
    setForm({
      grade: c.grade,
      classCode: c.classCode,
      classroom: c.classroom,
      section: c.section,
      academicYear: c.academicYear,
      teacherId: c.teacherId,
      assistantName: c.assistantName,
      capacity: c.capacity,
      description: c.description,
    });
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) await api(`/admin/classes/${editing.id}`, { method: 'PUT', body: form });
      else await api('/admin/classes', { method: 'POST', body: form });
      setOpen(false);
      setNotice(editing ? 'Class updated.' : 'Class created.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Deactivate ${c.grade}? Students are not deleted.`)) return;
    try {
      await api(`/admin/classes/${c.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}
      <div className="sa-users-head">
        <p className="sa-muted">
          Classes match student grades. Grades already on student records are added here automatically.
        </p>
        <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>
          + Add class
        </button>
      </div>
      <section className="sa-stu-kpis sa-users-kpis">
        <article className="sa-stu-kpi tint-purple">
          <div>
            <span>Classes</span>
            <strong>{data?.classes?.length ?? '…'}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-green">
          <div>
            <span>Teachers</span>
            <strong>{data?.teachers?.length ?? '…'}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-sky">
          <div>
            <span>Houses on records</span>
            <strong>{data?.houses?.length ?? '…'}</strong>
            <em>{data?.houses?.length ? data.houses.join(', ') : 'None stored'}</em>
          </div>
        </article>
      </section>
      <article className="sa-card">
        <label className="sa-stu-search">
          <span aria-hidden="true">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search classes..." />
        </label>
        <div className="sa-table-wrap">
          <table className="sa-table sa-users-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Code</th>
                <th>Room</th>
                <th>Teacher</th>
                <th>Students</th>
                <th>Houses</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.grade}</strong>
                    {c.section ? <div className="sa-muted">{c.section}</div> : null}
                  </td>
                  <td>{c.classCode || '—'}</td>
                  <td>{c.classroom || '—'}</td>
                  <td>{c.teacherName || '—'}</td>
                  <td>{c.studentCount ?? 0}</td>
                  <td>{c.houses?.length ? c.houses.join(', ') : '—'}</td>
                  <td>
                    <button type="button" className="sa-text-link" onClick={() => startEdit(c)}>
                      Edit
                    </button>{' '}
                    <button type="button" className="sa-text-link" onClick={() => remove(c)}>
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="sa-home-empty">No classes stored yet.</p>}
      </article>
      {open && (
        <div className="sa-reports-modal" role="dialog">
          <form className="sa-card" onSubmit={save}>
            <h3>{editing ? 'Edit class' : 'Add class'}</h3>
            <label>
              Grade / class name
              <input required value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
            </label>
            <label>
              Class code
              <input value={form.classCode} onChange={(e) => setForm({ ...form, classCode: e.target.value })} />
            </label>
            <label>
              Classroom
              <input value={form.classroom} onChange={(e) => setForm({ ...form, classroom: e.target.value })} />
            </label>
            <label>
              Section
              <input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
            </label>
            <label>
              Academic year
              <input value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} />
            </label>
            <label>
              Class teacher
              <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                <option value="">Not assigned</option>
                {(data?.teachers || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assistant
              <input value={form.assistantName} onChange={(e) => setForm({ ...form, assistantName: e.target.value })} />
            </label>
            <label>
              Capacity
              <input
                type="number"
                min="1"
                max="80"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
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
