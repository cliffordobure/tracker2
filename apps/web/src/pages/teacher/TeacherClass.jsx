import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const TABS = ['Overview', 'Students', 'Timetable', 'Subjects', 'Notes'];

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

  const load = async (nextGrade = grade) => {
    if (!nextGrade) {
      const kids = await api('/teacher/kids');
      const list = kids.grades || [];
      setGrades(list);
      const first = list[0] || '';
      setGrade(first);
      if (first) {
        setParams({ grade: first }, { replace: true });
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
    setParams({ grade: next }, { replace: true });
    try {
      await load(next);
    } catch (e) {
      setError(e.message);
    }
  };

  const saveMeta = async (e) => {
    e.preventDefault();
    setBusy(true);
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

  return (
    <div className="tw-page">
      <div className="tw-toolbar">
        <label>
          Class
          <select value={grade} onChange={(e) => changeGrade(e.target.value)}>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <Link className="tw-btn tw-btn-secondary" to={`/teacher/register?grade=${encodeURIComponent(grade)}`}>
          Register
        </Link>
        <Link className="tw-btn tw-btn-secondary" to={`/teacher/timetable?grade=${encodeURIComponent(grade)}`}>
          Timetable
        </Link>
        <Link className="tw-btn tw-btn-secondary" to={`/teacher/reports?grade=${encodeURIComponent(grade)}`}>
          Reports
        </Link>
      </div>
      {error && <div className="tw-alert">{error}</div>}
      <div>
        <h2>{klass.grade || grade || 'Class'}</h2>
        <p className="tw-lede">
          {klass.teacherName || 'Class teacher'} · {stats.students || 0} students · Room {klass.classroom || '—'}
        </p>
      </div>

      <div className="tw-tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`tw-tab ${tab === t ? 'is-on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="tw-split">
          <div className="tw-metrics tw-metrics-4">
            <div className="tw-metric">
              <span>Students</span>
              <strong>{stats.students || 0}</strong>
            </div>
            <div className="tw-metric">
              <span>Average</span>
              <strong>{stats.avgPerformance || 0}</strong>
            </div>
            <div className="tw-metric">
              <span>Subjects</span>
              <strong>{stats.subjects || 0}</strong>
            </div>
            <div className="tw-metric">
              <span>Capacity</span>
              <strong>{stats.capacity || 0}</strong>
            </div>
          </div>
          <form className="tw-form" onSubmit={saveMeta}>
            <h3>Class settings</h3>
            <label>
              Code
              <input value={meta.classCode || ''} onChange={(e) => setMeta({ ...meta, classCode: e.target.value })} />
            </label>
            <label>
              Room
              <input value={meta.classroom || ''} onChange={(e) => setMeta({ ...meta, classroom: e.target.value })} />
            </label>
            <label>
              Section
              <input value={meta.section || ''} onChange={(e) => setMeta({ ...meta, section: e.target.value })} />
            </label>
            <label>
              Year
              <input value={meta.academicYear || ''} onChange={(e) => setMeta({ ...meta, academicYear: e.target.value })} />
            </label>
            <label>
              Assistant
              <input value={meta.assistantName || ''} onChange={(e) => setMeta({ ...meta, assistantName: e.target.value })} />
            </label>
            <label>
              Capacity
              <input type="number" min="1" max="80" value={meta.capacity || 30} onChange={(e) => setMeta({ ...meta, capacity: e.target.value })} />
            </label>
            <label>
              Description
              <textarea rows={3} value={meta.description || ''} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            </label>
            <button className="tw-btn tw-btn-primary" disabled={busy}>
              Save class
            </button>
          </form>
        </div>
      )}

      {tab === 'Students' && (
        <div className="tw-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Today</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.kids || []).map((k) => (
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
        </div>
      )}

      {tab === 'Timetable' && (
        <ul className="tw-list">
          {(data?.timetable || []).map((slot, i) => (
            <li key={`${slot.day}-${slot.startTime}-${i}`}>
              <strong>
                {slot.day} {slot.startTime}–{slot.endTime}
              </strong>
              <span>{slot.subject || slot.kind}</span>
            </li>
          ))}
          {!data?.timetable?.length && <p className="tw-empty">No timetable slots yet.</p>}
        </ul>
      )}

      {tab === 'Subjects' && (
        <div className="tw-split">
          <ul className="tw-list">
            {(data?.subjects || []).map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong>
                <span>{s.teacherName || ''}</span>
              </li>
            ))}
          </ul>
          <form className="tw-form" onSubmit={addSubject}>
            <h3>Add subject</h3>
            <label>
              Name
              <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
            </label>
            <button className="tw-btn tw-btn-primary" disabled={busy}>
              Add
            </button>
          </form>
        </div>
      )}

      {tab === 'Notes' && (
        <div className="tw-split">
          <div className="tw-page">
            {(data?.notes || []).map((n) => (
              <article key={n._id} className="tw-note">
                <strong>{n.title}</strong>
                <p className="tw-lede" style={{ margin: 0 }}>
                  {n.body}
                </p>
                <button type="button" className="tw-btn tw-btn-ghost" onClick={() => removeNote(n._id)}>
                  Remove
                </button>
              </article>
            ))}
            <form className="tw-form" onSubmit={addNote}>
              <h3>Class note</h3>
              <label>
                Title
                <input required value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} />
              </label>
              <label>
                Details
                <textarea rows={3} value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} />
              </label>
              <button className="tw-btn tw-btn-primary" disabled={busy}>
                Add note
              </button>
            </form>
          </div>
          <form className="tw-form" onSubmit={sendBroadcast}>
            <h3>Message all parents</h3>
            <label>
              Title
              <input required value={broadcast.title} onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })} />
            </label>
            <label>
              Message
              <textarea required rows={4} value={broadcast.body} onChange={(e) => setBroadcast({ ...broadcast, body: e.target.value })} />
            </label>
            <button className="tw-btn tw-btn-primary" disabled={busy}>
              Send to class parents
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
