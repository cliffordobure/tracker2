import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PageFoot } from './shared';

export default function SuperRoles() {
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/platform/roles')
      .then((d) => setRoles(d.roles || []))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;

  return (
    <div className="sa-page">
      <p className="muted">
        Roles are built into the product. You can disable a person from Users, but you cannot invent a new role without a code change.
      </p>
      <div className="pa-role-grid">
        {roles.map((r) => (
          <article key={r.id} className="sa-card pa-role-card">
            <h3>{r.name}</h3>
            <p>{r.summary}</p>
            <strong>
              {r.count?.active || 0} active · {r.count?.total || 0} total
            </strong>
            <small>{r.id}</small>
          </article>
        ))}
      </div>
      <PageFoot />
    </div>
  );
}
