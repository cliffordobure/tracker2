import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

export default function TeacherHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const overview = await api('/teacher/overview');
    setData(overview);
    setError('');
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  if (!data && !error) return <p>Loading…</p>;

  const stats = data?.stats || {};
  const school = data?.school;

  return (
    <div className="stack">
      {error && <div className="alert">{error}</div>}
      <div>
        <p className="eyebrow">Teacher</p>
        <h2>{school?.name || 'Class workspace'}</h2>
        <p className="lede">
          Mark the daily register, set assignments, and message parents about a student.
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span>Students</span>
          <strong>{stats.students ?? 0}</strong>
        </div>
        <div className="stat">
          <span>Register today</span>
          <strong>
            {stats.markedToday ?? 0}/{stats.students ?? 0}
          </strong>
        </div>
        <div className="stat">
          <span>Present</span>
          <strong>{stats.present ?? 0}</strong>
        </div>
        <div className="stat">
          <span>Absent / late</span>
          <strong>{(stats.absent || 0) + (stats.late || 0)}</strong>
        </div>
        <div className="stat">
          <span>Open assignments</span>
          <strong>{stats.assignments ?? 0}</strong>
        </div>
      </div>

      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Register still open</h2>
              <p className="muted">Students not marked on today’s class register</p>
            </div>
            <Link className="btn btn-primary" to="/teacher/register">
              Mark register
            </Link>
          </div>
          <ul className="kid-list">
            {(data?.unmarked || []).map((k) => (
              <li key={k._id} className="kid-row">
                <div>
                  <strong>{k.name}</strong>
                  <div className="muted">{k.grade || 'No grade'}</div>
                </div>
              </li>
            ))}
            {!data?.unmarked?.length && (
              <li className="muted">All students on the register have been marked.</li>
            )}
          </ul>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Assignments</h2>
                <p className="muted">Work you have set for the class</p>
              </div>
              <Link className="btn btn-secondary" to="/teacher/assignments">
                Set work
              </Link>
            </div>
            <ul className="kid-list">
              {(data?.assignments || []).slice(0, 5).map((a) => (
                <li key={a._id} className="kid-row">
                  <div>
                    <strong>{a.title}</strong>
                    <div className="muted">
                      {a.subject || 'Class'}
                      {a.grade ? ` · ${a.grade}` : ''}
                      {a.dueDate ? ` · due ${new Date(a.dueDate).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                </li>
              ))}
              {!data?.assignments?.length && <li className="muted">No assignments yet.</li>}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Parent updates</h2>
                <p className="muted">Recent notes sent to guardians</p>
              </div>
              <Link className="btn btn-ghost" to="/teacher/notes">
                Message a parent
              </Link>
            </div>
            <ul className="kid-list">
              {(data?.recentNotes || []).slice(0, 5).map((n) => (
                <li key={n._id} className="kid-row">
                  <div>
                    <strong>{n.title}</strong>
                    <div className="muted">
                      {n.kidId?.name || 'Student'} · {n.category}
                    </div>
                  </div>
                </li>
              ))}
              {!data?.recentNotes?.length && <li className="muted">No parent updates sent yet.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
