import { Fragment, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { isKidOnBus } from '../../lib/mapMarkers';

function periodLabel(period, direction) {
  if (period === 'morning' || period === 'afternoon' || period === 'evening') return period;
  return direction === 'to_school' ? 'morning' : 'evening';
}

function fmtTime(v) {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TeacherTrips() {
  const [trips, setTrips] = useState([]);
  const [openId, setOpenId] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const data = await api('/teacher/trips/today');
    setTrips(data.trips || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const id = setInterval(() => load().catch(() => {}), 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="stack">
      <div>
        <h2>Today’s trips</h2>
        <p className="lede">
          Trip Instances for this school today. Open a trip to see who is checked in against that
          Trip ID.
        </p>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Trip ID</th>
              <th>Period</th>
              <th>Route</th>
              <th>Bus / Driver</th>
              <th>Attendance</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trips.map((row) => {
              const t = row.trip;
              const open = openId === t._id;
              return (
                <Fragment key={t._id}>
                  <tr>
                    <td>
                      <strong>{t.tripCode || t._id.slice(-6)}</strong>
                      <div className="muted">{fmtTime(t.scheduledFor || t.startedAt)}</div>
                    </td>
                    <td>
                      {periodLabel(t.period, t.direction)}
                      <div className="muted">
                        {t.direction === 'to_school' ? 'to school' : 'to home'}
                      </div>
                    </td>
                    <td>{t.routeId?.name || '—'}</td>
                    <td>
                      {t.busId?.plate || t.busId?.label || '—'}
                      <div className="muted">{t.driverId?.name || '—'}</div>
                    </td>
                    <td>
                      In {row.checkedIn}/{row.studentCount} · Out {row.checkedOut}
                    </td>
                    <td>
                      <span className={`pill status-${t.status}`}>{t.status}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setOpenId(open ? '' : t._id)}
                      >
                        {open ? 'Hide' : 'Students'}
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7}>
                        <ul className="kid-list">
                          {(t.kidIds || []).map((kid) => {
                            const onBus = isKidOnBus(row.events, kid._id);
                            const dropped = (row.events || []).some(
                              (e) =>
                                String(e.kidId?._id || e.kidId) === String(kid._id) &&
                                e.type === 'dropped_off'
                            );
                            const label = dropped
                              ? t.direction === 'to_school'
                                ? 'Arrived'
                                : 'Dropped off'
                              : onBus
                                ? 'On bus'
                                : 'Waiting';
                            return (
                              <li key={kid._id} className="kid-row">
                                <div>
                                  <strong>{kid.name}</strong>
                                  <div className="muted">{kid.grade || ''}</div>
                                </div>
                                <span className="pill">{label}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!trips.length && (
              <tr>
                <td colSpan={7} className="muted">
                  No trip instances for today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
