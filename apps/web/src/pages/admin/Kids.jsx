import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const empty = {
  name: '',
  grade: '',
  schoolId: '',
  routeId: '',
  homeStopId: '',
  parentIds: [],
};

export default function Kids() {
  const [kids, setKids] = useState([]);
  const [schools, setSchools] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [parents, setParents] = useState([]);
  const [stops, setStops] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  const load = async () => {
    const [k, s, r, p] = await Promise.all([
      api('/admin/kids'),
      api('/admin/schools'),
      api('/admin/routes'),
      api('/admin/parents'),
    ]);
    setKids(k.kids);
    setSchools(s.schools);
    setRoutes(r.routes);
    setParents(p.parents);
    setForm((f) => ({
      ...f,
      schoolId: f.schoolId || s.schools[0]?._id || '',
      routeId: f.routeId || r.routes[0]?._id || '',
    }));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!form.routeId) return;
    api(`/admin/routes/${form.routeId}/stops`)
      .then((d) => {
        setStops(d.stops);
        const home = d.stops.find((s) => s.type === 'home');
        setForm((f) => ({ ...f, homeStopId: f.homeStopId || home?._id || '' }));
      })
      .catch(() => setStops([]));
  }, [form.routeId]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/kids', { method: 'POST', body: form });
      setForm((f) => ({ ...empty, schoolId: f.schoolId, routeId: f.routeId }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleParent = (id) => {
    setForm((f) => ({
      ...f,
      parentIds: f.parentIds.includes(id)
        ? f.parentIds.filter((x) => x !== id)
        : [...f.parentIds, id],
    }));
  };

  return (
    <div className="split">
      <div className="stack">
        <h2>Kids</h2>
        {error && <div className="alert">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>School</th>
                <th>Route</th>
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
                  <td>{k.schoolId?.name}</td>
                  <td>
                    {k.routeId?.name}
                    <div className="muted">{k.homeStopId?.name}</div>
                  </td>
                  <td>{(k.parentIds || []).map((p) => p.name).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <form className="card-form" onSubmit={submit}>
        <h3>Add kid</h3>
        <label>
          Name
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Grade
          <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
        </label>
        <label>
          School
          <select
            required
            value={form.schoolId}
            onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
          >
            {schools.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Route
          <select
            required
            value={form.routeId}
            onChange={(e) => setForm({ ...form, routeId: e.target.value, homeStopId: '' })}
          >
            {routes.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Home stop
          <select
            required
            value={form.homeStopId}
            onChange={(e) => setForm({ ...form, homeStopId: e.target.value })}
          >
            <option value="">Select stop</option>
            {stops
              .filter((s) => s.type === 'home')
              .map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <fieldset className="checkbox-set">
          <legend>Parents</legend>
          {parents.map((p) => (
            <label key={p.id} className="check">
              <input
                type="checkbox"
                checked={form.parentIds.includes(p.id)}
                onChange={() => toggleParent(p.id)}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
        <button className="btn btn-primary" type="submit">
          Create kid
        </button>
      </form>
    </div>
  );
}
