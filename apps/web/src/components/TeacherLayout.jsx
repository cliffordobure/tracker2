import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import '../teacher.css';

const mainNav = [
  { to: '/teacher', label: 'Home', end: true, icon: 'home' },
  { to: '/teacher/register', label: 'Register', icon: 'register' },
  { to: '/teacher/diary', label: 'Diary', icon: 'diary' },
  { to: '/teacher/assignments', label: 'Work', icon: 'work' },
  { to: '/teacher/students', label: 'Students', icon: 'students' },
  { to: '/teacher/resources', label: 'Plans', icon: 'plans' },
];

const extraNav = [
  { to: '/teacher/timetable', label: 'Timetable', icon: 'timetable' },
  { to: '/teacher/announcements', label: 'Announcements', icon: 'announce' },
  { to: '/teacher/messages', label: 'Messages', icon: 'notes' },
  { to: '/teacher/notes', label: 'Parent notes', icon: 'notes' },
  { to: '/teacher/reports', label: 'Reports', icon: 'reports' },
  { to: '/teacher/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/teacher/profile', label: 'Profile', icon: 'students' },
];

const titles = [
  ['/teacher/students/', 'Student profile'],
  ['/teacher/register', 'Class register'],
  ['/teacher/diary', 'Diary'],
  ['/teacher/assignments', 'Work'],
  ['/teacher/notes', 'Parent notes'],
  ['/teacher/students', 'Students'],
  ['/teacher/resources', 'Lesson plans'],
  ['/teacher/announcements', 'Announcements'],
  ['/teacher/messages', 'Messages'],
  ['/teacher/notifications', 'Notifications'],
  ['/teacher/timetable', 'Timetable'],
  ['/teacher/reports', 'Reports'],
  ['/teacher/class', 'Class details'],
  ['/teacher/profile', 'My profile'],
  ['/teacher', 'Home'],
];

function pageTitle(pathname) {
  const hit = titles.find(([prefix]) =>
    prefix === '/teacher' ? pathname === '/teacher' : pathname === prefix || pathname.startsWith(prefix)
  );
  return hit?.[1] || 'Teacher';
}

function NavIcon({ name }) {
  const p = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (name) {
    case 'home':
      return (
        <svg {...p}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case 'register':
      return (
        <svg {...p}>
          <path d="M9 5h11M9 12h11M9 19h11" />
          <path d="M4 5h.01M4 12h.01M4 19h.01" />
        </svg>
      );
    case 'diary':
      return (
        <svg {...p}>
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Z" />
          <path d="M8 4v16" />
        </svg>
      );
    case 'work':
      return (
        <svg {...p}>
          <path d="M8 7V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" />
          <rect x="4" y="7" width="16" height="13" rx="2" />
        </svg>
      );
    case 'plans':
      return (
        <svg {...p}>
          <path d="M8 4h8v16H8z" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case 'timetable':
      return (
        <svg {...p}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 10h16M8 5v3M16 5v3" />
        </svg>
      );
    case 'announce':
      return (
        <svg {...p}>
          <path d="M5 10v4h3l5 4V6L8 10H5Z" />
          <path d="M16 9.5a3 3 0 0 1 0 5" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...p}>
          <path d="M6 17h12l-1.2-2.2V10a4.8 4.8 0 0 0-9.6 0v4.8L6 17Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...p}>
          <path d="M5 19V9.5M10 19V5M15 19v-6.5M20 19V8" />
        </svg>
      );
    case 'notes':
      return (
        <svg {...p}>
          <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H8l-4 3v-5.2A8.5 8.5 0 1 1 21 12Z" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M4 19c.7-2.8 2.6-4.2 5-4.2s4.3 1.4 5 4.2" />
        </svg>
      );
  }
}

export default function TeacherLayout() {
  const { user, logout, toast } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [params, setParams] = useSearchParams();
  const title = pageTitle(location.pathname);
  const initial = (user?.name || 'T').slice(0, 1).toUpperCase();
  const isHome = location.pathname === '/teacher';
  const isRegister = location.pathname === '/teacher/register';
  const isDiary = location.pathname === '/teacher/diary';
  const isWork = location.pathname === '/teacher/assignments';
  const isStudents = location.pathname === '/teacher/students';
  const isPlans = location.pathname === '/teacher/resources';
  const isTimetable = location.pathname === '/teacher/timetable';
  const isAnnounce = location.pathname === '/teacher/announcements';
  const isMessages = location.pathname === '/teacher/messages' || location.pathname.startsWith('/teacher/messages/');
  const isNotes = location.pathname === '/teacher/notes';
  const isClass = location.pathname === '/teacher/class';
  const isNotif = location.pathname === '/teacher/notifications';
  const isProfile = location.pathname === '/teacher/profile';
  const isDash = isHome || isRegister || isDiary || isPlans;
  const firstName = (user?.name || 'Teacher').trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const sun = hour < 17 ? '☀️' : '🌙';
  const todayLong = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  useEffect(() => {
    let cancelled = false;
    api('/teacher/notifications')
      .then((d) => {
        if (!cancelled) setUnread(d.counts?.unread || 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  return (
    <div className="tw-shell">
      {open && (
        <button type="button" className="tw-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />
      )}

      <aside className={`tw-sidebar ${open ? 'is-open' : ''}`}>
        <div className="tw-brand">
          <span className="tw-brand-mark" aria-hidden>
            TT
          </span>
          <div>
            <strong>Classroom</strong>
            <small>Teacher workspace</small>
          </div>
        </div>

        <nav className="tw-nav" onClick={() => setOpen(false)}>
          {mainNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="tw-nav-link">
              <span className="tw-nav-icon">
                <NavIcon name={item.icon} />
              </span>
              {item.label}
            </NavLink>
          ))}
          <p className="tw-nav-label">More</p>
          {extraNav.map((item) => (
            <NavLink key={item.to} to={item.to} className="tw-nav-link">
              <span className="tw-nav-icon">
                <NavIcon name={item.icon} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="tw-sidebar-foot">
          <div className="tw-promo">
            <span aria-hidden="true">{isDiary ? '🌱' : isAnnounce ? '📣' : isMessages ? '💬' : isNotes ? '👨‍👩‍👧' : isNotif ? '🔔' : '🎓'}</span>
            <strong>{isDiary ? 'Teach Today Build Tomorrow' : 'Better Learning Together'}</strong>
            <small>
              {isDiary
                ? 'Every learner matters.'
                : isAnnounce
                  ? 'Share updates. Build community.'
                  : isMessages
                    ? 'Communicate. Support. Grow.'
                    : isNotes
                      ? 'Parents. Teachers. Brighter futures.'
                      : isNotif
                        ? 'Stay informed. Make a difference.'
                        : 'Support today. Brighter tomorrow.'}
            </small>
          </div>
          <button type="button" className="tw-user-mini tw-user-link" onClick={() => navigate('/teacher/profile')}>
            <span>{user?.photoUrl ? <img src={user.photoUrl} alt="" /> : initial}</span>
            <div>
              <strong>{user?.name || 'Teacher'}</strong>
              <small>View profile</small>
            </div>
          </button>
          <button type="button" className="tw-btn tw-btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="tw-main">
        <header className={`tw-topbar${isDash ? ' is-dash' : ''}${isWork || isStudents || isTimetable || isAnnounce || isMessages || isNotes || isClass || isNotif || isProfile ? ' is-work' : ''}${isPlans ? ' is-plans' : ''}`}>
          <button type="button" className="tw-menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}>
            <span />
            <span />
            <span />
          </button>
          {isHome ? (
            <div className="tw-dash-hello">
              <h1>
                {hello}, {firstName}! {sun}
              </h1>
              <p>Here&apos;s what&apos;s happening in your classes today.</p>
            </div>
          ) : isRegister ? (
            <div className="tw-dash-hello">
              <h1>Hello, {firstName} 👋</h1>
              <p>Manage your class attendance with ease.</p>
            </div>
          ) : isDiary ? (
            <div className="tw-dash-hello">
              <h1>
                {hello}, {firstName}! 👋
              </h1>
              <p>Record, reflect, and make a difference today.</p>
            </div>
          ) : isPlans ? (
            <div className="tw-dash-hello">
              <h1>
                {hello}, {firstName}! 👋
              </h1>
              <p>Plan, teach and inspire. Great lessons create brighter futures.</p>
            </div>
          ) : isWork || isStudents || isTimetable || isAnnounce || isMessages || isNotes || isClass || isNotif || isProfile ? null : (
            <div>
              <p className="tw-kicker">Teacher</p>
              <h1>{title}</h1>
            </div>
          )}
          {isHome && (
            <div className="tw-dash-date">
              <strong>{todayLong}</strong>
              <small>Stay consistent, make a difference!</small>
            </div>
          )}
          {(isDiary || isWork || isStudents || isPlans || isTimetable || isAnnounce || isMessages || isNotes || isClass || isNotif || isProfile) && (
            <label className="tw-top-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                value={params.get('q') || ''}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  if (e.target.value) next.set('q', e.target.value);
                  else next.delete('q');
                  setParams(next, { replace: true });
                }}
                placeholder={
                  isProfile
                    ? 'Search students, classes, or announcements...'
                    : isNotif
                      ? 'Search notifications, messages, or reminders...'
                      : isClass
                        ? 'Search classes, students, or subjects...'
                        : isNotes
                          ? 'Search students, parents or notes...'
                          : isMessages
                            ? 'Search messages, parents, or students...'
                            : isAnnounce
                              ? 'Search announcements, classes, or keywords...'
                              : isTimetable
                                ? 'Search classes, subjects, or timetable...'
                                : isPlans
                                  ? 'Search plans, resources, subjects...'
                                  : isStudents
                                    ? 'Search students, parents or classes...'
                                    : isWork
                                      ? 'Search students, assignments, or classes...'
                                      : 'Search students, subjects, or entries...'
                }
              />
            </label>
          )}
          <div className="tw-topbar-actions">
            <button
              type="button"
              className="tw-bell"
              aria-label="Notifications"
              onClick={() => navigate('/teacher/notifications')}
            >
              <NavIcon name="bell" />
              {unread > 0 ? <em>{unread > 9 ? '9+' : unread}</em> : null}
            </button>
            {(isDiary || isPlans) && (
              <button
                type="button"
                className="tw-bell"
                aria-label={isPlans ? 'Create lesson plan' : 'Create diary entry'}
                onClick={() => document.getElementById(isPlans ? 'tplan-create' : 'tdia-create')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
            <button type="button" className="tw-topbar-user tw-user-link" onClick={() => navigate('/teacher/profile')}>
              <span className="tw-avatar">{user?.photoUrl ? <img src={user.photoUrl} alt="" /> : initial}</span>
              <div>
                <strong>{user?.name || 'Teacher'}</strong>
                <small>{user?.email}</small>
              </div>
              <svg className="tw-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
        </header>
        <div className="tw-content">
          <Outlet />
        </div>
      </div>

      <nav className="tw-bottom-nav" aria-label="Teacher">
        {mainNav.slice(0, 5).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="tw-bottom-link">
            <NavIcon name={item.icon} />
            <small>{item.label}</small>
          </NavLink>
        ))}
      </nav>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
