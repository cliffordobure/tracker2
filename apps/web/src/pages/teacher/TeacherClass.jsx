import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const TABS = ['Overview', 'Students', 'Timetable', 'Subjects', 'Notes'];

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
    case 'register':
      return (
        <svg {...iconProps}>
          <path d="M9 5h11M9 12h11M9 19h11" />
          <path d="M4 5h.01M4 12h.01M4 19h.01" />
        </svg>
      );
    case 'cal':
      return (
        <svg {...iconProps}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...iconProps}>
          <path d="M5 19V9.5M10 19V5M15 19v-6.5M20 19V8" />
        </svg>
      );
    case 'book':
      return (
        <svg {...iconProps}>
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5V5.5Z" />
          <path d="M5 18.5A2.5 2.5 0 0 1 7.5 16H19" />
        </svg>
      );
    case 'cap':
      return (
        <svg {...iconProps}>
          <path d="M3 10 12 5l9 5-9 5-9-5Z" />
          <path d="M7 12.5v4.2c2 1.6 8 1.6 10 0V12.5" />
        </svg>
      );
    case 'bookmark':
      return (
        <svg {...iconProps}>
          <path d="M7 4h10v16l-5-3.2L7 20V4Z" />
        </svg>
      );
    case 'pin':
      return (
        <svg {...iconProps}>
          <path d="M12 21s6-5.4 6-10a6 6 0 1 0-12 0c0 4.6 6 10 6 10Z" />
          <circle cx="12" cy="11" r="2" />
        </svg>
      );
    case 'user':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 19c.8-3.1 3-4.6 7-4.6s6.2 1.5 7 4.6" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </svg>
      );
    case 'bolt':
      return (
        <svg {...iconProps}>
          <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />
        </svg>
      );
    case 'check':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="m8.5 12.2 2.4 2.4 4.6-5" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.4 6.4l1.4 1.4M16.2 16.2l1.4 1.4M17.6 6.4l-1.4 1.4M7.8 16.2 6.4 17.6" />
        </svg>
      );
    case 'save':
      return (
        <svg {...iconProps}>
          <path d="M5 5h11l3 3v11H5V5Z" />
          <path d="M8 5v4h7V5M8 19v-6h8v6" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...iconProps}>
          <path d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Z" />
          <path d="m13.2 7.3 3.5 3.5" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...iconProps}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'send':
      return (
        <svg {...iconProps}>
          <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
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

function dash(value) {
  if (value === 0) return '0';
  return value ? value : '—';
}

function createdLabel(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TeacherClass() {
  const { showToast } = useAuth();
  const [params, setParams] = useSearchParams();
  const [grades, setGrades] = useState([]);
  const [grade, setGrade] = useState(params.get('grade') || '');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState({});
  const [note, setNote] = useState({ title: '', body: '' });
  const [broadcast, setBroadcast] = useState({ title: '', body: '' });
  const [subjectName, setSubjectName] = useState('');

  const headerQ = (params.get('q') || '').trim().toLowerCase();

  const load = async (nextGrade = grade) => {
    if (!nextGrade) {
      const kids = await api('/teacher/kids');
      const list = kids.grades || [];
      setGrades(list);
      const first = list[0] || '';
      setGrade(first);
      if (first) {
        const next = new URLSearchParams(params);
        next.set('grade', first);
        setParams(next, { replace: true });
        return load(first);
      }
      return;
    }
    const [klass, kids] = await Promise.all([api(`/teacher/class?grade=${encodeURIComponent(nextGrade)}`), api('/teacher/kids')]);
    setData(klass);
    setGrades(kids.grades || []);
    const c = klass.class || {};
    setMeta({
      classCode: c.classCode || '',
      classroom: c.classroom || '',
      section: c.section || '',
      academicYear: c.academicYear || '',
      assistantName: c.assistantName || '',
      capacity: c.capacity || 30,
      description: c.description || '',
    });
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeGrade = async (next) => {
    setGrade(next);
    const nextParams = new URLSearchParams(params);
    nextParams.set('grade', next);
    setParams(nextParams, { replace: true });
    try {
      await load(next);
    } catch (e) {
      setError(e.message);
    }
  };

  const saveMeta = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/teacher/class?grade=${encodeURIComponent(grade)}`, { method: 'PUT', body: { ...meta, grade } });
      showToast('Class details saved', 'success');
      await load(grade);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addNote = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/teacher/class/notes', { method: 'POST', body: { ...note, grade } });
      setNote({ title: '', body: '' });
      await load(grade);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeNote = async (noteId) => {
    await api(`/teacher/class/notes/${noteId}?grade=${encodeURIComponent(grade)}`, { method: 'DELETE' });
    await load(grade);
  };

  const addSubject = async (e) => {
    e.preventDefault();
    if (!subjectName.trim()) return;
    const subjects = [...(data?.subjects || []), { name: subjectName.trim() }];
    setBusy(true);
    try {
      await api(`/teacher/class?grade=${encodeURIComponent(grade)}`, { method: 'PUT', body: { grade, subjects } });
      setSubjectName('');
      await load(grade);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendBroadcast = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api('/teacher/class/message', { method: 'POST', body: { ...broadcast, grade } });
      setBroadcast({ title: '', body: '' });
      showToast(`Notified ${res.notified || 0} parents`, 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const klass = data?.class || {};
  const stats = data?.stats || {};
  const className = klass.grade || grade || 'Class';

  const kids = useMemo(() => {
    const rows = data?.kids || [];
    if (!headerQ) return rows;
    return rows.filter((k) => `${k.name} ${k.attendance?.status || ''}`.toLowerCase().includes(headerQ));
  }, [data, headerQ]);

  const subjects = useMemo(() => {
    const rows = data?.subjects || [];
    if (!headerQ) return rows;
    return rows.filter((s) => `${s.name} ${s.teacherName || ''}`.toLowerCase().includes(headerQ));
  }, [data, headerQ]);

  const slots = useMemo(() => {
    const rows = data?.timetable || [];
    if (!headerQ) return rows;
    return rows.filter((s) => `${s.day} ${s.subject} ${s.kind} ${s.room}`.toLowerCase().includes(headerQ));
  }, [data, headerQ]);

  const notes = useMemo(() => {
    const rows = data?.notes || [];
    if (!headerQ) return rows;
    return rows.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(headerQ));
  }, [data, headerQ]);

  const focusSettings = () => {
    document.getElementById('tcls-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('tcls-code')?.focus();
  };

  return (
    <div className="tcls">
      <div className="tcls-main">
        <div className="tcls-head">
          <div>
            <p className="tw-kicker">Teacher / Class details</p>
            <div className="tcls-title">
              <span className="tcls-title-ico"><Icon name="people" /></span>
              <div>
                <h2>Class details</h2>
                <p>Manage your class information, view statistics, and access class tools.</p>
              </div>
            </div>
          </div>
          <div className="tcls-art" aria-hidden="true">
            <svg width="92" height="64" viewBox="0 0 92 64" fill="none">
              <rect x="6" y="28" width="22" height="26" rx="3" fill="#0f766e" />
              <rect x="16" y="22" width="22" height="32" rx="3" fill="#14b8a6" />
              <rect x="26" y="18" width="22" height="36" rx="3" fill="#99f6e4" />
              <rect x="58" y="30" width="16" height="24" rx="3" fill="#e8f7f1" stroke="#0f766e" />
              <path d="M66 30v-8" stroke="#0f766e" strokeWidth="2" />
              <circle cx="66" cy="18" r="6" fill="#86efac" />
              <circle cx="71" cy="16" r="4" fill="#4ade80" />
              <path d="M80 54h8M84 50v8" stroke="#0f766e" strokeWidth="1.6" />
            </svg>
            <strong>Great classes build brighter futures.</strong>
            <small>Every learner matters, every day.</small>
          </div>
        </div>

        <div className="tcls-toolbar">
          <label className="tcls-grade">
            <select value={grade} onChange={(e) => changeGrade(e.target.value)}>
              {!grades.length && <option value="">No classes</option>}
              {grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <Link className="tcls-tool" to={`/teacher/register?grade=${encodeURIComponent(grade)}`}>
            <Icon name="people" /> Register
          </Link>
          <Link className="tcls-tool" to={`/teacher/timetable?grade=${encodeURIComponent(grade)}`}>
            <Icon name="cal" /> Timetable
          </Link>
          <Link className="tcls-tool" to={`/teacher/reports?grade=${encodeURIComponent(grade)}`}>
            <Icon name="chart" /> Reports
          </Link>
        </div>

        <div className="tcls-tabs">
          {TABS.map((t) => (
            <button key={t} type="button" className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {error && <div className="tw-alert">{error}</div>}

        {tab === 'Overview' && (
          <>
            <div className="tcls-stats">
              <article>
                <span className="is-mint"><Icon name="people" /></span>
                <div>
                  <strong>{stats.students || 0}</strong>
                  <small>Students</small>
                  <em>Enrolled in this class</em>
                </div>
              </article>
              <article>
                <span className="is-blue"><Icon name="chart" /></span>
                <div>
                  <strong>{stats.avgPerformance || 0}</strong>
                  <small>Average</small>
                  <em>Class average</em>
                </div>
              </article>
              <article>
                <span className="is-purple"><Icon name="book" /></span>
                <div>
                  <strong>{stats.subjects || 0}</strong>
                  <small>Subjects</small>
                  <em>Active subjects</em>
                </div>
              </article>
              <article>
                <span className="is-orange"><Icon name="people" /></span>
                <div>
                  <strong>{stats.capacity || meta.capacity || 30}</strong>
                  <small>Capacity</small>
                  <em>Maximum students</em>
                </div>
              </article>
            </div>

            <div className="tcls-two">
              <section className="tcls-card">
                <div className="tcls-card-head">
                  <span className="is-mint"><Icon name="cap" /></span>
                  <div>
                    <h3>Class information</h3>
                    <p>Key details about {className}</p>
                  </div>
                  <button type="button" className="tcls-edit" onClick={focusSettings}>
                    <Icon name="edit" /> Edit
                  </button>
                </div>
                <dl className="tcls-dl">
                  <div>
                    <dt><Icon name="bookmark" /> Class name</dt>
                    <dd>{dash(className)}</dd>
                  </div>
                  <div>
                    <dt><Icon name="user" /> Teacher</dt>
                    <dd>{dash(klass.teacherName)}</dd>
                  </div>
                  <div>
                    <dt><Icon name="pin" /> Room</dt>
                    <dd>{dash(klass.classroom || meta.classroom)}</dd>
                  </div>
                  <div>
                    <dt><Icon name="bookmark" /> Section</dt>
                    <dd>{dash(klass.section || meta.section)}</dd>
                  </div>
                  <div>
                    <dt><Icon name="cal" /> Year</dt>
                    <dd>{dash(klass.academicYear || meta.academicYear)}</dd>
                  </div>
                  <div>
                    <dt><Icon name="user" /> Assistant</dt>
                    <dd>{dash(klass.assistantName || meta.assistantName)}</dd>
                  </div>
                  <div>
                    <dt><Icon name="people" /> Capacity</dt>
                    <dd>{dash(klass.capacity || meta.capacity || 30)}</dd>
                  </div>
                  <div>
                    <dt><Icon name="clock" /> Created</dt>
                    <dd>{createdLabel(klass.createdAt)}</dd>
                  </div>
                </dl>
              </section>

              <section className="tcls-card">
                <div className="tcls-card-head">
                  <span className="is-blue"><Icon name="bolt" /></span>
                  <div>
                    <h3>Quick actions</h3>
                    <p>Manage your class efficiently</p>
                  </div>
                </div>
                <div className="tcls-actions">
                  <Link to={`/teacher/register?grade=${encodeURIComponent(grade)}`}>
                    <span className="is-mint"><Icon name="check" /></span>
                    <div>
                      <strong>Take attendance</strong>
                      <small>Mark student attendance</small>
                    </div>
                    <Icon name="arrow" />
                  </Link>
                  <Link to={`/teacher/students${grade ? `?q=${encodeURIComponent(grade)}` : ''}`}>
                    <span className="is-blue"><Icon name="people" /></span>
                    <div>
                      <strong>Manage students</strong>
                      <small>View and edit list</small>
                    </div>
                    <Icon name="arrow" />
                  </Link>
                  <button type="button" onClick={() => setTab('Subjects')}>
                    <span className="is-orange"><Icon name="book" /></span>
                    <div>
                      <strong>Manage subjects</strong>
                      <small>Add or edit subjects</small>
                    </div>
                    <Icon name="arrow" />
                  </button>
                  <Link to={`/teacher/timetable?grade=${encodeURIComponent(grade)}`}>
                    <span className="is-purple"><Icon name="cal" /></span>
                    <div>
                      <strong>View timetable</strong>
                      <small>See class schedule</small>
                    </div>
                    <Icon name="arrow" />
                  </Link>
                </div>
                <div className="tcls-tip">
                  <span aria-hidden="true">💡</span>
                  Tip: Keep your class information up to date for smooth teaching and communication.
                </div>
              </section>
            </div>
          </>
        )}

        {tab === 'Students' && (
          <section className="tcls-card tcls-table-card">
            <div className="tcls-card-head">
              <span className="is-mint"><Icon name="people" /></span>
              <div>
                <h3>Students</h3>
                <p>{kids.length} enrolled in {className}</p>
              </div>
            </div>
            <div className="tcls-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Today</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {kids.map((k) => (
                    <tr key={k._id}>
                      <td>{k.name}</td>
                      <td>{k.attendance?.status || 'Unmarked'}</td>
                      <td>
                        <Link to={`/teacher/students/${k._id}`}>Profile</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!kids.length && <p className="tw-empty">No students in this class.</p>}
            </div>
          </section>
        )}

        {tab === 'Timetable' && (
          <section className="tcls-card">
            <div className="tcls-card-head">
              <span className="is-purple"><Icon name="cal" /></span>
              <div>
                <h3>Timetable</h3>
                <p>Weekly slots for {className}</p>
              </div>
            </div>
            <ul className="tcls-list">
              {slots.map((slot, i) => (
                <li key={`${slot.day}-${slot.startTime}-${i}`}>
                  <strong>{slot.day} {slot.startTime}–{slot.endTime}</strong>
                  <span>{slot.subject || slot.kind}</span>
                </li>
              ))}
            </ul>
            {!slots.length && <p className="tw-empty">No timetable slots yet.</p>}
          </section>
        )}

        {tab === 'Subjects' && (
          <section className="tcls-card">
            <div className="tcls-card-head">
              <span className="is-orange"><Icon name="book" /></span>
              <div>
                <h3>Subjects</h3>
                <p>Active subjects for {className}</p>
              </div>
            </div>
            <ul className="tcls-list">
              {subjects.map((s) => (
                <li key={s.name}>
                  <strong>{s.name}</strong>
                  <span>{s.teacherName || ''}</span>
                </li>
              ))}
            </ul>
            {!subjects.length && <p className="tw-empty">No subjects yet.</p>}
            <form className="tcls-inline" onSubmit={addSubject}>
              <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Subject name" />
              <button className="tcls-btn tcls-btn--teal" type="submit" disabled={busy || !subjectName.trim()}>
                <Icon name="plus" /> Add
              </button>
            </form>
          </section>
        )}

        {tab === 'Notes' && (
          <div className="tcls-notes">
            <section className="tcls-card">
              <div className="tcls-card-head">
                <span className="is-mint"><Icon name="bookmark" /></span>
                <div>
                  <h3>Class notes</h3>
                  <p>Internal notes for {className}</p>
                </div>
              </div>
              <div className="tcls-note-list">
                {notes.map((n) => (
                  <article key={n._id}>
                    <strong>{n.title}</strong>
                    <p>{n.body}</p>
                    <button type="button" onClick={() => removeNote(n._id)}>Remove</button>
                  </article>
                ))}
                {!notes.length && <p className="tw-empty">No class notes yet.</p>}
              </div>
              <form className="tcls-inline-form" onSubmit={addNote}>
                <input required value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} placeholder="Title" />
                <textarea rows={3} value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} placeholder="Details" />
                <button className="tcls-btn tcls-btn--teal" disabled={busy}>Add note</button>
              </form>
            </section>
            <form className="tcls-card tcls-inline-form" onSubmit={sendBroadcast}>
              <div className="tcls-card-head">
                <span className="is-blue"><Icon name="send" /></span>
                <div>
                  <h3>Message all parents</h3>
                  <p>Notify guardians for this class</p>
                </div>
              </div>
              <input required value={broadcast.title} onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })} placeholder="Title" />
              <textarea required rows={4} value={broadcast.body} onChange={(e) => setBroadcast({ ...broadcast, body: e.target.value })} placeholder="Message" />
              <button className="tcls-btn tcls-btn--teal" disabled={busy}>Send to class parents</button>
            </form>
          </div>
        )}
      </div>

      <form id="tcls-settings" className="tcls-form" onSubmit={saveMeta}>
        <div className="tcls-form-head">
          <span><Icon name="gear" /></span>
          <div>
            <h3>Class settings</h3>
            <p>Update class information</p>
          </div>
        </div>
        <label className="tcls-field">
          Code
          <input id="tcls-code" value={meta.classCode || ''} onChange={(e) => setMeta({ ...meta, classCode: e.target.value })} placeholder="e.g. G1, 1A" />
        </label>
        <label className="tcls-field">
          Room
          <input value={meta.classroom || ''} onChange={(e) => setMeta({ ...meta, classroom: e.target.value })} placeholder="e.g. Room 12" />
        </label>
        <label className="tcls-field">
          Section
          <input value={meta.section || ''} onChange={(e) => setMeta({ ...meta, section: e.target.value })} placeholder="e.g. A" />
        </label>
        <label className="tcls-field">
          Year
          <input value={meta.academicYear || ''} onChange={(e) => setMeta({ ...meta, academicYear: e.target.value })} placeholder="e.g. 2026" />
        </label>
        <label className="tcls-field">
          Assistant
          <input value={meta.assistantName || ''} onChange={(e) => setMeta({ ...meta, assistantName: e.target.value })} placeholder="Assistant teacher (optional)" />
        </label>
        <label className="tcls-field">
          Capacity
          <input type="number" min="1" max="80" value={meta.capacity || 30} onChange={(e) => setMeta({ ...meta, capacity: e.target.value })} />
        </label>
        <label className="tcls-field">
          Description
          <textarea rows={3} value={meta.description || ''} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="Add a short description of this class..." />
        </label>
        <button className="tcls-btn tcls-btn--teal" type="submit" disabled={busy || !grade}>
          <Icon name="save" /> {busy ? 'Saving…' : 'Save class'}
        </button>
      </form>
    </div>
  );
}
