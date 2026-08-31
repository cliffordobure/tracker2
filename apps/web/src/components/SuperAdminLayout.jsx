import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import '../super-admin.css';

const navSections = [
  {
    title: 'Platform Management',
    items: [
      { to: '/super-admin/schools', label: 'Schools', icon: 'schools' },
      { to: '/super-admin/admins', label: 'Admins', icon: 'admins' },
      { to: '/super-admin/subscriptions', label: 'Subscriptions', icon: 'plan' },
      { to: '/super-admin/payments', label: 'Payments', icon: 'pay' },
      { to: '/super-admin/invoices', label: 'Invoices', icon: 'invoice' },
    ],
  },
  {
    title: 'System Management',
    items: [
      { to: '/super-admin/users', label: 'Users', icon: 'users' },
      { to: '/super-admin/roles', label: 'Roles & Permissions', icon: 'roles' },
      { to: '/super-admin/settings', label: 'System Settings', icon: 'settings' },
      { to: '/super-admin/audit', label: 'Audit Logs', icon: 'audit' },
      { to: '/super-admin/activity', label: 'Activity Logs', icon: 'activity' },
    ],
  },
  {
    title: 'Support & Tools',
    items: [
      { to: '/super-admin/tickets', label: 'Support Tickets', icon: 'tickets', badge: 'tickets' },
      { to: '/super-admin/announcements', label: 'Announcements', icon: 'megaphone' },
      { to: '/super-admin/requests', label: 'Feature Requests', icon: 'spark' },
      { to: '/super-admin/health', label: 'System Health', icon: 'health' },
    ],
  },
];

const pageMeta = {
  '/super-admin': {
    title: 'Super Admin Dashboard',
    subtitle: 'Overview of all schools and platform activity.',
  },
  '/super-admin/schools': { title: 'Schools', subtitle: 'Admit schools and approve them onto the platform.' },
  '/super-admin/admins': { title: 'School Admins', subtitle: 'Create and manage the admin for each school.' },
  '/super-admin/subscriptions': { title: 'Subscriptions', subtitle: 'Plan mix across admitted schools.' },
  '/super-admin/payments': { title: 'Payments', subtitle: 'Platform invoices that have been marked paid.' },
  '/super-admin/invoices': { title: 'Invoices', subtitle: 'Issue and track subscription invoices.' },
  '/super-admin/users': { title: 'Users', subtitle: 'Every account on the platform.' },
  '/super-admin/roles': { title: 'Roles & Permissions', subtitle: 'Built-in roles and how many people hold each one.' },
  '/super-admin/settings': { title: 'System Settings', subtitle: 'Platform name, support contacts, and maintenance.' },
  '/super-admin/audit': { title: 'Audit Logs', subtitle: 'Changes made by super admins.' },
  '/super-admin/activity': { title: 'Activity Logs', subtitle: 'Recent platform events from live records.' },
  '/super-admin/tickets': { title: 'Support Tickets', subtitle: 'Parent and school support queue.' },
  '/super-admin/announcements': { title: 'Announcements', subtitle: 'Platform notices pushed to admitted schools.' },
  '/super-admin/requests': { title: 'Feature Requests', subtitle: 'Track requests from schools and the platform team.' },
  '/super-admin/health': { title: 'System Health', subtitle: 'Live API, database, and session checks.' },
  '/super-admin/notifications': { title: 'Notifications', subtitle: 'Alerts for this Super Admin account.' },
};

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
    case 'schools':
      return (
        <svg {...common}>
          <path d="M3 10 12 4l9 6" />
          <path d="M5 10v9h14v-9" />
          <path d="M10 19v-5h4v5" />
        </svg>
      );
    case 'admins':
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3.5 19c.8-3 2.8-4.5 5.5-4.5S13.7 16 14.5 19" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16 14.5c2 .3 3.5 1.6 4 4.5" />
        </svg>
      );
    case 'plan':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8M9 11h6" />
        </svg>
      );
    case 'pay':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case 'invoice':
      return (
        <svg {...common}>
          <path d="M7 3h8l4 4v14H7z" />
          <path d="M15 3v4h4M9 13h6M9 17h4" />
        </svg>
      );
    case 'roles':
      return (
        <svg {...common}>
          <path d="M12 3 4 7v5c0 5 3.5 8.5 8 9.5 4.5-1 8-4.5 8-9.5V7l-8-4Z" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      );
    case 'audit':
    case 'activity':
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case 'tickets':
      return (
        <svg {...common}>
          <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V8Z" />
        </svg>
      );
    case 'megaphone':
      return (
        <svg {...common}>
          <path d="M4 10v4h3l5 4V6L7 10H4Z" />
          <path d="M14 9.5a4 4 0 0 1 0 5" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...common}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M6 18l2.5-2.5" />
        </svg>
      );
    case 'health':
      return (
        <svg {...common}>
          <path d="M4 13h4l2-5 3 10 2-5h5" />
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

export default function SuperAdminLayout() {
  const { user, logout, toast } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [shell, setShell] = useState({ ticketOpen: 0, unread: 0, settings: { platformName: 'Track Toto', tagline: 'Transport Management System' } });

  useEffect(() => {
    api('/admin/platform/shell')
      .then(setShell)
      .catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('pa-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const meta = useMemo(() => {
    const exact = pageMeta[location.pathname];
    if (exact) return exact;
    const hit = Object.entries(pageMeta).find(([path]) => location.pathname.startsWith(path) && path !== '/super-admin');
    return hit?.[1] || pageMeta['/super-admin'];
  }, [location.pathname]);

  const brand = shell.settings?.platformName || 'Track Toto';
  const tagline = shell.settings?.tagline || 'Transport Management System';

  function onSearch(e) {
    e.preventDefault();
    const q = search.trim();
    if (q.length < 2) return;
    navigate(`/super-admin/schools?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className={`sa-shell sa-shell--navy sa-shell--platform${open ? ' is-nav-open' : ''}${collapsed ? ' is-collapsed' : ''}`}>
      {open && (
        <button type="button" className="sa-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />
      )}

      <aside className={`sa-sidebar ${open ? 'is-open' : ''}`}>
        <div className="sa-brand">
          <span className="sa-brand-mark pa-brand-bus" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9H4V7Zm2.5 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM7 8h10v4H7V8Z" />
            </svg>
          </span>
          {!collapsed && (
            <div className="sa-brand-copy">
              <strong>{brand}</strong>
              <small>{tagline}</small>
            </div>
          )}
        </div>

        <nav className="sa-nav" aria-label="Super admin">
          <NavLink to="/super-admin" end className="sa-nav-link" title="Dashboard">
            <span className="sa-nav-icon">
              <NavIcon name="dashboard" />
            </span>
            {!collapsed && <span>Dashboard</span>}
          </NavLink>
          {navSections.map((section) => (
            <div key={section.title} className="sa-nav-section">
              {!collapsed && <p className="sa-nav-section-title">{section.title}</p>}
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} className="sa-nav-link" title={item.label}>
                  <span className="sa-nav-icon">
                    <NavIcon name={item.icon} />
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && item.badge === 'tickets' && shell.ticketOpen > 0 && (
                    <i className="sa-nav-badge pa-nav-badge">{shell.ticketOpen > 9 ? '9+' : shell.ticketOpen}</i>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
          <a className="sa-nav-link" href="/handover.html" target="_blank" rel="noreferrer" title="Handover & QA">
            <span className="sa-nav-icon">
              <NavIcon name="audit" />
            </span>
            {!collapsed && <span>Handover &amp; QA</span>}
          </a>
        </nav>

        <div className="sa-sidebar-foot">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? '»' : '« Collapse'}
          </button>
          {!collapsed && <small className="pa-copy">© {new Date().getFullYear()} {brand}</small>}
        </div>
      </aside>

      <div className="sa-main">
        <header className="sa-topbar">
          <div className="sa-topbar-left">
            <button
              type="button"
              className="sa-menu-btn"
              aria-label={open ? 'Hide menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <h1 className="sa-page-title">{meta.title}</h1>
              <p className="sa-page-welcome">{meta.subtitle}</p>
            </div>
          </div>

          <form className="sa-search pa-search" onSubmit={onSearch}>
            <span aria-hidden="true">⌕</span>
            <input
              id="pa-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search schools, admins, users..."
            />
            <kbd>⌘K</kbd>
          </form>

          <div className="sa-topbar-right">
            <button
              type="button"
              className="sa-icon-btn"
              aria-label="Notifications"
              onClick={() => navigate('/super-admin/notifications')}
            >
              <span aria-hidden="true">🔔</span>
              {shell.unread > 0 && <i>{shell.unread > 9 ? '9+' : shell.unread}</i>}
            </button>
            <div className="sa-user">
              <span className="sa-user-avatar">{(user?.name || 'S').slice(0, 1)}</span>
              <div>
                <strong>{user?.name || 'Super Admin'}</strong>
                <small>Platform Administrator</small>
              </div>
            </div>
            <button type="button" className="sa-btn sa-btn-ghost pa-signout" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>

        <div className="sa-content">
          {shell.settings?.maintenanceMode && (
            <div className="pa-banner">Maintenance mode is on. School logins still work until you wire a lockout.</div>
          )}
          <Outlet />
        </div>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
