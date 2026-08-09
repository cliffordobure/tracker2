import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { connectSocket } from '../../lib/socket';
import MapView from '../../components/MapView';
import { useAuth } from '../../context/AuthContext';

export default function ParentHome() {
  const { showToast } = useAuth();
  const [kids, setKids] = useState([]);
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selected, setSelected] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    const [k, a, h, n] = await Promise.all([
      api('/parent/kids'),
      api('/parent/trips/active'),
      api('/parent/trips'),
      api('/parent/notifications'),
    ]);
    setKids(k.kids);
    setActive(a.trips);
    setHistory(h.trips);
    setNotifications(n.notifications);
    if (a.trips[0]) {
      setSelected(a.trips[0]);
      setDriverLocation(a.trips[0].trip.latestLocation || null);
    } else {
      setSelected(null);
      setDriverLocation(null);
    }
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return undefined;

    const refresh = () => load().catch(() => {});

    const onLocation = (payload) => {
      if (!selected?.trip?._id || payload.tripId !== selected.trip._id) return;
      setDriverLocation(payload);
    };

    socket.on('location:update', onLocation);
    socket.on('trip:started', refresh);
    socket.on('kid:picked_up', (p) => {
      showToast('Your child was picked up');
      refresh();
      if (selected?.trip?._id) socket.emit('trip:join', selected.trip._id);
    });
    socket.on('kid:dropped_off', () => {
      showToast('Your child was dropped off');
      refresh();
    });
    socket.on('trip:completed', () => {
      showToast('Trip completed');
      refresh();
    });
    socket.on('notification:new', (n) => {
      setNotifications((prev) => [n, ...prev]);
    });

    return () => {
      socket.off('location:update', onLocation);
      socket.off('trip:started', refresh);
      socket.off('kid:picked_up');
      socket.off('kid:dropped_off');
      socket.off('trip:completed');
      socket.off('notification:new');
    };
  }, [selected?.trip?._id, showToast]);

  useEffect(() => {
    if (!selected?.trip?._id) return undefined;
    const socket = connectSocket();
    socket?.emit('trip:join', selected.trip._id);
    return () => socket?.emit('trip:leave', selected.trip._id);
  }, [selected?.trip?._id]);

  const markRead = async () => {
    await api('/parent/notifications/read', { method: 'POST', body: {} });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="stack">
      {error && <div className="alert">{error}</div>}

      <div className="stat-grid">
        <div className="stat">
          <span>Children</span>
          <strong>{kids.length}</strong>
        </div>
        <div className="stat">
          <span>Active trips</span>
          <strong>{active.length}</strong>
        </div>
        <div className="stat">
          <span>Unread alerts</span>
          <strong>{notifications.filter((n) => !n.read).length}</strong>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <h2>Live tracking</h2>
          {!selected && <p className="muted">No active trip right now. You will be notified when a trip starts.</p>}
          {selected && (
            <>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>{selected.trip.routeId?.name}</h3>
                    <p className="muted">
                      Driver {selected.trip.driverId?.name}
                      {selected.driverProfile?.vehiclePlate
                        ? ` · ${selected.driverProfile.vehiclePlate}`
                        : ''}
                      {' · '}
                      {selected.trip.direction === 'to_school' ? 'To school' : 'To home'}
                    </p>
                  </div>
                </div>
              </div>
              <MapView
                key={selected.trip._id}
                center={
                  driverLocation ||
                  selected.stops[0]?.location ||
                  selected.trip.schoolId?.location || { lat: -1.3965, lng: 36.7542 }
                }
                zoom={15}
                driverLocation={driverLocation}
                stops={selected.stops}
                direction={selected.trip.direction}
                showRoute
                followDriver
                className="map-canvas map-lg"
              />
              <ul className="kid-list">
                {selected.myKids.map((kid) => {
                  const picked = selected.events.some(
                    (e) => (e.kidId?._id || e.kidId) === kid._id && e.type === 'picked_up'
                  );
                  const dropped = selected.events.some(
                    (e) => (e.kidId?._id || e.kidId) === kid._id && e.type === 'dropped_off'
                  );
                  return (
                    <li key={kid._id} className="kid-row">
                      <div>
                        <strong>{kid.name}</strong>
                        <div className="muted">
                          {dropped ? 'Dropped off' : picked ? 'On the bus' : 'Waiting for pickup'}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <h2>Your children</h2>
          <ul className="list">
            {kids.map((k) => (
              <li key={k._id} className="panel tight">
                <strong>{k.name}</strong>
                <div className="muted">
                  {k.schoolId?.name} · {k.routeId?.name} · stop {k.homeStopId?.name}
                </div>
              </li>
            ))}
          </ul>

          <h2>Recent trips</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Route</th>
                  <th>Direction</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((t) => (
                  <tr key={t._id}>
                    <td>{new Date(t.startedAt).toLocaleString()}</td>
                    <td>{t.routeId?.name}</td>
                    <td>{t.direction === 'to_school' ? 'To school' : 'To home'}</td>
                    <td>{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <div className="panel-head">
            <h2>Notifications</h2>
            <button type="button" className="btn btn-ghost" onClick={markRead}>
              Mark all read
            </button>
          </div>
          <ul className="notif-list">
            {notifications.map((n) => (
              <li key={n.id || n._id} className={n.read ? 'read' : 'unread'}>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>{new Date(n.createdAt).toLocaleString()}</small>
              </li>
            ))}
            {!notifications.length && <li className="muted">No notifications yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
