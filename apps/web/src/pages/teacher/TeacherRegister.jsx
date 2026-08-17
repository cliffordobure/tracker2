import { useEffect, useMemo, useState } from 'react';
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
  const [date, setDate] = useState(todayInput());
  const [grade, setGrade] = useState('');
  const [grades, setGrades] = useState([]);
  const [kids, setKids] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    const params = new URLSearchParams({ date });
    if (grade) params.set('grade', grade);
    const data = await api(`/teacher/attendance?${params}`);
    setKids(data.kids || []);
    setGrades(data.grades || []);
    setError('');
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, grade]);

  const summary = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
    for (const k of kids) {
      const s = k.attendance?.status;
      if (s && counts[s] != null) counts[s] += 1;
      else counts.unmarked += 1;
    }
    return counts;
  }, [kids]);

  const mark = async (kidId, status) => {
    setBusyId(kidId);
    setError('');
    try {
      await api('/teacher/attendance', {
        method: 'POST',
        body: { kidId, date, status },
      });
      showToast(`${status} saved`, 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const markAllPresent = async () => {
    const unmarked = kids.filter((k) => !k.attendance).map((k) => ({ kidId: k._id, status: 'present' }));
    if (!unmarked.length) return;
    setError('');
    try {
      await api('/teacher/attendance/bulk', { method: 'POST', body: { date, marks: unmarked } });
      showToast('Unmarked students set to present', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack">
      <div>
        <h2>Class register</h2>
        <p className="lede">
          Mark who is present, absent, late, or excused. Parents are notified when a child is absent
          or late.
        </p>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="row-actions" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
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
        <button type="button" className="btn btn-secondary" onClick={markAllPresent}>
          Mark remaining present
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span>Present</span>
          <strong>{summary.present}</strong>
        </div>
        <div className="stat">
          <span>Absent</span>
          <strong>{summary.absent}</strong>
        </div>
        <div className="stat">
          <span>Late</span>
          <strong>{summary.late}</strong>
        </div>
        <div className="stat">
          <span>Not marked</span>
          <strong>{summary.unmarked}</strong>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Grade</th>
              <th>Mark</th>
            </tr>
          </thead>
          <tbody>
            {kids.map((k) => {
              const current = k.attendance?.status || '';
              return (
                <tr key={k._id}>
                  <td>
                    <strong>{k.name}</strong>
                    {k.admissionNo ? <div className="muted">{k.admissionNo}</div> : null}
                  </td>
                  <td>{k.grade || '—'}</td>
                  <td>
                    <div className="register-marks">
                      {STATUSES.map((s) => (
                        <button
                          key={s.v}
                          type="button"
                          className={`btn ${current === s.v ? 'btn-primary' : 'btn-ghost'}`}
                          disabled={busyId === k._id}
                          onClick={() => mark(k._id, s.v)}
                        >
                          {s.l}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!kids.length && (
              <tr>
                <td colSpan={3} className="muted">
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
