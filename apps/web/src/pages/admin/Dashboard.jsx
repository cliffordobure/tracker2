import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/dashboard')
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!stats) return <p>Loading dashboard…</p>;

  const cards = [
    { label: 'Schools', value: stats.schools },
    { label: 'Routes', value: stats.routes },
    { label: 'Kids', value: stats.kids },
    { label: 'Parents', value: stats.parents },
    { label: 'Drivers', value: stats.drivers },
    { label: 'Active trips', value: stats.activeTrips },
  ];

  return (
    <div className="stack">
      <p className="lede">Manage schools, routes, families, and drivers for live school transport.</p>
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
