import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../teacher.css';

const navItems = [
  { to: '/teacher', label: 'Overview', end: true, icon: 'home' },
  { to: '/teacher/register', label: 'Register', icon: 'register' },
  { to: '/teacher/diary', label: 'Diary', icon: 'diary' },
  { to: '/teacher/assignments', label: 'Assignments', icon: 'work' },
  { to: '/teacher/notes', label: 'Parent updates', icon: 'notes' },
  { to: '/teacher/students', label: 'Students', icon: 'students' },
];

const titles = {
  '/teacher': 'Overview',
  '/teacher/register': 'Class register',
  '/teacher/diary': 'Class diary',
  '/teacher/assignments': 'Assignments',
  '/teacher/notes': 'Parent updates',
  '/teacher/students': 'Students',
};

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
          <circle cx="17" cy="9" r="2.4" />
          <path d="M16 19c.4-1.8 1.6-3 3.4-3.4" />
        </svg>
      );
  }
}

export default function TeacherLayout() {
  const { user, logout, toast } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const title = titles[location.pathname] || 'Teacher';
  const initial = (user?.name || 'T').slice(0, 1).toUpperCase();

  return (
    <div className="tw-shell">
      {open && (
        <button type="button" className="tw-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />
      )}

      <aside className={`tw-sidebar ${open ? 'is-open' : ''}`}>
        <div className="tw-brand">
          <span className="tw-brand-mark" aria-hidden>
            SK
          </span>
          <div>
            <strong>Classroom</strong>
            <small>Teacher workspace</small>
          </div>
        </div>

        <nav className="tw-nav" onClick={() => setOpen(false)}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="tw-nav-link">
              <span className="tw-nav-icon">
                <NavIcon name={item.icon} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="tw-sidebar-foot">
          <div className="tw-user-mini">
            <span>{initial}</span>
            <div>
              <strong>{user?.name || 'Teacher'}</strong>
              <small>Signed in</small>
            </div>
          </div>
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
          <div className="tw-topbar-user">
            <span className="tw-avatar">{initial}</span>
            <div>
              <strong>{user?.name || 'Teacher'}</strong>
              <small>{user?.email}</small>
            </div>
          </div>
        </header>
        <div className="tw-content">
          <Outlet />
        </div>
      </div>

      <nav className="tw-bottom-nav" aria-label="Teacher">
        {navItems.slice(0, 5).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="tw-bottom-link">
            <NavIcon name={item.icon} />
            <small>{item.label === 'Parent updates' ? 'Updates' : item.label}</small>
          </NavLink>
        ))}
      </nav>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
