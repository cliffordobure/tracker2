import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const TABS = ['Overview', 'Classes', 'Students', 'Activity', 'Settings'];
const LANGUAGES = ['English', 'Swahili', 'French', 'Kikuyu', 'Luo'];

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Icon({ name }) {
  switch (name) {
    case 'camera':
      return (
        <svg {...iconProps}>
          <path d="M4 8h3l1.5-2h7L17 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
          <circle cx="12" cy="14" r="3.2" />
        </svg>
      );
    case 'school':
      return (
        <svg {...iconProps}>
          <path d="M3 10 12 5l9 5-9 5-9-5Z" />
          <path d="M7 12.5v4.2c2 1.6 8 1.6 10 0V12.5" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...iconProps}>
          <rect x="3.5" y="6" width="17" height="12" rx="2" />
          <path d="m4 8 8 6 8-6" />
        </svg>
      );
    case 'phone':
      return (
        <svg {...iconProps}>
          <path d="M7 3.5h3.2l1 3.2-2 1.4a12 12 0 0 0 6.7 6.7l1.4-2 3.2 1V17a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 5 5.7 2 2 0 0 1 7 3.5Z" />
        </svg>
      );
    case 'people':
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 18c.6-3 2.6-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
        </svg>
      );
    case 'cal':
      return (
        <svg {...iconProps}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
      );
    case 'doc':
      return (
        <svg {...iconProps}>
          <path d="M7 4h8l4 4v12H7V4Z" />
          <path d="M15 4v4h4M9 12h6M9 16h4" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...iconProps}>
          <path d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Z" />
          <path d="m13.2 7.3 3.5 3.5" />
        </svg>
      );
    case 'briefcase':
      return (
        <svg {...iconProps}>
          <rect x="3.5" y="8" width="17" height="12" rx="2" />
          <path d="M8 8V6.5A2 2 0 0 1 10 4.5h4A2 2 0 0 1 16 6.5V8" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c2.5 3 3.5 6 3.5 8s-1 5-3.5 8c-2.5-3-3.5-6-3.5-8s1-5 3.5-8Z" />
        </svg>
      );
    case 'palette':
      return (
        <svg {...iconProps}>
          <path d="M12 4a8 8 0 1 0 0 16h1.6a2.2 2.2 0 0 0 0-4.4H12" />
          <circle cx="8" cy="10" r="1" />
          <circle cx="10.5" cy="7.5" r="1" />
          <circle cx="14.5" cy="7.8" r="1" />
        </svg>
      );
    case 'user':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 19c.8-3.1 3-4.6 7-4.6s6.2 1.5 7 4.6" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...iconProps}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case 'save':
      return (
        <svg {...iconProps}>
          <path d="M5 5h11l3 3v11H5V5Z" />
          <path d="M8 5v4h7V5M8 19v-6h8v6" />
        </svg>
      );
    default:
      return null;
  }
}

function yearsLabel(n) {
  const value = Number(n) || 0;
  return `${value} ${value === 1 ? 'year' : 'years'}`;
}

export default function TeacherProfile() {
  const { user, updateUser, showToast } = useAuth();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [kids, setKids] = useState([]);
  const [tab, setTab] = useState('Overview');
  const [editingAbout, setEditingAbout] = useState(false);
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

  const headerQ = (params.get('q') || '').trim().toLowerCase();

  const load = async () => {
    const [res, k] = await Promise.all([api('/teacher/profile'), api('/teacher/kids').catch(() => ({ kids: [] }))]);
    setData(res);
    setKids(k.kids || []);
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
    e?.preventDefault?.();
    setBusy(true);
    setError('');
    try {
      const res = await api('/auth/me', { method: 'PUT', body: form });
      updateUser(res.user);
      showToast('Profile saved', 'success');
      setEditingAbout(false);
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
    setError('');
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
  const schoolName = data?.school?.name || '—';
  const initial = (teacher.name || 'T').slice(0, 1).toUpperCase();
  const languages = LANGUAGES.includes(form.language) ? LANGUAGES : [form.language, ...LANGUAGES];

  const classes = useMemo(() => {
    const grades = [...new Set(kids.map((k) => k.grade).filter(Boolean))].sort();
    return grades.filter((g) => !headerQ || g.toLowerCase().includes(headerQ));
  }, [kids, headerQ]);

  const students = useMemo(() => {
    if (!headerQ) return kids;
    return kids.filter((k) => `${k.name} ${k.grade || ''}`.toLowerCase().includes(headerQ));
  }, [kids, headerQ]);

  return (
    <div className="tpro">
      <div className="tpro-main">
        <div className="tpro-head">
          <div>
            <p className="tw-kicker">Teacher / My profile</p>
            <div className="tpro-title">
              <span className="tpro-title-ico">{teacher.photoUrl ? <img src={teacher.photoUrl} alt="" /> : initial}</span>
              <div>
                <h2>My profile</h2>
                <p>Manage your personal information and account settings.</p>
              </div>
            </div>
          </div>
          <div className="tpro-art" aria-hidden="true">
            <svg width="120" height="68" viewBox="0 0 120 68" fill="none">
              <rect x="8" y="28" width="20" height="24" rx="3" fill="#0f766e" />
              <rect x="18" y="22" width="20" height="30" rx="3" fill="#14b8a6" />
              <rect x="28" y="18" width="20" height="34" rx="3" fill="#99f6e4" />
              <rect x="62" y="30" width="16" height="22" rx="3" fill="#e8f7f1" stroke="#0f766e" />
              <path d="M70 30v-8" stroke="#0f766e" strokeWidth="2" />
              <circle cx="70" cy="18" r="6" fill="#86efac" />
              <circle cx="76" cy="16" r="4" fill="#4ade80" />
              <path d="M92 52h10M97 47v10" stroke="#0f766e" strokeWidth="1.8" />
            </svg>
            <strong>Educate, Inspire, Empower.</strong>
          </div>
        </div>

        {error && <div className="tw-alert">{error}</div>}

        <section className="tpro-identity">
          <span className="tpro-avatar">{teacher.photoUrl ? <img src={teacher.photoUrl} alt="" /> : initial}</span>
          <div>
            <h3>{teacher.name || 'Teacher'}</h3>
            <p>{stats.role || teacher.jobTitle || 'Class Teacher'}</p>
            <div className="tpro-meta">
              <span><Icon name="school" /> {schoolName}</span>
              <span><Icon name="mail" /> {teacher.email || user?.email || '—'}</span>
              <span><Icon name="phone" /> {teacher.phone || form.phone || '—'}</span>
            </div>
          </div>
          <label className="tpro-photo">
            <Icon name="camera" /> Change photo
            <input type="file" accept="image/*" hidden onChange={(e) => changePhoto(e.target.files?.[0])} />
          </label>
        </section>

        <div className="tpro-stats">
          <article>
            <span className="is-mint"><Icon name="people" /></span>
            <div>
              <strong>{stats.classes || 0}</strong>
              <small>Classes</small>
              <em>Classes assigned</em>
            </div>
          </article>
          <article>
            <span className="is-blue"><Icon name="people" /></span>
            <div>
              <strong>{stats.students || 0}</strong>
              <small>Students</small>
              <em>Total students</em>
            </div>
          </article>
          <article>
            <span className="is-purple"><Icon name="cal" /></span>
            <div>
              <strong>{stats.yearsOfService || 0}</strong>
              <small>Years</small>
              <em>Years of service</em>
            </div>
          </article>
          <article>
            <span className="is-slate"><Icon name="school" /></span>
            <div>
              <strong className="is-text">{schoolName}</strong>
              <small>School</small>
            </div>
          </article>
        </div>

        <div className="tpro-tabs">
          {TABS.map((t) => (
            <button key={t} type="button" className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Overview' && (
          <section className="tpro-card">
            <div className="tpro-card-head">
              <span className="is-mint"><Icon name="doc" /></span>
              <div>
                <h3>About me</h3>
              </div>
              <button type="button" className="tpro-edit" onClick={() => setEditingAbout((v) => !v)}>
                <Icon name="edit" /> {editingAbout ? 'Done' : 'Edit'}
              </button>
            </div>
            {editingAbout ? (
              <textarea
                rows={4}
                maxLength={800}
                value={form.aboutMe}
                onChange={(e) => setForm({ ...form, aboutMe: e.target.value })}
                placeholder="Tell parents and the school a little about yourself..."
              />
            ) : (
              <p className="tpro-about">
                {form.aboutMe || 'Add a short introduction so parents and school administrators know you better.'}
              </p>
            )}
            <div className="tpro-facts">
              <div>
                <dt><Icon name="briefcase" /> Job title</dt>
                <dd>{form.jobTitle || 'Class Teacher'}</dd>
              </div>
              <div>
                <dt><Icon name="clock" /> Years of service</dt>
                <dd>{yearsLabel(form.yearsOfService)}</dd>
              </div>
              <div>
                <dt><Icon name="globe" /> Language</dt>
                <dd>{form.language || 'English'}</dd>
              </div>
              <div>
                <dt><Icon name="palette" /> Theme</dt>
                <dd>{form.theme === 'system' ? 'System' : form.theme === 'light' ? 'Light' : 'Dark'}</dd>
              </div>
            </div>
            <div className="tpro-tip">
              <span aria-hidden="true">💡</span>
              Tip: Keep your profile information up to date to help parents and school administrators communicate with you easily.
            </div>
          </section>
        )}

        {tab === 'Classes' && (
          <section className="tpro-card">
            <div className="tpro-card-head">
              <span className="is-mint"><Icon name="school" /></span>
              <div>
                <h3>Classes</h3>
                <p>{classes.length} classes assigned</p>
              </div>
            </div>
            <ul className="tpro-list">
              {classes.map((g) => (
                <li key={g}>
                  <Link to={`/teacher/class?grade=${encodeURIComponent(g)}`}>{g}</Link>
                </li>
              ))}
            </ul>
            {!classes.length && <p className="tw-empty">No classes assigned yet.</p>}
          </section>
        )}

        {tab === 'Students' && (
          <section className="tpro-card">
            <div className="tpro-card-head">
              <span className="is-blue"><Icon name="people" /></span>
              <div>
                <h3>Students</h3>
                <p>{students.length} students</p>
              </div>
            </div>
            <ul className="tpro-list">
              {students.map((k) => (
                <li key={k._id}>
                  <Link to={`/teacher/students/${k._id}`}>{k.name}</Link>
                  <span>{k.grade || ''}</span>
                </li>
              ))}
            </ul>
            {!students.length && <p className="tw-empty">No students found.</p>}
          </section>
        )}

        {tab === 'Activity' && (
          <section className="tpro-card">
            <div className="tpro-card-head">
              <span className="is-purple"><Icon name="clock" /></span>
              <div>
                <h3>Activity</h3>
                <p>Recent account activity</p>
              </div>
            </div>
            <div className="tpro-facts">
              <div>
                <dt><Icon name="clock" /> Last login</dt>
                <dd>{teacher.lastLoginAt ? new Date(teacher.lastLoginAt).toLocaleString() : '—'}</dd>
              </div>
              <div>
                <dt><Icon name="cal" /> Years of service</dt>
                <dd>{yearsLabel(stats.yearsOfService || form.yearsOfService)}</dd>
              </div>
            </div>
          </section>
        )}

        {tab === 'Settings' && (
          <section className="tpro-card">
            <div className="tpro-card-head">
              <span className="is-slate"><Icon name="lock" /></span>
              <div>
                <h3>Settings</h3>
                <p>Account preferences</p>
              </div>
            </div>
            <label className="tpro-check">
              <input
                type="checkbox"
                checked={form.twoFactorEnabled}
                onChange={(e) => setForm({ ...form, twoFactorEnabled: e.target.checked })}
              />
              Two-factor reminder enabled
            </label>
            <button type="button" className="tpro-btn tpro-btn--teal tpro-btn--auto" disabled={busy} onClick={save}>
              Save settings
            </button>
          </section>
        )}
      </div>

      <aside className="tpro-side">
        <form className="tpro-form" onSubmit={save}>
          <div className="tpro-card-head">
            <span className="is-mint"><Icon name="user" /></span>
            <div>
              <h3>Personal information</h3>
              <p>Update your personal details.</p>
            </div>
          </div>
          <label className="tpro-field">
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <div className="tpro-two">
            <label className="tpro-field">
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="tpro-field">
              Job title
              <input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </label>
          </div>
          <div className="tpro-two">
            <label className="tpro-field">
              Years of service
              <input type="number" min="0" max="60" value={form.yearsOfService} onChange={(e) => setForm({ ...form, yearsOfService: e.target.value })} />
            </label>
            <label className="tpro-field">
              Language
              <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                {languages.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="tpro-field">
            Theme
            <select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button className="tpro-btn tpro-btn--teal" disabled={busy}>
            <Icon name="save" /> {busy ? 'Saving…' : 'Save profile'}
          </button>
        </form>

        <form className="tpro-form" onSubmit={changePassword}>
          <div className="tpro-card-head">
            <span className="is-slate"><Icon name="lock" /></span>
            <div>
              <h3>Change password</h3>
              <p>Keep your account secure.</p>
            </div>
          </div>
          <label className="tpro-field">
            Current password
            <input type="password" required value={pass.currentPassword} onChange={(e) => setPass({ ...pass, currentPassword: e.target.value })} placeholder="Enter current password" />
          </label>
          <label className="tpro-field">
            New password
            <input type="password" required minLength={6} value={pass.newPassword} onChange={(e) => setPass({ ...pass, newPassword: e.target.value })} placeholder="Enter new password" />
          </label>
          <button className="tpro-btn tpro-btn--ghost" disabled={busy}>
            Update password
          </button>
        </form>
      </aside>
    </div>
  );
}
