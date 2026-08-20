import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../lib/roles';

const PRESETS = [
  { id: 'super', label: 'Super Admin', email: 'admin@schooltracker.test' },
  { id: 'school', label: 'School Admin', email: 'schooladmin@schooltracker.test' },
  { id: 'teacher', label: 'Teacher', email: 'teacher@schooltracker.test' },
  { id: 'driver', label: 'Driver', email: 'driver@schooltracker.test' },
  { id: 'parent', label: 'Parent', email: 'parent1@schooltracker.test' },
];

export default function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [preset, setPreset] = useState('school');
  const [email, setEmail] = useState('schooladmin@schooltracker.test');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  const pick = (item) => {
    setPreset(item.id);
    setEmail(item.email);
    setPassword('password123');
  };

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
            Super admins onboard schools. School admins run transport. Teachers mark the register,
            set assignments, and update parents. Parents track the ride live.
          </p>
        </div>
        <form className="login-form card-form" onSubmit={onSubmit}>
          <h2>Sign in</h2>
          {error && <div className="alert">{error}</div>}
          <div className="login-role-row" role="group" aria-label="Demo accounts">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={preset === item.id ? 'is-on' : ''}
                onClick={() => pick(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
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
            Super Admin: <strong>admin@schooltracker.test</strong> / <strong>password123</strong>
            <br />
            The dashboard mockup showed the name Super Admin, not the email. Demo password for every
            seeded role is password123.
          </p>
        </form>
      </div>
    </div>
  );
}
