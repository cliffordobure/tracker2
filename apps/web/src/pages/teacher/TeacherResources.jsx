import { useEffect, useState } from 'react';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const emptyPlan = {
  title: '',
  subject: '',
  grade: '',
  description: '',
  objectives: '',
  scheduledDate: '',
  durationMinutes: 40,
  status: 'draft',
};

export default function TeacherResources() {
  const { showToast } = useAuth();
  const [tab, setTab] = useState('plans');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(emptyPlan);
  const [editingId, setEditingId] = useState('');
  const [resource, setResource] = useState({ title: '', subject: '', grade: '', description: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await api('/teacher/resources');
    setData(res);
    setForm((f) => ({ ...f, grade: f.grade || res.grades?.[0] || '' }));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const savePlan = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        await api(`/teacher/lesson-plans/${editingId}`, { method: 'PUT', body: form });
      } else {
        await api('/teacher/lesson-plans', { method: 'POST', body: form });
      }
      setForm({ ...emptyPlan, grade: form.grade });
      setEditingId('');
      showToast('Lesson plan saved', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (p) => {
    setEditingId(p._id);
    setForm({
      title: p.title || '',
      subject: p.subject || '',
      grade: p.grade || '',
      description: p.description || '',
      objectives: p.objectives || '',
      scheduledDate: p.scheduledDate ? String(p.scheduledDate).slice(0, 10) : '',
      durationMinutes: p.durationMinutes || 40,
      status: p.status || 'draft',
    });
    setTab('plans');
  };

  const favoritePlan = async (p) => {
    await api(`/teacher/lesson-plans/${p._id}/favorite`, { method: 'POST', body: { favorite: !p.favorite } });
    await load();
  };

  const removePlan = async (p) => {
    if (!confirm('Remove this lesson plan?')) return;
    await api(`/teacher/lesson-plans/${p._id}`, { method: 'DELETE' });
    await load();
  };

  const uploadResource = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let uploaded = {};
      if (file) uploaded = await uploadFile(file, { folder: 'diary' });
      await api('/teacher/resources', {
        method: 'POST',
        body: {
          ...resource,
          url: uploaded.url || '',
          originalName: uploaded.originalName || file?.name || resource.title,
        },
      });
      setResource({ title: '', subject: '', grade: '', description: '' });
      setFile(null);
      showToast('Resource uploaded', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const favoriteResource = async (r) => {
    await api(`/teacher/resources/${r._id}/favorite`, { method: 'POST', body: { favorite: !r.favorite } });
    await load();
  };

  const plans = data?.lessonPlans || [];
  const shared = data?.shared || [];
  const mine = data?.mine || [];
  const favorites = data?.favorites || [];

  return (
    <div className="tw-split">
      <div className="tw-page">
        <div>
          <h2>Lesson plans & resources</h2>
          <p className="tw-lede">Plan lessons, keep drafts, and share teaching files with the class.</p>
        </div>
        {error && <div className="tw-alert">{error}</div>}
        <div className="tw-tabs">
          {[
            ['plans', 'My plans'],
            ['shared', 'Shared'],
            ['mine', 'My files'],
            ['favorites', 'Favorites'],
          ].map(([id, label]) => (
            <button key={id} type="button" className={`tw-tab ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'plans' &&
          plans.map((p) => (
            <article key={p._id} className="tw-note">
              <div className="tw-row-between">
                <span className="tw-pill">{p.status}</span>
                <small className="tw-muted">{p.subject || 'Subject'}</small>
              </div>
              <strong>{p.title}</strong>
              <p className="tw-muted">
                {p.grade || 'All classes'}
                {p.scheduledDate ? ` · ${new Date(p.scheduledDate).toLocaleDateString()}` : ''}
                {p.durationMinutes ? ` · ${p.durationMinutes} min` : ''}
              </p>
              {p.description ? <p className="tw-lede" style={{ margin: 0 }}>{p.description}</p> : null}
              <div className="tw-inline-actions">
                <button type="button" className="tw-btn tw-btn-ghost" onClick={() => startEdit(p)}>
                  Edit
                </button>
                <button type="button" className="tw-btn tw-btn-ghost" onClick={() => favoritePlan(p)}>
                  {p.favorite ? 'Unfavourite' : 'Favourite'}
                </button>
                <button type="button" className="tw-btn tw-btn-ghost" onClick={() => removePlan(p)}>
                  Remove
                </button>
              </div>
            </article>
          ))}

        {tab === 'shared' &&
          shared.map((r) => (
            <article key={r._id} className="tw-note">
              <strong>{r.title}</strong>
              <p className="tw-muted">{r.subject || r.fileType}</p>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  Open file
                </a>
              ) : null}
              <button type="button" className="tw-btn tw-btn-ghost" onClick={() => favoriteResource(r)}>
                {r.favorite ? 'Unfavourite' : 'Favourite'}
              </button>
            </article>
          ))}

        {tab === 'mine' &&
          mine.map((r) => (
            <article key={r._id} className="tw-note">
              <strong>{r.title}</strong>
              <p className="tw-muted">{r.originalName || r.fileType}</p>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  Open file
                </a>
              ) : null}
            </article>
          ))}

        {tab === 'favorites' &&
          favorites.map((r) => (
            <article key={r._id} className="tw-note">
              <strong>{r.title}</strong>
              <p className="tw-muted">{r.itemType === 'plan' ? 'Lesson plan' : 'Resource'}</p>
            </article>
          ))}

        {((tab === 'plans' && !plans.length) ||
          (tab === 'shared' && !shared.length) ||
          (tab === 'mine' && !mine.length) ||
          (tab === 'favorites' && !favorites.length)) && <p className="tw-empty">Nothing in this list yet.</p>}
      </div>

      <div className="tw-page">
        <form className="tw-form" onSubmit={savePlan}>
          <h3>{editingId ? 'Edit lesson plan' : 'New lesson plan'}</h3>
          <label>
            Title
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            Subject
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </label>
          <label>
            Class
            <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
              <option value="">Any class</option>
              {(data?.grades || []).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
          </label>
          <label>
            Duration (minutes)
            <input type="number" min="0" max="240" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
          </label>
          <label>
            Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="draft">Draft</option>
              <option value="planned">Planned</option>
              <option value="in_progress">In progress</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label>
            Description
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label>
            Objectives
            <textarea rows={3} value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} />
          </label>
          <button className="tw-btn tw-btn-primary" disabled={busy}>
            {editingId ? 'Save plan' : 'Create plan'}
          </button>
        </form>

        <form className="tw-form" onSubmit={uploadResource}>
          <h3>Upload resource</h3>
          <label>
            Title
            <input required value={resource.title} onChange={(e) => setResource({ ...resource, title: e.target.value })} />
          </label>
          <label>
            Subject
            <input value={resource.subject} onChange={(e) => setResource({ ...resource, subject: e.target.value })} />
          </label>
          <label>
            File
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button className="tw-btn tw-btn-secondary" disabled={busy}>
            Upload
          </button>
        </form>
      </div>
    </div>
  );
}
