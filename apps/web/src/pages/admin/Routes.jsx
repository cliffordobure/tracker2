import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';

export default function RoutesPage() {
  const [schools, setSchools] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [stops, setStops] = useState([]);
  const [routeForm, setRouteForm] = useState({ name: '', schoolId: '', description: '' });
  const [stopForm, setStopForm] = useState({
    name: '',
    type: 'home',
    order: 1,
    location: { lat: -1.39, lng: 36.74 },
  });
  const [error, setError] = useState('');

  const loadRoutes = async () => {
    const [r, s] = await Promise.all([api('/admin/routes'), api('/admin/schools')]);
    setRoutes(r.routes);
    setSchools(s.schools);
    if (!routeForm.schoolId && s.schools[0]) {
      setRouteForm((f) => ({ ...f, schoolId: s.schools[0]._id }));
    }
  };

  const loadStops = async (routeId) => {
    const data = await api(`/admin/routes/${routeId}/stops`);
    setStops(data.stops);
  };

  useEffect(() => {
    loadRoutes().catch((e) => setError(e.message));
  }, []);

  const createRoute = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/routes', { method: 'POST', body: routeForm });
      setRouteForm((f) => ({ ...f, name: '', description: '' }));
      await loadRoutes();
    } catch (err) {
      setError(err.message);
    }
  };

  const selectRoute = async (route) => {
    setSelectedRoute(route);
    await loadStops(route._id);
  };

  const addStop = async (e) => {
    e.preventDefault();
    if (!selectedRoute) return;
    try {
      await api(`/admin/routes/${selectedRoute._id}/stops`, {
        method: 'POST',
        body: stopForm,
      });
      setStopForm((f) => ({ ...f, name: '', order: f.order + 1 }));
      await loadStops(selectedRoute._id);
    } catch (err) {
      setError(err.message);
    }
  };

  const removeStop = async (id) => {
    await api(`/admin/stops/${id}`, { method: 'DELETE' });
    await loadStops(selectedRoute._id);
  };

  return (
    <div className="stack">
      {error && <div className="alert">{error}</div>}
      <div className="split">
        <div className="stack">
          <h2>Routes</h2>
          <ul className="list">
            {routes.map((r) => (
              <li key={r._id}>
                <button
                  type="button"
                  className={`list-btn ${selectedRoute?._id === r._id ? 'active' : ''}`}
                  onClick={() => selectRoute(r)}
                >
                  <strong>{r.name}</strong>
                  <span>{r.schoolId?.name || 'School'}</span>
                </button>
              </li>
            ))}
          </ul>
          <form className="card-form" onSubmit={createRoute}>
            <h3>New route</h3>
            <label>
              Name
              <input
                required
                value={routeForm.name}
                onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })}
              />
            </label>
            <label>
              School
              <select
                required
                value={routeForm.schoolId}
                onChange={(e) => setRouteForm({ ...routeForm, schoolId: e.target.value })}
              >
                {schools.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Description
              <input
                value={routeForm.description}
                onChange={(e) => setRouteForm({ ...routeForm, description: e.target.value })}
              />
            </label>
            <button className="btn btn-primary" type="submit">
              Create route
            </button>
          </form>
        </div>

        <div className="stack">
          <h2>Stops {selectedRoute ? `— ${selectedRoute.name}` : ''}</h2>
          {!selectedRoute && <p className="muted">Select a route to manage stops.</p>}
          {selectedRoute && (
            <>
              <MapView
                center={stops[0]?.location || { lat: -1.3965, lng: 36.7542 }}
                stops={stops}
                onMapClick={(loc) => setStopForm({ ...stopForm, location: loc })}
                className="map-canvas map-md"
              />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {stops.map((s) => (
                      <tr key={s._id}>
                        <td>{s.order}</td>
                        <td>{s.name}</td>
                        <td>{s.type}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => removeStop(s._id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form className="card-form" onSubmit={addStop}>
                <h3>Add stop (click map for coordinates)</h3>
                <label>
                  Name
                  <input
                    required
                    value={stopForm.name}
                    onChange={(e) => setStopForm({ ...stopForm, name: e.target.value })}
                  />
                </label>
                <div className="inline-fields">
                  <label>
                    Type
                    <select
                      value={stopForm.type}
                      onChange={(e) => setStopForm({ ...stopForm, type: e.target.value })}
                    >
                      <option value="home">home</option>
                      <option value="school">school</option>
                    </select>
                  </label>
                  <label>
                    Order
                    <input
                      type="number"
                      value={stopForm.order}
                      onChange={(e) => setStopForm({ ...stopForm, order: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <div className="inline-fields">
                  <label>
                    Lat
                    <input
                      type="number"
                      step="any"
                      value={stopForm.location.lat}
                      onChange={(e) =>
                        setStopForm({
                          ...stopForm,
                          location: { ...stopForm.location, lat: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    Lng
                    <input
                      type="number"
                      step="any"
                      value={stopForm.location.lng}
                      onChange={(e) =>
                        setStopForm({
                          ...stopForm,
                          location: { ...stopForm.location, lng: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                </div>
                <button className="btn btn-primary" type="submit">
                  Add stop
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
