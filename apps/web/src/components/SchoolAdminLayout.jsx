import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const navSections = [
  {
    items: [{ to: '/school-admin', label: 'Dashboard', end: true, icon: 'dashboard' }],
  },
  {
    title: 'Administration',
    items: [
      { to: '/school-admin/school', label: 'School', icon: 'school' },
      { to: '/school-admin/students', label: 'Students', icon: 'students' },
      { to: '/school-admin/parents', label: 'Parents', icon: 'parents' },
      { to: '/school-admin/drivers', label: 'Staff', icon: 'staff' },
    ],
  },
  {
    title: 'Academics',
    items: [
      { to: '/school-admin/coming-soon/classes', label: 'Classes', icon: 'classes' },
      { to: '/school-admin/coming-soon/subjects', label: 'Subjects', icon: 'subjects' },
      { to: '/school-admin/coming-soon/examinations', label: 'Examinations', icon: 'exam' },
      { to: '/school-admin/coming-soon/assignments', label: 'Assignments', icon: 'assign' },
    ],
  },
  {
    title: 'Student / Attendance',
    items: [
      { to: '/school-admin/coming-soon/attendance', label: 'Attendance', icon: 'attendance' },
      { to: '/school-admin/leave-requests', label: 'Leave Requests', icon: 'leave' },
      { to: '/school-admin/coming-soon/bulk-attendance', label: 'Bulk Attendance', icon: 'bulk' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { to: '/school-admin/noticeboard', label: 'Noticeboard', icon: 'notice' },
      { to: '/school-admin/coming-soon/messages', label: 'Messages', icon: 'messages' },
    ],
  },
  {
    title: 'Transport',
    items: [
      { to: '/school-admin/routes', label: 'Routes', icon: 'routes' },
      { to: '/school-admin/drivers', label: 'Drivers', icon: 'drivers' },
      { to: '/school-admin/buses', label: 'Vehicles', icon: 'buses' },
      { to: '/school-admin/trip-scheduling', label: 'Trip Scheduling', icon: 'schedule' },
      { to: '/school-admin/trip-instances', label: 'Trip Instances', icon: 'trips' },
      { to: '/school-admin/live-tracking', label: 'Live Tracking', icon: 'live' },
    ],
  },
];

const pageMeta = {
  '/school-admin': { title: 'Dashboard', crumbs: ['Home', 'Dashboard'] },
  '/school-admin/school': { title: 'School', crumbs: ['Home', 'Administration', 'School'] },
  '/school-admin/students': { title: 'Students', crumbs: ['Home', 'Administration', 'Students'] },
  '/school-admin/parents': { title: 'Parents', crumbs: ['Home', 'Administration', 'Parents'] },
  '/school-admin/drivers': { title: 'Drivers / Staff', crumbs: ['Home', 'Transport', 'Drivers'] },
  '/school-admin/buses': { title: 'Vehicles', crumbs: ['Home', 'Transport', 'Vehicles'] },
  '/school-admin/routes': { title: 'Routes', crumbs: ['Home', 'Transport', 'Routes'] },
  '/school-admin/trip-scheduling': {
    title: 'Trip Scheduling',
    crumbs: ['Home', 'Transport', 'Trip Scheduling'],
  },
  '/school-admin/trip-instances': {
    title: 'Trip Instances',
    crumbs: ['Home', 'Transport', 'Trip Instances'],
  },
  '/school-admin/live-tracking': {
    title: 'Live Tracking',
    crumbs: ['Home', 'Transport', 'Live Tracking'],
  },
  '/school-admin/leave-requests': {
    title: 'Leave Requests',
    crumbs: ['Home', 'Student Attendance', 'Leave Requests'],
  },
  '/school-admin/noticeboard': {
    title: 'Noticeboard',
    crumbs: ['Home', 'Communication', 'Noticeboard'],
  },
};

const bottomItems = [
  { to: '/school-admin', label: 'Home', end: true, icon: 'dashboard' },
  { to: '/school-admin/leave-requests', label: 'Leave', icon: 'leave' },
  { to: '/school-admin/trip-scheduling', label: 'Schedule', icon: 'schedule' },
  { to: '/school-admin/live-tracking', label: 'Live', icon: 'live' },
  { to: '/school-admin/students', label: 'Kids', icon: 'students' },
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
    case 'leave':
      return (
        <svg {...common}>
          <path d="M8 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2" />
          <path d="M15 12H3m0 0 3-3m-3 3 3 3" />
        </svg>
      );
    case 'students':
    case 'parents':
    case 'staff':
    case 'drivers':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3.5 19c.8-3 2.8-4.5 5.5-4.5S13.7 16 14.5 19" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16 14.5c2 .3 3.5 1.6 4 4.5" />
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
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2.5" />
        </svg>
      );
  }
}

export default function SchoolAdminLayout() {
  const { user, logout, toast } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [schoolName, setSchoolName] = useState('School Admin');
  const [search, setSearch] = useState('');

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
      })
      .catch(() => {});
  }, []);

  const meta = useMemo(() => {
    if (pageMeta[location.pathname]) return pageMeta[location.pathname];
    if (location.pathname.startsWith('/school-admin/coming-soon')) {
      const slug = location.pathname.split('/').pop();
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return { title, crumbs: ['Home', title] };
    }
    return { title: 'School Admin', crumbs: ['Home'] };
  }, [location.pathname]);

  const isLiveMap = location.pathname === '/school-admin/live-tracking';

  return (
    <div className={`sa-shell sa-shell--navy${isLiveMap ? ' sa-shell--live-map' : ''}`}>
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
          <span className="sa-brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2 3 6v6c0 5.25 3.4 10.15 9 11.5 5.6-1.35 9-6.25 9-11.5V6l-9-4Z" />
            </svg>
          </span>
          <div>
            <strong>{schoolName}</strong>
            <small>School Admin</small>
          </div>
        </div>

        <nav className="sa-nav" aria-label="School admin">
          {navSections.map((section, idx) => (
            <div key={section.title || idx} className="sa-nav-section">
              {section.title && <p className="sa-nav-section-title">{section.title}</p>}
              {section.items.map((item) => (
                <NavLink key={item.to + item.label} to={item.to} end={item.end} className="sa-nav-link">
                  <span className="sa-nav-icon" aria-hidden="true">
                    <NavIcon name={item.icon} />
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sa-sidebar-foot">
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
            <div className="sa-crumbs" aria-label="Breadcrumb">
              {meta.crumbs.map((c, i) => (
                <span key={`${c}-${i}`}>
                  {i > 0 && <span className="sa-crumb-sep">›</span>}
                  <span className={i === meta.crumbs.length - 1 ? 'is-current' : ''}>{c}</span>
                </span>
              ))}
            </div>
          </div>

          <label className="sa-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search anything..."
            />
          </label>

          <div className="sa-topbar-right">
            <button type="button" className="sa-icon-btn" aria-label="Messages">
              <span>💬</span>
              <i>4</i>
            </button>
            <button type="button" className="sa-icon-btn" aria-label="Notifications">
              <span>🔔</span>
              <i>12</i>
            </button>
            <div className="sa-user">
              <span className="sa-user-avatar">{(user?.name || 'A').slice(0, 1)}</span>
              <div>
                <strong>{user?.name || 'Admin User'}</strong>
                <small>School Admin</small>
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
