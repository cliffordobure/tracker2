import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ navItems, title, rideMode = false }) {
  const { user, logout, toast } = useAuth();
  const location = useLocation();
  const isRide = rideMode || location.pathname.startsWith('/parent');

  return (
    <div className={`app-shell${isRide ? ' app-shell--ride' : ''}`}>
      {!isRide && (
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">SK</span>
            <div>
              <strong>SchoolKids</strong>
              <small>Tracker</small>
            </div>
          </div>
          <nav>
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="user-chip">
              <strong>{user?.name}</strong>
              <span>{user?.role}</span>
            </div>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Sign out
            </button>
          </div>
        </aside>
      )}
      <main className="main">
        {!isRide && (
          <header className="topbar">
            <h1>{title}</h1>
            <Link to="/" className="muted">
              {user?.email}
            </Link>
          </header>
        )}
        <div className={`content${isRide ? ' content--ride' : ''}`}>
          <Outlet />
        </div>
      </main>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
