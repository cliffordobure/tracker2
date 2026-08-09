import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/dashboard')
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!stats) return <p>Loading dashboard…</p>;

  const isSuper = user?.role === 'super_admin';
  const cards = isSuper
    ? [
        { label: 'Schools', value: stats.schools },
        { label: 'Routes', value: stats.routes },
        { label: 'Students', value: stats.kids },
        { label: 'Active trips', value: stats.activeTrips },
      ]
    : [
        { label: 'Buses', value: stats.buses },
        { label: 'Routes', value: stats.routes },
        { label: 'Students', value: stats.kids },
        { label: 'Parents', value: stats.parents },
        { label: 'Drivers', value: stats.drivers },
        { label: 'Scheduled trips', value: stats.scheduledTrips },
        { label: 'Active trips', value: stats.activeTrips },
      ];

  return (
    <div className="stack">
      <p className="lede">
        {isSuper
          ? 'Create schools and school admins. Each school runs its own buses, routes, and dispatch.'
          : 'Manage buses, routes, students, and daily dispatch for your school.'}
      </p>
      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat">
            <span>{c.label}</span>
            <strong>{c.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
