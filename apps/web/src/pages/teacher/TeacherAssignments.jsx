import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const empty = {
  title: '',
  subject: '',
  grade: '',
  description: '',
  dueDate: '',
  status: 'published',
  kidIds: [],
};

function assignmentAudience(a) {
  const kids = Array.isArray(a.kidIds) ? a.kidIds : [];
  if (kids.length) {
    const names = kids.map((k) => (k && typeof k === 'object' ? k.name : '')).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length === 2) return names.join(', ');
    if (names.length > 2) return `${names[0]} +${names.length - 1}`;
    return `${kids.length} student${kids.length === 1 ? '' : 's'}`;
  }
  return a.grade || 'All classes';
}

export default function TeacherAssignments() {
  const { showToast } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [grades, setGrades] = useState([]);
  const [kids, setKids] = useState([]);
  const [stats, setStats] = useState({});
  const [form, setForm] = useState(empty);
  const [audience, setAudience] = useState('class');
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const work = await api('/teacher/work');
      setAssignments(work.assignments || []);
      setHolidays(work.holidays || []);
      setGrades(work.grades || []);
      setStats(work.stats || {});
      const k = await api('/teacher/kids');
      setKids(k.kids || []);
      if (!(work.grades || []).length) setGrades(k.grades || []);
    } catch (_) {
      const [a, k] = await Promise.all([api('/teacher/assignments'), api('/teacher/kids')]);
      setAssignments(a.assignments || []);
      setGrades(k.grades || []);
      setKids(k.kids || []);
    }
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        grade: audience === 'all' ? '' : form.grade,
        kidIds: audience === 'individuals' ? form.kidIds : [],
      };
      if (audience === 'class' && !payload.grade) {
        setError('Select a class, or send to all classes / individual students');
        setBusy(false);
        return;
      }
      if (audience === 'individuals' && !payload.kidIds.length) {
        setError('Select at least one student');
        setBusy(false);
        return;
      }
      if (editingId) {
        await api(`/teacher/assignments/${editingId}`, { method: 'PUT', body: payload });
        showToast('Assignment updated', 'success');
      } else {
        await api('/teacher/assignments', { method: 'POST', body: payload });
        showToast(form.status === 'draft' ? 'Draft saved' : 'Assignment posted. Parents have been notified.', 'success');
      }
      setForm({ ...empty, grade: audience === 'all' ? '' : form.grade });
      setEditingId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (a) => {
    const kidIds = (a.kidIds || []).map((k) => k._id || k).filter(Boolean);
    setEditingId(a._id);
    setAudience(kidIds.length ? 'individuals' : a.grade ? 'class' : 'all');
    setForm({
      title: a.title || '',
      subject: a.subject || '',
      grade: a.grade || '',
      description: a.description || '',
      dueDate: a.dueDate ? String(a.dueDate).slice(0, 10) : '',
      status: a.status === 'draft' ? 'draft' : 'published',
      kidIds,
    });
  };

  const publish = async (a) => {
    await api(`/teacher/assignments/${a._id}`, { method: 'PUT', body: { status: 'published' } });
    showToast('Assignment published', 'success');
    await load();
  };

  const remove = async (id) => {
    if (!confirm('Remove this assignment?')) return;
    try {
      await api(`/teacher/assignments/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="tw-split">
      <div className="tw-page">
        <div>
          <h2>Work</h2>
          <p className="tw-lede">Set class work, keep drafts, and see upcoming school events.</p>
        </div>
        {error && <div className="tw-alert">{error}</div>}
        <div className="tw-metrics tw-metrics-4">
          <div className="tw-metric">
            <span>Assignments</span>
            <strong>{assignments.length}</strong>
          </div>
          <div className="tw-metric">
            <span>Unmarked today</span>
            <strong>{stats.unmarked ?? 0}</strong>
          </div>
          <div className="tw-metric">
            <span>Students</span>
            <strong>{stats.students ?? 0}</strong>
          </div>
          <div className="tw-metric">
            <span>Events</span>
            <strong>{holidays.length}</strong>
          </div>
        </div>
        <div className="tw-inline-actions">
          <Link className="tw-btn tw-btn-secondary" to="/teacher/resources">
            Lesson plans
          </Link>
          <Link className="tw-btn tw-btn-secondary" to="/teacher/announcements">
            Announcements
          </Link>
          <Link className="tw-btn tw-btn-secondary" to="/teacher/reports">
            Reports
          </Link>
        </div>
        <div className="tw-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Class</th>
                <th>Due</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a._id}>
                  <td>
                    <strong>{a.title}</strong>
                    <div className="tw-muted">{a.subject || '—'}</div>
                    {a.description ? <div className="tw-muted">{a.description}</div> : null}
                  </td>
                  <td>{assignmentAudience(a)}</td>
                  <td>{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}</td>
                  <td>
                    <span className="tw-pill">{a.status || 'published'}</span>
                  </td>
                  <td>
                    <div className="tw-inline-actions">
                      <button type="button" className="tw-btn tw-btn-ghost" onClick={() => startEdit(a)}>
                        Edit
                      </button>
                      {a.status === 'draft' ? (
                        <button type="button" className="tw-btn tw-btn-ghost" onClick={() => publish(a)}>
                          Publish
                        </button>
                      ) : null}
                      <button type="button" className="tw-btn tw-btn-ghost" onClick={() => remove(a._id)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!assignments.length && (
                <tr>
                  <td colSpan={5} className="tw-muted">
                    No assignments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {holidays.length ? (
          <div className="tw-panel">
            <h3>Upcoming events</h3>
            <ul className="tw-list">
              {holidays.map((h) => (
                <li key={h._id}>
                  <strong>{h.name}</strong>
                  <span>{h.date ? new Date(h.date).toLocaleDateString() : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <form className="tw-form" onSubmit={submit}>
        <h3>{editingId ? 'Edit assignment' : 'New assignment'}</h3>
        <label>
          Title
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Reading comprehension — chapter 4"
          />
        </label>
        <label>
          Subject
          <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="English" />
        </label>
        <label>
          Send to
          <select
            value={audience}
            onChange={(e) => {
              const next = e.target.value;
              setAudience(next);
              setForm((f) => ({
                ...f,
                kidIds: next === 'individuals' ? f.kidIds : [],
                grade: next === 'all' ? '' : f.grade,
              }));
            }}
          >
            <option value="all">All classes</option>
            <option value="class">One class</option>
            <option value="individuals">Individual students</option>
          </select>
        </label>
        {audience !== 'all' && (
          <label>
            Class
            <select
              value={form.grade}
              onChange={(e) => setForm({ ...form, grade: e.target.value, kidIds: audience === 'individuals' ? [] : form.kidIds })}
            >
              <option value="">{audience === 'individuals' ? 'All classes (filter)' : 'Select class'}</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        )}
        {audience === 'individuals' && (
          <fieldset className="diary-kids">
            <legend>Students</legend>
            {(form.grade ? kids.filter((k) => k.grade === form.grade) : kids).map((k) => {
              const on = form.kidIds.includes(k._id);
              return (
                <label key={k._id} className="diary-kid-row">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setForm((f) => ({
                      ...f,
                      kidIds: on ? f.kidIds.filter((id) => id !== k._id) : [...f.kidIds, k._id],
                    }))}
                  />
                  {k.name}{k.grade ? ` · ${k.grade}` : ''}
                </label>
              );
            })}
            {!kids.length && <p className="tw-empty">No students found.</p>}
          </fieldset>
        )}
        <label>
          Due date
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </label>
        <label>
          Instructions
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What should students do, and how should they submit?"
          />
        </label>
        <label>
          Status
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="published">Publish now</option>
            <option value="draft">Save as draft</option>
          </select>
        </label>
        <div className="tw-inline-actions">
          <button className="tw-btn tw-btn-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : editingId ? 'Save changes' : form.status === 'draft' ? 'Save draft' : 'Post assignment'}
          </button>
          {editingId ? (
            <button
              type="button"
              className="tw-btn tw-btn-ghost"
              onClick={() => {
                setEditingId('');
                setAudience('class');
                setForm(empty);
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
