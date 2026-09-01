import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { connectSocket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
import { fetchDrivingRoute, formatEtaMinutes } from '../../lib/directions';
import {
  etaPurposeLabel,
  nextStopForKid,
  stopsForTripKids,
  waypointsToTargetStop,
} from '../../lib/geo';
import { anyKidOnBus, isKidOnBus } from '../../lib/mapMarkers';
import { registerParentWebPush } from '../../lib/webPush';
import ParentHomeDashboard from './ParentHomeDashboard';
import ParentLiveScreen from './ParentLiveScreen';

function locFrom(trip) {
  const loc = trip?.latestLocation || trip?.startLocation;
  if (loc?.lat == null || loc?.lng == null) return null;
  return loc;
}

export default function ParentHome() {
  const navigate = useNavigate();
  const { user, logout, showToast } = useAuth();
  const [kids, setKids] = useState([]);
  const [active, setActive] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selected, setSelected] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState('home');
  const [panel, setPanel] = useState('');
  const [sheetTab, setSheetTab] = useState('ride');
  const [lateNote, setLateNote] = useState('');
  const [lateKidId, setLateKidId] = useState('');
  const [lateBusy, setLateBusy] = useState(false);
  const [schoolFeed, setSchoolFeed] = useState({ attendance: [], assignments: [], notes: [], diary: [] });
  const [etas, setEtas] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const selectedRef = useRef(null);
  const etaFetchRef = useRef(0);

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
    const [k, a, n, s] = await Promise.all([
      api('/parent/kids'),
      api('/parent/trips/active'),
      api('/parent/notifications'),
      api('/parent/school').catch(() => ({ attendance: [], assignments: [], notes: [], diary: [] })),
    ]);
    setKids(k.kids);
    setActive(a.trips);
    setNotifications(n.notifications || n.list || []);
    setSchoolFeed({
      attendance: s.attendance || [],
      assignments: s.assignments || [],
      notes: s.notes || [],
      diary: s.diary || [],
    });
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
            events: [...(cur.events || []), { kidId, type: 'picked_up', at: new Date().toISOString() }],
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
      if (n?.title) showToast(n.body ? `${n.title}: ${n.body}` : n.title);
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

  const requestLatePickup = async (kidId) => {
    if (!kidId || lateBusy) return;
    setLateBusy(true);
    setError('');
    try {
      await api('/parent/late-pickup-request', {
        method: 'POST',
        body: { kidId, message: lateNote, tripId: selected?.trip?._id },
      });
      setLateNote('');
      setLateKidId('');
      showToast('Late pickup request sent to the driver');
    } catch (e) {
      setError(e.message);
      showToast(e.message, 'error');
    } finally {
      setLateBusy(false);
    }
  };

  const onBus = selected ? anyKidOnBus(selected.events, selected.myKids) : false;
  const mapStops = selected
    ? stopsForTripKids(selected.stops, selected.trip.kidIds || selected.myKids || [])
    : [];
  const tripKids = selected?.trip?.kidIds || selected?.myKids || [];

  useEffect(() => {
    if (!selected || !driverLocation?.lat) {
      setEtas({});
      return undefined;
    }
    let cancelled = false;
    const runId = ++etaFetchRef.current;
    const stops = stopsForTripKids(selected.stops, selected.trip.kidIds || selected.myKids || []);
    const allKids = selected.trip.kidIds || selected.myKids || [];
    const events = selected.events || [];
    const direction = selected.trip.direction;
    const myKids = selected.myKids || [];
    const loc = { lat: driverLocation.lat, lng: driverLocation.lng };

    const run = async () => {
      const next = {};
      for (const kid of myKids) {
        const target = nextStopForKid({ kid, stops, direction, events });
        if (!target?.location) continue;
        const waypoints = waypointsToTargetStop({
          driverLocation: loc,
          stops,
          direction,
          kids: allKids,
          events,
          targetStop: target,
        });
        const route = await fetchDrivingRoute(waypoints);
        if (cancelled || runId !== etaFetchRef.current) return;
        if (!route) continue;
        const onKidBus = isKidOnBus(events, kid._id);
        const purpose = etaPurposeLabel(target, direction, onKidBus);
        const mins = formatEtaMinutes(route.durationSec);
        next[String(kid._id)] = {
          durationSec: route.durationSec,
          stopName: target.name,
          purpose,
          label: mins ? `≈ ${mins} to ${purpose}` : null,
          shortLabel: mins ? `≈ ${mins}` : null,
        };
      }
      if (!cancelled && runId === etaFetchRef.current) setEtas(next);
    };

    run().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    selected?.trip?._id,
    selected?.trip?.direction,
    selected?.events,
    selected?.myKids,
    selected?.stops,
    selected?.trip?.kidIds,
    driverLocation?.lat,
    driverLocation?.lng,
  ]);

  const primaryEta = Object.values(etas)[0] || null;

  const openPanel = (name) => {
    setMenuOpen(false);
    if (name === 'live') {
      setScreen('live');
      return;
    }
    if (name === 'notifications') {
      setSheetTab('alerts');
      setScreen('live');
      return;
    }
    if (name === 'children') {
      setSheetTab('kids');
      setScreen('live');
      return;
    }
    if (name === 'diary') {
      navigate('/parent/diary');
      return;
    }
    if (name === 'attendance') {
      setSheetTab('school');
      setScreen('live');
      return;
    }
    if (name === 'trips') {
      setSheetTab('ride');
      setScreen('live');
      return;
    }
    if (name === 'fees') {
      showToast('Fees & payments — contact your school admin for now.');
      return;
    }
    if (name === 'contact') {
      const school = kids[0]?.schoolId;
      const bits = [school?.supportEmail, school?.supportPhone, school?.address].filter(Boolean);
      showToast(bits.length ? bits.join(' · ') : 'No school contact on file yet.');
    }
  };

  return (
    <>
      <ParentHomeDashboard
        user={user}
        kids={kids}
        selected={selected}
        active={active}
        notifications={notifications}
        schoolFeed={schoolFeed}
        onOpenLive={() => setScreen('live')}
        onOpenPanel={openPanel}
        onDismissBanner={() => setBannerDismissed(true)}
        bannerDismissed={bannerDismissed}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        logout={logout}
        error={screen === 'home' ? error : ''}
      />

      {screen === 'live' && (
        <ParentLiveScreen
          error={error}
          selected={selected}
          active={active}
          user={user}
          onBus={onBus}
          driverLocation={driverLocation}
          mapStops={mapStops}
          tripKids={tripKids}
          etas={etas}
          sheetTab={sheetTab}
          setSheetTab={setSheetTab}
          notifications={notifications}
          kids={kids}
          schoolFeed={schoolFeed}
          markRead={markRead}
          lateNote={lateNote}
          setLateNote={setLateNote}
          lateKidId={lateKidId}
          setLateKidId={setLateKidId}
          lateBusy={lateBusy}
          requestLatePickup={requestLatePickup}
          logout={logout}
          onClose={() => setScreen('home')}
          primaryEta={primaryEta}
        />
      )}
    </>
  );
}
