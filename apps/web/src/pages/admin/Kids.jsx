import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';
import MediaPicker from '../../components/MediaPicker';
import LocationSearch from '../../components/LocationSearch';

const emptyParent = { name: '', email: '', phone: '', password: 'parent123' };

function coordsFromStop(stop) {
  const loc = stop?.location;
  if (!loc) return null;
  if (loc.lat != null && loc.lng != null) {
    return { lat: Number(loc.lat), lng: Number(loc.lng) };
  }
  if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    return { lat: Number(loc.coordinates[1]), lng: Number(loc.coordinates[0]) };
  }
  return null;
}

function formatCoords(loc) {
  const c = coordsFromStop({ location: loc });
  if (!c || Number.isNaN(c.lat) || Number.isNaN(c.lng)) return '';
  return `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
}

export default function Kids() {
  const [kids, setKids] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [parents, setParents] = useState([]);
  const [school, setSchool] = useState(null);
  const [mode, setMode] = useState('create'); // create | edit
  const [editingId, setEditingId] = useState(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [active, setActive] = useState(true);
  const [routeMode, setRouteMode] = useState('existing');
  const [routeId, setRouteId] = useState('');
  const [routeName, setRouteName] = useState('');
  const [boarding, setBoarding] = useState({ lat: -1.39, lng: 36.74, stopName: '' });
  const [mapFocus, setMapFocus] = useState(null);
  const [parentMode, setParentMode] = useState('new');
  const [parent, setParent] = useState(emptyParent);
  const [parentIds, setParentIds] = useState([]);
  const [photo, setPhoto] = useState(null);

  const load = async () => {
    const [k, r, p, s] = await Promise.all([
      api('/admin/kids'),
      api('/admin/routes'),
      api('/admin/parents'),
      api('/admin/schools'),
    ]);
    setKids(k.kids);
    setRoutes(r.routes);
    setParents(p.parents);
    setSchool(s.schools[0] || null);
    setRouteId((id) => id || r.routes[0]?._id || '');
    if (s.schools[0]?.location) {
      setBoarding((b) => ({
        ...b,
        lat: b.lat ?? s.schools[0].location.lat,
        lng: b.lng ?? s.schools[0].location.lng,
      }));
    }
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const resetForm = () => {
    setMode('create');
    setEditingId(null);
    setStep(1);
    setName('');
    setGrade('');
    setActive(true);
    setRouteMode('existing');
    setRouteName('');
    setBoarding({
      lat: school?.location?.lat ?? -1.39,
      lng: school?.location?.lng ?? 36.74,
      stopName: '',
    });
    setParentMode('new');
    setParent(emptyParent);
    setParentIds([]);
    setPhoto(null);
    setMapFocus(null);
  };

  const startEdit = (kid) => {
    setError('');
    setSuccess('');
    setMode('edit');
    setEditingId(kid._id);
    setStep(1);
    setName(kid.name || '');
    setGrade(kid.grade || '');
    setActive(kid.active !== false);
    setRouteMode('existing');
    setRouteId(kid.routeId?._id || kid.routeId || routes[0]?._id || '');
    setRouteName('');
    const loc = coordsFromStop(kid.homeStopId);
    setBoarding({
      lat: loc?.lat ?? school?.location?.lat ?? -1.39,
      lng: loc?.lng ?? school?.location?.lng ?? 36.74,
      stopName: kid.homeStopId?.name || '',
    });
    setParentMode('existing');
    setParent(emptyParent);
    setParentIds((kid.parentIds || []).map((p) => p._id || p.id || p).filter(Boolean));
    setPhoto(kid.photoUrl ? { url: kid.photoUrl, publicId: kid.photoPublicId || '' } : null);
  };

  const submitCreate = async () => {
    setError('');
    setSuccess('');
    try {
      const body = {
        name,
        grade,
        boarding: {
          lat: boarding.lat,
          lng: boarding.lng,
          stopName: boarding.stopName || `${name} boarding`,
        },
        photoUrl: photo?.url || '',
        photoPublicId: photo?.publicId || '',
      };
      if (routeMode === 'existing') body.routeId = routeId;
      else body.routeName = routeName;

      if (parentMode === 'new') body.parent = parent;
      else body.parentIds = parentIds;

      await api('/admin/kids/onboard', { method: 'POST', body });
      setSuccess(`${name} onboarded successfully.`);
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const submitEdit = async () => {
    setError('');
    setSuccess('');
    try {
      const body = {
        name,
        grade,
        active,
        routeId,
        parentIds,
        boarding: {
          lat: boarding.lat,
          lng: boarding.lng,
          stopName: boarding.stopName || `${name} boarding`,
        },
        photoUrl: photo?.url || '',
        photoPublicId: photo?.publicId || '',
      };
      const { kid } = await api(`/admin/kids/${editingId}`, { method: 'PUT', body });
      if (kid?._id) {
        setKids((list) => list.map((k) => (k._id === kid._id ? kid : k)));
      }
      setSuccess(`${name} updated.`);
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (kid) => {
    if (!confirm(`Remove ${kid.name}?`)) return;
    setError('');
    try {
      await api(`/admin/kids/${kid._id}`, { method: 'DELETE' });
      if (editingId === kid._id) resetForm();
      setSuccess(`${kid.name} removed.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleParent = (id) => {
    setParentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const maxStep = mode === 'edit' ? 3 : 4;

  const canNext = () => {
    if (step === 1) return Boolean(name.trim());
    if (step === 2) {
      if (mode === 'edit') return Boolean(routeId);
      return routeMode === 'existing' ? Boolean(routeId) : Boolean(routeName.trim());
    }
    if (step === 3) return boarding.lat != null && boarding.lng != null;
    if (step === 4) {
      if (parentMode === 'new') {
        return Boolean(parent.name && parent.email && parent.password);
      }
      return parentIds.length > 0;
    }
    return false;
  };

  const canSaveEdit = () =>
    Boolean(name.trim() && routeId && boarding.lat != null && boarding.lng != null);

  return (
    <div className="split">
      <div className="stack">
        <h2>Students</h2>
        <p className="lede">
          Onboard students or edit name, grade, route, boarding stop, and parents.
        </p>
        {error && <div className="alert">{error}</div>}
        {success && <div className="alert alert-ok">{success}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Route</th>
                <th>Boarding</th>
                <th>Parents</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {kids.map((k) => (
                <tr key={k._id}>
                  <td>
                    {k.photoUrl ? <img src={k.photoUrl} alt="" className="table-thumb" /> : null}
                    <strong>{k.name}</strong>
                    <div className="muted">{k.grade}</div>
                  </td>
                  <td>{k.routeId?.name}</td>
                  <td>
                    {k.homeStopId?.name || '—'}
                    {k.homeStopId?.location ? (
                      <div className="muted">{formatCoords(k.homeStopId.location)}</div>
                    ) : null}
                  </td>
                  <td>{(k.parentIds || []).map((p) => p.name).join(', ')}</td>
                  <td className="row-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => startEdit(k)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => remove(k)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-form wizard">
        <div className="row-actions" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>{mode === 'edit' ? 'Edit student' : 'Add student'}</h3>
          {mode === 'edit' && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>

        <div className="wizard-steps">
          {Array.from({ length: maxStep }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`wizard-step ${step === n ? 'active' : ''} ${step > n ? 'done' : ''}`}
              onClick={() => (mode === 'edit' || n <= step) && setStep(n)}
            >
              {n}
            </button>
          ))}
        </div>

        {step === 1 && (
          <>
            <h3>Student details</h3>
            <label>
              Name
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Grade
              <input value={grade} onChange={(e) => setGrade(e.target.value)} />
            </label>
            <MediaPicker
              label="Student photo"
              folder="kids"
              accept="image/*"
              value={photo}
              onChange={setPhoto}
              hint="Stored on Cloudinary. Used on registers and parent views."
            />
            {mode === 'edit' && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Active on routes
              </label>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h3>Route</h3>
            {mode === 'create' && (
              <div className="segmented">
                <button
                  type="button"
                  className={routeMode === 'existing' ? 'active' : ''}
                  onClick={() => setRouteMode('existing')}
                >
                  Existing route
                </button>
                <button
                  type="button"
                  className={routeMode === 'new' ? 'active' : ''}
                  onClick={() => setRouteMode('new')}
                >
                  Create route
                </button>
              </div>
            )}
            {mode === 'edit' || routeMode === 'existing' ? (
              <label>
                Select route
                <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                  {routes.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                New route name
                <input
                  required
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="e.g. Route B — Magadi Road"
                />
              </label>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h3>Boarding / drop-off point</h3>
            <p className="hint">
              Search an area to zoom in, then click the map to mark the exact boarding point.
            </p>
            <label>
              Stop name
              <input
                value={boarding.stopName}
                onChange={(e) => setBoarding((b) => ({ ...b, stopName: e.target.value }))}
                placeholder={`${name || 'Student'} boarding`}
              />
            </label>
            <LocationSearch
              proximity={school?.location || boarding}
              placeholder="Search estate, road, or landmark…"
              onSelect={(place) => {
                setBoarding((b) => ({
                  ...b,
                  lat: place.lat,
                  lng: place.lng,
                  stopName: b.stopName.trim() ? b.stopName : place.name,
                }));
                setMapFocus({ lat: place.lat, lng: place.lng, zoom: 16.4, at: Date.now() });
              }}
            />
            <MapView
              center={{ lat: boarding.lat, lng: boarding.lng }}
              zoom={14}
              focus={mapFocus}
              onMapClick={(loc) => setBoarding((b) => ({ ...b, ...loc }))}
              stops={[
                ...(school?.location
                  ? [{ name: school.name, type: 'school', location: school.location }]
                  : []),
                {
                  name: boarding.stopName || 'Boarding',
                  type: 'home',
                  location: { lat: boarding.lat, lng: boarding.lng },
                },
              ]}
              className="map-canvas map-sm"
            />
            {boarding.lat != null && boarding.lng != null ? (
              <p className="hint">
                Selected point: {Number(boarding.lat).toFixed(5)}, {Number(boarding.lng).toFixed(5)}
              </p>
            ) : null}
            {mode === 'edit' && (
              <>
                <h3 style={{ marginTop: '1rem' }}>Parents</h3>
                <fieldset className="checkbox-set">
                  <legend>Linked parents</legend>
                  {parents.map((p) => (
                    <label key={p.id} className="check">
                      <input
                        type="checkbox"
                        checked={parentIds.includes(p.id)}
                        onChange={() => toggleParent(p.id)}
                      />
                      {p.name} <span className="muted">({p.email})</span>
                    </label>
                  ))}
                </fieldset>
              </>
            )}
          </>
        )}

        {step === 4 && mode === 'create' && (
          <>
            <h3>Parent</h3>
            <div className="segmented">
              <button
                type="button"
                className={parentMode === 'new' ? 'active' : ''}
                onClick={() => setParentMode('new')}
              >
                Create parent
              </button>
              <button
                type="button"
                className={parentMode === 'existing' ? 'active' : ''}
                onClick={() => setParentMode('existing')}
              >
                Existing parent
              </button>
            </div>
            {parentMode === 'new' ? (
              <>
                <label>
                  Name
                  <input
                    required
                    value={parent.name}
                    onChange={(e) => setParent({ ...parent, name: e.target.value })}
                  />
                </label>
                <label>
                  Email
                  <input
                    required
                    type="email"
                    value={parent.email}
                    onChange={(e) => setParent({ ...parent, email: e.target.value })}
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={parent.phone}
                    onChange={(e) => setParent({ ...parent, phone: e.target.value })}
                  />
                </label>
                <label>
                  Password
                  <input
                    required
                    value={parent.password}
                    onChange={(e) => setParent({ ...parent, password: e.target.value })}
                  />
                </label>
              </>
            ) : (
              <fieldset className="checkbox-set">
                <legend>Select parents</legend>
                {parents.map((p) => (
                  <label key={p.id} className="check">
                    <input
                      type="checkbox"
                      checked={parentIds.includes(p.id)}
                      onChange={() => toggleParent(p.id)}
                    />
                    {p.name} <span className="muted">({p.email})</span>
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}

        <div className="row-actions">
          {step > 1 && (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < maxStep && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canNext()}
              onClick={() => setStep(step + 1)}
            >
              Next
            </button>
          )}
          {mode === 'edit' ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canSaveEdit()}
              onClick={submitEdit}
            >
              Save student
            </button>
          ) : (
            step >= maxStep && (
              <button type="button" className="btn btn-primary" disabled={!canNext()} onClick={submitCreate}>
                Create student
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
