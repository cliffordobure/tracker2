import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const KINDS = [
  { value: 'important', label: 'Important' },
  { value: 'general', label: 'General' },
  { value: 'information', label: 'Information' },
  { value: 'event', label: 'Event' },
  { value: 'reminder', label: 'Reminder' },
];

const empty = { title: '', body: '', kind: 'general', grade: '', audience: 'Parents' };

export default function TeacherAnnouncements() {
  const { showToast } = useAuth();
  const [items, setItems] = useState([]);
  const [grades, setGrades] = useState([]);
  const [scope, setScope] = useState('all');
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const params = new URLSearchParams();
    if (archived) params.set('archived', '1');
    if (scope === 'school' || scope === 'class') params.set('scope', scope);
    if (q.trim()) params.set('q', q.trim());
    const data = await api(`/teacher/announcements?${params}`);
    setItems(data.announcements || []);
    setGrades(data.grades || []);
    setForm((f) => ({ ...f, grade: f.grade || data.grades?.[0] || '' }));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, archived]);

  const visible = useMemo(() => {
    if (scope === 'mine') return items.filter((a) => a.mine);
    return items;
  }, [items, scope]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editingId) {
        await api(`/teacher/announcements/${editingId}`, { method: 'PUT', body: form });
        showToast('Announcement updated', 'success');
      } else {
        await api('/teacher/announcements', { method: 'POST', body: form });
        showToast('Class announcement posted. Parents were notified.', 'success');
      }
      setForm({ ...empty, grade: form.grade });
      setEditingId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (a) => {
    setEditingId(a._id);
    setForm({
      title: a.title || '',
      body: a.body || '',
      kind: a.kind || 'general',
      grade: a.grade || grades[0] || '',
      audience: a.audience || 'Parents',
    });
  };

  const archive = async (a) => {
    await api(`/teacher/announcements/${a._id}/archive`, {
      method: 'POST',
      body: { archived: !a.archived },
    });
    await load();
  };

  return (
    <div className="tw-split">
      <div className="tw-page">
        <div>
          <h2>Announcements</h2>
          <p className="tw-lede">School notices plus class announcements you send to parents.</p>
        </div>
        {error && <div className="tw-alert">{error}</div>}
        <div className="tw-toolbar">
          <label>
            Search
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => load().catch((e) => setError(e.message))}
              placeholder="Search title or body"
            />
          </label>
          <div className="tw-tabs">
            {[
              ['all', 'All'],
              ['school', 'School'],
              ['class', 'My class'],
              ['mine', 'Posted by me'],
            ].map(([id, label]) => (
              <button key={id} type="button" className={`tw-tab ${scope === id ? 'is-on' : ''}`} onClick={() => setScope(id)}>
                {label}
              </button>
            ))}
          </div>
          <label className="tw-check">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            Archived
          </label>
        </div>
        {visible.map((a) => (
          <article key={a._id} className="tw-note">
            <div className="tw-row-between">
              <span className="tw-pill">{a.kind}</span>
              <small className="tw-muted">{a.scope === 'class' ? a.grade || 'Class' : 'School'}</small>
            </div>
            <strong>{a.title}</strong>
            <p className="tw-lede" style={{ margin: 0 }}>
              {a.body}
            </p>
            <small className="tw-muted">
              {a.authorName || 'School'}
              {a.publishedAt ? ` · ${new Date(a.publishedAt).toLocaleString()}` : ''}
            </small>
            {a.mine ? (
              <div className="tw-inline-actions">
                <button type="button" className="tw-btn tw-btn-ghost" onClick={() => startEdit(a)}>
                  Edit
                </button>
                <button type="button" className="tw-btn tw-btn-ghost" onClick={() => archive(a)}>
                  {a.archived ? 'Restore' : 'Archive'}
                </button>
              </div>
            ) : null}
          </article>
        ))}
        {!visible.length && <p className="tw-empty">No announcements in this view.</p>}
      </div>

      <form className="tw-form" onSubmit={submit}>
        <h3>{editingId ? 'Edit announcement' : 'New class announcement'}</h3>
        <label>
          Title
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          Message
          <textarea required rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </label>
        <label>
          Kind
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Class
          <select required value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label>
          Audience
          <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
            <option>Parents</option>
            <option>Students</option>
            <option>Parents & Students</option>
          </select>
        </label>
        <div className="tw-inline-actions">
          <button className="tw-btn tw-btn-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : editingId ? 'Save changes' : 'Post announcement'}
          </button>
          {editingId ? (
            <button
              type="button"
              className="tw-btn tw-btn-ghost"
              onClick={() => {
                setEditingId('');
                setForm({ ...empty, grade: form.grade });
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
