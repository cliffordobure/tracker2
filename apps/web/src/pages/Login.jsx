import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../lib/roles';

export default function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('schooladmin@schooltracker.test');
  const [password, setPassword] = useState('password123');
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
      const u = await login(email, password);
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
        <div className="login-hero">
          <p className="eyebrow">SchoolKids Tracker</p>
          <h1>Know where they are, from gate to home.</h1>
          <p className="lede">
            Super admins onboard schools. School admins manage buses, routes, students, and daily
            dispatch — parents track the ride live.
          </p>
        </div>
        <form className="login-form card-form" onSubmit={onSubmit}>
          <h2>Sign in</h2>
          {error && <div className="alert">{error}</div>}
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
          <button className="btn btn-primary" disabled={submitting} type="submit">
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="hint">
            Demo: admin@ / schooladmin@ / driver@ / parent1@ schooltracker.test — password123
          </p>
        </form>
      </div>
    </div>
  );
}
