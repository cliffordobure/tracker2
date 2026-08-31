import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../lib/roles';

const features = [
  {
    title: 'Live Tracking',
    body: 'Track buses in real time and stay informed on every trip.',
    image: '/onboard-tracking.png',
  },
  {
    title: 'Safety First',
    body: 'Smart alerts keep students, parents, and drivers connected.',
    image: '/onboard-safety.png',
  },
  {
    title: 'Smart Reports',
    body: 'Real-time insights that help schools make better decisions.',
    image: '/onboard-reports.png',
  },
];

export default function Landing() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading-screen">Loading…</div>;
  if (user) return <Navigate to={homePathForRole(user.role)} replace />;

  return (
    <div className="tt-landing">
      <header className="tt-landing-nav">
        <div className="tt-brand">
          <span className="tt-shield" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2 4 5.4v6.3c0 5 3.4 9.6 8 11.3 4.6-1.7 8-6.3 8-11.3V5.4L12 2Z" fill="#0C1B3A" />
              <path d="M8.2 13.2 12 8.8l3.8 4.4v1.6c0 1.8-1.5 3.4-3.8 4-2.3-.6-3.8-2.2-3.8-4v-1.6Z" fill="#fff" />
            </svg>
          </span>
          <div>
            <strong>Track Toto</strong>
            <small>Transport Management System</small>
          </div>
        </div>
        <Link className="tt-nav-login" to="/login">
          Login
        </Link>
      </header>

      <section className="tt-hero">
        <div className="tt-hero-copy">
          <p className="tt-kicker">SCHOOL TRANSPORT, SIMPLIFIED</p>
          <h1>
            Smarter Transport.
            <br />
            Safer Students.
            <em> Stronger Schools.</em>
          </h1>
          <p className="tt-lede">
            Track Toto helps school admins run routes, teachers update parents, and families follow
            every ride from gate to home.
          </p>
          <div className="tt-hero-actions">
            <Link className="tt-btn" to="/login">
              Get Started
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="tt-btn-ghost" to="/login">
              Login to your account
            </Link>
          </div>
        </div>
        <div className="tt-hero-art">
          <img src="/splash-track-toto.png" alt="Track Toto school transport" />
        </div>
      </section>

      <section className="tt-features" aria-label="What Track Toto offers">
        {features.map((item) => (
          <article key={item.title} className="tt-feature">
            <img src={item.image} alt="" />
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      <footer className="tt-landing-foot">
        <span>© {new Date().getFullYear()} Track Toto School</span>
        <Link to="/login">Admin login</Link>
      </footer>
    </div>
  );
}
