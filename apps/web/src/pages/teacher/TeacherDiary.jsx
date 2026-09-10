import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import AudiencePicker from '../../components/AudiencePicker';

const TYPES = [
  { value: 'lesson', label: 'Lesson / Class Work' },
  { value: 'homework', label: 'Homework' },
  { value: 'observation', label: 'Observation' },
  { value: 'behaviour', label: 'Behaviour' },
  { value: 'achievement', label: 'Achievement' },
  { value: 'communication', label: 'Parent Communication' },
  { value: 'notice', label: 'General Notice' },
  { value: 'activity', label: 'Student Activity' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'incident', label: 'Incident' },
];

const PRIMARY_TYPES = TYPES.slice(0, 3);
const EXTRA_TYPES = TYPES.slice(3);
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
    case 'lesson':
      return (
        <svg {...iconProps}>
          <path d="M4 19V6.5A2.5 2.5 0 0 1 6.5 4H20v12H6.5A2.5 2.5 0 0 0 4 18.5V19h16" />
        </svg>
      );
    case 'work':
      return (
        <svg {...iconProps}>
          <path d="M8 7V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" />
          <rect x="4" y="7" width="16" height="13" rx="2" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...iconProps}>
          <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.4" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...iconProps}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
      );
    case 'cap':
      return (
        <svg {...iconProps}>
          <path d="M3 10 12 5l9 5-9 5-9-5Z" />
          <path d="M7 12.5v4.2c2 1.6 8 1.6 10 0V12.5" />
        </svg>
      );
    case 'topic':
      return (
        <svg {...iconProps}>
          <path d="M5 6h14M5 12h14M5 18h8" />
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
    default:
      return null;
  }
}

function ymd(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function emptyForm(date) {
  return {
    label: 'lesson',
    title: '',
    topic: '',
    body: '',
    lessonSummary: '',
    learningActivity: '',
    teacherObservation: '',
    grade: '',
    kidIds: [],
    subjects: [],
    date: date || ymd(new Date()),
    time: '',
    media: [],
    private: false,
    visibilityParents: true,
    visibilityStudents: true,
    notifyParent: true,
    homework: { enabled: false, title: '', dueDate: '' },
    category: '',
    severity: 'low',
    actionTaken: '',
    status: 'published',
  };
}

function isLesson(label) {
  return ['lesson', 'class', 'academic'].includes(label);
}

export default function TeacherDiary() {
  const { showToast } = useAuth();
  const [params] = useSearchParams();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => ymd(new Date()));
  const [entries, setEntries] = useState([]);
  const [dates, setDates] = useState([]);
  const [overview, setOverview] = useState(null);
  const [kids, setKids] = useState([]);
  const [grades, setGrades] = useState([]);
  const [form, setForm] = useState(() => emptyForm());
  const [audience, setAudience] = useState('class');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [editingId, setEditingId] = useState('');
  const [reply, setReply] = useState('');
  const [replyFiles, setReplyFiles] = useState([]);
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyUploading, setReplyUploading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');

  const load = async (month = monthKey(cursor), date = selected) => {
    const [d, k] = await Promise.all([
      api(`/teacher/diary?month=${month}&date=${date}`),
      api('/teacher/kids'),
    ]);
    setEntries(d.entries || []);
    setDates(d.dates || []);
    setOverview(d.overview || null);
    setKids(k.kids || []);
    setGrades(k.grades || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (audience === 'class' && !form.grade && grades.length === 1) {
      setForm((f) => ({ ...f, grade: grades[0] }));
    }
  }, [audience, form.grade, grades]);

  const shiftMonth = async (delta) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    setCursor(next);
    try {
      await load(monthKey(next), selected);
    } catch (e) {
      setError(e.message);
    }
  };

  const pickDay = async (day) => {
    setSelected(day);
    setForm((f) => ({ ...f, date: day }));
    setCursor(new Date(`${day}T00:00:00`));
    try {
      await load(monthKey(new Date(`${day}T00:00:00`)), day);
    } catch (e) {
      setError(e.message);
    }
  };

  const addFiles = async (files) => {
    const remaining = 8 - form.media.length;
    const batch = [...files].slice(0, remaining);
    if (!batch.length) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of batch) uploaded.push(await uploadFile(file, { folder: 'diary' }));
      setForm((f) => ({ ...f, media: [...f.media, ...uploaded] }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const buildPayload = (status) => {
    const subject = form.subjects[0] || '';
    const title = form.title.trim() || form.topic.trim() || `${TYPES.find((t) => t.value === form.label)?.label || 'Diary'} ${subject}`.trim();
    return {
      ...form,
      title,
      body: form.lessonSummary || form.body || form.teacherObservation || form.topic,
      grade: audience === 'all' ? '' : form.grade,
      kidIds: audience === 'individuals' ? form.kidIds : [],
      status,
      homework: form.label === 'homework'
        ? { enabled: true, title: form.topic || form.homework.title || title, dueDate: form.homework.dueDate || null }
        : form.homework,
    };
  };

  const submit = async (status = 'published') => {
    setBusy(true);
    setError('');
    try {
      if (audience === 'class' && !form.grade) {
        setError('Pick a class, or send to specific students');
        setBusy(false);
        return;
      }
      if (audience === 'individuals' && !form.kidIds.length) {
        setError('Pick at least one student');
        setBusy(false);
        return;
      }
      const payload = buildPayload(status);
      if (editingId) await api(`/teacher/diary/${editingId}`, { method: 'PUT', body: payload });
      else await api('/teacher/diary', { method: 'POST', body: payload });
      showToast(status === 'draft' ? 'Draft saved' : 'Diary published. Parents can acknowledge it.', 'success');
      setForm(emptyForm(selected));
      setAudience('class');
      setEditingId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addReplyFiles = async (files) => {
    const remaining = 4 - replyFiles.length;
    const batch = [...files].slice(0, remaining);
    if (!batch.length) return;
    setReplyUploading(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of batch) uploaded.push(await uploadFile(file, { folder: 'diary' }));
      setReplyFiles((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err.message);
    } finally {
      setReplyUploading(false);
    }
  };

  const sendReply = async (entry) => {
    const body = reply.trim();
    if (!body && !replyFiles.length) return;
    setReplyBusy(true);
    setError('');
    try {
      await api(`/teacher/diary/${entry._id}/comments`, { method: 'POST', body: { body, media: replyFiles } });
      showToast('Reply sent to parents', 'success');
      setReply('');
      setReplyFiles([]);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setReplyBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Remove this diary entry?')) return;
    try {
      await api(`/teacher/diary/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (e) => {
    const kidIds = (e.kidIds || []).map((k) => k._id || k).filter(Boolean);
    setAudience(kidIds.length ? 'individuals' : e.grade ? 'class' : 'all');
    setEditingId(e._id);
    setForm({
      ...emptyForm(selected),
      ...e,
      kidIds,
      homework: {
        enabled: e.homework?.enabled === true,
        title: e.homework?.title || '',
        dueDate: e.homework?.dueDate ? ymd(e.homework.dueDate) : '',
        assignmentId: e.homework?.assignmentId,
      },
      date: ymd(e.date || selected),
      subjects: e.subjects || [],
    });
    document.getElementById('tdia-create')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const calendarDays = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const pad = start.getDay();
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < pad; i += 1) cells.push(null);
    for (let d = 1; d <= last; d += 1) cells.push(ymd(new Date(cursor.getFullYear(), cursor.getMonth(), d)));
    return cells;
  }, [cursor]);

  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const selectedEntries = entries.filter((e) => ymd(e.date) === selected);
  const query = (params.get('q') || '').trim().toLowerCase();
  const visibleEntries = selectedEntries.filter((e) => {
    if (typeFilter === 'lessons' && !isLesson(e.label)) return false;
    if (typeFilter === 'homework' && !(e.label === 'homework' || e.homework?.enabled)) return false;
    if (typeFilter === 'observations' && e.label !== 'observation') return false;
    if (!query) return true;
    const hay = [e.topic, e.title, e.lessonSummary, e.body, e.typeLabel, ...(e.subjects || []), diaryAudienceLabel(e)]
      .join(' ')
      .toLowerCase();
    return hay.includes(query);
  });
  const open = visibleEntries.find((e) => e._id === openId) || visibleEntries[0] || null;
  const prettyDate = new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const dayCounts = {
    lessons: selectedEntries.filter((e) => isLesson(e.label)).length,
    homework: selectedEntries.filter((e) => e.label === 'homework' || e.homework?.enabled).length,
    observations: selectedEntries.filter((e) => e.label === 'observation').length,
    pending: overview?.pending ?? 0,
  };

  function diaryAudienceLabel(e) {
    const rows = Array.isArray(e.kidIds) ? e.kidIds : [];
    if (rows.length) {
      const names = rows.map((k) => (k && typeof k === 'object' ? k.name : '')).filter(Boolean);
      if (names.length === 1) return names[0];
      if (names.length === 2) return names.join(', ');
      if (names.length > 2) return `${names[0]} +${names.length - 1}`;
      return `${rows.length} student${rows.length === 1 ? '' : 's'}`;
    }
    return e.grade || 'Everyone';
  }

  const extraSelected = EXTRA_TYPES.some((t) => t.value === form.label);

  return (
    <div className="tdia">
      <div className="tdia-main">
        {error && <div className="tw-alert">{error}</div>}

        <section className="tdia-banner">
          <div>
            <p className="tdia-kicker">Teacher diary</p>
            <h2>Small steps, big progress</h2>
            <p>Record lessons, homework, and observations so parents stay close to every day in class.</p>
          </div>
          <div className="tdia-banner-art" aria-hidden="true">
            <strong>A Brighter Classroom</strong>
            <span>A Brighter Tomorrow</span>
            <em>✏️ 🖍️ 🖊️</em>
          </div>
        </section>

        <div className="tdia-stats">
          <article className="tdia-stat tdia-stat--mint">
            <span><Icon name="people" /></span>
            <div>
              <strong>{kids.length || overview?.students || 0}</strong>
              <small>Students in your class</small>
            </div>
          </article>
          <article className="tdia-stat tdia-stat--blue">
            <span><Icon name="lesson" /></span>
            <div>
              <strong>{overview?.lessons ?? 0}</strong>
              <small>Lessons recorded today</small>
            </div>
          </article>
          <article className="tdia-stat tdia-stat--orange">
            <span><Icon name="work" /></span>
            <div>
              <strong>{overview?.homework ?? 0}</strong>
              <small>Homework assigned</small>
            </div>
          </article>
          <article className="tdia-stat tdia-stat--purple">
            <span><Icon name="eye" /></span>
            <div>
              <strong>{overview?.ackRate ?? 0}%</strong>
              <small>Parents acknowledged</small>
            </div>
          </article>
        </div>

        <section className="tdia-cal-card">
          <div className="tdia-cal">
            <div className="tdia-cal-head">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
              <strong>{monthLabel}</strong>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
            </div>
            <div className="tdia-cal-grid tdia-cal-dow">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="tdia-cal-grid">
              {calendarDays.map((day, i) =>
                day ? (
                  <button
                    key={day}
                    type="button"
                    className={[
                      'tdia-day',
                      day === selected ? 'is-selected' : '',
                      dates.includes(day) ? 'has-entry' : '',
                      day === ymd(new Date()) ? 'is-today' : '',
                    ].join(' ')}
                    onClick={() => pickDay(day)}
                  >
                    {Number(day.slice(-2))}
                    {dates.includes(day) ? <i /> : null}
                  </button>
                ) : (
                  <span key={`pad-${i}`} />
                )
              )}
            </div>
          </div>
          <div className="tdia-cal-side">
            <h3>{prettyDate}</h3>
            <p>What is recorded for this day.</p>
            <ul>
              <li><i className="is-mint" /> <b>{dayCounts.lessons}</b> Lessons</li>
              <li><i className="is-blue" /> <b>{dayCounts.homework}</b> Homework</li>
              <li><i className="is-orange" /> <b>{dayCounts.observations}</b> Observations</li>
              <li><i className="is-purple" /> <b>{dayCounts.pending}</b> Not acknowledged</li>
            </ul>
            <blockquote>
              <span aria-hidden="true">🍃</span>
              <p>Well planned lessons today create brighter futures tomorrow. — A Great Teacher</p>
            </blockquote>
          </div>
        </section>

        <section className="tdia-feed">
          <div className="tdia-feed-head">
            <div>
              <h3>Today&apos;s entries</h3>
              <p>{prettyDate}</p>
            </div>
            <div className="tdia-pills">
              {[
                ['all', 'All types'],
                ['lessons', 'Lessons'],
                ['homework', 'Homework'],
                ['observations', 'Observations'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={typeFilter === id ? 'is-on' : ''}
                  onClick={() => setTypeFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visibleEntries.map((e) => (
            <article
              key={e._id}
              className={`tdia-row ${open?._id === e._id ? 'is-open' : ''}`}
              onClick={() => setOpenId(e._id)}
            >
              <span className="tdia-row-ico" aria-hidden="true">
                <Icon name={isLesson(e.label) ? 'lesson' : e.label === 'homework' ? 'work' : 'eye'} />
              </span>
              <div>
                <h4>{e.topic || e.title}</h4>
                <p>{e.lessonSummary || e.body || e.typeLabel}</p>
                <small>
                  {(e.subjects || [])[0] || e.typeLabel} · {e.time || '—'} · {diaryAudienceLabel(e)}
                  {e.signatureCount ? ` · ${e.signatureCount} acknowledged` : ' · Awaiting acknowledgement'}
                  {(e.comments || []).length ? ` · ${(e.comments || []).length} comment${(e.comments || []).length === 1 ? '' : 's'}` : ''}
                </small>
                <div className="tdia-row-actions">
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      startEdit(e);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      remove(e._id);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}

          {!visibleEntries.length && (
            <div className="tdia-empty">
              <span aria-hidden="true">📓</span>
              <strong>No diary entries yet</strong>
              <p>Create a lesson, homework, or observation for this day.</p>
              <button
                type="button"
                className="tdia-btn tdia-btn--teal"
                onClick={() => document.getElementById('tdia-create')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                + Create first entry
              </button>
            </div>
          )}
        </section>

        {open && (
          <div className="tdia-comments">
            <strong>Comments with parents</strong>
            {(open.comments || []).length === 0 ? (
              <p>No parent comments yet.</p>
            ) : (
              <ul>
                {(open.comments || []).map((c) => (
                  <li key={c._id}>
                    <b>{c.authorName || 'Parent'}{c.authorRole ? ` · ${c.authorRole}` : ''}</b>
                    {c.body ? <p>{c.body}</p> : null}
                    {(c.attachments || c.media || []).length > 0 && (
                      <span className="tdia-files">
                        {(c.attachments || c.media).map((f) => (
                          <a key={f.url} href={f.url} target="_blank" rel="noreferrer">{f.name || f.originalName || 'File'}</a>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to parents" rows={3} />
            <div className="tdia-comment-actions">
              <label className="tdia-btn tdia-btn--ghost">
                {replyUploading ? 'Uploading…' : 'Attach file'}
                <input
                  type="file"
                  multiple
                  hidden
                  disabled={replyUploading || replyFiles.length >= 4}
                  onChange={(e) => {
                    addReplyFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                className="tdia-btn tdia-btn--teal"
                disabled={replyBusy || replyUploading || (!reply.trim() && !replyFiles.length)}
                onClick={() => sendReply(open)}
              >
                {replyBusy ? 'Sending…' : 'Send reply'}
              </button>
            </div>
            {replyFiles.length > 0 && (
              <div className="tdia-files">
                {replyFiles.map((f) => (
                  <button
                    type="button"
                    key={f.url}
                    onClick={() => setReplyFiles((prev) => prev.filter((x) => x.url !== f.url))}
                  >
                    {f.originalName || 'File'} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {overview?.pendingParents?.length > 0 && (
          <div className="tdia-pending">
            <strong>Not acknowledged ({overview.pending})</strong>
            <ul>{overview.pendingParents.slice(0, 8).map((p) => <li key={`${p.parentId}-${p.kidName}`}>{p.parentName} · {p.kidName}</li>)}</ul>
          </div>
        )}
      </div>

      <form
        id="tdia-create"
        className="tdia-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit('published');
        }}
      >
        <div className="tdia-form-head">
          <span aria-hidden="true"><Icon name="book" /></span>
          <div>
            <h3>{editingId ? 'Edit diary entry' : 'Create diary entry'}</h3>
            <p>Record a lesson, homework or observation.</p>
          </div>
        </div>

        <p className="tdia-label">Entry type</p>
        <div className="tdia-types">
          {PRIMARY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={form.label === t.value ? 'is-on' : ''}
              onClick={() => {
                setForm({ ...form, label: t.value });
                if (t.value === 'observation') setAudience('individuals');
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          className={extraSelected ? 'is-on' : ''}
          value={extraSelected ? form.label : ''}
          onChange={(e) => {
            const label = e.target.value;
            if (!label) return;
            setForm({ ...form, label });
            if (['observation', 'behaviour', 'achievement', 'incident'].includes(label)) {
              setAudience('individuals');
            }
          }}
        >
          <option value="">More types</option>
          {EXTRA_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <AudiencePicker
          audience={audience}
          onAudienceChange={setAudience}
          grade={form.grade}
          onGradeChange={(grade) => setForm((f) => ({ ...f, grade }))}
          grades={grades}
          kids={kids}
          kidIds={form.kidIds}
          onKidIdsChange={(kidIds) => setForm((f) => ({ ...f, kidIds }))}
        />

        <div className="tdia-two">
          <label className="tdia-field">
            Date
            <span>
              <Icon name="calendar" />
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </span>
          </label>
          {['lesson', 'homework', 'activity'].includes(form.label) ? (
            <label className="tdia-field">
              Subject
              <span>
                <Icon name="cap" />
                <select
                  value={form.subjects[0] || ''}
                  onChange={(e) => setForm({ ...form, subjects: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">Select subject</option>
                  {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </span>
            </label>
          ) : (
            <span />
          )}
        </div>
        {form.label === 'homework' && (
          <label className="tdia-field">
            Due date
            <span>
              <Icon name="calendar" />
              <input
                type="date"
                value={form.homework.dueDate}
                onChange={(e) => setForm({ ...form, homework: { ...form.homework, enabled: true, dueDate: e.target.value, title: form.topic || form.title } })}
              />
            </span>
          </label>
        )}

        <label className="tdia-field">
          {form.label === 'lesson' ? 'Topic' : 'Title'}
          <span>
            <Icon name="topic" />
            <input
              required
              value={form.topic || form.title}
              onChange={(e) => setForm({ ...form, topic: e.target.value, title: e.target.value })}
              placeholder={form.label === 'lesson' ? 'e.g. Addition of Fractions' : 'Short title'}
            />
          </span>
        </label>

        {form.label === 'lesson' && (
          <>
            <label className="tdia-field">
              Lesson summary
              <textarea
                value={form.lessonSummary}
                onChange={(e) => setForm({ ...form, lessonSummary: e.target.value, body: e.target.value })}
                placeholder="What did you teach today?"
              />
            </label>
            <label className="tdia-field">
              Learning activity
              <textarea
                value={form.learningActivity}
                onChange={(e) => setForm({ ...form, learningActivity: e.target.value })}
                placeholder="e.g. Group work, discussion, exercises..."
              />
            </label>
            <label className="tdia-field">
              Teacher observation
              <textarea
                value={form.teacherObservation}
                onChange={(e) => setForm({ ...form, teacherObservation: e.target.value })}
                placeholder="Notes about participation, behavior, progress..."
              />
            </label>
          </>
        )}

        {form.label !== 'lesson' && (
          <label className="tdia-field">
            Details
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} placeholder="Write the details for this entry" />
          </label>
        )}

        {(form.label === 'behaviour' || form.label === 'incident') && (
          <>
            <label className="tdia-field">
              Severity
              <span>
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </span>
            </label>
            <label className="tdia-field">
              Action taken
              <span>
                <input value={form.actionTaken} onChange={(e) => setForm({ ...form, actionTaken: e.target.value })} placeholder="Verbal counselling" />
              </span>
            </label>
          </>
        )}

        {form.homework.enabled && form.label === 'lesson' && (
          <div className="tdia-two">
            <label className="tdia-field">
              Homework
              <span>
                <input value={form.homework.title} onChange={(e) => setForm({ ...form, homework: { ...form.homework, title: e.target.value } })} placeholder="Exercise 5, Questions 1–10" />
              </span>
            </label>
            <label className="tdia-field">
              Due
              <span>
                <input type="date" value={form.homework.dueDate} onChange={(e) => setForm({ ...form, homework: { ...form.homework, dueDate: e.target.value } })} />
              </span>
            </label>
          </div>
        )}

        <label className="tdia-attach">
          <Icon name="clip" />
          {uploading ? 'Uploading…' : '+ Choose file (PDF, Image, etc.)'}
          <input type="file" multiple hidden disabled={uploading || form.media.length >= 8} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </label>
        {form.media.length > 0 && (
          <div className="tdia-files">
            {form.media.map((m) => (
              <button type="button" key={m.url} onClick={() => setForm((f) => ({ ...f, media: f.media.filter((x) => x.url !== m.url) }))}>
                {m.originalName || 'File'} ×
              </button>
            ))}
          </div>
        )}

        <div className="tdia-checks">
          <label><input type="checkbox" checked={form.notifyParent} onChange={(e) => setForm({ ...form, notifyParent: e.target.checked, visibilityParents: e.target.checked || form.visibilityParents })} /> Notify parents</label>
          <label><input type="checkbox" checked={form.visibilityStudents} onChange={(e) => setForm({ ...form, visibilityStudents: e.target.checked })} /> Notify students</label>
          {form.label === 'lesson' && (
            <label>
              <input type="checkbox" checked={form.homework.enabled} onChange={(e) => setForm({ ...form, homework: { ...form.homework, enabled: e.target.checked } })} />
              Attach homework
            </label>
          )}
        </div>

        <button className="tdia-btn tdia-btn--teal tdia-btn--wide" type="submit" disabled={busy || uploading}>
          <Icon name="send" />
          {busy ? 'Saving…' : 'Publish entry'}
        </button>
        <button type="button" className="tdia-btn tdia-btn--ghost tdia-btn--wide" disabled={busy} onClick={() => submit('draft')}>
          <Icon name="save" />
          Save as draft
        </button>
        {editingId ? (
          <button type="button" className="tdia-btn tdia-btn--ghost tdia-btn--wide" onClick={() => { setEditingId(''); setForm(emptyForm(selected)); }}>
            Cancel
          </button>
        ) : null}
      </form>
    </div>
  );
}
