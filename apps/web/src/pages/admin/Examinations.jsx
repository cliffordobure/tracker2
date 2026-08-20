import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

function ymd(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const empty = { kidId: '', teacherId: '', title: 'Assessment', subject: '', score: '', kind: 'academic', date: ymd() };

export default function Examinations() {
  const { schoolName = '', globalSearch = '' } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

  const load = async () => {
    const query = new URLSearchParams();
    if (q.trim()) query.set('q', q.trim());
    if (subject) query.set('subject', subject);
    setData(await api(`/admin/examinations?${query}`));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [q, subject]);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/admin/examinations', { method: 'POST', body: form });
      setOpen(false);
      setForm(empty);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.title} for ${row.kidName}?`)) return;
    try {
      await api(`/admin/examinations/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const rows = data?.assessments || [];

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      <div className="sa-users-head">
        <p className="sa-muted">
          These are stored student assessments (score out of 100). There is no separate exam timetable.
        </p>
        <button type="button" className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}>
          + Record assessment
        </button>
      </div>
      <section className="sa-stu-kpis sa-users-kpis">
        <article className="sa-stu-kpi tint-purple">
          <div>
            <span>Records</span>
            <strong>{data?.stats?.total ?? '…'}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-green">
          <div>
            <span>Average score</span>
            <strong>{data?.stats?.average == null ? '—' : data.stats.average}</strong>
          </div>
        </article>
      </section>
      <article className="sa-card">
        <div className="sa-stu-toolbar">
          <label className="sa-stu-search">
            <span aria-hidden="true">⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student, subject, title..." />
          </label>
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">All subjects</option>
            {(data?.subjects || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table sa-users-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Student</th>
                <th>Title</th>
                <th>Subject</th>
                <th>Kind</th>
                <th>Score</th>
                <th>Teacher</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.date)}</td>
                  <td>
                    <strong>{r.kidName}</strong>
                    <div className="sa-muted">{r.grade || '—'}</div>
                  </td>
                  <td>{r.title}</td>
                  <td>{r.subject || '—'}</td>
                  <td>{r.kind}</td>
                  <td>{r.score}</td>
                  <td>{r.teacherName}</td>
                  <td>
                    <button type="button" className="sa-text-link" onClick={() => remove(r)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="sa-home-empty">No assessments stored yet.</p>}
      </article>
      {open && (
        <div className="sa-reports-modal" role="dialog">
          <form className="sa-card" onSubmit={save}>
            <h3>Record assessment</h3>
            <label>
              Student
              <select required value={form.kidId} onChange={(e) => setForm({ ...form, kidId: e.target.value })}>
                <option value="">Select…</option>
                {(data?.kids || []).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                    {k.grade ? ` · ${k.grade}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              Subject
              <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </label>
            <label>
              Score (0–100)
              <input
                type="number"
                min="0"
                max="100"
                required
                value={form.score}
                onChange={(e) => setForm({ ...form, score: e.target.value })}
              />
            </label>
            <label>
              Kind
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="academic">Academic</option>
                <option value="behaviour">Behaviour</option>
                <option value="skill">Skill</option>
              </select>
            </label>
            <label>
              Date
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              Teacher
              <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                <option value="">Default</option>
                {(data?.teachers || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
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
