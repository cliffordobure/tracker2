import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

function dueLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `Due ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function initialOf(name) {
  return (name || 'S').trim().charAt(0).toUpperCase();
}

const tones = ['green', 'purple', 'orange', 'blue'];

export default function TeacherHome() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [kids, setKids] = useState([]);
  const [notices, setNotices] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [overview, announcements, roster] = await Promise.all([
      api('/teacher/overview'),
      api('/teacher/announcements').catch(() => ({ announcements: [] })),
      api('/teacher/kids').catch(() => ({ kids: [] })),
    ]);
    setData(overview);
    setKids((roster.kids || []).slice(0, 6));
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
  const teacher = data?.teacher || user;
  const assignments = data?.assignments || [];
  const roster = kids.length ? kids : (data?.unmarked || []);

  return (
    <div className="td-home">
      {error && <div className="tw-alert">{error}</div>}

      <section className="td-banner">
        <div>
          <p className="td-banner-kicker">Teacher workspace</p>
          <h2>Inspire. Teach. Transform.</h2>
          <p>Every lesson you teach creates a brighter future.</p>
          <blockquote>Stay consistent. Make a difference for {teacher?.name?.split(' ')[0] || 'your'} class today.</blockquote>
        </div>
        <div className="td-banner-art" aria-hidden="true">
          <span className="td-art-board">Better Students<br />Brighter Tomorrows</span>
          <span className="td-art-books">📚</span>
          <span className="td-art-pencils">✏️</span>
        </div>
      </section>

      <div className="td-stats">
        <article className="td-stat td-stat--mint">
          <span className="td-stat-ico">👥</span>
          <div>
            <strong>{stats.students ?? 0}</strong>
            <small>My Students</small>
          </div>
        </article>
        <article className="td-stat td-stat--blue">
          <span className="td-stat-ico">✓</span>
          <div>
            <strong>
              {stats.markedToday ?? 0} / {stats.students ?? 0}
            </strong>
            <small>Today&apos;s Register</small>
          </div>
        </article>
        <article className="td-stat td-stat--orange">
          <span className="td-stat-ico">☰</span>
          <div>
            <strong>{stats.assignments ?? 0}</strong>
            <small>Assignments</small>
          </div>
        </article>
        <article className="td-stat td-stat--purple">
          <span className="td-stat-ico">▦</span>
          <div>
            <strong>{stats.classes ?? 0}</strong>
            <small>Classes Today</small>
          </div>
        </article>
      </div>

      <div className="td-grid">
        <section className="td-card">
          <div className="td-card-head">
            <h3>My Students</h3>
            <Link to="/teacher/students">View all</Link>
          </div>
          <ul className="td-people">
            {roster.map((k) => (
              <li key={k._id}>
                <span className="td-ava">{k.photoUrl ? <img src={k.photoUrl} alt="" /> : initialOf(k.name)}</span>
                <div>
                  <strong>{k.name}</strong>
                  <small>{k.grade || 'Student'}</small>
                </div>
                <Link className="td-pill" to={`/teacher/students/${k._id}`}>
                  Profile
                </Link>
              </li>
            ))}
            {!roster.length && <p className="tw-empty">No students on your list yet.</p>}
          </ul>
        </section>

        <section className="td-card">
          <div className="td-card-head">
            <h3>Recent Assignments</h3>
            <Link to="/teacher/assignments">View all</Link>
          </div>
          <ul className="td-work">
            {assignments.slice(0, 5).map((a, i) => (
              <li key={a._id}>
                <span className={`td-dot td-dot--${tones[i % tones.length]}`}>✎</span>
                <div>
                  <strong>{a.title}</strong>
                  <small>
                    {a.subject || 'Class'}
                    {a.grade ? ` · ${a.grade}` : ''}
                  </small>
                </div>
                <em>{dueLabel(a.dueDate) || 'Set'}</em>
              </li>
            ))}
            {!assignments.length && <p className="tw-empty">No assignments yet.</p>}
          </ul>
        </section>

        <div className="td-stack">
          <section className="td-card">
            <div className="td-card-head">
              <h3>Announcements</h3>
              <Link to="/teacher/announcements">View all</Link>
            </div>
            {notices.length ? (
              <ul className="td-work">
                {notices.map((a) => (
                  <li key={a._id}>
                    <span className="td-dot td-dot--orange">!</span>
                    <div>
                      <strong>{a.title}</strong>
                      <small>{a.kind || a.scope || 'Notice'}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="td-empty">
                <span aria-hidden="true">📢</span>
                <p>No announcements yet.</p>
              </div>
            )}
          </section>

          <section className="td-card">
            <div className="td-card-head">
              <h3>Quick Actions</h3>
            </div>
            <div className="td-quick">
              <Link to="/teacher/register">
                <span className="td-quick-ico td-stat--mint">✓</span>
                Take Attendance
              </Link>
              <Link to="/teacher/diary">
                <span className="td-quick-ico td-stat--blue">✎</span>
                Class Diary
              </Link>
              <Link to="/teacher/assignments">
                <span className="td-quick-ico td-stat--purple">☰</span>
                Set Work
              </Link>
              <Link to="/teacher/timetable">
                <span className="td-quick-ico td-stat--orange">▦</span>
                View Timetable
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
