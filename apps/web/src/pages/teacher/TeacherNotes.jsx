import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const empty = { kidId: '', category: 'general', title: '', body: '' };
const BODY_MAX = 1000;
const TYPES = [
  { value: 'general', label: 'General' },
  { value: 'academic', label: 'Academic' },
  { value: 'behaviour', label: 'Behaviour' },
  { value: 'health', label: 'Health' },
  { value: 'urgent', label: 'Urgent' },
];

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
    case 'people':
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 18c.6-3 2.6-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
          <circle cx="17" cy="8.5" r="2.2" />
          <path d="M16 13.6c2 .3 3.6 1.6 4.2 4.4" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...iconProps}>
          <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H8l-4 3v-5.2A8.5 8.5 0 1 1 21 12Z" />
        </svg>
      );
    case 'send':
      return (
        <svg {...iconProps}>
          <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
        </svg>
      );
    case 'search':
      return (
        <svg {...iconProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...iconProps}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'pencil':
      return (
        <svg {...iconProps}>
          <path d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Z" />
          <path d="m13.2 7.3 3.5 3.5" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...iconProps}>
          <path d="M12 3.5 19 6.2v5.4c0 4.4-2.8 7.4-7 8.9-4.2-1.5-7-4.5-7-8.9V6.2L12 3.5Z" />
          <path d="m9 12 2.1 2.1L15.5 10" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...iconProps}>
          <path d="M5 19V9.5M10 19V5M15 19v-6.5M20 19V8" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...iconProps}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    default:
      return null;
  }
}

function kidIdOf(note) {
  return String(note.kidId?._id || note.kidId || '');
}

export default function TeacherNotes() {
  const { showToast } = useAuth();
  const [params] = useSearchParams();
  const [kids, setKids] = useState([]);
  const [notes, setNotes] = useState([]);
  const [form, setForm] = useState({ ...empty, kidId: params.get('kidId') || '' });
  const [q, setQ] = useState('');
  const [kidFilter, setKidFilter] = useState(params.get('kidId') || '');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('latest');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const headerQ = (params.get('q') || '').trim().toLowerCase();

  const load = async () => {
    const [k, n] = await Promise.all([api('/teacher/kids'), api('/teacher/notes')]);
    setKids(k.kids || []);
    setNotes(n.notes || []);
    const fromUrl = params.get('kidId') || '';
    setForm((f) => ({ ...f, kidId: f.kidId || fromUrl }));
    if (fromUrl) setKidFilter((cur) => cur || fromUrl);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const notedKidIds = new Set(notes.map(kidIdOf).filter(Boolean));
  const parentIds = new Set();
  for (const kid of kids) {
    if (!notedKidIds.has(String(kid._id))) continue;
    for (const p of kid.parentIds || []) parentIds.add(String(p._id || p));
  }

  const stats = {
    total: notes.length,
    week: notes.filter((n) => new Date(n.createdAt).getTime() >= weekAgo).length,
    students: notedKidIds.size,
    parents: parentIds.size,
  };

  const filtered = useMemo(() => {
    const needle = (q.trim() || headerQ).toLowerCase();
    const rows = notes.filter((n) => {
      if (kidFilter && kidIdOf(n) !== kidFilter) return false;
      if (typeFilter !== 'all' && n.category !== typeFilter) return false;
      if (!needle) return true;
      return `${n.title} ${n.body} ${n.kidId?.name || ''} ${n.category}`.toLowerCase().includes(needle);
    });
    rows.sort((a, b) => {
      const da = new Date(a.createdAt) - new Date(b.createdAt);
      return sortBy === 'oldest' ? da : -da;
    });
    return rows;
  }, [notes, q, headerQ, kidFilter, typeFilter, sortBy]);

  const focusForm = () => {
    document.getElementById('tnote-create')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('tnote-student')?.focus();
  };

  return (
    <div className="tnote">
      <div className="tnote-main">
        <div className="tnote-head">
          <div>
            <p className="tw-kicker">Teacher / Parent notes</p>
            <div className="tnote-title">
              <span className="tnote-title-ico"><Icon name="people" /></span>
              <div>
                <h2>Parent notes</h2>
                <p>
                  Send a note about a student — behaviour, classwork, health, or anything the guardian should know.
                  For two-way chat, use <Link to="/teacher/messages">Messages</Link>.
                </p>
              </div>
            </div>
          </div>
          <div className="tnote-art" aria-hidden="true">
            <svg width="120" height="72" viewBox="0 0 120 72" fill="none">
              <path d="M18 58c8-18 20-22 28-8 6-16 20-18 28-4 4-10 16-12 22 2" stroke="#86efac" strokeWidth="6" strokeLinecap="round" />
              <circle cx="42" cy="28" r="8" fill="#0f766e" />
              <circle cx="62" cy="26" r="9" fill="#14b8a6" />
              <circle cx="80" cy="32" r="6" fill="#0f766e" />
              <path d="M28 58c2-12 8-16 14-16s12 4 14 16" fill="#99f6e4" />
              <path d="M50 58c2-14 10-18 16-18s14 4 16 18" fill="#5eead4" />
              <path d="M72 58c1-10 6-13 10-13s8 3 10 13" fill="#99f6e4" />
              <path d="M96 18c6 0 6 8 0 8-6 0-6-8 0-8Z" fill="#fb7185" />
              <path d="M108 22c5 0 5 7 0 7-5 0-5-7 0-7Z" fill="#f9a8d4" />
            </svg>
            <strong>Good communication creates brighter futures.</strong>
            <small>Together we support every learner.</small>
          </div>
        </div>

        {error && <div className="tw-alert">{error}</div>}

        <div className="tnote-stats">
          <article>
            <span className="is-mint"><Icon name="chat" /></span>
            <div>
              <strong>{stats.total}</strong>
              <small>Total notes</small>
              <em>All time</em>
            </div>
          </article>
          <article>
            <span className="is-blue"><Icon name="send" /></span>
            <div>
              <strong>{stats.week}</strong>
              <small>Sent this week</small>
            </div>
          </article>
          <article>
            <span className="is-purple"><Icon name="people" /></span>
            <div>
              <strong>{stats.students}</strong>
              <small>Students</small>
              <em>Have notes</em>
            </div>
          </article>
          <article>
            <span className="is-orange"><Icon name="people" /></span>
            <div>
              <strong>{stats.parents}</strong>
              <small>Parents</small>
              <em>Notified</em>
            </div>
          </article>
        </div>

        <div className="tnote-filters">
          <label className="tnote-search">
            <Icon name="search" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes..." />
          </label>
          <select value={kidFilter} onChange={(e) => setKidFilter(e.target.value)}>
            <option value="">All students</option>
            {kids.map((k) => (
              <option key={k._id} value={k._id}>{k.name}{k.grade ? ` · ${k.grade}` : ''}</option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="latest">Latest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        <section className="tnote-board">
          {filtered.length ? (
            <div className="tnote-list">
              {filtered.map((n) => (
                <article key={n._id}>
                  <em>{n.category}</em>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>{n.kidId?.name || 'Student'} · {new Date(n.createdAt).toLocaleString()}</small>
                </article>
              ))}
            </div>
          ) : notes.length ? (
            <p className="tw-empty">No notes in this view.</p>
          ) : (
            <div className="tnote-empty">
              <div className="tnote-empty-art" aria-hidden="true">
                <svg width="120" height="96" viewBox="0 0 120 96" fill="none">
                  <path d="M22 70c10-16 22-14 28-2 8-18 24-16 30 2" stroke="#bbf7d0" strokeWidth="8" strokeLinecap="round" />
                  <rect x="38" y="22" width="44" height="54" rx="6" fill="#e8f7f1" stroke="#0f766e" strokeWidth="2" />
                  <path d="M48 38h24M48 48h18M48 58h14" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" />
                  <path d="M78 18l18-8 6 14-18 8-6-14Z" fill="#0f766e" />
                  <path d="M84 16l4 9" stroke="#99f6e4" strokeWidth="2" />
                  <circle cx="96" cy="14" r="3" fill="#fbbf24" />
                </svg>
              </div>
              <strong>No parent notes yet</strong>
              <p>Keep parents informed about their child&apos;s progress, behaviour, classwork, or well-being.</p>
              <button type="button" className="tnote-btn tnote-btn--teal tnote-btn--auto" onClick={focusForm}>
                <Icon name="plus" /> Send your first note
              </button>
              <div className="tnote-tip">
                <span aria-hidden="true">💡</span>
                Tip: Regular communication with parents helps build trust and supports student success.
              </div>
            </div>
          )}
        </section>

        <div className="tnote-cards">
          <Link to="/teacher/students" className="tnote-card">
            <span className="is-mint"><Icon name="people" /></span>
            <div>
              <strong>Build stronger partnerships</strong>
              <p>Keep parents informed and involved in their child&apos;s learning.</p>
            </div>
            <Icon name="arrow" />
          </Link>
          <Link to="/teacher/messages" className="tnote-card">
            <span className="is-purple"><Icon name="chat" /></span>
            <div>
              <strong>Use Messages for chat</strong>
              <p>For two-way communication, use the Messages feature.</p>
            </div>
            <Icon name="arrow" />
          </Link>
          <Link to="/teacher/reports" className="tnote-card">
            <span className="is-orange"><Icon name="chart" /></span>
            <div>
              <strong>Track student progress</strong>
              <p>Notes are saved and can be viewed in student records.</p>
            </div>
            <Icon name="arrow" />
          </Link>
        </div>
      </div>

      <form id="tnote-create" className="tnote-form" onSubmit={submit}>
        <div className="tnote-form-head">
          <span><Icon name="pencil" /></span>
          <div>
            <h3>New parent note</h3>
            <p>Send an update to a parent or guardian.</p>
          </div>
        </div>
        <label className="tnote-field">
          Student <i>*</i>
          <select
            id="tnote-student"
            required
            value={form.kidId}
            onChange={(e) => setForm({ ...form, kidId: e.target.value })}
          >
            <option value="">Select a student</option>
            {kids.map((k) => (
              <option key={k._id} value={k._id}>
                {k.name}{k.grade ? ` · ${k.grade}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="tnote-field">
          Type <i>*</i>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="tnote-field">
          Title <i>*</i>
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Forgot homework / Doing well in maths"
          />
        </label>
        <label className="tnote-field">
          Message to parent <i>*</i>
          <textarea
            required
            rows={6}
            maxLength={BODY_MAX}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Write what the parent should know..."
          />
        </label>
        <small className="tnote-count">{form.body.length}/{BODY_MAX}</small>
        <div className="tnote-form-tip">
          <span><Icon name="shield" /></span>
          <p>Be kind, clear and constructive. Your message helps support the student&apos;s growth.</p>
        </div>
        <button className="tnote-btn tnote-btn--teal" type="submit" disabled={busy || !form.kidId}>
          <Icon name="send" /> {busy ? 'Sending…' : 'Send to parent'}
        </button>
      </form>
    </div>
  );
}
