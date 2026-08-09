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
const APPROACH_M = 180;
const ARRIVE_M = 60;

export default function DriverHome() {
  const { showToast } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [trip, setTrip] = useState(null);
  const [events, setEvents] = useState([]);
  const [stops, setStops] = useState([]);
  const [driverLocation, setDriverLocation] = useState(null);
  const [error, setError] = useState('');
  const [visitedStopIds, setVisitedStopIds] = useState([]);
  const [routeCoords, setRouteCoords] = useState([]);
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
    const data = await api('/driver/routes');
    setRoutes(data.routes);
    const active = data.routes.find((r) => r.activeTrip)?.activeTrip;
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
    if (!trip?._id) return undefined;
    const socket = connectSocket();
    socket?.emit('trip:join', trip._id);
    return () => socket?.emit('trip:leave', trip._id);
  }, [trip?._id]);

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
    if (trip?._id && trip.status === 'active') {
      startSharing(trip._id);
    }
    return () => {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?._id, trip?.status]);

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
      const { trip: t } = await api('/trips', {
        method: 'POST',
        body: { routeId, direction },
      });
      await activateTrip(t, direction);
    } catch (err) {
      setError(err.message);
    }
  };

  const startScheduled = async (scheduledTrip) => {
    setError('');
    try {
      const { trip: t } = await api(`/trips/${scheduledTrip._id}/start`, { method: 'POST' });
      await activateTrip(t, t.direction);
    } catch (err) {
      setError(err.message);
    }
  };

  const eventFor = (kidId, type) =>
    events.find((e) => (e.kidId?._id || e.kidId) === kidId && e.type === type);

  const markPickup = async (kidId) => {
    try {
      const { event } = await api(`/trips/${trip._id}/kids/${kidId}/pickup`, { method: 'POST' });
      setEvents((prev) => [...prev, event]);
      showToast('Marked picked up');
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
      await api(`/trips/${trip._id}/complete`, { method: 'POST' });
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

  return (
    <div className="stack">
      {error && <div className="alert">{error}</div>}

      {!trip && (
        <div className="stack">
          <p className="lede">
            Start a dispatched trip for today, or begin an ad-hoc morning/evening run.
          </p>
          {routes.map((route) => (
            <div key={route._id} className="panel">
              <div className="panel-head">
                <div>
                  <h2>{route.name}</h2>
                  <p className="muted">
                    {route.schoolId?.name} · {route.kids?.length || 0} kids
                  </p>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
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
              {(route.scheduledTrips || []).length > 0 && (
                <div className="stack" style={{ marginTop: '0.75rem' }}>
                  <p className="hint">Dispatched for today</p>
                  {route.scheduledTrips.map((st) => (
                    <div key={st._id} className="row-actions" style={{ justifyContent: 'space-between' }}>
                      <span>
                        Trip {st.sequence}
                        {st.busId ? ` · ${st.busId.label || st.busId.plate}` : ''} ·{' '}
                        {(st.kidIds || []).length} students ·{' '}
                        {st.direction === 'to_school' ? 'to school' : 'to home'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => startScheduled(st)}
                      >
                        Start trip {st.sequence}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!routes.length && (
            <p>No routes or dispatched trips yet. Ask your school admin to dispatch you.</p>
          )}
        </div>
      )}

      {trip && (
        <div className="split">
          <div className="stack">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>{trip.routeId?.name || 'Active trip'}</h2>
                  <p className="muted">
                    {trip.direction === 'to_school' ? 'Morning → school' : 'Evening → home'} ·{' '}
                    {trip.status}
                  </p>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn btn-primary" onClick={completeTrip}>
                    Complete trip
                  </button>
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
            <h3>Kids on trip</h3>
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
                        {dropped ? 'Dropped off' : picked ? 'On board' : 'Waiting'}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={picked}
                        onClick={() => markPickup(id)}
                      >
                        Pick up
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!picked || dropped}
                        onClick={() => markDropoff(id)}
                      >
                        Drop off
                      </button>
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
