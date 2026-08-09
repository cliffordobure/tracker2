import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { connectSocket } from '../../lib/socket';
import MapView from '../../components/MapView';
import { useAuth } from '../../context/AuthContext';
import { stopsForTripKids } from '../../lib/geo';
import { anyKidOnBus, isKidOnBus } from '../../lib/mapMarkers';
import { notificationTypeLabel, registerParentWebPush } from '../../lib/webPush';

function locFrom(trip) {
  const loc = trip?.latestLocation || trip?.startLocation;
  if (loc?.lat == null || loc?.lng == null) return null;
  return loc;
}

export default function ParentHome() {
  const { user, logout, showToast } = useAuth();
  const [kids, setKids] = useState([]);
  const [active, setActive] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selected, setSelected] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [error, setError] = useState('');
  const [sheetTab, setSheetTab] = useState('ride');
  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const applyTrip = useCallback((tripWrap) => {
    setSelected(tripWrap || null);
    if (!tripWrap) {
      setDriverLocation(null);
      return;
    }
    const onBus = anyKidOnBus(tripWrap.events, tripWrap.myKids);
    setDriverLocation(onBus ? locFrom(tripWrap.trip) : null);
  }, []);

  const load = useCallback(async () => {
    const [k, a, n] = await Promise.all([
      api('/parent/kids'),
      api('/parent/trips/active'),
      api('/parent/notifications'),
    ]);
    setKids(k.kids);
    setActive(a.trips);
    setNotifications(n.notifications);
    applyTrip(a.trips[0] || null);
  }, [applyTrip]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    registerParentWebPush().catch(() => {});
  }, [load]);

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return undefined;

    const refresh = () => load().catch(() => {});

    const onLocation = (payload) => {
      const cur = selectedRef.current;
      if (!cur?.trip?._id) return;
      if (String(payload.tripId) !== String(cur.trip._id)) return;
      if (!anyKidOnBus(cur.events, cur.myKids)) return;
      setDriverLocation({
        lat: payload.lat,
        lng: payload.lng,
        heading: payload.heading,
        speed: payload.speed,
        at: payload.at,
      });
    };

    const onPickedUp = (p) => {
      showToast('Your child was picked up — live tracking on');
      const cur = selectedRef.current;
      if (cur && p?.kidId) {
        const kidId = String(p.kidId?._id || p.kidId);
        const has = (cur.events || []).some(
          (e) => String(e.kidId?._id || e.kidId) === kidId && e.type === 'picked_up'
        );
        if (!has) {
          const next = {
            ...cur,
            events: [...(cur.events || []), { kidId, type: 'picked_up' }],
          };
          selectedRef.current = next;
          setSelected(next);
          setDriverLocation(locFrom(cur.trip));
        }
      }
      refresh();
    };

    socket.on('location:update', onLocation);
    socket.on('trip:started', refresh);
    socket.on('kid:picked_up', onPickedUp);
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
      socket.off('kid:picked_up', onPickedUp);
      socket.off('kid:dropped_off');
      socket.off('trip:completed');
      socket.off('notification:new');
    };
  }, [load, showToast]);

  useEffect(() => {
    if (!selected?.trip?._id) return undefined;
    const socket = connectSocket();
    const tripId = String(selected.trip._id);
    socket?.emit('trip:join', tripId);
    return () => socket?.emit('trip:leave', tripId);
  }, [selected?.trip?._id]);

  const markRead = async () => {
    await api('/parent/notifications/read', { method: 'POST', body: {} });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const onBus = selected ? anyKidOnBus(selected.events, selected.myKids) : false;
  const statusLabel = !selected
    ? 'No active trip'
    : onBus
      ? 'Live · tracking driver'
      : 'Trip started — waiting for pickup';

  const mapCenter =
    driverLocation ||
    selected?.stops?.[0]?.location ||
    selected?.trip?.schoolId?.location || { lat: -1.3965, lng: 36.7542 };

  return (
    <div className="parent-ride">
      {error && <div className="alert parent-ride-alert">{error}</div>}

      <div className="parent-ride-map">
        <MapView
          key={selected?.trip?._id || 'idle'}
          center={mapCenter}
          zoom={onBus ? 15.5 : 14}
          driverLocation={driverLocation}
          stops={
            selected
              ? stopsForTripKids(selected.stops, selected.trip.kidIds || selected.myKids || [])
              : []
          }
          direction={selected?.trip?.direction}
          showRoute={!!selected}
          followDriver={onBus}
          className="map-canvas parent-ride-canvas"
        />

        <div className="parent-ride-chrome">
          <div className="parent-ride-status">
            <span className={`parent-ride-dot ${onBus ? 'is-live' : ''}`} />
            <div>
              <strong>{statusLabel}</strong>
              {selected && (
                <small>
                  {selected.trip.routeId?.name}
                  {selected.trip.driverId?.name ? ` · ${selected.trip.driverId.name}` : ''}
                </small>
              )}
            </div>
          </div>
          <button type="button" className="btn btn-ghost parent-ride-logout" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      <div className="parent-ride-sheet">
        <div className="parent-ride-handle" aria-hidden="true" />
        <div className="parent-ride-tabs">
          <button
            type="button"
            className={sheetTab === 'ride' ? 'active' : ''}
            onClick={() => setSheetTab('ride')}
          >
            Ride
          </button>
          <button
            type="button"
            className={sheetTab === 'alerts' ? 'active' : ''}
            onClick={() => setSheetTab('alerts')}
          >
            Alerts
            {notifications.some((n) => !n.read) ? (
              <span className="parent-ride-badge">
                {notifications.filter((n) => !n.read).length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={sheetTab === 'kids' ? 'active' : ''}
            onClick={() => setSheetTab('kids')}
          >
            Kids
          </button>
        </div>

        {sheetTab === 'ride' && (
          <div className="parent-ride-body">
            {!selected && (
              <p className="muted">No active trip. You will see the bus here after pickup.</p>
            )}
            {selected && (
              <>
                <div className="parent-ride-meta">
                  <h2>{selected.trip.routeId?.name}</h2>
                  <p className="muted">
                    Driver {selected.trip.driverId?.name}
                    {selected.driverProfile?.vehiclePlate
                      ? ` · ${selected.driverProfile.vehiclePlate}`
                      : ''}
                    {' · '}
                    {selected.trip.direction === 'to_school' ? 'To school' : 'To home'}
                  </p>
                  <p className="muted">
                    {active.length} active trip{active.length === 1 ? '' : 's'} · signed in as{' '}
                    {user?.email}
                  </p>
                </div>
                <ul className="kid-list">
                  {selected.myKids.map((kid) => {
                    const picked = isKidOnBus(selected.events, kid._id);
                    const dropped = (selected.events || []).some(
                      (e) =>
                        String(e.kidId?._id || e.kidId) === String(kid._id) &&
                        e.type === 'dropped_off'
                    );
                    return (
                      <li key={kid._id} className="kid-row">
                        <div>
                          <strong>{kid.name}</strong>
                          <div className="muted">
                            {dropped
                              ? 'Dropped off'
                              : picked
                                ? 'On the bus · tracking'
                                : 'Waiting for pickup'}
                          </div>
                        </div>
                        <span className={`pill ${picked && !dropped ? 'pill-live' : ''}`}>
                          {dropped ? 'Done' : picked ? 'Live' : 'Wait'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        {sheetTab === 'alerts' && (
          <div className="parent-ride-body">
            <div className="panel-head">
              <h2>Notifications</h2>
              <button type="button" className="btn btn-ghost" onClick={markRead}>
                Mark all read
              </button>
            </div>
            <ul className="notif-list">
              {notifications.map((n) => (
                <li key={n.id || n._id} className={n.read ? 'read' : 'unread'}>
                  <span className="pill">{notificationTypeLabel(n.type)}</span>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>{new Date(n.createdAt).toLocaleString()}</small>
                </li>
              ))}
              {!notifications.length && <li className="muted">No notifications yet.</li>}
            </ul>
          </div>
        )}

        {sheetTab === 'kids' && (
          <div className="parent-ride-body">
            <ul className="list">
              {kids.map((k) => (
                <li key={k._id} className="panel tight">
                  <strong>{k.name}</strong>
                  <div className="muted">
                    {k.schoolId?.name} · {k.routeId?.name} · {k.homeStopId?.name}
                  </div>
                </li>
              ))}
              {!kids.length && <li className="muted">No children linked.</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
