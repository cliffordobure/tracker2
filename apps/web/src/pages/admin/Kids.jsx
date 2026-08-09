import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';

const emptyParent = { name: '', email: '', phone: '', password: 'parent123' };

export default function Kids() {
  const [kids, setKids] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [parents, setParents] = useState([]);
  const [school, setSchool] = useState(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [routeMode, setRouteMode] = useState('existing');
  const [routeId, setRouteId] = useState('');
  const [routeName, setRouteName] = useState('');
  const [boarding, setBoarding] = useState({ lat: -1.39, lng: 36.74, stopName: '' });
  const [parentMode, setParentMode] = useState('new');
  const [parent, setParent] = useState(emptyParent);
  const [parentIds, setParentIds] = useState([]);

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
        lat: s.schools[0].location.lat,
        lng: s.schools[0].location.lng,
      }));
    }
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const resetWizard = () => {
    setStep(1);
    setName('');
    setGrade('');
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
  };

  const submit = async () => {
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
      };
      if (routeMode === 'existing') body.routeId = routeId;
      else body.routeName = routeName;

      if (parentMode === 'new') body.parent = parent;
      else body.parentIds = parentIds;

      await api('/admin/kids/onboard', { method: 'POST', body });
      setSuccess(`${name} onboarded successfully.`);
      resetWizard();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleParent = (id) => {
    setParentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const canNext = () => {
    if (step === 1) return Boolean(name.trim());
    if (step === 2) {
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

  return (
    <div className="split">
      <div className="stack">
        <h2>Students</h2>
        <p className="lede">Onboard a student with route, boarding point on the map, and parent login.</p>
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
              </tr>
            </thead>
            <tbody>
              {kids.map((k) => (
                <tr key={k._id}>
                  <td>
                    <strong>{k.name}</strong>
                    <div className="muted">{k.grade}</div>
                  </td>
                  <td>{k.routeId?.name}</td>
                  <td>{k.homeStopId?.name}</td>
                  <td>{(k.parentIds || []).map((p) => p.name).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-form wizard">
        <div className="wizard-steps">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className={`wizard-step ${step === n ? 'active' : ''} ${step > n ? 'done' : ''}`}
              onClick={() => n < step && setStep(n)}
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
          </>
        )}

        {step === 2 && (
          <>
            <h3>Route</h3>
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
            {routeMode === 'existing' ? (
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
            <h3>Boarding point</h3>
            <p className="hint">Click the map to set where this student boards the bus.</p>
            <label>
              Stop name
              <input
                value={boarding.stopName}
                onChange={(e) => setBoarding({ ...boarding, stopName: e.target.value })}
                placeholder={`${name || 'Student'} boarding`}
              />
            </label>
            <MapView
              center={{ lat: boarding.lat, lng: boarding.lng }}
              zoom={14}
              onMapClick={(loc) => setBoarding({ ...boarding, ...loc })}
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
          </>
        )}

        {step === 4 && (
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
          {step < 4 ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canNext()}
              onClick={() => setStep(step + 1)}
            >
              Next
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!canNext()} onClick={submit}>
              Create student
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
