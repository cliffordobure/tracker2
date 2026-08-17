import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { connectSocket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';

function periodLabel(period, direction) {
  if (period === 'morning' || period === 'afternoon' || period === 'evening') return period;
  return direction === 'to_school' ? 'morning' : 'evening';
}

export default function TeacherHome() {
  const { showToast } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const overview = await api('/teacher/overview');
    setData(overview);
    setError('');
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return undefined;
    const refresh = () => load().catch(() => {});
    socket.on('trip:started', refresh);
    socket.on('trip:completed', refresh);
    socket.on('kid:picked_up', () => {
      showToast('Student checked in', 'success');
      refresh();
    });
    socket.on('kid:dropped_off', () => {
      showToast('Student checked out', 'success');
      refresh();
    });
    return () => {
      socket.off('trip:started', refresh);
      socket.off('trip:completed', refresh);
      socket.off('kid:picked_up');
      socket.off('kid:dropped_off');
    };
  }, [load, showToast]);

  useEffect(() => {
    const id = setInterval(() => load().catch(() => {}), 8000);
    return () => clearInterval(id);
  }, [load]);

  if (!data && !error) return <p>Loading teacher overview…</p>;

  const stats = data?.stats || {};
  const school = data?.school;
  const active = data?.activeTrips || [];
  const kids = data?.kids || [];
  const arriving = kids.filter((k) =>
    ['on_bus', 'waiting', 'arrived', 'scheduled'].includes(k.transport?.status)
  );

  return (
    <div className="stack">
      {error && <div className="alert">{error}</div>}
      <div>
        <p className="eyebrow">Teacher</p>
        <h2>{school?.name || 'School overview'}</h2>
        <p className="lede">
          See who is on the bus, who has arrived, and which trips are running. Teachers have a
          read-only view — drivers operate the Trip ID.
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span>Students</span>
          <strong>{stats.students ?? 0}</strong>
        </div>
        <div className="stat">
          <span>Active trips</span>
          <strong>{stats.activeTrips ?? 0}</strong>
        </div>
        <div className="stat">
          <span>On the bus</span>
          <strong>{stats.onboard ?? 0}</strong>
        </div>
        <div className="stat">
          <span>Arrived at school</span>
          <strong>{stats.arrived ?? 0}</strong>
        </div>
        <div className="stat">
          <span>Scheduled today</span>
          <strong>{stats.scheduledToday ?? 0}</strong>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Live trips</h2>
            <p className="muted">Buses currently executing a Trip Instance</p>
          </div>
          <Link className="btn btn-secondary" to="/teacher/live">
            Open live map
          </Link>
        </div>
        {!active.length && <p className="muted">No buses on an active trip right now.</p>}
        <ul className="kid-list">
          {active.map((row) => {
            const t = row.trip;
            return (
              <li key={t._id} className="kid-row">
                <div>
                  <strong>{t.tripCode || t.busId?.plate || 'Trip'}</strong>
                  <div className="muted">
                    {t.busId?.plate || 'Bus'} · {t.driverId?.name || 'Driver'} ·{' '}
                    {t.routeId?.name || 'Route'} · {periodLabel(t.period, t.direction)}
                  </div>
                </div>
                <span className="pill">
                  In {row.checkedIn}/{row.studentCount} · Out {row.checkedOut}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Student transport board</h2>
            <p className="muted">Today’s check-in status for students on scheduled trips</p>
          </div>
          <Link className="btn btn-ghost" to="/teacher/students">
            All students
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Grade</th>
                <th>Route</th>
                <th>Status</th>
                <th>Trip</th>
              </tr>
            </thead>
            <tbody>
              {arriving.slice(0, 20).map((k) => (
                <tr key={k._id}>
                  <td>
                    <strong>{k.name}</strong>
                  </td>
                  <td>{k.grade || '—'}</td>
                  <td>{k.routeId?.name || '—'}</td>
                  <td>
                    <span className={`pill status-${k.transport?.status || 'waiting'}`}>
                      {k.transport?.label || '—'}
                    </span>
                  </td>
                  <td>{k.transport?.tripCode || '—'}</td>
                </tr>
              ))}
              {!arriving.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    No students are on today’s transport trips.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
