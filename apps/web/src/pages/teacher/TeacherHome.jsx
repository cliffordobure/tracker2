import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

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

  if (!data && !error) {
    return (
      <div className="tw-page">
        <p className="tw-muted">Loading classroom…</p>
      </div>
    );
  }

  const stats = data?.stats || {};
  const school = data?.school;
  const unmarked = data?.unmarked || [];
  const assignments = data?.assignments || [];
  const notes = data?.recentNotes || [];

  return (
    <div className="tw-page">
      {error && <div className="tw-alert">{error}</div>}

      <section className="tw-hero">
        <div>
          <p className="tw-kicker" style={{ color: 'rgba(244,255,251,0.75)' }}>
            Classroom
          </p>
          <h2>{school?.name || 'Class workspace'}</h2>
          <p>Mark the register, post diary photos, set work, and message a parent when needed.</p>
        </div>
        <div className="tw-hero-date">
          <small>Today</small>
          <strong>{todayLabel()}</strong>
        </div>
      </section>

      <div className="tw-metrics">
        <div className="tw-metric">
          <span>Students</span>
          <strong>{stats.students ?? 0}</strong>
        </div>
        <div className="tw-metric">
          <span>Register</span>
          <strong>
            {stats.markedToday ?? 0}/{stats.students ?? 0}
          </strong>
        </div>
        <div className="tw-metric is-present">
          <span>Present</span>
          <strong>{stats.present ?? 0}</strong>
        </div>
        <div className="tw-metric is-away">
          <span>Absent / late</span>
          <strong>{(stats.absent || 0) + (stats.late || 0)}</strong>
        </div>
        <div className="tw-metric">
          <span>Assignments</span>
          <strong>{stats.assignments ?? 0}</strong>
        </div>
      </div>

      <div className="tw-actions">
        <Link className="tw-action" to="/teacher/register">
          <span className="tw-action-icon">✓</span>
          <strong>Mark register</strong>
          <span>Take today’s attendance</span>
        </Link>
        <Link className="tw-action" to="/teacher/diary">
          <span className="tw-action-icon">✎</span>
          <strong>Class diary</strong>
          <span>Photos and the day’s story</span>
        </Link>
        <Link className="tw-action" to="/teacher/assignments">
          <span className="tw-action-icon">☰</span>
          <strong>Set work</strong>
          <span>Post homework or classwork</span>
        </Link>
        <Link className="tw-action" to="/teacher/notes">
          <span className="tw-action-icon">✉</span>
          <strong>Message a parent</strong>
          <span>Private note to a guardian</span>
        </Link>
      </div>

      <div className="tw-grid">
        <div className="tw-panel">
          <div className="tw-panel-head">
            <div>
              <h3>Register still open</h3>
              <p>Students not marked on today’s class register</p>
            </div>
            <Link className="tw-btn tw-btn-primary" to="/teacher/register">
              Mark
            </Link>
          </div>
          <ul className="tw-list">
            {unmarked.map((k) => (
              <li key={k._id}>
                <div>
                  <strong>{k.name}</strong>
                  <div className="tw-muted">{k.grade || 'No grade'}</div>
                </div>
              </li>
            ))}
            {!unmarked.length && <p className="tw-empty">All students on the register have been marked.</p>}
          </ul>
        </div>

        <div className="tw-page">
          <div className="tw-panel">
            <div className="tw-panel-head">
              <div>
                <h3>Assignments</h3>
                <p>Work you have set for the class</p>
              </div>
              <Link className="tw-btn tw-btn-secondary" to="/teacher/assignments">
                Set work
              </Link>
            </div>
            <ul className="tw-list">
              {assignments.slice(0, 4).map((a) => (
                <li key={a._id}>
                  <div>
                    <strong>{a.title}</strong>
                    <div className="tw-muted">
                      {a.subject || 'Class'}
                      {a.grade ? ` · ${a.grade}` : ''}
                    </div>
                  </div>
                </li>
              ))}
              {!assignments.length && <p className="tw-empty">No assignments yet.</p>}
            </ul>
          </div>

          <div className="tw-panel">
            <div className="tw-panel-head">
              <div>
                <h3>Parent updates</h3>
                <p>Recent notes sent to guardians</p>
              </div>
              <Link className="tw-btn tw-btn-ghost" to="/teacher/notes">
                Message
              </Link>
            </div>
            <ul className="tw-list">
              {notes.slice(0, 4).map((n) => (
                <li key={n._id}>
                  <div>
                    <strong>{n.title}</strong>
                    <div className="tw-muted">
                      {n.kidId?.name || 'Student'} · {n.category}
                    </div>
                  </div>
                </li>
              ))}
              {!notes.length && <p className="tw-empty">No parent updates sent yet.</p>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
