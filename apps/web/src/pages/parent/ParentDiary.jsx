import { useEffect, useMemo, useState } from 'react';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import '../../diary-module.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'lessons', label: 'Lessons' },
  { id: 'homework', label: 'Homework' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'behaviour', label: 'Behaviour' },
  { id: 'observations', label: 'Observations' },
  { id: 'communication', label: 'Communication' },
];

function dayKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prettyDay(value) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  const today = dayKey(new Date());
  const label = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return value === today ? `Today · ${label}` : label;
}

function prettyDue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function homeworkList(item) {
  if (Array.isArray(item.homework)) return item.homework.filter(Boolean);
  return [];
}

export default function ParentDiary() {
  const { showToast } = useAuth();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [range, setRange] = useState('week');
  const [subject, setSubject] = useState('all');
  const [kidId, setKidId] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [commentFor, setCommentFor] = useState('');
  const [comment, setComment] = useState('');
  const [commentFiles, setCommentFiles] = useState([]);
  const [commentUploading, setCommentUploading] = useState(false);

  const load = async (nextKid = kidId) => {
    const qs = new URLSearchParams();
    if (nextKid) qs.set('kidId', nextKid);
    const res = await api(`/parent/diary${qs.toString() ? `?${qs}` : ''}`);
    setData(res);
    if (!nextKid && res.kid?._id) setKidId(String(res.kid._id));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acknowledge = async (entry) => {
    setBusyId(entry._id || entry.id);
    setError('');
    try {
      await api(`/parent/diary/${entry._id || entry.id}/sign`, { method: 'POST', body: { kidId } });
      showToast('Diary acknowledged', 'success');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const addCommentFiles = async (files) => {
    const remaining = 4 - commentFiles.length;
    const batch = [...files].slice(0, remaining);
    if (!batch.length) return;
    setCommentUploading(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of batch) uploaded.push(await uploadFile(file, { folder: 'diary' }));
      setCommentFiles((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err.message);
    } finally {
      setCommentUploading(false);
    }
  };

  const sendComment = async (entry) => {
    const body = comment.trim();
    if (!body && !commentFiles.length) return;
    setBusyId(`c-${entry._id || entry.id}`);
    try {
      await api(`/parent/diary/${entry._id || entry.id}/comments`, {
        method: 'POST',
        body: { body, media: commentFiles },
      });
      showToast('Comment sent to the teacher', 'success');
      setComment('');
      setCommentFiles([]);
      setCommentFor('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const items = useMemo(() => {
    const rows = data?.entries || [];
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    return rows.filter((item) => {
      if (filter !== 'all' && item.filter !== filter) return false;
      if (subject !== 'all' && !(item.subjects || []).includes(subject)) return false;
      if (range === 'week') {
        const d = new Date(item.date);
        if (Number.isNaN(d.getTime()) || d < weekStart) return false;
      }
      return true;
    });
  }, [data, filter, range, subject]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const key = dayKey(item.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()];
  }, [items]);

  const subjects = useMemo(() => {
    const set = new Set();
    for (const e of data?.entries || []) {
      for (const s of e.subjects || []) if (s) set.add(s);
    }
    return [...set];
  }, [data]);

  const kidName = data?.kid?.name || data?.kids?.[0]?.name || 'your child';
  const first = kidName.split(' ')[0];
  const todayKey = dayKey(new Date());
  const todayItems = (data?.entries || []).filter((e) => dayKey(e.date) === todayKey);
  const todaySummary = {
    lessons: todayItems.filter((e) => e.filter === 'lessons').length,
    homework: todayItems.filter((e) => e.filter === 'homework' || homeworkList(e).length).length,
    achievements: todayItems.filter((e) => e.filter === 'achievements').length,
    observations: todayItems.filter((e) => e.filter === 'observations').length,
  };

  return (
    <div className="pdiary">
      <div>
        <h2>{first}&apos;s diary</h2>
        <p className="tw-lede">Lessons, homework, achievements, and notes from the teacher. Acknowledge what you have read.</p>
      </div>
      {error && <div className="tw-alert">{error}</div>}

      {(data?.kids || []).length > 1 && (
        <label>
          Child
          <select
            value={kidId}
            onChange={(e) => {
              const id = e.target.value;
              setKidId(id);
              load(id).catch((err) => setError(err.message));
            }}
          >
            {(data.kids || []).map((k) => <option key={k._id} value={k._id}>{k.name}</option>)}
          </select>
        </label>
      )}

      <div className="pdiary-today">
        <strong>Today</strong>
        <span>📚 {todaySummary.lessons} lessons</span>
        <span>📝 {todaySummary.homework} homework</span>
        <span>⭐ {todaySummary.achievements} achievements</span>
        <span>⚠️ {todaySummary.observations} observations</span>
      </div>

      <div className="pdiary-toolbar">
        <label>
          Date
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
        </label>
        <label>
          Subject
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="all">All subjects</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div className="pdiary-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? 'is-on' : ''}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.map(([day, dayItems]) => (
        <section key={day} className="pdiary-day">
          <h3>{prettyDay(day)}</h3>
          {dayItems.map((item) => {
            const hw = homeworkList(item);
            const id = item._id || item.id;
            return (
              <article key={id} className="pdiary-card">
                <div className="pdiary-kicker">{item.typeEmoji || '📚'} <strong>{item.typeLabel || item.category || 'Diary'}</strong></div>
                {(item.subjects || [])[0] ? <small className="pdiary-subject">{item.subjects[0]}</small> : null}
                <h4>{item.topic || item.title}</h4>
                {item.lessonSummary || item.body ? <p>{item.lessonSummary || item.body}</p> : null}
                {item.learningActivity ? (
                  <div className="pdiary-block">
                    <b>Class activity</b>
                    <p>{item.learningActivity}</p>
                  </div>
                ) : null}
                {item.teacherObservation ? (
                  <div className="pdiary-block">
                    <b>Teacher observation</b>
                    <p>{item.teacherObservation}</p>
                  </div>
                ) : null}
                {item.actionTaken ? (
                  <div className="pdiary-block">
                    <b>Action taken</b>
                    <p>{item.actionTaken}{item.severity ? ` · ${item.severity} severity` : ''}</p>
                  </div>
                ) : null}
                {hw.length > 0 && (
                  <div className="pdiary-block">
                    <b>Homework</b>
                    <ul>{hw.map((row) => <li key={row}>{row}</li>)}</ul>
                    {item.homeworkDue ? <small>Due {prettyDue(item.homeworkDue)}</small> : null}
                  </div>
                )}
                <small>Teacher: {item.teacher?.name || item.teacherName || 'Teacher'}{item.time ? ` · ${item.time}` : ''}</small>
                <div className="pdiary-ack">
                  {item.signed || item.needsSignature === false ? (
                    <span>✓ Acknowledged{item.signedAt ? ` · ${new Date(item.signedAt).toLocaleString()}` : ''}</span>
                  ) : (
                    <button
                      type="button"
                      className="tw-btn tw-btn-primary"
                      disabled={busyId === id}
                      onClick={() => acknowledge(item)}
                    >
                      {busyId === id ? 'Saving…' : 'Acknowledge'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="tw-btn tw-btn-ghost"
                    onClick={() => {
                      setCommentFor(commentFor === id ? '' : id);
                      setComment('');
                      setCommentFiles([]);
                    }}
                  >
                    Comment
                  </button>
                </div>
                {(item.comments || []).length > 0 && (
                  <ul className="pdiary-comments">
                    {item.comments.map((c) => (
                      <li key={c._id}>
                        <b>{c.authorName}{c.authorRole ? ` · ${c.authorRole}` : ''}:</b>{' '}
                        {c.body || ((c.attachments || c.media || []).length ? 'Sent a file' : '')}
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
                {commentFor === id && (
                  <div className="pdiary-comment-box">
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment for the teacher" rows={3} />
                    <div className="pdiary-comment-box-actions">
                      <label className="tw-btn tw-btn-ghost">
                        {commentUploading ? 'Uploading…' : 'Attach file'}
                        <input
                          type="file"
                          multiple
                          hidden
                          disabled={commentUploading || commentFiles.length >= 4}
                          onChange={(e) => {
                            addCommentFiles(e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="tw-btn tw-btn-primary"
                        disabled={busyId === `c-${id}` || commentUploading || (!comment.trim() && !commentFiles.length)}
                        onClick={() => sendComment(item)}
                      >
                        {busyId === `c-${id}` ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                    {commentFiles.length > 0 && (
                      <div className="pdiary-comment-files">
                        {commentFiles.map((f) => (
                          <button
                            type="button"
                            key={f.url}
                            className="diary-file-chip"
                            onClick={() => setCommentFiles((prev) => prev.filter((x) => x.url !== f.url))}
                          >
                            {f.originalName || 'File'} ×
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ))}
      {!groups.length && <p className="tw-empty">No diary entries yet for this child.</p>}
    </div>
  );
}
