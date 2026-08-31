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

  if (!loading && user) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const u = await login(email.trim(), password);
      navigate(homePathForRole(u.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-hero login-hero--toto">
          <p className="eyebrow">Track Toto</p>
          <h1>Know where they are, from gate to home.</h1>
          <p className="lede">
            Super admins onboard schools. School admins run transport. Teachers mark the register,
            set assignments, and update parents. Parents track the ride live.
          </p>
        </div>
        <form className="login-form card-form" onSubmit={onSubmit}>
          <p className="login-back">
            <Link to="/">← Back to home</Link>
          </p>
          <h2>Sign in</h2>
          {error && <div className="alert">{error}</div>}
          <label>
            Email
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
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="btn btn-primary" disabled={submitting} type="submit">
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
