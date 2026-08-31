import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../lib/roles';
import '../marketing.css';

const nav = [
  { to: '/', label: 'Home', end: true, icon: 'home' },
  { to: '/features', label: 'Features', icon: 'spark' },
  { to: '/about', label: 'About Us', icon: 'info' },
  { to: '/pricing', label: 'Pricing', icon: 'tag' },
  { to: '/resources', label: 'Resources', icon: 'book' },
  { to: '/contact', label: 'Contact', icon: 'mail' },
];

export default function MarketingLayout() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) return <div className="loading-screen">Loading…</div>;
  if (user) return <Navigate to={homePathForRole(user.role)} replace />;

  return (
    <div className={`mk ${open ? 'is-nav-open' : ''}`}>
      {open && <button type="button" className="mk-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <aside className="mk-side">
        <Link className="mk-brand" to="/" onClick={() => setOpen(false)}>
          <span className="mk-brand-mark" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2 3.8 5.6v6.6c0 5.2 3.5 10 8.2 11.8 4.7-1.8 8.2-6.6 8.2-11.8V5.6L12 2Z" fill="#fff" />
              <path d="M8.4 13.4 12 8.6l3.6 4.8v1.5c0 1.9-1.5 3.5-3.6 4.1-2.1-.6-3.6-2.2-3.6-4.1v-1.5Z" fill="#163B8A" />
            </svg>
          </span>
          <span>
            <b>TRACK TOTO</b>
            <small>SCHOOL</small>
          </span>
        </Link>

        <nav className="mk-nav" onClick={() => setOpen(false)}>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="mk-link">
              <NavIcon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mk-side-card">
          Smarter Transport.
          <br />
          Safer Students.
          <br />
          Stronger Schools.
        </div>
      </aside>

      <div className="mk-main">
        <header className="mk-top">
          <button type="button" className="mk-burger" aria-label="Open menu" onClick={() => setOpen((v) => !v)}>
            <span />
            <span />
            <span />
          </button>
          <div className="mk-top-actions">
            <Link className="mk-btn mk-btn--ghost" to="/login">Login</Link>
            <Link className="mk-btn mk-btn--solid" to="/login">Get Started</Link>
          </div>
        </header>
        <div className="mk-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function NavIcon({ name }) {
  const paths = {
    home: 'M4 11 12 4l8 7v9H4v-9Zm4 9h3v-5h6v5h3',
    spark: 'M12 3 9.5 9.5 3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5L12 3Z',
    info: 'M12 3a9 9 0 1 0 .01 18.01A9 9 0 0 0 12 3Zm-.8 4.2h1.6v1.6h-1.6V7.2Zm0 3.2h1.6V17h-1.6v-6.6Z',
    tag: 'M3 12 12 3h8v8l-9 9-8-8Zm13.2-5.2a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Z',
    book: 'M5 4h6a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4 4V4Zm8 0h6v16a4 4 0 0 0-4-4h-2V8a4 4 0 0 0-4-4Z',
    mail: 'M3 6h18v12H3V6Zm0 0 9 7 9-7',
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
