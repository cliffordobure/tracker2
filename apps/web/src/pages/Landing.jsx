import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../lib/roles';

const points = [
  { title: 'Real-time Tracking', body: 'Know where your school bus is.', tone: 'green' },
  { title: 'Safer Students', body: 'Check-in and drop-off alerts.', tone: 'purple' },
  { title: 'Instant Notifications', body: 'Keep parents informed.', tone: 'orange' },
  { title: 'Better School Operations', body: 'Simple and reliable.', tone: 'blue' },
];

export default function Landing() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hidePassword, setHidePassword] = useState(true);
  const [remember, setRemember] = useState(true);

  if (!loading && user) return <Navigate to={homePathForRole(user.role)} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const u = await login(email.trim(), password);
      if (!remember) sessionStorage.setItem('track_toto_session', '1');
      navigate(homePathForRole(u.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="hm">
        <div className="hm-hero">
          <div>
            <p className="site-kicker">SCHOOL TRANSPORT MANAGEMENT</p>
            <h1>
              Safe Journeys.
              <br />
              <em>Brighter Futures.</em>
            </h1>
            <p className="hm-lede">
              Track Toto helps schools, parents, and drivers work together so every child travels safely
              from home to school and back.
            </p>
            <div className="hm-features">
              {points.map((item) => (
                <article key={item.title}>
                  <span className={`ab-ico ab-ico--${item.tone === 'purple' ? 'blue' : item.tone}`} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </div>
                </article>
              ))}
            </div>
            <p className="site-script">Every Child Matters <span>♥</span></p>
          </div>

          <form className="hm-login" onSubmit={onSubmit}>
            <h2>Welcome Back 👋</h2>
            <p className="hint">Log in to your Track Toto School account</p>
            {error && <div className="alert">{error}</div>}
            <label className="hm-field">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="m4 8 8 6 8-6" stroke="currentColor" strokeWidth="1.8" /></svg>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required placeholder="Email Address" />
            </label>
            <label className="hm-field">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="6" y="10" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M8 10V8a4 4 0 1 1 8 0v2" stroke="currentColor" strokeWidth="1.8" /></svg>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type={hidePassword ? 'password' : 'text'} autoComplete="current-password" required placeholder="Password" />
              <button className="hm-eye" type="button" onClick={() => setHidePassword((v) => !v)} aria-label="Toggle password">
                {hidePassword ? 'Show' : 'Hide'}
              </button>
            </label>
            <div className="mk-check">
              <label>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember me
              </label>
              <Link to="/contact">Forgot password?</Link>
            </div>
            <button className="site-btn site-btn--solid site-btn--wide" disabled={submitting} type="submit">
              {submitting ? 'Signing in…' : 'Log In →'}
            </button>
            <p className="mk-switch">
              Don&apos;t have an account? <Link to="/pricing">Get Started</Link>
            </p>
          </form>
        </div>
      </section>
      <div className="hm-stats">
        <article><div><strong>10,000+</strong><span>Students Transported</span></div></article>
        <article><div><strong>200+</strong><span>Partner Schools</span></div></article>
        <article><div><strong>99.9%</strong><span>Safety Record</span></div></article>
        <article><div><strong>Happier</strong><span>Parents & Schools</span></div></article>
      </div>
      <div className="hm-foot">
        <span>TRACK TOTO SCHOOL | Smarter Transport. Safer Students. Stronger Schools.</span>
        <span>Privacy Policy · Terms of Service · Contact</span>
      </div>
    </>
  );
}
