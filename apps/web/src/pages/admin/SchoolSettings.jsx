import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';
import { useAuth } from '../../context/AuthContext';
import MediaPicker from '../../components/MediaPicker';

export default function SchoolSettings() {
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/admin/schools')
      .then((d) => {
        const school = d.schools[0];
        if (!school) {
          setError('No school assigned to your account');
          return;
        }
        setForm({
          id: school._id,
          name: school.name,
          address: school.address || '',
          location: { ...school.location },
          logoUrl: school.logoUrl || '',
          logoPublicId: school.logoPublicId || '',
        });
      })
      .catch((e) => setError(e.message));
  }, [user?.schoolId]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      await api(`/admin/schools/${form.id}`, {
        method: 'PUT',
        body: {
          name: form.name,
          address: form.address,
          location: form.location,
          logoUrl: form.logoUrl || '',
          logoPublicId: form.logoPublicId || '',
        },
      });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!form && !error) return <p>Loading school…</p>;
  if (!form) return <div className="alert">{error}</div>;

  return (
    <div className="split">
      <div className="stack">
        <h2>Your school</h2>
        <p className="lede">Update the school name, address, and map location parents will see.</p>
        {error && <div className="alert">{error}</div>}
        {saved && <div className="alert alert-ok">School saved.</div>}
      </div>
      <form className="card-form" onSubmit={submit}>
        <label>
          Name
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Address
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </label>
        <MediaPicker
          label="School logo"
          folder="schools"
          accept="image/*"
          value={form.logoUrl ? { url: form.logoUrl, publicId: form.logoPublicId } : null}
          onChange={(file) =>
            setForm({
              ...form,
              logoUrl: file?.url || '',
              logoPublicId: file?.publicId || '',
            })
          }
        />
        <p className="hint">Click the map to set the exact school gate location.</p>
        <MapView
          center={form.location}
          zoom={14}
          onMapClick={(loc) => setForm({ ...form, location: loc })}
          stops={[{ name: form.name || 'School', type: 'school', location: form.location }]}
          className="map-canvas map-sm"
        />
        <button className="btn btn-primary" type="submit">
          Save school
        </button>
      </form>
    </div>
  );
}
