import { useEffect, useMemo, useState } from 'react';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import '../../diary-module.css';

const TYPES = [
  { value: 'lesson', label: 'Lesson / Class Work', emoji: '📚' },
  { value: 'homework', label: 'Homework', emoji: '📝' },
  { value: 'observation', label: 'Teacher Observation', emoji: '⚠️' },
  { value: 'behaviour', label: 'Behaviour', emoji: '⚠️' },
  { value: 'achievement', label: 'Achievement', emoji: '⭐' },
  { value: 'communication', label: 'Parent Communication', emoji: '💬' },
  { value: 'notice', label: 'General Notice', emoji: '📢' },
  { value: 'activity', label: 'Student Activity', emoji: '🎯' },
  { value: 'reminder', label: 'Reminder', emoji: '⏰' },
  { value: 'incident', label: 'Incident', emoji: '🚨' },
];

const SUBJECTS = ['Mathematics', 'English', 'Science', 'Kiswahili', 'Social Studies', 'CRE', 'IRE', 'PE', 'Music', 'Art'];

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

export default function TeacherDiary() {
  const { showToast } = useAuth();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => ymd(new Date()));
  const [entries, setEntries] = useState([]);
  const [dates, setDates] = useState([]);
  const [overview, setOverview] = useState(null);
  const [kids, setKids] = useState([]);
  const [grades, setGrades] = useState([]);
  const [form, setForm] = useState(() => emptyForm());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [editingId, setEditingId] = useState('');

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
      const payload = buildPayload(status);
      if (editingId) await api(`/teacher/diary/${editingId}`, { method: 'PUT', body: payload });
      else await api('/teacher/diary', { method: 'POST', body: payload });
      showToast(status === 'draft' ? 'Draft saved' : 'Diary published. Parents can acknowledge it.', 'success');
      setForm(emptyForm(selected));
      setEditingId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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
  const open = selectedEntries.find((e) => e._id === openId) || selectedEntries[0] || null;
  const individual = ['observation', 'behaviour', 'achievement', 'incident'].includes(form.label);
  const prettyDate = new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="tw-split tdiary">
      <div className="tw-page">
        <div className="tdiary-head">
          <div>
            <h2>Diary</h2>
            <p className="tw-lede">{overview?.classLabel || 'Your class'} · {prettyDate}</p>
          </div>
        </div>
        {error && <div className="tw-alert">{error}</div>}

        {overview && (
          <div className="tdiary-stats">
            <div className="tdiary-stat"><b>{overview.students}</b><span>Students</span></div>
            <div className="tdiary-stat"><b>{overview.lessons}</b><span>Lessons today</span></div>
            <div className="tdiary-stat"><b>{overview.homework}</b><span>Homework</span></div>
            <div className="tdiary-stat"><b>{overview.ackRate}%</b><span>Parents acknowledged</span></div>
          </div>
        )}

        <div className="tw-panel tw-diary-cal">
          <div className="diary-cal-head">
            <button type="button" className="tw-btn tw-btn-ghost" onClick={() => shiftMonth(-1)}>‹</button>
            <strong>{monthLabel}</strong>
            <button type="button" className="tw-btn tw-btn-ghost" onClick={() => shiftMonth(1)}>›</button>
          </div>
          <div className="diary-cal-grid diary-cal-dow">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="diary-cal-grid">
            {calendarDays.map((day, i) =>
              day ? (
                <button
                  key={day}
                  type="button"
                  className={['diary-day', day === selected ? 'is-selected' : '', dates.includes(day) ? 'has-entry' : '', day === ymd(new Date()) ? 'is-today' : ''].join(' ')}
                  onClick={() => pickDay(day)}
                >
                  {Number(day.slice(-2))}
                </button>
              ) : <span key={`pad-${i}`} />
            )}
          </div>
        </div>

        <h3>Today&apos;s entries</h3>
        <div className="tdiary-list">
          {selectedEntries.map((e) => (
            <article key={e._id} className={`tdiary-row ${open?._id === e._id ? 'is-open' : ''}`} onClick={() => setOpenId(e._id)}>
              <div className="tdiary-emoji">{e.typeEmoji || '📚'}</div>
              <div>
                <h3>{e.topic || e.title}</h3>
                <p>{e.lessonSummary || e.body || e.typeLabel}</p>
                <small>
                  {(e.subjects || [])[0] || e.typeLabel} · {e.time || '—'} · {e.grade || 'Class'}
                  {e.signatureCount ? ` · ${e.signatureCount} acknowledged` : ' · Awaiting acknowledgement'}
                </small>
                <div className="tw-inline-actions">
                  <button
                    type="button"
                    className="tw-btn tw-btn-ghost"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEditingId(e._id);
                      setForm({
                        ...emptyForm(selected),
                        ...e,
                        kidIds: (e.kidIds || []).map((k) => k._id || k),
                        homework: {
                          enabled: e.homework?.enabled === true,
                          title: e.homework?.title || '',
                          dueDate: e.homework?.dueDate ? ymd(e.homework.dueDate) : '',
                          assignmentId: e.homework?.assignmentId,
                        },
                        date: ymd(e.date || selected),
                        subjects: e.subjects || [],
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="tw-btn tw-btn-ghost" onClick={() => remove(e._id)}>Remove</button>
                </div>
              </div>
            </article>
          ))}
          {!selectedEntries.length && <p className="tw-empty">No diary entries yet. Create a lesson, homework, or observation.</p>}
        </div>

        {overview?.pendingParents?.length > 0 && (
          <div className="tdiary-pending">
            <strong>Not acknowledged ({overview.pending})</strong>
            <ul>{overview.pendingParents.slice(0, 8).map((p) => <li key={`${p.parentId}-${p.kidName}`}>{p.parentName} · {p.kidName}</li>)}</ul>
          </div>
        )}
      </div>

      <form
        className="tw-form tdiary-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit('published');
        }}
      >
        <h3>{editingId ? 'Edit entry' : 'Create diary entry'}</h3>
        <label>
          Entry type
          <select value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
          </select>
        </label>
        <label>
          Class
          <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value, kidIds: [] })}>
            <option value="">Whole school / pick students</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        {['lesson', 'homework', 'activity'].includes(form.label) && (
          <label>
            Subject
            <select
              value={form.subjects[0] || ''}
              onChange={(e) => setForm({ ...form, subjects: e.target.value ? [e.target.value] : [] })}
            >
              <option value="">Select subject</option>
              {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        )}
        <label>
          {form.label === 'lesson' ? 'Topic' : 'Title'}
          <input
            required
            value={form.topic || form.title}
            onChange={(e) => setForm({ ...form, topic: e.target.value, title: e.target.value })}
            placeholder={form.label === 'lesson' ? 'Addition of Fractions' : 'Short title'}
          />
        </label>
        {form.label === 'lesson' && (
          <>
            <label>Lesson summary<textarea value={form.lessonSummary} onChange={(e) => setForm({ ...form, lessonSummary: e.target.value, body: e.target.value })} placeholder="What learners did today" /></label>
            <label>Learning activity<textarea value={form.learningActivity} onChange={(e) => setForm({ ...form, learningActivity: e.target.value })} /></label>
            <label>Teacher observation<textarea value={form.teacherObservation} onChange={(e) => setForm({ ...form, teacherObservation: e.target.value })} /></label>
          </>
        )}
        {form.label !== 'lesson' && (
          <label>
            Details
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} />
          </label>
        )}
        {individual && (
          <fieldset className="diary-kids">
            <legend>Student</legend>
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
          </fieldset>
        )}
        {(form.label === 'behaviour' || form.label === 'incident') && (
          <>
            <label>
              Severity
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>Action taken<input value={form.actionTaken} onChange={(e) => setForm({ ...form, actionTaken: e.target.value })} placeholder="Verbal counselling" /></label>
          </>
        )}
        {form.label === 'homework' && (
          <label>
            Due date
            <input type="date" value={form.homework.dueDate} onChange={(e) => setForm({ ...form, homework: { ...form.homework, enabled: true, dueDate: e.target.value, title: form.topic || form.title } })} />
          </label>
        )}
        {form.label === 'lesson' && (
          <label className="tw-check">
            <input type="checkbox" checked={form.homework.enabled} onChange={(e) => setForm({ ...form, homework: { ...form.homework, enabled: e.target.checked } })} />
            Attach homework to this lesson
          </label>
        )}
        {form.homework.enabled && form.label === 'lesson' && (
          <>
            <label>Homework<input value={form.homework.title} onChange={(e) => setForm({ ...form, homework: { ...form.homework, title: e.target.value } })} placeholder="Exercise 5, Questions 1–10" /></label>
            <label>Due<input type="date" value={form.homework.dueDate} onChange={(e) => setForm({ ...form, homework: { ...form.homework, dueDate: e.target.value } })} /></label>
          </>
        )}
        <div className="tdiary-checks">
          <label className="tw-check"><input type="checkbox" checked={form.visibilityParents} onChange={(e) => setForm({ ...form, visibilityParents: e.target.checked })} /> Parents</label>
          <label className="tw-check"><input type="checkbox" checked={form.visibilityStudents} onChange={(e) => setForm({ ...form, visibilityStudents: e.target.checked })} /> Students</label>
          <label className="tw-check"><input type="checkbox" checked={form.notifyParent} onChange={(e) => setForm({ ...form, notifyParent: e.target.checked })} /> Notify parent</label>
        </div>
        <div className="media-picker">
          <label className="tw-btn tw-btn-secondary">
            {uploading ? 'Uploading…' : '+ Add file'}
            <input type="file" multiple hidden disabled={uploading || form.media.length >= 8} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <div className="diary-thumbs">
            {form.media.map((m) => (
              <button type="button" key={m.url} className="diary-file-chip" onClick={() => setForm((f) => ({ ...f, media: f.media.filter((x) => x.url !== m.url) }))}>
                {m.originalName || 'File'}
              </button>
            ))}
          </div>
        </div>
        <div className="tw-inline-actions">
          <button className="tw-btn tw-btn-primary" type="submit" disabled={busy || uploading}>{busy ? 'Saving…' : 'Publish'}</button>
          <button type="button" className="tw-btn tw-btn-ghost" disabled={busy} onClick={() => submit('draft')}>Save draft</button>
          {editingId ? (
            <button type="button" className="tw-btn tw-btn-ghost" onClick={() => { setEditingId(''); setForm(emptyForm(selected)); }}>Cancel</button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
