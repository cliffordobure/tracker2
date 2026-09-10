import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const KINDS = [
  { value: 'important', label: 'Important' },
  { value: 'general', label: 'General' },
  { value: 'information', label: 'Information' },
  { value: 'event', label: 'Event' },
  { value: 'reminder', label: 'Reminder' },
];

const empty = { title: '', body: '', kind: 'general', grade: '', audience: 'Parents' };
const PAGE_SIZE = 4;

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
    case 'megaphone':
      return (
        <svg {...iconProps}>
          <path d="M5 10v4h3l5 4V6L8 10H5Z" />
          <path d="M16 9.5a3 3 0 0 1 0 5" />
        </svg>
      );
    case 'doc':
      return (
        <svg {...iconProps}>
          <path d="M7 4h8l4 4v12H7V4Z" />
          <path d="M15 4v4h4" />
        </svg>
      );
    case 'cap':
      return (
        <svg {...iconProps}>
          <path d="M3 10 12 5l9 5-9 5-9-5Z" />
          <path d="M7 12.5v4.2c2 1.6 8 1.6 10 0V12.5" />
        </svg>
      );
    case 'cal':
      return (
        <svg {...iconProps}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </svg>
      );
    case 'box':
      return (
        <svg {...iconProps}>
          <path d="M4 8 12 4l8 4-8 4-8-4Z" />
          <path d="M4 8v8l8 4 8-4V8" />
        </svg>
      );
    case 'people':
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 18c.6-3 2.6-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...iconProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'clip':
      return (
        <svg {...iconProps}>
          <path d="m15 8-6.8 6.8a2.4 2.4 0 0 0 3.4 3.4L19 11.8a4 4 0 0 0-5.7-5.7L6.5 13" />
        </svg>
      );
    case 'send':
      return (
        <svg {...iconProps}>
          <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
        </svg>
      );
    case 'save':
      return (
        <svg {...iconProps}>
          <path d="M5 5h11l3 3v11H5V5Z" />
          <path d="M8 5v5h7V5M8 19v-5h8v5" />
        </svg>
      );
    case 'upload':
      return (
        <svg {...iconProps}>
          <path d="M12 16V6M8 9l4-4 4 4M5 19h14" />
        </svg>
      );
    default:
      return null;
  }
}

function kindIcon(kind) {
  if (kind === 'event') return 'cal';
  if (kind === 'information') return 'cap';
  if (kind === 'reminder') return 'clock';
  if (kind === 'important') return 'megaphone';
  return 'doc';
}

function kindTone(kind) {
  if (kind === 'event') return 'orange';
  if (kind === 'information') return 'purple';
  if (kind === 'reminder') return 'blue';
  if (kind === 'important') return 'rose';
  return 'mint';
}

export default function TeacherAnnouncements() {
  const { showToast } = useAuth();
  const [params] = useSearchParams();
  const [items, setItems] = useState([]);
  const [grades, setGrades] = useState([]);
  const [scope, setScope] = useState('all');
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const load = async () => {
    const qs = new URLSearchParams();
    if (archived) qs.set('archived', '1');
    if (scope === 'school' || scope === 'class' || scope === 'mine') qs.set('scope', scope);
    const needle = q.trim() || params.get('q') || '';
    if (needle) qs.set('q', needle);
    const data = await api(`/teacher/announcements?${qs}`);
    setItems(data.announcements || []);
    setGrades(data.grades || []);
    setForm((f) => ({ ...f, grade: f.grade || data.grades?.[0] || '' }));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, archived]);

  const headerQ = (params.get('q') || '').trim().toLowerCase();

  const visible = useMemo(() => {
    const needle = (q.trim() || headerQ).toLowerCase();
    const rows = items.filter((a) => {
      if (scope === 'mine' && !a.mine) return false;
      if (!needle) return true;
      return `${a.title} ${a.body} ${a.grade} ${a.authorName}`.toLowerCase().includes(needle);
    });
    rows.sort((a, b) => {
      const da = new Date(a.publishedAt || a.createdAt || 0);
      const db = new Date(b.publishedAt || b.createdAt || 0);
      return sortBy === 'oldest' ? da - db : db - da;
    });
    return rows;
  }, [items, scope, q, headerQ, sortBy]);

  const stats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    return {
      total: items.length,
      week: items.filter((a) => new Date(a.publishedAt || a.createdAt || 0).getTime() >= weekAgo).length,
      parents: items.filter((a) => String(a.audience || '').toLowerCase().includes('parent') || !a.audience).length,
      archived: items.filter((a) => a.archived).length,
    };
  }, [items]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const slice = visible.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [scope, archived, q, headerQ, sortBy]);

  const save = async (draft = false) => {
    setBusy(true);
    setError('');
    try {
      let attachment = {};
      if (file) {
        const uploaded = await uploadFile(file, { folder: 'announcements' });
        attachment = {
          attachmentUrl: uploaded.url || '',
          attachmentName: uploaded.originalName || file.name,
          attachmentPublicId: uploaded.publicId || '',
        };
      }
      const payload = { ...form, ...attachment, draft };
      if (editingId) {
        await api(`/teacher/announcements/${editingId}`, { method: 'PUT', body: payload });
        showToast(draft ? 'Draft saved' : 'Announcement updated', 'success');
      } else {
        await api('/teacher/announcements', { method: 'POST', body: payload });
        showToast(draft ? 'Draft saved' : 'Class announcement posted. Parents were notified.', 'success');
      }
      setForm({ ...empty, grade: form.grade });
      setEditingId('');
      setFile(null);
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
    setMenuId('');
    document.getElementById('tanno-create')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const archive = async (a) => {
    await api(`/teacher/announcements/${a._id}/archive`, {
      method: 'POST',
      body: { archived: !a.archived },
    });
    setMenuId('');
    await load();
  };

  const format = (cmd) => {
    document.execCommand(cmd, false, null);
  };

  return (
    <div className="tanno">
      <div className="tanno-main">
        <div className="tanno-head">
          <div>
            <p className="tw-kicker">Teacher / Announcements</p>
            <h2>Announcements</h2>
            <p>School notices plus class announcements you send to parents.</p>
          </div>
          <div className="tanno-art" aria-hidden="true">
            <strong>Keep everyone informed</strong>
            <span>for a brighter learning community.</span>
            <em>📣</em>
          </div>
        </div>

        {error && <div className="tw-alert">{error}</div>}

        <div className="tanno-stats">
          <article className="tanno-stat tanno-stat--mint">
            <span><Icon name="doc" /></span>
            <div>
              <strong>{stats.total}</strong>
              <small>Total announcements</small>
              <em>All time</em>
            </div>
          </article>
          <article className="tanno-stat tanno-stat--blue">
            <span><Icon name="clock" /></span>
            <div>
              <strong>{stats.week}</strong>
              <small>This week</small>
              <em>Recently posted</em>
            </div>
          </article>
          <article className="tanno-stat tanno-stat--rose">
            <span><Icon name="people" /></span>
            <div>
              <strong>{stats.parents}</strong>
              <small>Sent to parents</small>
              <em>Reached parents</em>
            </div>
          </article>
          <article className="tanno-stat tanno-stat--orange">
            <span><Icon name="box" /></span>
            <div>
              <strong>{archived ? stats.total : stats.archived}</strong>
              <small>Archived</small>
              <em>Hidden from list</em>
            </div>
          </article>
        </div>

        <div className="tanno-filters">
          <label className="tanno-search">
            <Icon name="search" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => load().catch((e) => setError(e.message))}
              placeholder="Search announcements..."
            />
          </label>
          <div className="tanno-pills">
            {[
              ['all', 'All'],
              ['school', 'School'],
              ['class', 'My class'],
              ['mine', 'Posted by me'],
            ].map(([id, label]) => (
              <button key={id} type="button" className={scope === id ? 'is-on' : ''} onClick={() => setScope(id)}>
                {label}
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="latest">Latest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <label className="tanno-check">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          Show archived
        </label>

        <div className="tanno-list">
          {slice.map((a) => (
            <article key={a._id} className="tanno-row">
              <span className={`tanno-ico is-${kindTone(a.kind)}`}>
                <Icon name={kindIcon(a.kind)} />
              </span>
              <div>
                <div className="tanno-row-top">
                  <em>{a.kind || 'General'}</em>
                  <strong>{a.title}</strong>
                </div>
                <p>{a.body}</p>
                <small>
                  {a.authorName || 'School'}
                  {a.publishedAt ? ` · ${new Date(a.publishedAt).toLocaleString()}` : ''}
                  {a.draft ? ' · Draft' : ''}
                </small>
              </div>
              <span className="tanno-badge">{a.scope === 'class' ? a.grade || 'Class' : 'School'}</span>
              <div className="tanno-menu">
                <button type="button" aria-label="More" onClick={() => setMenuId(menuId === a._id ? '' : a._id)}>⋯</button>
                {menuId === a._id && a.mine && (
                  <div className="tanno-menu-pop">
                    <button type="button" onClick={() => startEdit(a)}>Edit</button>
                    <button type="button" onClick={() => archive(a)}>{a.archived ? 'Restore' : 'Archive'}</button>
                  </div>
                )}
              </div>
            </article>
          ))}
          {!slice.length && <p className="tw-empty">No announcements in this view.</p>}
          <div className="tanno-pager">
            <small>
              Showing {visible.length ? (pageSafe - 1) * PAGE_SIZE + 1 : 0} to {Math.min(pageSafe * PAGE_SIZE, visible.length)} of {visible.length} announcements
            </small>
            <div>
              <button type="button" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>‹</button>
              <strong>{pageSafe}</strong>
              <button type="button" disabled={pageSafe >= pages} onClick={() => setPage(pageSafe + 1)}>›</button>
            </div>
          </div>
        </div>
      </div>

      <form
        id="tanno-create"
        className="tanno-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        <div className="tanno-form-head">
          <span><Icon name="doc" /></span>
          <div>
            <h3>{editingId ? 'Edit announcement' : 'New class announcement'}</h3>
            <p>Send a notice to your class, school or parents.</p>
          </div>
        </div>
        <label className="tanno-field">
          Title *
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Enter a clear title" />
        </label>
        <label className="tanno-field">
          Message *
          <textarea
            required
            rows={5}
            maxLength={1000}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Write your announcement here..."
          />
        </label>
        <div className="tanno-editor">
          <button type="button" onClick={() => format('bold')}><b>B</b></button>
          <button type="button" onClick={() => format('italic')}><i>I</i></button>
          <button type="button" onClick={() => format('insertUnorderedList')}>≡</button>
          <button type="button" onClick={() => format('insertOrderedList')}>≣</button>
          <span>{form.body.length}/1000</span>
        </div>
        <div className="tanno-two">
          <label className="tanno-field">
            Kind
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </label>
          <label className="tanno-field">
            Class
            <select required value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
              {grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="tanno-field">
          Audience
          <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
            <option>Parents</option>
            <option>Students</option>
            <option>Parents & Students</option>
          </select>
        </label>
        <label
          className={`tanno-drop${dragOver ? ' is-over' : ''}`}
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
        <button className="tanno-btn tanno-btn--teal" type="submit" disabled={busy}>
          <Icon name="send" /> {busy ? 'Saving…' : editingId ? 'Save changes' : 'Post announcement'}
        </button>
        <button type="button" className="tanno-btn tanno-btn--ghost" disabled={busy} onClick={() => save(true)}>
          <Icon name="save" /> Save as draft
        </button>
        {editingId ? (
          <button type="button" className="tanno-btn tanno-btn--ghost" onClick={() => { setEditingId(''); setForm({ ...empty, grade: form.grade }); setFile(null); }}>
            Cancel
          </button>
        ) : null}
        <div className="tanno-tip">
          <span aria-hidden="true">💡</span>
          <p>Tip: Clear and timely communication helps parents stay engaged and supports student success.</p>
        </div>
      </form>
    </div>
  );
}
