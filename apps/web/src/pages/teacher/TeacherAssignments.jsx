import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import AudiencePicker from '../../components/AudiencePicker';

const empty = {
  title: '',
  subject: '',
  grade: '',
  description: '',
  dueDate: '',
  status: 'published',
  kind: 'classwork',
  kidIds: [],
  media: [],
};

const SUBJECTS = ['Mathematics', 'English', 'Science', 'Kiswahili', 'Social Studies', 'CRE', 'IRE', 'PE', 'Music', 'Art'];
const KINDS = [
  { v: 'classwork', l: 'Class work' },
  { v: 'homework', l: 'Homework' },
  { v: 'quiz', l: 'Test / Quiz' },
];
const PAGE_SIZE = 8;

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
    case 'doc':
      return (
        <svg {...iconProps}>
          <path d="M7 4h8l4 4v12H7V4Z" />
          <path d="M15 4v4h4M9 13h6M9 17h4" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </svg>
      );
    case 'people':
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 18c.6-3 2.6-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
        </svg>
      );
    case 'cal':
      return (
        <svg {...iconProps}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
      );
    case 'book':
      return (
        <svg {...iconProps}>
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Z" />
          <path d="M8 4v16" />
        </svg>
      );
    case 'home':
      return (
        <svg {...iconProps}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case 'quiz':
      return (
        <svg {...iconProps}>
          <path d="M9 3h6l1 4H8L9 3Z" />
          <path d="M8 7h8v12a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V7Z" />
          <path d="M10 11h4M10 15h3" />
        </svg>
      );
    case 'plans':
      return (
        <svg {...iconProps}>
          <path d="M8 4h8v16H8z" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case 'announce':
      return (
        <svg {...iconProps}>
          <path d="M5 10v4h3l5 4V6L8 10H5Z" />
          <path d="M16 9.5a3 3 0 0 1 0 5" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...iconProps}>
          <path d="M5 19V9.5M10 19V5M15 19v-6.5M20 19V8" />
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

function kindIcon(kind) {
  if (kind === 'homework') return 'home';
  if (kind === 'quiz') return 'quiz';
  return 'book';
}

export default function TeacherAssignments() {
  const { showToast } = useAuth();
  const [params] = useSearchParams();
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
  const [uploading, setUploading] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [page, setPage] = useState(1);
  const [openMenu, setOpenMenu] = useState('');
  const [viewId, setViewId] = useState('');

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

  const studentCount = (a) => {
    const targeted = Array.isArray(a.kidIds) ? a.kidIds : [];
    if (targeted.length) return targeted.length;
    if (a.grade) return kids.filter((k) => k.grade === a.grade).length;
    return kids.length;
  };

  const headerQuery = (params.get('q') || '').trim().toLowerCase();

  const filtered = useMemo(() => {
    const rows = assignments.filter((a) => {
      if (classFilter && assignmentAudience(a) !== classFilter && a.grade !== classFilter) return false;
      if (statusFilter && (a.status || 'published') !== statusFilter) return false;
      const hay = [a.title, a.subject, a.description, a.grade, assignmentAudience(a)].join(' ').toLowerCase();
      if (headerQuery && !hay.includes(headerQuery)) return false;
      if (listQuery.trim() && !hay.includes(listQuery.trim().toLowerCase())) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'due') return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    return rows;
  }, [assignments, classFilter, statusFilter, sortBy, headerQuery, listQuery]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const slice = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [headerQuery, listQuery, classFilter, statusFilter, sortBy]);

  const addFiles = async (files) => {
    const remaining = 8 - form.media.length;
    const batch = [...files].slice(0, remaining);
    if (!batch.length) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of batch) uploaded.push(await uploadFile(file, { folder: 'assignments' }));
      setForm((f) => ({ ...f, media: [...f.media, ...uploaded] }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async (status) => {
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        status,
        grade: audience === 'all' ? '' : form.grade,
        kidIds: audience === 'individuals' ? form.kidIds : [],
      };
      if (audience === 'class' && !payload.grade) {
        setError('Pick a class, or send to specific students');
        setBusy(false);
        return;
      }
      if (audience === 'individuals' && !payload.kidIds.length) {
        setError('Pick at least one student');
        setBusy(false);
        return;
      }
      if (editingId) {
        await api(`/teacher/assignments/${editingId}`, { method: 'PUT', body: payload });
        showToast('Assignment updated', 'success');
      } else {
        await api('/teacher/assignments', { method: 'POST', body: payload });
        showToast(status === 'draft' ? 'Draft saved' : 'Assignment posted. Parents have been notified.', 'success');
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
      kind: ['classwork', 'homework', 'quiz'].includes(a.kind) ? a.kind : 'classwork',
      kidIds,
      media: a.media || [],
    });
    setOpenMenu('');
    document.getElementById('twork-create')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const publish = async (a) => {
    await api(`/teacher/assignments/${a._id}`, { method: 'PUT', body: { status: 'published' } });
    showToast('Assignment published', 'success');
    setOpenMenu('');
    await load();
  };

  const remove = async (id) => {
    if (!confirm('Remove this assignment?')) return;
    try {
      await api(`/teacher/assignments/${id}`, { method: 'DELETE' });
      setOpenMenu('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const todayLong = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="twork">
      <div className="twork-main">
        <div className="twork-head">
          <div>
            <p className="tw-kicker">Teacher / Work</p>
            <h2>Class Work & Assignments</h2>
            <p>Create, manage and track class work and assignments. Keep your students engaged and informed.</p>
          </div>
          <div className="twork-head-date">
            <strong>{todayLong}</strong>
            <small>Teach · Empower · Make a Difference</small>
          </div>
        </div>

        {error && <div className="tw-alert">{error}</div>}

        <div className="twork-stats">
          <article className="twork-stat twork-stat--mint">
            <span><Icon name="doc" /></span>
            <div>
              <strong>{assignments.length}</strong>
              <small>Total assignments</small>
              <em>All time</em>
            </div>
          </article>
          <article className="twork-stat twork-stat--blue">
            <span><Icon name="clock" /></span>
            <div>
              <strong>{stats.unmarked ?? 0}</strong>
              <small>Unmarked today</small>
              <em>Need your review</em>
            </div>
          </article>
          <article className="twork-stat twork-stat--purple">
            <span><Icon name="people" /></span>
            <div>
              <strong>{stats.students ?? kids.length}</strong>
              <small>Students</small>
              <em>In your classes</em>
            </div>
          </article>
          <article className="twork-stat twork-stat--orange">
            <span><Icon name="cal" /></span>
            <div>
              <strong>{holidays.length}</strong>
              <small>Upcoming events</small>
              <em>This week</em>
            </div>
          </article>
        </div>

        <div className="twork-tabs">
          <span className="is-on"><Icon name="doc" /> All assignments</span>
          <Link to="/teacher/resources"><Icon name="plans" /> Lesson plans</Link>
          <Link to="/teacher/announcements"><Icon name="announce" /> Announcements</Link>
          <Link to="/teacher/reports"><Icon name="chart" /> Reports</Link>
        </div>

        <section className="twork-list">
          <div className="twork-filters">
            <label className="twork-search">
              <Icon name="search" />
              <input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Search assignments..."
              />
            </label>
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="latest">Latest first</option>
              <option value="due">Due soon</option>
              <option value="title">Title</option>
            </select>
          </div>

          {slice.map((a) => {
            const viewing = viewId === a._id;
            return (
              <article key={a._id} className={`twork-row${viewing ? ' is-open' : ''}`}>
                <span className={`twork-row-ico is-${a.kind || 'classwork'}`}>
                  <Icon name={kindIcon(a.kind)} />
                </span>
                <div className="twork-row-body">
                  <h3>{a.title}</h3>
                  <p>{a.description || a.subject || '—'}</p>
                  <small>
                    {studentCount(a)} student{studentCount(a) === 1 ? '' : 's'} · {a.media?.length || 0} file{(a.media?.length || 0) === 1 ? '' : 's'}
                  </small>
                  {viewing && a.description ? <p className="twork-view">{a.description}</p> : null}
                </div>
                <div className="twork-meta">
                  <span>Class <b>{assignmentAudience(a)}</b></span>
                  <span>Due <b>{a.dueDate ? new Date(a.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</b></span>
                  <em className={(a.status || 'published') === 'draft' ? 'is-draft' : ''}>{a.status || 'published'}</em>
                </div>
                <div className="twork-row-actions">
                  <button type="button" onClick={() => startEdit(a)}>Edit</button>
                  <button type="button" onClick={() => setViewId(viewing ? '' : a._id)}>View</button>
                  <div className="twork-menu">
                    <button type="button" className="twork-kebab" aria-label="More" onClick={() => setOpenMenu(openMenu === a._id ? '' : a._id)}>⋯</button>
                    {openMenu === a._id && (
                      <div className="twork-menu-pop">
                        {(a.status || 'published') === 'draft' ? (
                          <button type="button" onClick={() => publish(a)}>Publish</button>
                        ) : null}
                        <button type="button" onClick={() => remove(a._id)}>Remove</button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {!slice.length && <p className="tw-empty">No assignments match these filters.</p>}

          <div className="twork-pager">
            <small>
              Showing {filtered.length ? (pageSafe - 1) * PAGE_SIZE + 1 : 0} to {Math.min(pageSafe * PAGE_SIZE, filtered.length)} of {filtered.length} assignments
            </small>
            <div>
              <button type="button" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>‹</button>
              <strong>{pageSafe}</strong>
              <button type="button" disabled={pageSafe >= pages} onClick={() => setPage(pageSafe + 1)}>›</button>
            </div>
          </div>
        </section>

        {holidays.length ? (
          <div className="twork-events">
            <h3>Upcoming events</h3>
            <ul>
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

      <form
        id="twork-create"
        className="twork-form"
        onSubmit={(e) => {
          e.preventDefault();
          save('published');
        }}
      >
        <div className="twork-form-head">
          <span><Icon name="plus" /></span>
          <div>
            <h3>{editingId ? 'Edit assignment' : 'Create new assignment'}</h3>
            <p>Set class work, homework or a test.</p>
          </div>
        </div>

        <label className="twork-field">
          Title
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Reading comprehension — chapter 4"
          />
        </label>
        <label className="twork-field">
          Subject
          <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
            <option value="">Select subject</option>
            {SUBJECTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
            {form.subject && !SUBJECTS.includes(form.subject) ? <option value={form.subject}>{form.subject}</option> : null}
          </select>
        </label>
        <label className="twork-field">
          Class
          <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
            <option value="">Select class</option>
            {grades.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="twork-field">
          Due date
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </label>

        <p className="twork-label">Assignment type</p>
        <div className="twork-kinds">
          {KINDS.map((k) => (
            <button
              key={k.v}
              type="button"
              className={form.kind === k.v ? 'is-on' : ''}
              onClick={() => setForm({ ...form, kind: k.v })}
            >
              <Icon name={kindIcon(k.v)} />
              {k.l}
            </button>
          ))}
        </div>

        <label className="twork-field">
          Instructions
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What should students do, and how should they submit?"
          />
        </label>

        <label className="twork-attach">
          <Icon name="clip" />
          {uploading ? 'Uploading…' : '+ Choose file (PDF, Image, etc.)'}
          <input
            type="file"
            multiple
            hidden
            disabled={uploading || form.media.length >= 8}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        {form.media.length > 0 && (
          <div className="twork-files">
            {form.media.map((m) => (
              <button type="button" key={m.url} onClick={() => setForm((f) => ({ ...f, media: f.media.filter((x) => x.url !== m.url) }))}>
                {m.originalName || 'File'} ×
              </button>
            ))}
          </div>
        )}

        <AudiencePicker
          audience={audience}
          onAudienceChange={setAudience}
          grade={form.grade}
          onGradeChange={(grade) => setForm((f) => ({ ...f, grade }))}
          grades={grades}
          kids={kids}
          kidIds={form.kidIds}
          onKidIdsChange={(kidIds) => setForm((f) => ({ ...f, kidIds }))}
          hideGrade
        />

        <button className="twork-btn twork-btn--teal" type="submit" disabled={busy || uploading}>
          <Icon name="send" />
          {busy ? 'Saving…' : editingId ? 'Save changes' : 'Post assignment'}
        </button>
        <button type="button" className="twork-btn twork-btn--ghost" disabled={busy} onClick={() => save('draft')}>
          <Icon name="save" />
          Save as draft
        </button>
        {editingId ? (
          <button
            type="button"
            className="twork-btn twork-btn--ghost"
            onClick={() => {
              setEditingId('');
              setAudience('class');
              setForm(empty);
            }}
          >
            Cancel
          </button>
        ) : null}
      </form>
    </div>
  );
}
