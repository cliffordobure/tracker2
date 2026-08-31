import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../lib/roles';

export default function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hidePassword, setHidePassword] = useState(true);
  const [remember, setRemember] = useState(true);

  if (!loading && user) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

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
    <div className="mk-login">
      <div className="mk-login-art">
        <b>TRACK TOTO SCHOOL</b>
        <h2>Welcome Back!</h2>
        <p>Please login to your account.</p>
        <img src="/landing-hero.png" alt="" />
      </div>
      <form className="mk-login-form" onSubmit={onSubmit}>
        <h2>Login</h2>
        <p className="hint">Enter your credentials to access your account.</p>
        {error && <div className="alert">{error}</div>}
        <label>
          Email Address
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <span className="mk-pass">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={hidePassword ? 'password' : 'text'}
              autoComplete="current-password"
              required
            />
            <button type="button" onClick={() => setHidePassword((v) => !v)} aria-label="Toggle password">
              {hidePassword ? 'Show' : 'Hide'}
            </button>
          </span>
        </label>
        <div className="mk-check">
          <label>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me
          </label>
          <Link to="/contact">Forgot Password?</Link>
        </div>
        <button className="mk-btn mk-btn--solid mk-btn--lg" disabled={submitting} type="submit">
          {submitting ? 'Signing in…' : 'Login'}
        </button>
        <p className="mk-switch">
          Don&apos;t have an account? <Link to="/pricing">Get Started</Link>
        </p>
      </form>
    </div>
  );
}
