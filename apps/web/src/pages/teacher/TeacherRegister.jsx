import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUSES = [
  { v: 'present', l: 'Present' },
  { v: 'absent', l: 'Absent' },
  { v: 'late', l: 'Late' },
  { v: 'excused', l: 'Excused' },
];

export default function TeacherRegister() {
  const { showToast } = useAuth();
  const [params] = useSearchParams();
  const [date, setDate] = useState(todayInput());
  const [grade, setGrade] = useState(params.get('grade') || '');
  const [grades, setGrades] = useState([]);
  const [kids, setKids] = useState([]);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const qs = new URLSearchParams({ date });
    if (grade) qs.set('grade', grade);
    const data = await api(`/teacher/attendance?${qs}`);
    setKids(data.kids || []);
    setGrades(data.grades || []);
    const next = {};
    for (const k of data.kids || []) {
      if (k.attendance?.status) next[k._id] = k.attendance.status;
    }
    setDraft(next);
    setError('');
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, grade]);

  const summary = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
    for (const k of kids) {
      const s = draft[k._id];
      if (s && counts[s] != null) counts[s] += 1;
      else counts.unmarked += 1;
    }
    return counts;
  }, [kids, draft]);

  const markLocal = (kidId, status) => {
    setDraft((prev) => ({ ...prev, [kidId]: status }));
  };

  const save = async (marks) => {
    setBusy(true);
    setError('');
    try {
      await api('/teacher/attendance/bulk', { method: 'POST', body: { date, marks } });
      showToast('Register saved', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveAll = () => {
    const marks = kids.filter((k) => draft[k._id]).map((k) => ({ kidId: k._id, status: draft[k._id] }));
    if (!marks.length) return;
    return save(marks);
  };

  const markAllPresent = () => {
    const next = { ...draft };
    for (const k of kids) {
      if (!next[k._id]) next[k._id] = 'present';
    }
    setDraft(next);
    const marks = kids.filter((k) => !draft[k._id]).map((k) => ({ kidId: k._id, status: 'present' }));
    if (marks.length) save(marks);
  };

  return (
    <div className="tw-page">
      <div>
        <h2>Class register</h2>
        <p className="tw-lede">
          Mark who is present, absent, late, or excused. Parents are notified when a child is absent or late.
        </p>
      </div>
      {error && <div className="tw-alert">{error}</div>}

      <div className="tw-toolbar">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Grade
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">All grades</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="tw-btn tw-btn-secondary" onClick={markAllPresent} disabled={busy}>
          Mark remaining present
        </button>
        <button type="button" className="tw-btn tw-btn-primary" onClick={saveAll} disabled={busy}>
          {busy ? 'Saving…' : 'Save register'}
        </button>
        <Link className="tw-btn tw-btn-ghost" to="/teacher/notes">
          Message a parent
        </Link>
      </div>

      <div className="tw-metrics tw-metrics-4">
        <div className="tw-metric is-present">
          <span>Present</span>
          <strong>{summary.present}</strong>
        </div>
        <div className="tw-metric is-away">
          <span>Absent</span>
          <strong>{summary.absent}</strong>
        </div>
        <div className="tw-metric">
          <span>Late</span>
          <strong>{summary.late}</strong>
        </div>
        <div className="tw-metric">
          <span>Not marked</span>
          <strong>{summary.unmarked}</strong>
        </div>
      </div>

      <div className="tw-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Grade</th>
              <th>Mark</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {kids.map((k) => {
              const current = draft[k._id] || '';
              return (
                <tr key={k._id}>
                  <td>
                    <div className="tw-student">
                      {k.photoUrl ? <img src={k.photoUrl} alt="" /> : null}
                      <div>
                        <strong>{k.name}</strong>
                        {k.admissionNo ? <div className="tw-muted">{k.admissionNo}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td>{k.grade || '—'}</td>
                  <td>
                    <div className="tw-marks">
                      {STATUSES.map((s) => (
                        <button
                          key={s.v}
                          type="button"
                          data-status={s.v}
                          className={`tw-mark ${current === s.v ? 'is-on' : ''}`}
                          onClick={() => markLocal(k._id, s.v)}
                        >
                          {s.l}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    <Link className="tw-btn tw-btn-ghost" to={`/teacher/notes?kidId=${k._id}`}>
                      Note
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!kids.length && (
              <tr>
                <td colSpan={4} className="tw-muted">
                  No students in this class.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
