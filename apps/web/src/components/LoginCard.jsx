import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../lib/roles';

export default function LoginCard() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hidePassword, setHidePassword] = useState(true);
  const [remember, setRemember] = useState(true);

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
    <form className="hm-login" onSubmit={onSubmit}>
      <h2>Welcome Back 👋</h2>
      <p className="hint">Log in to your Track Toto School account</p>
      {error && <div className="alert">{error}</div>}

      <label className="hm-field">
        <span className="hm-ico" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3.5" y="6.5" width="17" height="11" rx="2" stroke="#94A3B8" strokeWidth="1.7" />
            <path d="m5 8.5 7 5.2 7-5.2" stroke="#94A3B8" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="username"
          required
          placeholder="Email Address"
        />
      </label>

      <label className="hm-field">
        <span className="hm-ico" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="6" y="10" width="12" height="10" rx="2" stroke="#94A3B8" strokeWidth="1.7" />
            <path d="M8.2 10V8.2a3.8 3.8 0 0 1 7.6 0V10" stroke="#94A3B8" strokeWidth="1.7" />
          </svg>
        </span>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type={hidePassword ? 'password' : 'text'}
          autoComplete="current-password"
          required
          placeholder="Password"
        />
      </label>
      <button className="hm-show" type="button" onClick={() => setHidePassword((v) => !v)}>
        {hidePassword ? 'Show' : 'Hide'}
      </button>

      <div className="hm-row">
        <label className="hm-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me
        </label>
        <Link to="/contact">Forgot password?</Link>
      </div>

      <button className="hm-submit" disabled={submitting} type="submit">
        {submitting ? 'Signing in…' : 'Log In →'}
      </button>
      <p className="hm-switch">
        Don&apos;t have an account? <Link to="/pricing">Get Started</Link>
      </p>
    </form>
  );
}
