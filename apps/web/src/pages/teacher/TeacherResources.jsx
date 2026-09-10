import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

const SUBJECTS = ['Mathematics', 'English', 'Science', 'Kiswahili', 'Social Studies', 'CRE', 'IRE', 'PE', 'Music', 'Art'];

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Icon({ name }) {
  switch (name) {
    case 'book':
      return (
        <svg {...iconProps}>
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Z" />
          <path d="M8 4v16" />
        </svg>
      );
    case 'people':
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 18c.6-3 2.6-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...iconProps}>
          <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H10l2 2h6.5A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-10Z" />
        </svg>
      );
    case 'star':
      return (
        <svg {...iconProps}>
          <path d="m12 4 2.1 4.3 4.7.7-3.4 3.3.8 4.7L12 15.2 7.8 17l.8-4.7L5.2 9l4.7-.7L12 4Z" />
        </svg>
      );
    case 'clip':
      return (
        <svg {...iconProps}>
          <path d="m15 8-6.8 6.8a2.4 2.4 0 0 0 3.4 3.4L19 11.8a4 4 0 0 0-5.7-5.7L6.5 13" />
        </svg>
      );
    case 'search':
      return (
        <svg {...iconProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'send':
      return (
        <svg {...iconProps}>
          <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
        </svg>
      );
    case 'upload':
      return (
        <svg {...iconProps}>
          <path d="M12 16V6M8 9l4-4 4 4M5 19h14" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...iconProps}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    default:
      return null;
  }
}

export default function TeacherResources() {
  const { showToast } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState('plans');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(emptyPlan);
  const [editingId, setEditingId] = useState('');
  const [resource, setResource] = useState({ title: '', subject: '', grade: '', description: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [tipOpen, setTipOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);

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
    setError('');
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
    document.getElementById('tplan-create')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    setError('');
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
  const templates = data?.templates || [];
  const grades = data?.grades || [];
  const subjects = [...new Set([...(data?.subjects || []), ...SUBJECTS])].sort();
  const headerQ = (params.get('q') || '').trim().toLowerCase();

  const visible = useMemo(() => {
    const rows =
      tab === 'plans' ? plans
        : tab === 'shared' ? shared
          : tab === 'mine' ? mine
            : favorites;
    const q = listQuery.trim().toLowerCase();
    const next = rows.filter((item) => {
      if (classFilter && item.grade !== classFilter) return false;
      if (subjectFilter && item.subject !== subjectFilter) return false;
      const hay = [item.title, item.subject, item.description, item.grade, item.originalName].join(' ').toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (headerQ && !hay.includes(headerQ)) return false;
      return true;
    });
    next.sort((a, b) => {
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'date') return new Date(a.scheduledDate || a.createdAt || 0) - new Date(b.scheduledDate || b.createdAt || 0);
      return new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0);
    });
    return next;
  }, [tab, plans, shared, mine, favorites, listQuery, classFilter, subjectFilter, sortBy, headerQ]);

  const todayLong = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const focusCreate = () => document.getElementById('tplan-create')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="tplan">
      <div className="tplan-main">
        <div className="tplan-head">
          <div>
            <p className="tw-kicker">Teacher / Lesson plans</p>
            <h2>Lesson Plans & Resources</h2>
            <p>Plan lessons, keep drafts, and share teaching files with your class.</p>
          </div>
          <div className="tplan-head-date">
            <strong>{todayLong}</strong>
            <small>A good plan today leads to better learning tomorrow.</small>
          </div>
        </div>

        {error && <div className="tw-alert">{error}</div>}

        <div className="tplan-stats">
          <article className="tplan-stat tplan-stat--mint">
            <span><Icon name="book" /></span>
            <div>
              <strong>{plans.length}</strong>
              <small>My plans</small>
              <em>Total lesson plans</em>
            </div>
          </article>
          <article className="tplan-stat tplan-stat--blue">
            <span><Icon name="people" /></span>
            <div>
              <strong>{shared.length}</strong>
              <small>Shared plans</small>
              <em>With other teachers</em>
            </div>
          </article>
          <article className="tplan-stat tplan-stat--orange">
            <span><Icon name="folder" /></span>
            <div>
              <strong>{mine.length}</strong>
              <small>Resources</small>
              <em>Files and materials</em>
            </div>
          </article>
          <article className="tplan-stat tplan-stat--purple">
            <span><Icon name="star" /></span>
            <div>
              <strong>{favorites.length}</strong>
              <small>Favorites</small>
              <em>Saved for later</em>
            </div>
          </article>
        </div>

        <div className="tplan-tabs">
          {[
            ['plans', 'My plans', 'book'],
            ['shared', 'Shared', 'people'],
            ['mine', 'My files', 'folder'],
            ['favorites', 'Favorites', 'star'],
          ].map(([id, label, icon]) => (
            <button key={id} type="button" className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
              <Icon name={icon} /> {label}
            </button>
          ))}
        </div>

        <section className="tplan-list">
          <div className="tplan-filters">
            <label className="tplan-search">
              <Icon name="search" />
              <input value={listQuery} onChange={(e) => setListQuery(e.target.value)} placeholder="Search lesson plans..." />
            </label>
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="latest">Latest first</option>
              <option value="date">By date</option>
              <option value="title">Title</option>
            </select>
          </div>

          {visible.map((item) => (
            <article key={item._id} className="tplan-row">
              <span className="tplan-row-ico"><Icon name={item.itemType === 'resource' || tab === 'mine' || tab === 'shared' ? 'folder' : 'book'} /></span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.description || item.subject || item.originalName || '—'}</p>
                <small>
                  {item.grade || 'All classes'}
                  {item.subject ? ` · ${item.subject}` : ''}
                  {item.scheduledDate ? ` · ${new Date(item.scheduledDate).toLocaleDateString()}` : ''}
                  {item.durationMinutes ? ` · ${item.durationMinutes} min` : ''}
                  {item.status ? ` · ${item.status}` : ''}
                </small>
              </div>
              <div className="tplan-row-actions">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer">Open</a>
                ) : null}
                {tab === 'plans' && (
                  <>
                    <button type="button" onClick={() => startEdit(item)}>Edit</button>
                    <button type="button" onClick={() => favoritePlan(item)}>{item.favorite ? 'Unfavourite' : 'Favourite'}</button>
                    <button type="button" onClick={() => removePlan(item)}>Remove</button>
                  </>
                )}
                {(tab === 'shared' || tab === 'mine') && (
                  <button type="button" onClick={() => favoriteResource(item)}>{item.favorite ? 'Unfavourite' : 'Favourite'}</button>
                )}
              </div>
            </article>
          ))}

          {!visible.length && (
            <div className="tplan-empty">
              <div className="tplan-empty-art" aria-hidden="true">📚💡</div>
              <strong>No lesson plans yet</strong>
              <p>Start creating lesson plans to organize your teaching and share resources with your class.</p>
              <button type="button" className="tplan-btn tplan-btn--teal" onClick={focusCreate}>
                <Icon name="plus" /> Create your first lesson plan
              </button>
            </div>
          )}

          {tipOpen && (
            <div className="tplan-tip">
              <span aria-hidden="true">🌱</span>
              <p>Tip: A well planned lesson makes learning more engaging and effective!</p>
              <button type="button" aria-label="Dismiss tip" onClick={() => setTipOpen(false)}>×</button>
            </div>
          )}
        </section>

        <div className="tplan-quick">
          <h3>Quick actions</h3>
          <div>
            <button type="button" onClick={() => { setTab('mine'); }}>
              <span className="is-mint"><Icon name="book" /></span>
              <strong>Lesson templates</strong>
              <small>{templates.length ? `${templates.length} ready-made plans` : 'Use ready-made planners'}</small>
            </button>
            <button type="button" onClick={() => setTab('mine')}>
              <span className="is-blue"><Icon name="folder" /></span>
              <strong>My resources</strong>
              <small>View uploaded files</small>
            </button>
            <button type="button" onClick={() => setTab('shared')}>
              <span className="is-purple"><Icon name="people" /></span>
              <strong>Shared with me</strong>
              <small>Resources from other teachers</small>
            </button>
            <button type="button" onClick={() => setTab('favorites')}>
              <span className="is-orange"><Icon name="star" /></span>
              <strong>Favorites</strong>
              <small>View saved items</small>
            </button>
          </div>
        </div>
      </div>

      <aside className="tplan-side">
        <form id="tplan-create" className="tplan-form" onSubmit={savePlan}>
          <div className="tplan-form-head">
            <span><Icon name="book" /></span>
            <div>
              <h3>{editingId ? 'Edit lesson plan' : 'Create new lesson plan'}</h3>
              <p>Plan a lesson, set objectives and save as draft or publish.</p>
            </div>
          </div>
          <label className="tplan-field">
            Title
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Introduction to Fractions" />
          </label>
          <div className="tplan-two">
            <label className="tplan-field">
              Subject
              <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                <option value="">Select subject</option>
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                {form.subject && !SUBJECTS.includes(form.subject) ? <option value={form.subject}>{form.subject}</option> : null}
              </select>
            </label>
            <label className="tplan-field">
              Class
              <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                <option value="">Select class</option>
                {grades.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          </div>
          <div className="tplan-two">
            <label className="tplan-field">
              Date
              <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
            </label>
            <label className="tplan-field">
              Duration (minutes)
              <input type="number" min="0" max="240" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
            </label>
          </div>
          <label className="tplan-field">
            Description
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Enter a brief description of the lesson..." />
          </label>
          <label className="tplan-field">
            Objectives
            <textarea rows={3} value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} placeholder="What should students learn from this lesson?" />
          </label>
          <div className="tplan-create-row">
            <label className="tplan-field">
              Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">Draft</option>
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="published">Published</option>
              </select>
            </label>
            <button className="tplan-btn tplan-btn--teal" disabled={busy}>
              <Icon name="send" />
              {editingId ? 'Save plan' : 'Create plan'}
            </button>
          </div>
          {editingId ? (
            <button type="button" className="tplan-btn tplan-btn--ghost" onClick={() => { setEditingId(''); setForm(emptyPlan); }}>
              Cancel
            </button>
          ) : null}
        </form>

        <form className="tplan-form" onSubmit={uploadResource}>
          <div className="tplan-form-head">
            <span><Icon name="clip" /></span>
            <div>
              <h3>Upload a resource</h3>
              <p>Share files, links or other learning materials.</p>
            </div>
          </div>
          <label className="tplan-field">
            Title
            <input required value={resource.title} onChange={(e) => setResource({ ...resource, title: e.target.value })} placeholder="e.g. Fractions worksheet" />
          </label>
          <label className="tplan-field">
            Subject
            <select value={resource.subject} onChange={(e) => setResource({ ...resource, subject: e.target.value })}>
              <option value="">Select subject</option>
              {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label
            className={`tplan-drop${dragOver ? ' is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              setFile(e.dataTransfer.files?.[0] || null);
            }}
          >
            <Icon name="upload" />
            <strong>{file ? file.name : 'Choose file or drag and drop'}</strong>
            <small>PDF, DOC, PPT, images (Max 10MB)</small>
            <input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button className="tplan-btn tplan-btn--mint" disabled={busy}>
            <Icon name="upload" /> Upload resource
          </button>
        </form>
      </aside>
    </div>
  );
}
