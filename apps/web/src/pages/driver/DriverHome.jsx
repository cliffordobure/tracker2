import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { connectSocket } from '../../lib/socket';
import MapView from '../../components/MapView';
import { useAuth } from '../../context/AuthContext';
import {
  formatDistance,
  haversineMeters,
  nextPendingStop,
  orderedStopsForDirection,
  stopsForTripKids,
} from '../../lib/geo';
import { notificationTypeLabel } from '../../lib/webPush';

const APPROACH_M = 180;
const ARRIVE_M = 60;

function periodLabel(period, direction) {
  if (period === 'morning') return 'morning';
  if (period === 'afternoon') return 'afternoon';
  if (period === 'evening') return 'evening';
  return direction === 'to_school' ? 'morning' : 'evening';
}

function isEveningTrip(t) {
  return t?.direction === 'to_home' || t?.period === 'evening';
}

export default function DriverHome() {
  const { showToast } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [todayTrips, setTodayTrips] = useState([]);
  const [trip, setTrip] = useState(null);
  const [events, setEvents] = useState([]);
  const [stops, setStops] = useState([]);
  const [driverLocation, setDriverLocation] = useState(null);
  const [error, setError] = useState('');
  const [visitedStopIds, setVisitedStopIds] = useState([]);
  const [routeCoords, setRouteCoords] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const watchRef = useRef(null);
  const notifiedRef = useRef(new Set());
  const visitedRef = useRef([]);
  const orderedRef = useRef([]);
  const directionRef = useRef(null);
  const routeIndexRef = useRef(0);

  const orderedStops = useMemo(
    () => orderedStopsForDirection(stops, trip?.direction),
    [stops, trip?.direction]
  );

  useEffect(() => {
    visitedRef.current = visitedStopIds;
  }, [visitedStopIds]);

  useEffect(() => {
    orderedRef.current = orderedStops;
    directionRef.current = trip?.direction;
  }, [orderedStops, trip?.direction]);

  const nextStop = useMemo(
    () => nextPendingStop(orderedStops, new Set(visitedStopIds)),
    [orderedStops, visitedStopIds]
  );

  const distanceToNext = useMemo(() => {
    if (!driverLocation || !nextStop) return null;
    return haversineMeters(driverLocation, nextStop.location);
  }, [driverLocation, nextStop]);

  const placeBusAt = useCallback((location) => {
    if (!location?.lat || !location?.lng) return;
    setDriverLocation({ lat: location.lat, lng: location.lng });
  }, []);

  const seedBusLocation = useCallback(
    (detailStops, direction, latestLocation) => {
      const first = orderedStopsForDirection(detailStops || [], direction)[0];
      // Prefer starting on the school route so the bus appears on the blue road path
      const routeStart = first?.location;
      if (latestLocation?.lat != null && routeStart) {
        const dist = haversineMeters(latestLocation, routeStart);
        if (dist < 8000) {
          placeBusAt(latestLocation);
          return;
        }
      }
      if (routeStart) placeBusAt(routeStart);
      else if (latestLocation?.lat != null) placeBusAt(latestLocation);
    },
    [placeBusAt]
  );

  const loadRoutes = useCallback(async () => {
    const [routesData, todayData, notifData] = await Promise.all([
      api('/driver/routes'),
      api('/driver/trips/today'),
      api('/driver/notifications'),
    ]);
    setRoutes(routesData.routes);
    setTodayTrips(todayData.trips || []);
    setNotifications(notifData.notifications || []);
    const active =
      (todayData.trips || []).find((t) => t.status === 'active') ||
      routesData.routes.find((r) => r.activeTrip)?.activeTrip;
    if (active) {
      const detail = await api(`/trips/${active._id}`);
      setTrip(detail.trip);
      setEvents(detail.events);
      const tripStops = stopsForTripKids(detail.stops, detail.trip.kidIds || []);
      setStops(tripStops);
      seedBusLocation(tripStops, detail.trip.direction, detail.trip.latestLocation);
    }
  }, [seedBusLocation]);

  useEffect(() => {
    loadRoutes().catch((e) => setError(e.message));
  }, [loadRoutes]);

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return undefined;
    const onNotif = (n) => {
      setNotifications((prev) => [n, ...prev]);
    };
    socket.on('notification:new', onNotif);
    return () => socket.off('notification:new', onNotif);
  }, []);

  useEffect(() => {
    if (!trip?._id) return undefined;
    const socket = connectSocket();
    socket?.emit('trip:join', trip._id);
    return () => socket?.emit('trip:leave', trip._id);
  }, [trip?._id]);

  const markNotifsRead = async () => {
    await api('/driver/notifications/read', { method: 'POST', body: {} });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const maybeNotifyStops = useCallback(
    (location) => {
      const list = orderedRef.current;
      if (!location || !list.length) return;

      const stop = nextPendingStop(list, new Set(visitedRef.current));
      if (!stop) return;

      const dist = haversineMeters(location, stop.location);
      const approachKey = `approach:${stop._id}`;
      const arriveKey = `arrive:${stop._id}`;

      if (dist <= APPROACH_M && !notifiedRef.current.has(approachKey)) {
        notifiedRef.current.add(approachKey);
        const action =
          directionRef.current === 'to_school'
            ? stop.type === 'school'
              ? 'drop-off at school'
              : 'pickup kids'
            : stop.type === 'school'
              ? 'pickup kids at school'
              : 'drop-off kids';
        showToast(`Approaching ${stop.name} — prepare to ${action}`, 'success');
      }

      if (dist <= ARRIVE_M && !notifiedRef.current.has(arriveKey)) {
        notifiedRef.current.add(arriveKey);
        showToast(`Arrived at stop: ${stop.name}`, 'success');
        setVisitedStopIds((prev) => {
          if (prev.includes(stop._id)) return prev;
          const next = [...prev, stop._id];
          visitedRef.current = next;
          return next;
        });
      }
    },
    [showToast]
  );

  const startSharing = (tripId) => {
    if (!navigator.geolocation) {
      showToast('Geolocation not available in this browser', 'error');
      return;
    }
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);

    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const payload = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? undefined,
          speed: pos.coords.speed ?? undefined,
        };
        setDriverLocation(payload);
        maybeNotifyStops(payload);
        try {
          await api(`/trips/${tripId}/location`, { method: 'POST', body: payload });
        } catch {
          /* ignore transient GPS post errors */
        }
      },
      () => showToast('Unable to read GPS. Allow location access.', 'error'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  };

  useEffect(() => {
    if (trip?._id && (trip.status === 'active' || (trip.status === 'scheduled' && isEveningTrip(trip)))) {
      startSharing(trip._id);
    }
    return () => {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?._id, trip?.status]);

  const beginBoarding = async (t) => {
    const detail = await api(`/trips/${t._id}`);
    setTrip(detail.trip);
    setEvents(detail.events || []);
    const tripStops = stopsForTripKids(detail.stops, detail.trip.kidIds || []);
    setStops(tripStops);
    showToast('Check in whoever is boarding, then start. The bus does not need to be full.');
  };

  const activateTrip = async (t, direction) => {
    const detail = await api(`/trips/${t._id}`);
    setTrip(detail.trip);
    setEvents(detail.events);
    const tripStops = stopsForTripKids(detail.stops, detail.trip.kidIds || []);
    setStops(tripStops);
    setVisitedStopIds([]);
    visitedRef.current = [];
    notifiedRef.current = new Set();
    setRouteCoords([]);
    routeIndexRef.current = 0;
    seedBusLocation(tripStops, direction, detail.trip.latestLocation);
    showToast(`Trip started (${direction === 'to_school' ? 'to school' : 'to home'})`);
    const first = orderedStopsForDirection(tripStops, direction)[0];
    if (first) showToast(`First stop: ${first.name}`, 'success');
  };

  const startTrip = async (routeId, direction) => {
    setError('');
    try {
      const data = await api('/trips', {
        method: 'POST',
        body: { routeId, direction },
      });
      const t = data.trip;
      if (data.boarding || t.status === 'scheduled') {
        await beginBoarding(t);
        return;
      }
      await activateTrip(t, direction);
    } catch (err) {
      setError(err.message);
    }
  };

  const startScheduled = async (scheduledTrip) => {
    setError('');
    try {
      if (isEveningTrip(scheduledTrip)) {
        await beginBoarding(scheduledTrip);
        return;
      }
      const body = driverLocation
        ? { lat: driverLocation.lat, lng: driverLocation.lng }
        : {};
      const { trip: t } = await api(`/trips/${scheduledTrip._id}/start`, {
        method: 'POST',
        body,
      });
      await activateTrip(t, t.direction);
      await loadRoutes();
    } catch (err) {
      setError(err.message);
    }
  };

  const eventFor = (kidId, type) =>
    events.find((e) => (e.kidId?._id || e.kidId) === kidId && e.type === type);

  const markPickup = async (kidId) => {
    try {
      const path =
        trip.status === 'scheduled'
          ? `/trips/${trip._id}/kids/${kidId}/check-in`
          : `/trips/${trip._id}/kids/${kidId}/pickup`;
      const { event } = await api(path, { method: 'POST' });
      setEvents((prev) => [
        ...prev.filter((e) => !((e.kidId?._id || e.kidId) === kidId && (e.type === 'picked_up' || e.type === 'not_picked_up'))),
        event,
      ]);
      showToast(trip.status === 'scheduled' ? 'Checked in' : 'Marked picked up');
    } catch (err) {
      setError(err.message);
    }
  };

  const startBoardedTrip = async () => {
    setError('');
    try {
      const body = driverLocation
        ? { lat: driverLocation.lat, lng: driverLocation.lng }
        : {};
      const { trip: t } = await api(`/trips/${trip._id}/start`, {
        method: 'POST',
        body,
      });
      await activateTrip(t, t.direction);
    } catch (err) {
      setError(err.message);
    }
  };

  const markDropoff = async (kidId) => {
    try {
      const { event } = await api(`/trips/${trip._id}/kids/${kidId}/dropoff`, { method: 'POST' });
      setEvents((prev) => [...prev, event]);
      showToast('Marked dropped off');
    } catch (err) {
      setError(err.message);
    }
  };

  const completeTrip = async () => {
    try {
      const body = driverLocation
        ? { lat: driverLocation.lat, lng: driverLocation.lng }
        : {};
      await api(`/trips/${trip._id}/complete`, { method: 'POST', body });
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
      setTrip(null);
      setEvents([]);
      setStops([]);
      setVisitedStopIds([]);
      setRouteCoords([]);
      setDriverLocation(null);
      routeIndexRef.current = 0;
      notifiedRef.current = new Set();
      showToast('Trip completed');
      await loadRoutes();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRouteReady = useCallback((coordinates) => {
    setRouteCoords(coordinates || []);
    routeIndexRef.current = 0;
  }, []);

  const kids = trip?.kidIds || [];
  const boarding = trip?.status === 'scheduled' && isEveningTrip(trip);
  const boardedCount = kids.filter((kid) => eventFor(kid._id || kid, 'picked_up')).length;

  const unreadAlerts = notifications.filter((n) => !n.read).length;

  return (
    <div className="stack">
      {error && <div className="alert">{error}</div>}

      <div className="panel driver-alerts">
        <div className="panel-head">
          <div>
            <h2>Parent alerts {unreadAlerts ? `(${unreadAlerts})` : ''}</h2>
            <p className="muted">Late pickup requests and other parent messages</p>
          </div>
          {!!notifications.length && (
            <button type="button" className="btn btn-ghost" onClick={markNotifsRead}>
              Mark all read
            </button>
          )}
        </div>
        <ul className="notif-list">
          {notifications.slice(0, 8).map((n) => (
            <li key={n.id || n._id} className={n.read ? 'read' : 'unread'}>
              <span className="pill">{notificationTypeLabel(n.type)}</span>
              <strong>{n.title}</strong>
              <p>{n.body}</p>
              <small>{new Date(n.createdAt).toLocaleString()}</small>
            </li>
          ))}
          {!notifications.length && <li className="muted">No parent alerts yet.</li>}
        </ul>
      </div>

      {!trip && (
        <div className="stack">
          <p className="lede">Today&apos;s trip instances assigned to you. Start by period, then share GPS.</p>

          {todayTrips.filter((t) => t.status === 'scheduled').length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Today&apos;s trips</h2>
                  <p className="muted">Scheduled instances for this service day</p>
                </div>
              </div>
              <div className="stack" style={{ marginTop: '0.75rem' }}>
                {todayTrips
                  .filter((t) => t.status === 'scheduled')
                  .map((st) => {
                    const label = periodLabel(st.period, st.direction);
                    return (
                      <div
                        key={st._id}
                        className="row-actions"
                        style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}
                      >
                        <span>
                          <strong>{st.tripCode || `Trip ${st.sequence}`}</strong>
                          {st.busId ? ` · ${st.busId.label || st.busId.plate}` : ''} ·{' '}
                          {st.routeId?.name || 'Route'} · {(st.kidIds || []).length} students ·{' '}
                          {label}
                        </span>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => startScheduled(st)}
                        >
                          {isEveningTrip(st) ? 'Check in students' : `Start ${label} trip`}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {routes.map((route) => (
            <div key={route._id} className="panel">
              <div className="panel-head">
                <div>
                  <h2>{route.name}</h2>
                  <p className="muted">
                    {route.schoolId?.name} · {route.kids?.length || 0} kids · ad-hoc fallback
                  </p>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => startTrip(route._id, 'to_school')}
                  >
                    Start morning
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => startTrip(route._id, 'to_home')}
                  >
                    Start evening
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!todayTrips.length && !routes.length && (
            <p>No trips for today. Ask your school admin to create a trip schedule.</p>
          )}
        </div>
      )}

      {trip && (
        <div className="split">
          <div className="stack">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>{trip.routeId?.name || (boarding ? 'Evening boarding' : 'Active trip')}</h2>
                  <p className="muted">
                    {trip.tripCode ? `${trip.tripCode} · ` : ''}
                    {periodLabel(trip.period, trip.direction)} ·{' '}
                    {trip.direction === 'to_school' ? 'to school' : 'to home'} · {trip.status}
                    {boarding ? ' · check in at school first' : ''}
                  </p>
                </div>
                <div className="row-actions">
                  {boarding ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={boardedCount === 0}
                      onClick={startBoardedTrip}
                    >
                      {boardedCount === 0
                        ? 'Check in students first'
                        : boardedCount === kids.length
                          ? 'Start evening trip'
                          : `Start with ${boardedCount} student${boardedCount === 1 ? '' : 's'}`}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={completeTrip}>
                      Complete {periodLabel(trip.period, trip.direction)} trip
                    </button>
                  )}
                </div>
              </div>
            </div>

            {nextStop && (
              <div className="next-stop-banner">
                <div>
                  <span className="eyebrow">Next stop</span>
                  <strong>{nextStop.name}</strong>
                  <p className="muted">
                    {nextStop.type === 'school' ? 'School' : 'Home stop'} ·{' '}
                    {distanceToNext != null ? formatDistance(distanceToNext) : 'Waiting for GPS'}
                  </p>
                </div>
                <ol className="stop-chip-list">
                  {orderedStops.map((s) => (
                    <li
                      key={s._id}
                      className={
                        visitedStopIds.includes(s._id)
                          ? 'done'
                          : nextStop._id === s._id
                            ? 'current'
                            : ''
                      }
                    >
                      {s.name}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <MapView
              key={trip._id}
              center={driverLocation || orderedStops[0]?.location || { lat: -1.3965, lng: 36.7542 }}
              zoom={15}
              driverLocation={driverLocation}
              stops={stops}
              direction={trip.direction}
              nextStopId={nextStop?._id}
              showRoute
              followDriver
              onRouteReady={handleRouteReady}
              className="map-canvas map-lg"
            />
          </div>
          <div className="stack">
            <h3>{boarding ? 'Check in at school' : 'Kids on trip'}</h3>
            <ul className="kid-list">
              {kids.map((kid) => {
                const id = kid._id || kid;
                const name = kid.name || 'Kid';
                const picked = !!eventFor(id, 'picked_up');
                const dropped = !!eventFor(id, 'dropped_off');
                return (
                  <li key={id} className="kid-row">
                    <div>
                      <strong>{name}</strong>
                      <div className="muted">
                        {dropped ? 'Dropped off' : picked ? 'On board' : boarding ? 'Waiting at school' : 'Waiting'}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={picked}
                        onClick={() => markPickup(id)}
                      >
                        {boarding ? 'Check in' : 'Pick up'}
                      </button>
                      {!boarding && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!picked || dropped}
                          onClick={() => markDropoff(id)}
                        >
                          Drop off
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
