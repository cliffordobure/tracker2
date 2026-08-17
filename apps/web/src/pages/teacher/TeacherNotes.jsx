import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const empty = {
  kidId: '',
  category: 'general',
  title: '',
  body: '',
};

export default function TeacherNotes() {
  const { showToast } = useAuth();
  const [kids, setKids] = useState([]);
  const [notes, setNotes] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [k, n] = await Promise.all([api('/teacher/kids'), api('/teacher/notes')]);
    setKids(k.kids || []);
    setNotes(n.notes || []);
    setForm((f) => ({ ...f, kidId: f.kidId || k.kids?.[0]?._id || '' }));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/teacher/notes', { method: 'POST', body: form });
      setForm((f) => ({ ...f, title: '', body: '' }));
      showToast('Parents have been notified.', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="split">
      <div className="stack">
        <div>
          <h2>Update a parent</h2>
          <p className="lede">
            Send a note about a student — behaviour, classwork, health, or anything the guardian
            should know. It appears in the parent app alerts.
          </p>
        </div>
        {error && <div className="alert">{error}</div>}
        <ul className="notif-list">
          {notes.map((n) => (
            <li key={n._id}>
              <span className="pill">{n.category}</span>
              <strong>{n.title}</strong>
              <p>{n.body}</p>
              <small>
                {n.kidId?.name || 'Student'} · {new Date(n.createdAt).toLocaleString()}
              </small>
            </li>
          ))}
          {!notes.length && <li className="muted">No parent updates yet.</li>}
        </ul>
      </div>

      <form className="card-form" onSubmit={submit}>
        <h3>New note</h3>
        <label>
          Student
          <select
            required
            value={form.kidId}
            onChange={(e) => setForm({ ...form, kidId: e.target.value })}
          >
            {kids.map((k) => (
              <option key={k._id} value={k._id}>
                {k.name}
                {k.grade ? ` · ${k.grade}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="general">General</option>
            <option value="academic">Academic</option>
            <option value="behaviour">Behaviour</option>
            <option value="health">Health</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label>
          Title
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Forgot homework / not feeling well / doing well in maths"
          />
        </label>
        <label>
          Message to parent
          <textarea
            required
            rows={5}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Write what the parent should know…"
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy || !form.kidId}>
          {busy ? 'Sending…' : 'Send to parent'}
        </button>
      </form>
    </div>
  );
}
