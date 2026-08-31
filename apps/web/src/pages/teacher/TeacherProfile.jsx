import { useEffect, useState } from 'react';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function TeacherProfile() {
  const { user, updateUser, showToast, logout } = useAuth();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    aboutMe: '',
    jobTitle: '',
    yearsOfService: 0,
    gender: '',
    language: 'English',
    theme: 'system',
    twoFactorEnabled: false,
  });
  const [pass, setPass] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await api('/teacher/profile');
    setData(res);
    const t = res.teacher || user || {};
    setForm({
      name: t.name || '',
      phone: t.phone || '',
      aboutMe: t.aboutMe || '',
      jobTitle: t.jobTitle || 'Class Teacher',
      yearsOfService: t.yearsOfService || 0,
      gender: t.gender || '',
      language: t.language || 'English',
      theme: t.theme || 'system',
      twoFactorEnabled: t.twoFactorEnabled === true,
    });
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api('/auth/me', { method: 'PUT', body: form });
      updateUser(res.user);
      showToast('Profile saved', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await uploadFile(file, { folder: 'users' });
      const res = await api('/auth/me', {
        method: 'PUT',
        body: { photoUrl: uploaded.url, photoPublicId: uploaded.publicId },
      });
      updateUser(res.user);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/auth/password', { method: 'PUT', body: pass });
      setPass({ currentPassword: '', newPassword: '' });
      showToast('Password updated', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const stats = data?.stats || {};
  const teacher = data?.teacher || user || {};

  return (
    <div className="tw-split">
      <div className="tw-page">
        <div className="tw-panel tw-profile-head">
          <div className="tw-student">
            {teacher.photoUrl ? <img src={teacher.photoUrl} alt="" /> : <span className="tw-avatar">{(teacher.name || 'T')[0]}</span>}
            <div>
              <h2>{teacher.name}</h2>
              <p className="tw-muted">{stats.role || teacher.jobTitle || 'Teacher'}</p>
            </div>
          </div>
          <label className="tw-btn tw-btn-secondary">
            Change photo
            <input type="file" accept="image/*" hidden onChange={(e) => changePhoto(e.target.files?.[0])} />
          </label>
        </div>
        <div className="tw-metrics tw-metrics-4">
          <div className="tw-metric">
            <span>Classes</span>
            <strong>{stats.classes || 0}</strong>
          </div>
          <div className="tw-metric">
            <span>Students</span>
            <strong>{stats.students || 0}</strong>
          </div>
          <div className="tw-metric">
            <span>Years</span>
            <strong>{stats.yearsOfService || 0}</strong>
          </div>
          <div className="tw-metric">
            <span>School</span>
            <strong style={{ fontSize: '1rem' }}>{data?.school?.name || '—'}</strong>
          </div>
        </div>
        {error && <div className="tw-alert">{error}</div>}
      </div>

      <div className="tw-page">
        <form className="tw-form" onSubmit={save}>
          <h3>Personal information</h3>
          <label>
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label>
            Job title
            <input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
          </label>
          <label>
            Years of service
            <input type="number" min="0" max="60" value={form.yearsOfService} onChange={(e) => setForm({ ...form, yearsOfService: e.target.value })} />
          </label>
          <label>
            Language
            <input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
          </label>
          <label>
            Theme
            <select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            About me
            <textarea rows={4} value={form.aboutMe} onChange={(e) => setForm({ ...form, aboutMe: e.target.value })} />
          </label>
          <label className="tw-check">
            <input
              type="checkbox"
              checked={form.twoFactorEnabled}
              onChange={(e) => setForm({ ...form, twoFactorEnabled: e.target.checked })}
            />
            Two-factor reminder enabled
          </label>
          <button className="tw-btn tw-btn-primary" disabled={busy}>
            Save profile
          </button>
        </form>

        <form className="tw-form" onSubmit={changePassword}>
          <h3>Change password</h3>
          <label>
            Current password
            <input type="password" required value={pass.currentPassword} onChange={(e) => setPass({ ...pass, currentPassword: e.target.value })} />
          </label>
          <label>
            New password
            <input type="password" required minLength={6} value={pass.newPassword} onChange={(e) => setPass({ ...pass, newPassword: e.target.value })} />
          </label>
          <button className="tw-btn tw-btn-secondary" disabled={busy}>
            Update password
          </button>
        </form>
        <button type="button" className="tw-btn tw-btn-ghost" onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
