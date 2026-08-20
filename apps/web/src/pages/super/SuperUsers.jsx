import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, PageFoot, formatDate } from './shared';

export default function SuperUsers() {
  const [users, setUsers] = useState([]);
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const query = new URLSearchParams();
    if (role) query.set('role', role);
    if (q) query.set('q', q);
    const data = await api(`/admin/platform/users?${query}`);
    setUsers(data.users || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [role, q]);

  const toggle = async (user) => {
    await api(`/admin/platform/users/${user.id}`, { method: 'PUT', body: { active: !user.active } });
    await load();
  };

  return (
    <div className="sa-page">
      {error && <div className="alert">{error}</div>}
      <div className="pa-toolbar">
        <input value={q} placeholder="Search name or email..." onChange={(e) => setQ(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option value="super_admin">Super admin</option>
          <option value="school_admin">School admin</option>
          <option value="driver">Driver</option>
          <option value="teacher">Teacher</option>
          <option value="parent">Parent</option>
        </select>
      </div>
      <article className="sa-card">
        {users.length ? (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>School</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role.replace('_', ' ')}</td>
                    <td>{u.schoolName || '—'}</td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>{u.active ? 'Active' : 'Disabled'}</td>
                    <td>
                      <button type="button" className="sa-btn sa-btn-outline" onClick={() => toggle(u)}>
                        {u.active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No users match this filter.</Empty>
        )}
      </article>
      <PageFoot />
    </div>
  );
}
