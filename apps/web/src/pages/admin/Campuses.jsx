import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

const emptyForm = {
  name: '',
  address: '',
  phone: '',
  lat: '',
  lng: '',
  active: true,
};

const GROUPS = [
  { key: 'kids', label: 'Students' },
  { key: 'teachers', label: 'Teachers' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'buses', label: 'Buses' },
  { key: 'routes', label: 'Routes' },
];

export default function Campuses() {
  const [campuses, setCampuses] = useState([]);
  const [assignable, setAssignable] = useState({ kids: [], teachers: [], drivers: [], buses: [], routes: [] });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [panel, setPanel] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState({ kids: [], teachers: [], drivers: [], buses: [], routes: [] });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const data = await api('/admin/campuses');
    setCampuses(data.campuses || []);
    setAssignable(data.assignable || { kids: [], teachers: [], drivers: [], buses: [], routes: [] });
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const totals = useMemo(
    () =>
      campuses.reduce(
        (acc, c) => ({
          campuses: acc.campuses + 1,
          kids: acc.kids + (c.counts?.kids || 0),
          teachers: acc.teachers + (c.counts?.teachers || 0),
          buses: acc.buses + (c.counts?.buses || 0),
        }),
        { campuses: 0, kids: 0, teachers: 0, buses: 0 }
      ),
    [campuses]
  );

  const closePanel = () => {
    setPanel(null);
    setEditingId(null);
    setForm(emptyForm);
  };

  const startCreate = () => {
    setError('');
    setSuccess('');
    setEditingId(null);
    setForm(emptyForm);
    setPanel('form');
  };

  const startEdit = (campus) => {
    setError('');
    setSuccess('');
    setEditingId(campus.id);
    setForm({
      name: campus.name || '',
      address: campus.address || '',
      phone: campus.phone || '',
      lat: campus.location?.lat ?? '',
      lng: campus.location?.lng ?? '',
      active: campus.active !== false,
    });
    setPanel('form');
  };

  const startAssign = (campus) => {
    setError('');
    setSuccess('');
    setEditingId(campus.id);
    setSelected({
      kids: assignable.kids.filter((x) => x.campusId === campus.id).map((x) => x.id),
      teachers: assignable.teachers.filter((x) => x.campusId === campus.id).map((x) => x.id),
      drivers: assignable.drivers.filter((x) => x.campusId === campus.id).map((x) => x.id),
      buses: assignable.buses.filter((x) => x.campusId === campus.id).map((x) => x.id),
      routes: assignable.routes.filter((x) => x.campusId === campus.id).map((x) => x.id),
    });
    setPanel('assign');
  };

  const submitCampus = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        active: form.active,
        location: {
          lat: form.lat === '' ? null : Number(form.lat),
          lng: form.lng === '' ? null : Number(form.lng),
        },
      };
      if (editingId) {
        await api(`/admin/campuses/${editingId}`, { method: 'PUT', body });
        setSuccess(`${form.name} updated.`);
      } else {
        await api('/admin/campuses', { method: 'POST', body });
        setSuccess(`${form.name} added.`);
      }
      closePanel();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const submitAssign = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await api(`/admin/campuses/${editingId}/assign`, { method: 'POST', body: { ...selected, replace: true } });
      setSuccess('Assignments saved.');
      closePanel();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (campus) => {
    if (!confirm(`Delete ${campus.name}? People and buses will move to another campus.`)) return;
    setError('');
    try {
      await api(`/admin/campuses/${campus.id}`, { method: 'DELETE' });
      setSuccess(`${campus.name} removed.`);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggle = (group, id) => {
    setSelected((prev) => {
      const has = prev[group].includes(id);
      return {
        ...prev,
        [group]: has ? prev[group].filter((x) => x !== id) : [...prev[group], id],
      };
    });
  };

  const current = campuses.find((c) => c.id === editingId);

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <div className="sa-sd-top">
        <div>
          <h2 className="sa-page-kicker">Campuses</h2>
          <p className="sa-muted">One school admin can run several campuses. Assign students, teachers, drivers, and buses to each site.</p>
        </div>
        <div className="sa-sd-top-actions">
          <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>
            + Add Campus
          </button>
        </div>
      </div>

      <section className="sa-stu-kpis" aria-label="Campus metrics">
        <article className="sa-stu-kpi tint-violet">
          <div>
            <span>Campuses</span>
            <strong>{totals.campuses}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-green">
          <div>
            <span>Students assigned</span>
            <strong>{totals.kids}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-blue">
          <div>
            <span>Teachers assigned</span>
            <strong>{totals.teachers}</strong>
          </div>
        </article>
        <article className="sa-stu-kpi tint-orange">
          <div>
            <span>Buses assigned</span>
            <strong>{totals.buses}</strong>
          </div>
        </article>
      </section>

      <section className="sa-campus-grid">
        {campuses.map((campus) => (
          <article key={campus.id} className="sa-card sa-campus-card">
            <header>
              <div>
                <h3>{campus.name}</h3>
                <p>{campus.address || 'No address yet'}</p>
              </div>
              {campus.isDefault && <em className="sa-campus-default">Main</em>}
            </header>
            <ul className="sa-campus-counts">
              <li>{campus.counts?.kids || 0} students</li>
              <li>{campus.counts?.teachers || 0} teachers</li>
              <li>{campus.counts?.drivers || 0} drivers</li>
              <li>{campus.counts?.buses || 0} buses</li>
              <li>{campus.counts?.routes || 0} routes</li>
            </ul>
            <div className="sa-campus-actions">
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => startAssign(campus)}>
                Assign people & buses
              </button>
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => startEdit(campus)}>
                Edit
              </button>
              {!campus.isDefault && (
                <button type="button" className="sa-btn sa-btn-outline" onClick={() => remove(campus)}>
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </section>

      {panel === 'form' && (
        <div className="sa-action-overlay" onClick={closePanel} role="presentation">
          <aside className="sa-action-modal sa-people-modal" onClick={(e) => e.stopPropagation()}>
            <header className="sa-stop-detail-bar">
              <h2>{editingId ? 'Edit campus' : 'Add campus'}</h2>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={closePanel}>×</button>
            </header>
            <div className="sa-people-body">
              <label className="sa-field">
                <span>Campus name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rongai Main" />
              </label>
              <label className="sa-field">
                <span>Address</span>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <label className="sa-field">
                <span>Phone</span>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
              <div className="sa-stu-form-row">
                <label className="sa-field">
                  <span>Latitude</span>
                  <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
                </label>
                <label className="sa-field">
                  <span>Longitude</span>
                  <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
                </label>
              </div>
            </div>
            <div className="sa-people-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={closePanel}>Cancel</button>
              <button type="button" className="sa-btn sa-btn-primary" disabled={!form.name.trim() || saving} onClick={submitCampus}>
                {editingId ? 'Save campus' : 'Create campus'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {panel === 'assign' && current && (
        <div className="sa-action-overlay" onClick={closePanel} role="presentation">
          <aside className="sa-action-modal sa-people-modal sa-campus-assign" onClick={(e) => e.stopPropagation()}>
            <header className="sa-stop-detail-bar">
              <h2>Assign to {current.name}</h2>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={closePanel}>×</button>
            </header>
            <div className="sa-people-body">
              <p className="sa-muted">Tick who belongs to this campus. You can move someone later from another campus or from their profile.</p>
              {GROUPS.map((group) => (
                <div key={group.key} className="sa-campus-assign-group">
                  <h3>{group.label}</h3>
                  {(assignable[group.key] || []).length === 0 ? (
                    <p className="sa-muted">None added yet.</p>
                  ) : (
                    <ul>
                      {(assignable[group.key] || []).map((item) => (
                        <li key={item.id}>
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={selected[group.key].includes(item.id)}
                              onChange={() => toggle(group.key, item.id)}
                            />
                            <span>
                              {item.name}
                              {item.campusId && item.campusId !== current.id ? (
                                <small> · now on {campuses.find((c) => c.id === item.campusId)?.name || 'another campus'}</small>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <div className="sa-people-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={closePanel}>Cancel</button>
              <button type="button" className="sa-btn sa-btn-primary" disabled={saving} onClick={submitAssign}>
                Save assignments
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
