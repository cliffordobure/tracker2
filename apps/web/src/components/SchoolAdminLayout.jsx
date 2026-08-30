import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useTripTab } from '../lib/tripTabs';

const navItems = [
  { to: '/school-admin', label: 'Dashboard', end: true, icon: 'dashboard' },
  { to: '/school-admin/classes', label: 'Classes', icon: 'classes' },
  { to: '/school-admin/students', label: 'Students', icon: 'students' },
  { to: '/school-admin/buses', label: 'Buses / Vehicles', icon: 'buses' },
  { to: '/school-admin/drivers', label: 'Drivers', icon: 'drivers' },
  { to: '/school-admin/teachers', label: 'Teachers', icon: 'teachers' },
  { to: '/school-admin/routes', label: 'Routes', icon: 'routes' },
  { to: '/school-admin/stops', label: 'Stops', icon: 'stops' },
  { to: '/school-admin/trip-instances', label: 'Trips', icon: 'trips' },
  { to: '/school-admin/live-tracking', label: 'Live Tracking', icon: 'live' },
  { to: '/school-admin/parents', label: 'Parents', icon: 'parents' },
  { to: '/school-admin/attendance', label: 'Attendance', icon: 'attendance' },
  { to: '/school-admin/reports', label: 'Reports & Analytics', icon: 'reports' },
  { to: '/school-admin/notifications', label: 'Notifications', icon: 'bell', badge: 'unread' },
  { to: '/school-admin/incidents', label: 'Incidents', icon: 'incidents', badge: 'incidents' },
  { to: '/school-admin/messages', label: 'Messages', icon: 'messages', badge: 'messages' },
  { to: '/school-admin/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/school-admin/users', label: 'Users & Roles', icon: 'users' },
];

const extraItems = [
  { to: '/school-admin/leave-requests', label: 'Leave Requests', icon: 'leave' },
  { to: '/school-admin/noticeboard', label: 'Noticeboard', icon: 'notice' },
  { to: '/school-admin/subjects', label: 'Subjects', icon: 'reports' },
  { to: '/school-admin/examinations', label: 'Examinations', icon: 'reports' },
  { to: '/school-admin/assignments', label: 'Assignments', icon: 'reports' },
];

const pageMeta = {
  '/school-admin': { title: 'Dashboard', welcome: true },
  '/school-admin/school': { title: 'Settings', crumbs: ['Dashboard', 'Settings'] },
  '/school-admin/students': { title: 'Students', crumbs: ['Dashboard', 'Students'] },
  '/school-admin/teachers': { title: 'Teachers', crumbs: ['Dashboard', 'Teachers'] },
  '/school-admin/parents': { title: 'Parents', crumbs: ['Dashboard', 'Parents'] },
  '/school-admin/drivers': { title: 'Drivers', crumbs: ['Dashboard', 'Drivers'] },
  '/school-admin/buses': { title: 'Buses / Vehicles', crumbs: ['Dashboard', 'Buses / Vehicles'] },
  '/school-admin/routes': { title: 'Routes', crumbs: ['Dashboard', 'Routes'] },
  '/school-admin/stops': { title: 'Stops', crumbs: ['Dashboard', 'Stops'] },
  '/school-admin/trip-instances': { title: 'Trips', crumbs: ['Dashboard', 'Trips'] },
  '/school-admin/live-tracking': { title: 'Live Tracking', crumbs: ['Dashboard', 'Live Tracking'] },
  '/school-admin/reports': { title: 'Reports & Analytics', crumbs: ['Dashboard', 'Reports & Analytics'] },
  '/school-admin/calendar': { title: 'Calendar', crumbs: ['Dashboard', 'Calendar'] },
  '/school-admin/notifications': { title: 'Notifications', crumbs: ['Dashboard', 'Notifications'] },
  '/school-admin/incidents': { title: 'Incidents', crumbs: ['Dashboard', 'Incidents'] },
  '/school-admin/messages': { title: 'Messages', crumbs: ['Dashboard', 'Messages'] },
  '/school-admin/users': { title: 'Users & Roles', crumbs: ['Dashboard', 'Users & Roles'] },
  '/school-admin/classes': { title: 'Classes', crumbs: ['Dashboard', 'Classes'] },
  '/school-admin/subjects': { title: 'Subjects', crumbs: ['Dashboard', 'Subjects'] },
  '/school-admin/examinations': { title: 'Examinations', crumbs: ['Dashboard', 'Examinations'] },
  '/school-admin/assignments': { title: 'Assignments', crumbs: ['Dashboard', 'Assignments'] },
  '/school-admin/attendance': { title: 'Attendance', crumbs: ['Dashboard', 'Attendance'] },
  '/school-admin/leave-requests': { title: 'Leave Requests', crumbs: ['Dashboard', 'Leave Requests'] },
  '/school-admin/noticeboard': { title: 'Noticeboard', crumbs: ['Dashboard', 'Noticeboard'] },
};

const bottomItems = [
  { to: '/school-admin', label: 'Home', end: true, icon: 'dashboard' },
  { to: '/school-admin/students', label: 'Students', icon: 'students' },
  { to: '/school-admin/trip-instances', label: 'Trips', icon: 'trips' },
  { to: '/school-admin/live-tracking', label: 'Live', icon: 'live' },
  { to: '/school-admin/school', label: 'Settings', icon: 'settings' },
];

function prettyName(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

function greetingFor(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${prettyName(name)}! 👋`;
}

function NavIcon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
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
    case 'classes':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="11" rx="1.6" />
          <path d="M8 20h8M12 16v4" />
          <path d="M8 9.2h8M8 12.2h5" />
        </svg>
      );
    case 'students':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.6 19c.7-2.8 2.6-4.2 5.4-4.2S13.7 16.2 14.4 19" />
          <circle cx="17" cy="9" r="2.3" />
          <path d="M16.2 14.6c1.8.3 3.2 1.5 3.8 4.4" />
        </svg>
      );
    case 'teachers':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 19c.9-3.1 3.2-4.6 7-4.6S18.1 15.9 19 19" />
          <path d="M16 4.5 20 6.2v2.2" />
        </svg>
      );
    case 'parents':
      return (
        <svg {...common}>
          <circle cx="8" cy="9" r="2.8" />
          <circle cx="16" cy="9" r="2.8" />
          <path d="M3.8 19c.6-2.6 2.2-3.8 4.2-3.8s3.6 1.2 4.2 3.8" />
          <path d="M12 19c.6-2.6 2.2-3.8 4.2-3.8s3.6 1.2 4.2 3.8" />
        </svg>
      );
    case 'drivers':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.6 19c.7-2.8 2.6-4.2 5.4-4.2S13.7 16.2 14.4 19" />
          <circle cx="17" cy="9" r="2.3" />
          <path d="M16.2 14.6c1.8.3 3.2 1.5 3.8 4.4" />
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
  const [searchParams] = useSearchParams();
  const tripTab = useTripTab();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [schoolName, setSchoolName] = useState('School Admin');
  const [schoolLogo, setSchoolLogo] = useState('');
  const [search, setSearch] = useState('');
  const [unread, setUnread] = useState(0);
  const [incidentCount, setIncidentCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const searchRef = useRef(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  function toggleSidebar() {
    if (window.matchMedia('(max-width: 1099px)').matches) {
      setOpen((v) => !v);
      return;
    }
    setCollapsed((v) => !v);
  }

  useEffect(() => {
    const lock = () => {
      document.body.style.overflow = open && window.matchMedia('(max-width: 1099px)').matches ? 'hidden' : '';
    };
    lock();
    window.addEventListener('resize', lock);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('resize', lock);
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
      .then((d) => {
        setUnread(Number(d.unread) || 0);
        setIncidentCount(Number(d.incidents) || 0);
        setMessageCount(Number(d.messages) || 0);
      })
      .catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const refresh = () => {
      api('/admin/inbox')
        .then((d) => {
          setUnread(Number(d.unread) || 0);
          setIncidentCount(Number(d.incidents) || 0);
          setMessageCount(Number(d.messages) || 0);
        })
        .catch(() => {});
    };
    const s = getSocket();
    s?.on('notification:new', refresh);
    window.addEventListener('sa-inbox-refresh', refresh);
    return () => {
      s?.off('notification:new', refresh);
      window.removeEventListener('sa-inbox-refresh', refresh);
    };
  }, []);

  const meta = useMemo(() => {
    if (location.pathname.startsWith('/school-admin/students/') && location.pathname !== '/school-admin/students') {
      return {
        title: 'Student Details',
        crumbs: [
          { label: 'Dashboard', to: '/school-admin' },
          { label: 'Students', to: '/school-admin/students' },
          { label: 'Student Details' },
        ],
      };
    }
    if (location.pathname.startsWith('/school-admin/teachers/') && location.pathname !== '/school-admin/teachers') {
      return {
        title: 'Teacher Details',
        crumbs: [
          { label: 'Dashboard', to: '/school-admin' },
          { label: 'Teachers', to: '/school-admin/teachers' },
          { label: 'Teacher Details' },
        ],
      };
    }
    if (location.pathname.startsWith('/school-admin/drivers/') && location.pathname !== '/school-admin/drivers') {
      return {
        title: 'Driver Details',
        crumbs: [
          { label: 'Dashboard', to: '/school-admin' },
          { label: 'Drivers', to: '/school-admin/drivers' },
          { label: 'Driver Details' },
        ],
      };
    }
    if (location.pathname.startsWith('/school-admin/buses/') && location.pathname !== '/school-admin/buses') {
      return {
        title: 'Vehicle Details',
        crumbs: [
          { label: 'Dashboard', to: '/school-admin' },
          { label: 'Buses / Vehicles', to: '/school-admin/buses' },
          { label: 'Vehicle Details' },
        ],
      };
    }
    if (location.pathname.startsWith('/school-admin/routes/') && location.pathname !== '/school-admin/routes') {
      return {
        title: 'Route Details',
        crumbs: [
          { label: 'Dashboard', to: '/school-admin' },
          { label: 'Routes', to: '/school-admin/routes' },
          { label: 'Route Details' },
        ],
      };
    }
    if (location.pathname === '/school-admin/reports') {
      const type = searchParams.get('type');
      const extra =
        type === 'fleet'
          ? 'Fleet Performance'
          : type === 'safety'
            ? 'Safety & Compliance'
            : type === 'attendance'
              ? 'Student Attendance'
              : '';
      return {
        title: 'Reports & Analytics',
        crumbs: extra
          ? ['Dashboard', 'Reports & Analytics', extra]
          : ['Dashboard', 'Reports & Analytics'],
      };
    }
    if (location.pathname.startsWith('/school-admin/messages/') && location.pathname !== '/school-admin/messages') {
      return {
        title: 'Message Details',
        crumbs: [
          { label: 'Dashboard', to: '/school-admin' },
          { label: 'Messages', to: '/school-admin/messages' },
          { label: 'Message Details' },
        ],
      };
    }
    if (pageMeta[location.pathname]) return pageMeta[location.pathname];
    if (location.pathname.startsWith('/school-admin/coming-soon')) {
      const slug = location.pathname.split('/').pop();
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return { title };
    }
    return { title: 'School Admin' };
  }, [location.pathname, searchParams]);

  const isLivePage = location.pathname === '/school-admin/live-tracking';
  const isReports = location.pathname === '/school-admin/reports';
  const isCalendar = location.pathname === '/school-admin/calendar';
  const isNotifications = location.pathname === '/school-admin/notifications';
  const isIncidents = location.pathname === '/school-admin/incidents';
  const isMessages =
    location.pathname === '/school-admin/messages' || location.pathname.startsWith('/school-admin/messages/');
  const isUsers = location.pathname === '/school-admin/users';
  const isAttendance = location.pathname === '/school-admin/attendance';
  const isAcademics =
    location.pathname === '/school-admin/classes' ||
    location.pathname === '/school-admin/subjects' ||
    location.pathname === '/school-admin/examinations' ||
    location.pathname === '/school-admin/assignments' ||
    isAttendance;
  const isSettings = location.pathname === '/school-admin/school';
  const isLiveMap = isLivePage && searchParams.get('full') === '1';
  const isDashboard = location.pathname === '/school-admin';
  const isStudents = location.pathname === '/school-admin/students';
  const isStudentDetails = location.pathname.startsWith('/school-admin/students/');
  const isTeachers = location.pathname === '/school-admin/teachers';
  const isTeacherDetails = location.pathname.startsWith('/school-admin/teachers/');
  const isDrivers = location.pathname === '/school-admin/drivers';
  const isDriverDetails = location.pathname.startsWith('/school-admin/drivers/');
  const isBuses = location.pathname === '/school-admin/buses';
  const isBusDetails = location.pathname.startsWith('/school-admin/buses/');
  const isRoutes = location.pathname === '/school-admin/routes';
  const isRouteDetails = location.pathname.startsWith('/school-admin/routes/') && !isRoutes;
  const isStops = location.pathname === '/school-admin/stops';
  const isTrips = location.pathname === '/school-admin/trip-instances';
  const isParents = location.pathname === '/school-admin/parents';
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const searchable = [...navItems, ...extraItems, { to: '/school-admin/school', label: 'Settings' }];

  function onSearch(e) {
    e.preventDefault();
    if (isStudentDetails) {
      navigate('/school-admin/students');
      return;
    }
    if (isTeacherDetails) {
      navigate('/school-admin/teachers');
      return;
    }
    if (isDriverDetails) {
      navigate('/school-admin/drivers');
      return;
    }
    if (isBusDetails) {
      navigate('/school-admin/buses');
      return;
    }
    if (isRouteDetails) {
      navigate('/school-admin/routes');
      return;
    }
    if (isStudents || isTeachers || isDrivers || isBuses || isRoutes || isStops || isTrips || isLivePage || isReports || isCalendar || isNotifications || isIncidents || isMessages || isUsers || isAcademics || isParents) return;
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
    <div className={`sa-shell sa-shell--navy sa-shell--drawer${open ? ' is-nav-open' : ''}${collapsed ? ' is-collapsed' : ''}${isLiveMap ? ' sa-shell--live-map' : ''}`}>
      {open && (
        <button type="button" className="sa-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />
      )}

      <aside className={`sa-sidebar ${open ? 'is-open' : ''}`}>
        <div className="sa-brand">
          <span className="sa-brand-mark" aria-hidden="true">
            {schoolLogo ? (
              <img src={schoolLogo} alt="" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2 3.5 6v6.2c0 5.1 3.3 9.8 8.5 11.3 5.2-1.5 8.5-6.2 8.5-11.3V6L12 2Z" fill="currentColor" />
                <path d="M7.8 11.2 12 8.8l4.2 2.4v2.1c0 2.2-1.6 4.1-4.2 4.8-2.6-.7-4.2-2.6-4.2-4.8v-2.1Z" fill="#fff" opacity="0.95" />
                <path d="M9.2 11.8h5.6M12 9.4v5.6" stroke="#5b5bf0" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            )}
          </span>
          <div className="sa-brand-copy">
            <strong>{prettyName(schoolName)}</strong>
            <small>Transport Management System</small>
          </div>
        </div>

        <nav className="sa-nav" aria-label="School admin">
          {navItems.map((item) => {
            const count =
              item.badge === 'unread' ? unread : item.badge === 'incidents' ? incidentCount : item.badge === 'messages' ? messageCount : 0;
            return (
              <NavLink key={item.to + item.label} to={item.to} end={item.end} className="sa-nav-link" title={item.label}>
                <span className="sa-nav-icon" aria-hidden="true">
                  <NavIcon name={item.icon} />
                </span>
                <span>{item.label}</span>
                {item.icon === 'live' && <em className="sa-nav-live">Live</em>}
                {item.badge && count > 0 && <i className="sa-nav-badge">{count > 9 ? '9+' : count}</i>}
              </NavLink>
            );
          })}
          <p className="sa-nav-section-title">More</p>
          {extraItems.map((item) => (
            <NavLink key={item.to} to={item.to} title={item.label} className="sa-nav-link">
              <span className="sa-nav-icon" aria-hidden="true">
                <NavIcon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
          <NavLink to="/school-admin/school" className="sa-nav-link" title="Settings">
            <span className="sa-nav-icon" aria-hidden="true">
              <NavIcon name="settings" />
            </span>
            <span>Settings</span>
          </NavLink>
        </nav>

        <div className="sa-sidebar-foot">
          <div className="sa-side-user">
            <span className="sa-user-avatar">{prettyName(user?.name || 'A').slice(0, 1)}</span>
            <div>
              <strong>{prettyName(user?.name || 'Admin')}</strong>
              <small>{user?.role === 'super_admin' ? 'Super Admin' : 'Administrator'}</small>
            </div>
          </div>
          <button type="button" className="sa-signout" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-2" />
              <path d="M15 12H3m0 0 3-3m-3 3 3 3" />
            </svg>
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
              aria-label={collapsed || !open ? 'Open menu' : 'Hide menu'}
              aria-expanded={!collapsed}
              onClick={toggleSidebar}
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <h1 className="sa-page-title">
                {isDashboard || isLivePage || isBuses || isBusDetails || isRoutes || isRouteDetails || isStops || isTrips || isStudents || isStudentDetails || isParents || isTeachers || isTeacherDetails || isDrivers || isDriverDetails ? greetingFor(user?.name?.split(' ')[0] || 'Admin') : meta.title}
              </h1>
              {(isDashboard || isLivePage || isBuses || isBusDetails || isRoutes || isRouteDetails || isStops || isTrips || isStudents || isStudentDetails || isParents || isTeachers || isTeacherDetails || isDrivers || isDriverDetails) && (
                <p className="sa-page-welcome">
                  {isBuses || isBusDetails
                    ? "Here's what's happening with your school buses today."
                    : isRoutes || isRouteDetails
                      ? "Here's what's happening with your school routes today."
                      : isStops
                        ? "Here's what's happening with your school stops today."
                        : isTrips
                          ? tripTab === 'schedules'
                            ? 'Create recurring schedules and generate daily trips here.'
                            : tripTab === 'tours'
                              ? "Plan educational tours separately from the regular school run."
                              : "Here's what's happening with your trips today."
                          : isStudents
                            ? "Here's an overview of your students."
                            : isStudentDetails
                              ? "Here's your student overview and details."
                              : isParents
                                ? "Here's an overview of your parents."
                                : isTeachers || isTeacherDetails
                                  ? "Here's an overview of your teachers."
                                  : isDrivers || isDriverDetails
                                    ? "Here's an overview of your drivers."
                          : "Here's what's happening with school transport today."}
                </p>
              )}
              {meta.crumbs && !isDashboard && !isLivePage && !isBuses && !isBusDetails && !isRoutes && !isRouteDetails && !isStops && !isTrips && !isStudents && !isStudentDetails && !isParents && !isTeachers && !isTeacherDetails && !isDrivers && !isDriverDetails && (
                <p className="sa-crumbs">
                  {meta.crumbs.map((c, i) => {
                    const label = typeof c === 'string' ? c : c.label;
                    const to = typeof c === 'string' ? (i === 0 ? '/school-admin' : '') : c.to;
                    const last = i === meta.crumbs.length - 1;
                    return (
                      <span key={label}>
                        {i > 0 && <span className="sa-crumb-sep">›</span>}
                        {to && !last ? <Link to={to}>{label}</Link> : <span className={last ? 'is-current' : ''}>{label}</span>}
                      </span>
                    );
                  })}
                </p>
              )}
            </div>
          </div>

          <form className="sa-search" onSubmit={onSearch}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isStudentDetails
                  ? 'Search students, parents...'
                  : isTeacherDetails
                    ? 'Search students, teachers, routes...'
                    : isDriverDetails || isRouteDetails
                      ? 'Search students, staff, routes...'
                      : isStudents
                        ? 'Search students by name, admission no. or parent...'
                        : isTeachers
                          ? 'Search teachers...'
                          : isDrivers
                            ? 'Search drivers...'
                            : isBuses || isBusDetails
                              ? 'Search buses by name, number plate or model...'
                              : isRoutes
                                ? 'Search students, staff, routes...'
                                : isStops
                                  ? 'Search students, staff, routes...'
                                  : isTrips
                                    ? 'Search students, staff, routes...'
                                    : isMessages
                                      ? 'Search students, staff, routes, vehicles...'
                                    : isLivePage || isReports || isCalendar || isNotifications || isIncidents || isUsers || isSettings || isAcademics || isParents
                                      ? 'Search students, staff, routes...'
                                      : 'Search students, staff, routes...'
              }
            />
            <kbd>Ctrl /</kbd>
          </form>

          <div className="sa-topbar-right">
            <span className="sa-date-chip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M8 3v4M16 3v4M3 11h18" />
              </svg>
              {dateLabel}
            </span>
            <button
              type="button"
              className="sa-icon-btn"
              aria-label="Notifications"
              onClick={() => navigate('/school-admin/notifications')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
                <path d="M10 21h4" />
              </svg>
              {unread > 0 && <i className="sa-bell-dot" />}
            </button>
            <span className="sa-user-avatar sa-top-avatar">{prettyName(user?.name || 'A').slice(0, 1)}</span>
          </div>
        </header>

        <div className={`sa-content${isLiveMap ? ' sa-content--map' : ''}`}>
          <Outlet context={{ globalSearch: search, schoolName }} />
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
