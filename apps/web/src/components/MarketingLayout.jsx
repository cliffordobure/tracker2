import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../lib/roles';
import '../marketing.css';
import '../marketing-site.css';

const nav = [
  { to: '/', label: 'Home', end: true },
  { to: '/features', label: 'Features' },
  { to: '/about#why', label: 'Why Us' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/resources', label: 'Resources' },
  { to: '/about', label: 'About Us', end: true },
  { to: '/contact', label: 'Contact' },
];

export default function MarketingLayout() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname, hash } = useLocation();

  if (loading) return <div className="loading-screen">Loading…</div>;
  if (user) return <Navigate to={homePathForRole(user.role)} replace />;

  const isActive = (item) => {
    if (item.to === '/about#why') return pathname === '/about' && hash === '#why';
    if (item.to === '/about') return pathname === '/about' && hash !== '#why';
    if (item.end) return pathname === item.to;
    return pathname === item.to;
  };

  return (
    <div className={`site ${open ? 'is-nav-open' : ''}`}>
      {open && <button type="button" className="site-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <header className="site-nav">
        <Link className="site-brand" to="/" onClick={() => setOpen(false)}>
          <span className="site-brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="8" width="18" height="9" rx="2" fill="#fff" />
              <path d="M6 8V6.8A1.8 1.8 0 0 1 7.8 5h5.4A1.8 1.8 0 0 1 15 6.8V8" stroke="#fff" strokeWidth="1.6" />
              <circle cx="7.2" cy="17.2" r="1.5" fill="#2563EB" />
              <circle cx="16.8" cy="17.2" r="1.5" fill="#2563EB" />
            </svg>
          </span>
          <span>
            <b>TRACK TOTO</b>
            <small>SCHOOL</small>
          </span>
        </Link>

        <button type="button" className="site-burger" aria-label="Open menu" onClick={() => setOpen((v) => !v)}>
          <span />
          <span />
          <span />
        </button>

        <nav className="site-links" onClick={() => setOpen(false)}>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={() => `site-link${isActive(item) ? ' is-on' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-actions">
          <Link className="site-btn site-btn--ghost" to="/login">Login</Link>
          <Link className="site-btn site-btn--solid" to="/pricing">
            Get Started
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
    </div>
  );
}
