import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const empty = {
  title: '',
  subject: '',
  grade: '',
  description: '',
  dueDate: '',
};

export default function TeacherAssignments() {
  const { showToast } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [grades, setGrades] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [a, k] = await Promise.all([api('/teacher/assignments'), api('/teacher/kids')]);
    setAssignments(a.assignments || []);
    setGrades(k.grades || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/teacher/assignments', { method: 'POST', body: form });
      setForm(empty);
      showToast('Assignment posted. Parents have been notified.', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
          <h2>Assignments</h2>
          <p className="tw-lede">
            Set class work. Parents of the matching students are notified when you post.
          </p>
        </div>
        {error && <div className="tw-alert">{error}</div>}
        <div className="tw-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Class</th>
                <th>Due</th>
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
                  <td>{a.grade || 'All grades'}</td>
                  <td>{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}</td>
                  <td>
                    <button type="button" className="tw-btn tw-btn-ghost" onClick={() => remove(a._id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!assignments.length && (
                <tr>
                  <td colSpan={4} className="tw-muted">
                    No assignments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form className="tw-form" onSubmit={submit}>
        <h3>New assignment</h3>
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
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="English"
          />
        </label>
        <label>
          Grade / class
          <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
            <option value="">All grades</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          />
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
        <button className="tw-btn tw-btn-primary" type="submit" disabled={busy}>
          {busy ? 'Posting…' : 'Post assignment'}
        </button>
      </form>
    </div>
  );
}
