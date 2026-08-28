import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import LocationSearch from '../../components/LocationSearch';
import MapView from '../../components/MapView';
import { Empty, PageFoot, StatusDot, formatDate } from './shared';

const emptyForm = {
  name: '',
  address: '',
  lat: -1.3965,
  lng: 36.7542,
  plan: 'standard',
  status: 'pending',
  adminName: '',
  adminEmail: '',
  adminPhone: '',
  adminPassword: 'password123',
};

export default function SuperSchools() {
  const [params, setParams] = useSearchParams();
  const [schools, setSchools] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [mapFocus, setMapFocus] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const q = params.get('q') || '';

  const load = async () => {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    if (statusFilter) query.set('status', statusFilter);
    const data = await api(`/admin/platform/schools${query.toString() ? `?${query}` : ''}`);
    setSchools(data.schools || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [q, statusFilter]);

  const pending = useMemo(() => schools.filter((s) => s.status === 'pending').length, [schools]);

  const admit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        name: form.name,
        address: form.address,
        location: { lat: Number(form.lat), lng: Number(form.lng) },
        plan: form.plan,
        status: form.status,
      };
      if (form.adminEmail) {
        body.admin = {
          name: form.adminName,
          email: form.adminEmail,
          phone: form.adminPhone,
          password: form.adminPassword,
        };
      }
      await api('/admin/platform/schools', { method: 'POST', body });
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id, body) => {
    setError('');
    try {
      await api(`/admin/platform/schools/${id}`, { method: 'PUT', body });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this school? This does not wipe buses or users automatically.')) return;
    await api(`/admin/platform/schools/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="sa-page">
      {error && <div className="alert">{error}</div>}
      <div className="pa-toolbar">
        <input
          value={q}
          placeholder="Search schools..."
          onChange={(e) => {
            const next = e.target.value;
            const copy = new URLSearchParams(params);
            if (next) copy.set('q', next);
            else copy.delete('q');
            setParams(copy);
          }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending approval</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <span className="muted">{pending} waiting for approval</span>
      </div>

      <div className="pa-split">
        <article className="sa-card">
          <h3>Schools</h3>
          {schools.length ? (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>School Name</th>
                    <th>Admin</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Joined On</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map((s) => (
                    <tr key={s._id}>
                      <td>
                        <strong>{s.name}</strong>
                        <div className="muted">{s.address || '—'}</div>
                      </td>
                      <td>
                        {s.admin ? (
                          <>
                            {s.admin.name}
                            <div className="muted">{s.admin.email}</div>
                          </>
                        ) : (
                          'No admin yet'
                        )}
                      </td>
                      <td>
                        <select value={s.plan} onChange={(e) => patch(s._id, { plan: e.target.value })}>
                          <option value="trial">Trial</option>
                          <option value="basic">Basic</option>
                          <option value="standard">Standard</option>
                          <option value="premium">Premium</option>
                        </select>
                      </td>
                      <td>
                        <StatusDot status={s.status} />
                      </td>
                      <td>{formatDate(s.createdAt)}</td>
                      <td>
                        <div className="pa-actions">
                          {s.status === 'pending' && (
                            <button type="button" className="sa-btn sa-btn-success" onClick={() => patch(s._id, { status: 'active' })}>
                              Approve
                            </button>
                          )}
                          {s.status === 'suspended' ? (
                            <button type="button" className="sa-btn sa-btn-primary" onClick={() => patch(s._id, { status: 'active' })}>
                              Reinstate
                            </button>
                          ) : (
                            <button type="button" className="sa-btn sa-btn-outline" onClick={() => patch(s._id, { status: 'suspended' })}>
                              Suspend
                            </button>
                          )}
                          {s.status === 'trial' && (
                            <button type="button" className="sa-btn sa-btn-primary" onClick={() => patch(s._id, { status: 'active' })}>
                              Convert
                            </button>
                          )}
                          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => remove(s._id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No schools match this filter.</Empty>
          )}
        </article>

        <form className="sa-card card-form" onSubmit={admit}>
          <h3>Admit a school</h3>
          <p className="muted">New schools start as pending until you approve them. Add a school admin so they can sign in after approval.</p>
          <label className="sa-field">
            <span>School name</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Address</span>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </label>
          <div className="inline-fields">
            <label className="sa-field">
              <span>Plan</span>
              <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                <option value="trial">Trial</option>
                <option value="basic">Basic</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
            </label>
            <label className="sa-field">
              <span>Status</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="pending">Pending approval</option>
                <option value="trial">Trial</option>
                <option value="active">Active</option>
              </select>
            </label>
          </div>
          <p className="hint">Search a place or click the map to pin the school gate.</p>
          <LocationSearch
            proximity={{ lat: Number(form.lat), lng: Number(form.lng) }}
            placeholder="Search estate, landmark, or area…"
            onSelect={(place) => {
              setForm((f) => ({
                ...f,
                lat: place.lat,
                lng: place.lng,
                address: f.address.trim() ? f.address : place.placeName || place.name,
              }));
              setMapFocus({ lat: place.lat, lng: place.lng, zoom: 16.4, at: Date.now() });
            }}
          />
          <MapView
            center={{ lat: Number(form.lat), lng: Number(form.lng) }}
            zoom={13}
            focus={mapFocus}
            onMapClick={(loc) => setForm({ ...form, lat: loc.lat, lng: loc.lng })}
            stops={[{ name: form.name || 'School', type: 'school', location: { lat: Number(form.lat), lng: Number(form.lng) } }]}
            className="map-canvas pa-map"
          />
          <h3>School admin (optional)</h3>
          <label className="sa-field">
            <span>Admin name</span>
            <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Admin email</span>
            <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Phone</span>
            <input value={form.adminPhone} onChange={(e) => setForm({ ...form, adminPhone: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Password</span>
            <input value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
          </label>
          <button className="sa-btn sa-btn-primary" disabled={saving} type="submit">
            {saving ? 'Admitting…' : 'Admit school'}
          </button>
        </form>
      </div>
      <PageFoot />
    </div>
  );
}
