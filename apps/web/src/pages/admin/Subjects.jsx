import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

export default function Subjects() {
  const { schoolName = '', globalSearch = '' } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', classId: '', teacherName: '' });
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

  const load = async () => {
    setData(await api('/admin/subjects'));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  const rows = useMemo(() => {
    const list = data?.subjects || [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.classes.join(' ').toLowerCase().includes(s) ||
        r.teachers.join(' ').toLowerCase().includes(s)
    );
  }, [data, q]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/admin/subjects', { method: 'POST', body: form });
      setOpen(false);
      setForm({ name: '', classId: '', teacherName: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (name, classId) => {
    if (!window.confirm(`Remove ${name} from this class?`)) return;
    try {
      await api('/admin/subjects', { method: 'DELETE', body: { name, classId } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      <div className="sa-users-head">
        <p className="sa-muted">
          Subjects come from class lists, student records, assignments, and assessments. Nothing here is invented.
        </p>
        <button type="button" className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}>
          + Add to class
        </button>
      </div>
      <section className="sa-stu-kpis sa-users-kpis">
        <article className="sa-stu-kpi tint-purple">
          <div>
            <span>Subjects</span>
            <strong>{data?.subjects?.length ?? '…'}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-green">
          <div>
            <span>Classes</span>
            <strong>{data?.classes?.length ?? '…'}</strong>
          </div>
        </article>
      </section>
      <article className="sa-card">
        <label className="sa-stu-search">
          <span aria-hidden="true">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subjects..." />
        </label>
        <div className="sa-table-wrap">
          <table className="sa-table sa-users-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Classes</th>
                <th>Teachers</th>
                <th>Students</th>
                <th>Assignments</th>
                <th>Assessments</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td>{r.classes.length ? r.classes.join(', ') : '—'}</td>
                  <td>{r.teachers.length ? r.teachers.join(', ') : '—'}</td>
                  <td>{r.studentCount}</td>
                  <td>{r.assignmentCount}</td>
                  <td>{r.assessmentCount}</td>
                  <td>
                    {(data?.classes || [])
                      .filter((c) => r.classes.includes(c.grade))
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="sa-text-link"
                          onClick={() => remove(r.name, c.id)}
                        >
                          Remove from {c.grade}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="sa-home-empty">No subjects stored yet.</p>}
      </article>
      {open && (
        <div className="sa-reports-modal" role="dialog">
          <form className="sa-card" onSubmit={save}>
            <h3>Add subject to a class</h3>
            <label>
              Subject name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Class
              <select required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">Select…</option>
                {(data?.classes || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.grade}
                  </option>
                ))}
              </select>
            </label>
            {!data?.classes?.length && <p className="sa-muted">Create a class first, then attach subjects to it.</p>}
            <label>
              Teacher name (optional)
              <input value={form.teacherName} onChange={(e) => setForm({ ...form, teacherName: e.target.value })} />
            </label>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="sa-btn sa-btn-primary" type="submit" disabled={saving || !data?.classes?.length}>
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
