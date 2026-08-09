import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navSections = [
  {
    items: [
      { to: '/school-admin', label: 'Dashboard', end: true, icon: '◈' },
      { to: '/school-admin/students', label: 'Students', icon: '◎' },
      { to: '/school-admin/parents', label: 'Parents', icon: '◐' },
    ],
  },
  {
    title: 'Transport',
    items: [
      { to: '/school-admin/buses', label: 'Buses', icon: '▣' },
      { to: '/school-admin/drivers', label: 'Drivers', icon: '◉' },
      { to: '/school-admin/routes', label: 'Routes', icon: '◌' },
      { to: '/school-admin/trip-scheduling', label: 'Trip Scheduling', icon: '▦' },
      { to: '/school-admin/trip-instances', label: 'Trip Instances', icon: '▤' },
    ],
  },
  {
    items: [
      { to: '/school-admin/live-tracking', label: 'Live Tracking', icon: '◎' },
      { to: '/school-admin/school', label: 'School', icon: '⌂' },
    ],
  },
];

const pageTitles = {
  '/school-admin': 'Dashboard',
  '/school-admin/students': 'Students',
  '/school-admin/parents': 'Parents',
  '/school-admin/buses': 'Buses',
  '/school-admin/drivers': 'Drivers',
  '/school-admin/routes': 'Routes',
  '/school-admin/trip-scheduling': 'Trip Scheduling',
  '/school-admin/trip-instances': 'Trip Instances',
  '/school-admin/live-tracking': 'Live Tracking',
  '/school-admin/school': 'School settings',
  '/school-admin/dispatch': 'Trip Scheduling',
};

const bottomItems = [
  { to: '/school-admin', label: 'Home', end: true, icon: '◈' },
  { to: '/school-admin/trip-scheduling', label: 'Schedule', icon: '▦' },
  { to: '/school-admin/trip-instances', label: 'Trips', icon: '▤' },
  { to: '/school-admin/live-tracking', label: 'Live', icon: '◎' },
  { to: '/school-admin/students', label: 'Kids', icon: '◎' },
];

export default function SchoolAdminLayout() {
  const { user, logout, toast } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const title = pageTitles[location.pathname] || 'School Admin';

  return (
    <div className="sa-shell">
      <div className="sa-bg" aria-hidden="true" />

      {open && (
        <button
          type="button"
          className="sa-backdrop"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={`sa-sidebar ${open ? 'is-open' : ''}`}>
        <div className="sa-brand">
          <span className="sa-brand-mark">SK</span>
          <div>
            <strong>SchoolKids</strong>
            <small>Operations</small>
          </div>
        </div>

        <nav className="sa-nav" aria-label="School admin">
          {navSections.map((section, idx) => (
            <div key={section.title || idx} className="sa-nav-section">
              {section.title && <p className="sa-nav-section-title">{section.title}</p>}
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="sa-nav-link">
                  <span className="sa-nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sa-sidebar-foot">
          <div className="sa-user">
            <span className="sa-user-avatar">{(user?.name || 'A').slice(0, 1)}</span>
            <div>
              <strong>{user?.name}</strong>
              <small>School admin</small>
            </div>
          </div>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="sa-main">
        <header className="sa-topbar">
          <div className="sa-topbar-left">
            <button
              type="button"
              className="sa-menu-btn"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <p className="sa-eyebrow">School administration</p>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="sa-topbar-right">
            <span className="sa-email">{user?.email}</span>
          </div>
        </header>

        <div className="sa-content">
          <Outlet />
        </div>
      </div>

      <nav className="sa-bottom-nav" aria-label="Quick navigation">
        {bottomItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="sa-bottom-link">
            <span aria-hidden="true">{item.icon}</span>
            <small>{item.label}</small>
          </NavLink>
        ))}
      </nav>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
