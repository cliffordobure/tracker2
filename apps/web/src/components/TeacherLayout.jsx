import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  ['/teacher/diary', 'Class diary'],
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
  const title = pageTitle(location.pathname);
  const initial = (user?.name || 'T').slice(0, 1).toUpperCase();

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
        <header className="tw-topbar">
          <button type="button" className="tw-menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}>
            <span />
            <span />
            <span />
          </button>
          <div>
            <p className="tw-kicker">Teacher</p>
            <h1>{title}</h1>
          </div>
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
            <div className="tw-topbar-user">
              <span className="tw-avatar">{user?.photoUrl ? <img src={user.photoUrl} alt="" /> : initial}</span>
              <div>
                <strong>{user?.name || 'Teacher'}</strong>
                <small>{user?.email}</small>
              </div>
            </div>
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
