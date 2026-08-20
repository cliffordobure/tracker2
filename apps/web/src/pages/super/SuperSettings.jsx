import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PageFoot } from './shared';

export default function SuperSettings() {
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    api('/admin/platform/settings')
      .then((d) => setForm(d.settings))
      .catch((e) => setError(e.message));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaved('');
    try {
      const data = await api('/admin/platform/settings', { method: 'PUT', body: form });
      setForm(data.settings);
      setSaved('Saved.');
    } catch (err) {
      setError(err.message);
    }
  };

  if (!form && !error) return <p>Loading settings…</p>;

  return (
    <div className="sa-page">
      {error && <div className="alert">{error}</div>}
      {saved && <div className="alert" style={{ background: '#dcfce7' }}>{saved}</div>}
      {form && (
        <form className="sa-card card-form" onSubmit={save} style={{ maxWidth: 520 }}>
          <label className="sa-field">
            <span>Platform name</span>
            <input value={form.platformName || ''} onChange={(e) => setForm({ ...form, platformName: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Tagline</span>
            <input value={form.tagline || ''} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Support email</span>
            <input type="email" value={form.supportEmail || ''} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Support phone</span>
            <input value={form.supportPhone || ''} onChange={(e) => setForm({ ...form, supportPhone: e.target.value })} />
          </label>
          <label className="sa-field" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.maintenanceMode === true}
              onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
            />
            <span>Show maintenance banner to super admins</span>
          </label>
          <button className="sa-btn sa-btn-primary" type="submit">
            Save settings
          </button>
        </form>
      )}
      <PageFoot name={form?.platformName} />
    </div>
  );
}
