import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

export default function TeacherStudents() {
  const [kids, setKids] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const data = await api('/teacher/kids');
    setKids(data.kids || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const id = setInterval(() => load().catch(() => {}), 10000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return kids.filter((k) => {
      if (status && k.transport?.status !== status) return false;
      if (!needle) return true;
      const hay = [k.name, k.grade, k.admissionNo, k.routeId?.name, k.transport?.tripCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [kids, q, status]);

  return (
    <div className="stack">
      <div>
        <h2>Students</h2>
        <p className="lede">
          School roster with today’s transport status. Read-only — check-in and check-out stay with
          the assigned driver and Trip ID.
        </p>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="row-actions" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <label>
          Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, grade, route" />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="scheduled">Scheduled</option>
            <option value="waiting">Waiting for pickup</option>
            <option value="on_bus">On the bus</option>
            <option value="arrived">Arrived at school</option>
            <option value="dropped_off">Dropped off</option>
            <option value="not_scheduled">Not on today’s trips</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Grade</th>
              <th>Route</th>
              <th>Parent</th>
              <th>Status</th>
              <th>Trip</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => (
              <tr key={k._id}>
                <td>
                  <strong>{k.name}</strong>
                  {k.admissionNo ? <div className="muted">{k.admissionNo}</div> : null}
                </td>
                <td>{k.grade || '—'}</td>
                <td>{k.routeId?.name || '—'}</td>
                <td>
                  {(k.parentIds || []).map((p) => p.name).join(', ') || '—'}
                  <div className="muted">
                    {(k.parentIds || []).map((p) => p.phone).filter(Boolean).join(', ')}
                  </div>
                </td>
                <td>
                  <span className={`pill status-${k.transport?.status || 'waiting'}`}>
                    {k.transport?.label || '—'}
                  </span>
                </td>
                <td>
                  {k.transport?.tripCode || '—'}
                  {k.transport?.driver?.name ? (
                    <div className="muted">{k.transport.driver.name}</div>
                  ) : null}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={6} className="muted">
                  No students match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
