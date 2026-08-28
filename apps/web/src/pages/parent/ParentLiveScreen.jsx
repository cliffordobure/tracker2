import MapView from '../../components/MapView';
import { isKidOnBus } from '../../lib/mapMarkers';
import { notificationTypeLabel } from '../../lib/webPush';

export default function ParentLiveScreen({
  error,
  selected,
  active,
  user,
  onBus,
  driverLocation,
  mapStops,
  tripKids,
  etas,
  sheetTab,
  setSheetTab,
  notifications,
  kids,
  schoolFeed,
  markRead,
  lateNote,
  setLateNote,
  lateKidId,
  setLateKidId,
  lateBusy,
  requestLatePickup,
  logout,
  onClose,
  primaryEta,
}) {
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
    <div className="parent-ride parent-live-overlay">
      {error && <div className="alert parent-ride-alert">{error}</div>}

      <div className="parent-ride-map">
        <MapView
          key={selected?.trip?._id || 'idle'}
          center={mapCenter}
          zoom={onBus ? 15.5 : 14}
          driverLocation={driverLocation}
          stops={mapStops}
          direction={selected?.trip?.direction}
          showRoute={!!selected}
          liveNavigate={onBus}
          events={selected?.events || []}
          kids={tripKids}
          followDriver={onBus}
          className="map-canvas parent-ride-canvas"
        />

        <div className="parent-ride-chrome">
          <button type="button" className="parent-live-back" onClick={onClose}>
            ← Back
          </button>
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
          <div className="parent-ride-chrome-right">
            {primaryEta?.label && (
              <div className="parent-ride-eta" title={primaryEta.stopName}>
                <strong>{primaryEta.shortLabel}</strong>
                <small>{primaryEta.purpose}</small>
              </div>
            )}
            <button type="button" className="btn btn-ghost parent-ride-logout" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="parent-ride-sheet">
        <div className="parent-ride-handle" aria-hidden="true" />
        <div className="parent-ride-tabs">
          <button type="button" className={sheetTab === 'ride' ? 'active' : ''} onClick={() => setSheetTab('ride')}>
            Ride
          </button>
          <button type="button" className={sheetTab === 'alerts' ? 'active' : ''} onClick={() => setSheetTab('alerts')}>
            Alerts
            {notifications.some((n) => !n.read) ? (
              <span className="parent-ride-badge">{notifications.filter((n) => !n.read).length}</span>
            ) : null}
          </button>
          <button type="button" className={sheetTab === 'kids' ? 'active' : ''} onClick={() => setSheetTab('kids')}>
            Kids
          </button>
          <button type="button" className={sheetTab === 'school' ? 'active' : ''} onClick={() => setSheetTab('school')}>
            School
          </button>
        </div>

        {sheetTab === 'ride' && (
          <div className="parent-ride-body">
            {!selected && <p className="muted">No active trip. You will see the bus here after pickup.</p>}
            {selected && (
              <>
                <div className="parent-ride-meta">
                  <h2>{selected.trip.routeId?.name}</h2>
                  <p className="muted">
                    Driver {selected.trip.driverId?.name}
                    {selected.driverProfile?.vehiclePlate ? ` · ${selected.driverProfile.vehiclePlate}` : ''}
                    {' · '}
                    {selected.trip.direction === 'to_school' ? 'To school' : 'To home'}
                  </p>
                  <p className="muted">
                    {active.length} active trip{active.length === 1 ? '' : 's'} · signed in as {user?.email}
                  </p>
                </div>
                <ul className="kid-list">
                  {selected.myKids.map((kid) => {
                    const picked = isKidOnBus(selected.events, kid._id);
                    const dropped = (selected.events || []).some(
                      (e) => String(e.kidId?._id || e.kidId) === String(kid._id) && e.type === 'dropped_off'
                    );
                    const waiting = !picked && !dropped;
                    const composing = lateKidId === kid._id;
                    const eta = etas[String(kid._id)];
                    return (
                      <li key={kid._id} className="kid-row kid-row--stack">
                        <div className="kid-row-main">
                          <div>
                            <strong>{kid.name}</strong>
                            <div className="muted">
                              {dropped ? 'Dropped off' : picked ? 'On the bus · tracking' : 'Waiting for pickup'}
                            </div>
                            {eta?.label && !dropped && (
                              <div className="parent-kid-eta">
                                {eta.label}
                                {eta.stopName ? ` · ${eta.stopName}` : ''}
                              </div>
                            )}
                          </div>
                          <span className={`pill ${picked && !dropped ? 'pill-live' : ''}`}>
                            {dropped ? 'Done' : eta?.shortLabel || (picked ? 'Live' : 'Wait')}
                          </span>
                        </div>
                        {waiting && (
                          <div className="late-pickup">
                            {!composing ? (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  setLateKidId(kid._id);
                                  setLateNote('');
                                }}
                              >
                                Request late pickup
                              </button>
                            ) : (
                              <>
                                <textarea
                                  rows={2}
                                  placeholder="Optional note for the driver (e.g. running 10 minutes late)"
                                  value={lateNote}
                                  onChange={(e) => setLateNote(e.target.value)}
                                />
                                <div className="row-actions">
                                  <button type="button" className="btn btn-ghost" onClick={() => setLateKidId('')} disabled={lateBusy}>
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => requestLatePickup(kid._id)}
                                    disabled={lateBusy}
                                  >
                                    {lateBusy ? 'Sending…' : 'Send to driver'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
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

        {sheetTab === 'school' && (
          <div className="parent-ride-body">
            <h2>Today’s register</h2>
            <ul className="kid-list">
              {kids.map((k) => {
                const mark = schoolFeed.attendance.find(
                  (m) => String(m.kidId?._id || m.kidId) === String(k._id)
                );
                return (
                  <li key={k._id} className="kid-row">
                    <div>
                      <strong>{k.name}</strong>
                      <div className="muted">{k.grade || ''}</div>
                    </div>
                    <span className={`pill status-${mark?.status || 'waiting'}`}>{mark?.status || 'Not marked'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
