import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

export default function TeacherHome() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [notices, setNotices] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [overview, announcements] = await Promise.all([
      api('/teacher/overview'),
      api('/teacher/announcements').catch(() => ({ announcements: [] })),
    ]);
    setData(overview);
    setNotices((announcements.important || announcements.announcements || []).slice(0, 3));
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
  const teacher = data?.teacher || user;
  const unmarked = data?.unmarked || [];
  const assignments = data?.assignments || [];
  const notes = data?.recentNotes || [];
  const firstClass = data?.grades?.[0] || '';

  return (
    <div className="tw-page">
      {error && <div className="tw-alert">{error}</div>}

      <section className="tw-hero">
        <div>
          <p className="tw-kicker" style={{ color: 'rgba(244,255,251,0.75)' }}>
            Good day, {teacher?.name?.split(' ')[0] || 'Teacher'}
          </p>
          <h2>{school?.name || 'Class workspace'}</h2>
          <p>Mark the register, post the diary, set work, and message a parent when needed.</p>
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
          <strong>Take attendance</strong>
          <span>Mark today’s register</span>
        </Link>
        <Link className="tw-action" to="/teacher/diary">
          <span className="tw-action-icon">✎</span>
          <strong>Class diary</strong>
          <span>Photos and the day’s story</span>
        </Link>
        <Link className="tw-action" to="/teacher/assignments">
          <span className="tw-action-icon">☰</span>
          <strong>Set work</strong>
          <span>Homework and classwork</span>
        </Link>
        <Link className="tw-action" to="/teacher/timetable">
          <span className="tw-action-icon">▦</span>
          <strong>Timetable</strong>
          <span>This week’s periods</span>
        </Link>
        <Link className="tw-action" to={firstClass ? `/teacher/class?grade=${encodeURIComponent(firstClass)}` : '/teacher/students'}>
          <span className="tw-action-icon">⌂</span>
          <strong>My classes</strong>
          <span>Roster and class notes</span>
        </Link>
        <Link className="tw-action" to="/teacher/messages">
          <span className="tw-action-icon">✉</span>
          <strong>Messages</strong>
          <span>Chat with a parent</span>
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
                <Link to={`/teacher/students/${k._id}`}>Profile</Link>
              </li>
            ))}
            {!unmarked.length && <p className="tw-empty">All students on the register have been marked.</p>}
          </ul>
        </div>

        <div className="tw-page">
          <div className="tw-panel">
            <div className="tw-panel-head">
              <div>
                <h3>Announcements</h3>
                <p>Latest school and class notices</p>
              </div>
              <Link className="tw-btn tw-btn-ghost" to="/teacher/announcements">
                View all
              </Link>
            </div>
            <ul className="tw-list">
              {notices.map((a) => (
                <li key={a._id}>
                  <div>
                    <strong>{a.title}</strong>
                    <div className="tw-muted">{a.kind || a.scope || 'Notice'}</div>
                  </div>
                </li>
              ))}
              {!notices.length && <p className="tw-empty">No announcements yet.</p>}
            </ul>
          </div>

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
