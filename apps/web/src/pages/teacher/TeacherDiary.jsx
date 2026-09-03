import { useEffect, useMemo, useState } from 'react';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import AudiencePicker from '../../components/AudiencePicker';
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
  const prettyDate = new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

  const diaryAudienceLabel = (e) => {
    const rows = Array.isArray(e.kidIds) ? e.kidIds : [];
    if (rows.length) {
      const names = rows.map((k) => (k && typeof k === 'object' ? k.name : '')).filter(Boolean);
      if (names.length === 1) return names[0];
      if (names.length === 2) return names.join(', ');
      if (names.length > 2) return `${names[0]} +${names.length - 1}`;
      return `${rows.length} student${rows.length === 1 ? '' : 's'}`;
    }
    return e.grade || 'Everyone';
  };

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
                  {(e.subjects || [])[0] || e.typeLabel} · {e.time || '—'} · {diaryAudienceLabel(e)}
                  {e.signatureCount ? ` · ${e.signatureCount} acknowledged` : ' · Awaiting acknowledgement'}
                  {(e.comments || []).length ? ` · ${(e.comments || []).length} comment${(e.comments || []).length === 1 ? '' : 's'}` : ''}
                </small>
                <div className="tw-inline-actions">
                  <button
                    type="button"
                    className="tw-btn tw-btn-ghost"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEditingId(e._id);
                      {
                        const kidIds = (e.kidIds || []).map((k) => k._id || k).filter(Boolean);
                        setAudience(kidIds.length ? 'individuals' : e.grade ? 'class' : 'all');
                      }
                      setForm({
                        ...emptyForm(selected),
                        ...e,
                        kidIds: (e.kidIds || []).map((k) => k._id || k).filter(Boolean),
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

        {open && (
          <div className="tdiary-comments">
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
                      <span className="pdiary-comment-files">
                        {(c.attachments || c.media).map((f) => (
                          <a key={f.url} href={f.url} target="_blank" rel="noreferrer">{f.name || f.originalName || 'File'}</a>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="pdiary-comment-box">
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to parents" rows={3} />
              <div className="pdiary-comment-box-actions">
                <label className="tw-btn tw-btn-ghost">
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
                  className="tw-btn tw-btn-primary"
                  disabled={replyBusy || replyUploading || (!reply.trim() && !replyFiles.length)}
                  onClick={() => sendReply(open)}
                >
                  {replyBusy ? 'Sending…' : 'Send reply'}
                </button>
              </div>
              {replyFiles.length > 0 && (
                <div className="pdiary-comment-files">
                  {replyFiles.map((f) => (
                    <button
                      type="button"
                      key={f.url}
                      className="diary-file-chip"
                      onClick={() => setReplyFiles((prev) => prev.filter((x) => x.url !== f.url))}
                    >
                      {f.originalName || 'File'} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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
          <select
            value={form.label}
            onChange={(e) => {
              const label = e.target.value;
              setForm({ ...form, label });
              if (['observation', 'behaviour', 'achievement', 'incident'].includes(label)) {
                setAudience('individuals');
              }
            }}
          >
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
          </select>
        </label>
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
