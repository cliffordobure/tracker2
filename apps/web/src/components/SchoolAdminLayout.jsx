import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const navItems = [
  { to: '/school-admin', label: 'Dashboard', end: true, icon: 'dashboard' },
  { to: '/school-admin/students', label: 'Students', icon: 'students' },
  { to: '/school-admin/coming-soon/teachers', label: 'Teachers', icon: 'teachers' },
  { to: '/school-admin/drivers', label: 'Drivers', icon: 'drivers' },
  { to: '/school-admin/buses', label: 'Buses / Vehicles', icon: 'buses' },
  { to: '/school-admin/routes', label: 'Routes', icon: 'routes' },
  { to: '/school-admin/coming-soon/stops', label: 'Stops', icon: 'stops' },
  { to: '/school-admin/trip-instances', label: 'Trips', icon: 'trips' },
  { to: '/school-admin/live-tracking', label: 'Live Tracking', icon: 'live' },
  { to: '/school-admin/coming-soon/attendance', label: 'Attendance', icon: 'attendance' },
  { to: '/school-admin/coming-soon/reports', label: 'Reports & Analytics', icon: 'reports' },
  { to: '/school-admin/coming-soon/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/school-admin/coming-soon/incidents', label: 'Incidents', icon: 'incidents' },
  { to: '/school-admin/coming-soon/messages', label: 'Messages', icon: 'messages' },
  { to: '/school-admin/coming-soon/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/school-admin/coming-soon/users', label: 'Users & Roles', icon: 'users' },
];

const extraItems = [
  { to: '/school-admin/parents', label: 'Parents', icon: 'parents' },
  { to: '/school-admin/leave-requests', label: 'Leave Requests', icon: 'leave' },
  { to: '/school-admin/noticeboard', label: 'Noticeboard', icon: 'notice' },
  { to: '/school-admin/trip-scheduling', label: 'Trip Scheduling', icon: 'schedule' },
  { to: '/school-admin/coming-soon/classes', label: 'Classes', icon: 'students' },
  { to: '/school-admin/coming-soon/subjects', label: 'Subjects', icon: 'reports' },
  { to: '/school-admin/coming-soon/examinations', label: 'Examinations', icon: 'reports' },
  { to: '/school-admin/coming-soon/assignments', label: 'Assignments', icon: 'reports' },
  { to: '/school-admin/coming-soon/bulk-attendance', label: 'Bulk Attendance', icon: 'attendance' },
];

const pageMeta = {
  '/school-admin': { title: 'Dashboard', welcome: true },
  '/school-admin/school': { title: 'Settings' },
  '/school-admin/students': { title: 'Students' },
  '/school-admin/parents': { title: 'Parents' },
  '/school-admin/drivers': { title: 'Drivers' },
  '/school-admin/buses': { title: 'Buses / Vehicles' },
  '/school-admin/routes': { title: 'Routes' },
  '/school-admin/trip-scheduling': { title: 'Trip Scheduling' },
  '/school-admin/trip-instances': { title: 'Trips' },
  '/school-admin/live-tracking': { title: 'Live Tracking' },
  '/school-admin/leave-requests': { title: 'Leave Requests' },
  '/school-admin/noticeboard': { title: 'Noticeboard' },
};

const bottomItems = [
  { to: '/school-admin', label: 'Home', end: true, icon: 'dashboard' },
  { to: '/school-admin/students', label: 'Students', icon: 'students' },
  { to: '/school-admin/trip-instances', label: 'Trips', icon: 'trips' },
  { to: '/school-admin/live-tracking', label: 'Live', icon: 'live' },
  { to: '/school-admin/school', label: 'Settings', icon: 'settings' },
];

function NavIcon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 };
  switch (name) {
    case 'dashboard':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="5" rx="2" />
          <rect x="13" y="10" width="8" height="11" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
        </svg>
      );
    case 'students':
    case 'teachers':
    case 'parents':
    case 'drivers':
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3.5 19c.8-3 2.8-4.5 5.5-4.5S13.7 16 14.5 19" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16 14.5c2 .3 3.5 1.6 4 4.5" />
        </svg>
      );
    case 'buses':
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="10" rx="2" />
          <path d="M7 17v2M17 17v2M3 12h18" />
        </svg>
      );
    case 'routes':
    case 'trips':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <path d="M8 8c4 0 4 8 8 8" />
        </svg>
      );
    case 'stops':
      return (
        <svg {...common}>
          <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.2" />
        </svg>
      );
    case 'live':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M5 12a7 7 0 0 1 14 0" />
          <path d="M2 12a10 10 0 0 1 20 0" />
        </svg>
      );
    case 'attendance':
    case 'leave':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M4 11h16M9 16l2 2 4-4" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...common}>
          <path d="M4 19V5M4 19h16" />
          <path d="M8 15v-4M12 15V8M16 15v-7" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <path d="M10 21h4" />
        </svg>
      );
    case 'incidents':
      return (
        <svg {...common}>
          <path d="M12 3 3 20h18L12 3Z" />
          <path d="M12 10v4M12 17h.01" />
        </svg>
      );
    case 'messages':
    case 'notice':
      return (
        <svg {...common}>
          <path d="M4 6h16v10H8l-4 4V6Z" />
        </svg>
      );
    case 'calendar':
    case 'schedule':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 11h18" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

export default function SchoolAdminLayout() {
  const { user, logout, toast } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [schoolName, setSchoolName] = useState('School Admin');
  const [schoolLogo, setSchoolLogo] = useState('');
  const [search, setSearch] = useState('');
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    api('/admin/schools')
      .then((d) => {
        const school = d.schools?.[0];
        if (school?.name) setSchoolName(school.name);
        setSchoolLogo(school?.logoUrl || '');
      })
      .catch(() => {});
    api('/admin/inbox')
      .then((d) => setUnread(Number(d.unread) || 0))
      .catch(() => {});
  }, [location.pathname]);

  const meta = useMemo(() => {
    if (pageMeta[location.pathname]) return pageMeta[location.pathname];
    if (location.pathname.startsWith('/school-admin/coming-soon')) {
      const slug = location.pathname.split('/').pop();
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return { title };
    }
    return { title: 'School Admin' };
  }, [location.pathname]);

  const isLiveMap = location.pathname === '/school-admin/live-tracking';
  const isDashboard = location.pathname === '/school-admin';
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const searchable = [...navItems, ...extraItems, { to: '/school-admin/school', label: 'Settings' }];

  function onSearch(e) {
    e.preventDefault();
    const q = search.trim().toLowerCase();
    if (q.length < 2) return;
    const hit =
      searchable.find((item) => item.label.toLowerCase().startsWith(q)) ||
      searchable.find((item) => item.label.toLowerCase().includes(q));
    if (hit) {
      navigate(hit.to);
      setSearch('');
    }
  }

  return (
    <div className={`sa-shell sa-shell--navy${collapsed ? ' is-collapsed' : ''}${isLiveMap ? ' sa-shell--live-map' : ''}`}>
      {open && (
        <button type="button" className="sa-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />
      )}

      <aside className={`sa-sidebar ${open ? 'is-open' : ''}`}>
        <div className="sa-brand">
          <span className="sa-brand-mark" aria-hidden="true">
            {schoolLogo ? (
              <img src={schoolLogo} alt="" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2 3 6v6c0 5.25 3.4 10.15 9 11.5 5.6-1.35 9-6.25 9-11.5V6l-9-4Z" />
              </svg>
            )}
          </span>
          <div className="sa-brand-copy">
            <strong>{schoolName}</strong>
            <small>Transport Management System</small>
          </div>
        </div>

        <nav className="sa-nav" aria-label="School admin">
          {navItems.map((item) => (
            <NavLink key={item.to + item.label} to={item.to} end={item.end} className="sa-nav-link" title={item.label}>
              <span className="sa-nav-icon" aria-hidden="true">
                <NavIcon name={item.icon} />
              </span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
          {!collapsed && <p className="sa-nav-section-title">More</p>}
          {extraItems.map((item) => (
            <NavLink key={item.to} to={item.to} className="sa-nav-link" title={item.label}>
              <span className="sa-nav-icon" aria-hidden="true">
                <NavIcon name={item.icon} />
              </span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
          <NavLink to="/school-admin/school" className="sa-nav-link" title="Settings">
            <span className="sa-nav-icon" aria-hidden="true">
              <NavIcon name="settings" />
            </span>
            {!collapsed && <span>Settings</span>}
          </NavLink>
        </nav>

        <div className="sa-sidebar-foot">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? '»' : 'Collapse'}
          </button>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={logout}>
            {collapsed ? 'Out' : 'Sign out'}
          </button>
        </div>
      </aside>

      <div className="sa-main">
        <header className="sa-topbar">
          <div className="sa-topbar-left">
            <button type="button" className="sa-menu-btn" aria-label="Open menu" onClick={() => { setCollapsed(false); setOpen(true); }}>
              <span />
              <span />
              <span />
            </button>
            <div>
              <h1 className="sa-page-title">{meta.title}</h1>
              {isDashboard && (
                <p className="sa-page-welcome">Welcome back, {user?.name?.split(' ')[0] || 'Admin'}! Here&apos;s what&apos;s happening today.</p>
              )}
            </div>
          </div>

          <form className="sa-search" onSubmit={onSearch}>
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search anything..."
            />
          </form>

          <div className="sa-topbar-right">
            <span className="sa-date-chip">{dateLabel}</span>
            <button
              type="button"
              className="sa-icon-btn"
              aria-label="Notifications"
              onClick={() => navigate('/school-admin/coming-soon/notifications')}
            >
              <span aria-hidden="true">🔔</span>
              {unread > 0 && <i>{unread > 9 ? '9+' : unread}</i>}
            </button>
            <div className="sa-user">
              <span className="sa-user-avatar">{(user?.name || 'A').slice(0, 1)}</span>
              <div>
                <strong>{user?.name || 'Admin'}</strong>
                <small>{user?.role === 'super_admin' ? 'Super Admin' : 'Administrator'}</small>
              </div>
            </div>
          </div>
        </header>

        <div className={`sa-content${isLiveMap ? ' sa-content--map' : ''}`}>
          <Outlet context={{ globalSearch: search }} />
        </div>
      </div>

      <nav className="sa-bottom-nav" aria-label="Quick navigation">
        {bottomItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="sa-bottom-link">
            <span aria-hidden="true">
              <NavIcon name={item.icon} />
            </span>
            <small>{item.label}</small>
          </NavLink>
        ))}
      </nav>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
