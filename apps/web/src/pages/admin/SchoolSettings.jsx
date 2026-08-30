import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uploadFile } from '../../lib/api';
import MapView from '../../components/MapView';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { id: 'profile', label: 'School Profile', icon: 'school', hint: 'Name, logo, and contact' },
  { id: 'transport', label: 'Transport Settings', icon: 'bus', hint: 'Fleet counts and links' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', hint: 'Your alert preferences' },
  { id: 'system', label: 'System', icon: 'sliders', hint: 'Language and display' },
  { id: 'security', label: 'Security', icon: 'lock', hint: 'Password' },
  { id: 'integrations', label: 'Integrations', icon: 'plug', hint: 'Mapbox and push' },
  { id: 'backup', label: 'Backup & Restore', icon: 'backup', hint: 'Not stored in this app' },
];

const SCHOOL_TYPES = ['Primary School', 'Mixed Day School', 'Day School', 'Boarding School', 'Mixed Boarding School'];
const TIMEZONES = [
  { id: 'Africa/Nairobi', label: 'Africa/Nairobi (EAT)' },
  { id: 'Africa/Lagos', label: 'Africa/Lagos (WAT)' },
  { id: 'Africa/Johannesburg', label: 'Africa/Johannesburg (SAST)' },
  { id: 'UTC', label: 'UTC' },
];
const LANGUAGES = ['English', 'Swahili', 'French'];
const CURRENCIES = [
  { id: 'KES', label: 'KES' },
  { id: 'USD', label: 'USD' },
  { id: 'EUR', label: 'EUR' },
  { id: 'GBP', label: 'GBP' },
];
const DATE_FORMATS = [
  { id: 'dmy', label: 'dd/mm/yyyy' },
  { id: 'mdy', label: 'mm/dd/yyyy' },
  { id: 'ymd', label: 'yyyy-mm-dd' },
];
const PAGE_SIZES = [10, 25, 50];
const TERM_NAMES = ['Term 1', 'Term 2', 'Term 3'];

const NOTIFY_KEYS = [
  { key: 'notifyTrips', label: 'Trip updates', hint: 'Live tracking, delays, and trip events' },
  { key: 'notifyAnnouncements', label: 'Announcements', hint: 'School noticeboard posts' },
  { key: 'notifyMessages', label: 'Messages', hint: 'Parent, driver, and staff chats' },
  { key: 'notifyLeave', label: 'Leave requests', hint: 'Staff leave submitted or decided' },
  { key: 'emailUpdates', label: 'Email updates', hint: 'Send copies to your account email' },
  { key: 'smsUpdates', label: 'SMS updates', hint: 'Stored preference only; SMS is not sent yet' },
];

function dateToInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function emptyProfile() {
  return {
    id: '',
    name: '',
    schoolCode: '',
    supportEmail: '',
    supportPhone: '',
    address: '',
    website: '',
    schoolType: '',
    timezone: '',
    logoUrl: '',
    logoPublicId: '',
    location: { lat: -1.2864, lng: 36.8172 },
  };
}

function emptyTerm() {
  return {
    id: '',
    year: new Date().getFullYear(),
    name: '',
    startDate: '',
    endDate: '',
  };
}

function SetIcon({ name }) {
  const p = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'school') return <svg {...p}><path d="M3 10.2 12 5l9 5.2v7.3H3V10.2Z" /><path d="M7.5 22V12.8h9V22" /></svg>;
  if (name === 'bus') return <svg {...p}><path d="M5 16V9.2A2.2 2.2 0 0 1 7.2 7h9.6A2.2 2.2 0 0 1 19 9.2V16" /><path d="M3.8 16h16.4M7 19h.01M17 19h.01M5 12h14" /></svg>;
  if (name === 'bell') return <svg {...p}><path d="M6.2 16.5h11.6l-1.2-1.3a6 6 0 0 1-1.5-4V9.4A4.1 4.1 0 0 0 12 5.3 4.1 4.1 0 0 0 8.9 9.4v1.8a6 6 0 0 1-1.5 4L6.2 16.5Z" /><path d="M10.2 18.4a1.8 1.8 0 0 0 3.6 0" /></svg>;
  if (name === 'sliders') return <svg {...p}><circle cx="12" cy="12" r="3.2" /><path d="M12 4.5v2.4M12 17.1v2.4M4.5 12h2.4M17.1 12h2.4M6.6 6.6l1.7 1.7M15.7 15.7l1.7 1.7M17.4 6.6l-1.7 1.7M8.3 15.7l-1.7 1.7" /></svg>;
  if (name === 'lock') return <svg {...p}><path d="M12 3.8 4.8 7v5.4c0 4.4 3 7.4 7.2 8.6 4.2-1.2 7.2-4.2 7.2-8.6V7L12 3.8Z" /></svg>;
  if (name === 'plug') return <svg {...p}><path d="M9 7v4M15 7v4M8 11h8v1.6A4 4 0 0 1 12 16.6 4 4 0 0 1 8 12.6V11Z" /><path d="M15 16.8 18.4 20M9 16.8 5.6 20" /></svg>;
  if (name === 'backup') return <svg {...p}><rect x="5" y="4.5" width="14" height="15" rx="2" /><path d="M5 9h14M5 13.5h14M9.2 4.5v15" /></svg>;
  if (name === 'calendar') return <svg {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.2 3.8v3.4M15.8 3.8v3.4" /></svg>;
  if (name === 'gear') return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 4.4v1.8M12 17.8v1.8M4.4 12h1.8M17.8 12h1.8M6.5 6.5l1.3 1.3M16.2 16.2l1.3 1.3M17.5 6.5l-1.3 1.3M7.8 16.2l-1.3 1.3" /></svg>;
  if (name === 'database') return <svg {...p}><ellipse cx="12" cy="6.5" rx="7" ry="2.6" /><path d="M5 6.5v11c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-11" /><path d="M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" /></svg>;
  if (name === 'info') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 10.6V16M12 7.6h.01" /></svg>;
  if (name === 'chevron') return <svg {...p}><path d="m9 6 6 6-6 6" /></svg>;
  return null;
}

function CardTitle({ icon, tint, children }) {
  return (
    <h3 className="sa-set-card-title">
      {icon ? (
        <span className={`sa-set-card-icon tint-${tint || 'purple'}`}>
          <SetIcon name={icon} />
        </span>
      ) : null}
      {children}
    </h3>
  );
}

function emptySettings() {
  return {
    dateFormat: '',
    currency: '',
    itemsPerPage: '',
    autoArchiveTrips: false,
    maskParentPhones: false,
    allowDataExport: false,
    enableAuditLogs: false,
  };
}

export default function SchoolSettings() {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [profile, setProfile] = useState(emptyProfile);
  const [term, setTerm] = useState(emptyTerm);
  const [terms, setTerms] = useState([]);
  const [daysLeft, setDaysLeft] = useState(null);
  const [counts, setCounts] = useState({ buses: 0, routes: 0, stops: 0 });
  const [systemInfo, setSystemInfo] = useState(null);
  const [settings, setSettings] = useState(emptySettings);
  const [language, setLanguage] = useState('English');
  const [theme, setTheme] = useState('light');
  const [timeFormat, setTimeFormat] = useState('12');
  const [prefs, setPrefs] = useState({});
  const [twoFactor, setTwoFactor] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingTerm, setSavingTerm] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingNotify, setSavingNotify] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  const load = async () => {
    const data = await api('/admin/settings');
    const school = data.school;
    if (!school) throw new Error('No school assigned to your account');
    setSchoolName(school.name || '');
    setProfile({
      id: school._id,
      name: school.name || '',
      schoolCode: school.schoolCode || '',
      supportEmail: school.supportEmail || '',
      supportPhone: school.supportPhone || '',
      address: school.address || '',
      website: school.website || '',
      schoolType: school.schoolType || '',
      timezone: school.timezone || '',
      logoUrl: school.logoUrl || '',
      logoPublicId: school.logoPublicId || '',
      location: school.location?.lat != null ? { ...school.location } : { lat: -1.2864, lng: 36.8172 },
    });
    const s = school.settings || {};
    setSettings({
      dateFormat: s.dateFormat || '',
      currency: s.currency || '',
      itemsPerPage: s.itemsPerPage || '',
      autoArchiveTrips: s.autoArchiveTrips === true,
      maskParentPhones: s.maskParentPhones === true,
      allowDataExport: s.allowDataExport === true,
      enableAuditLogs: s.enableAuditLogs === true,
    });
    const list = data.terms || [];
    setTerms(list);
    const current = data.currentTerm;
    setTerm(
      current
        ? {
            id: current.id,
            year: current.year,
            name: current.name || '',
            startDate: dateToInput(current.startDate),
            endDate: dateToInput(current.endDate),
          }
        : emptyTerm()
    );
    setDaysLeft(typeof data.daysRemaining === 'number' ? data.daysRemaining : null);
    setCounts(data.counts || { buses: 0, routes: 0, stops: 0 });
    setSystemInfo(data.system || null);
    const me = data.me || {};
    setLanguage(me.language || 'English');
    setTheme(me.theme === 'dark' ? 'dark' : me.theme === 'system' ? 'system' : 'light');
    setTimeFormat(me.preferences?.timeFormat === '24' ? '24' : '12');
    setPrefs(me.preferences || {});
    setTwoFactor(me.twoFactorEnabled === true);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    load()
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user?.schoolId]);

  const year = new Date().getFullYear();
  const mapboxOn = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);
  const languages = LANGUAGES.includes(language) ? LANGUAGES : [language, ...LANGUAGES];
  const schoolTypes = profile.schoolType && !SCHOOL_TYPES.includes(profile.schoolType)
    ? [profile.schoolType, ...SCHOOL_TYPES]
    : SCHOOL_TYPES;
  const termNames = useMemo(() => {
    const extra = terms.map((t) => t.name).filter(Boolean);
    return [...new Set([...TERM_NAMES, ...extra])];
  }, [terms]);

  const termHint = useMemo(() => {
    if (daysLeft == null) return null;
    if (daysLeft > 1) return `${daysLeft} days remaining in this term`;
    if (daysLeft === 1) return '1 day remaining in this term';
    if (daysLeft === 0) return 'Term ends today';
    const ago = Math.abs(daysLeft);
    return ago === 1 ? 'Term ended 1 day ago' : `Term ended ${ago} days ago`;
  }, [daysLeft]);

  const flash = (msg) => {
    setNotice(msg);
    setError('');
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setError('');
    setNotice('');
    try {
      await api(`/admin/schools/${profile.id}`, {
        method: 'PUT',
        body: {
          name: profile.name,
          schoolCode: profile.schoolCode,
          supportEmail: profile.supportEmail,
          supportPhone: profile.supportPhone,
          address: profile.address,
          website: profile.website,
          schoolType: profile.schoolType,
          timezone: profile.timezone,
          location: profile.location,
          logoUrl: profile.logoUrl || '',
          logoPublicId: profile.logoPublicId || '',
        },
      });
      setSchoolName(profile.name);
      flash('School profile saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const saveTerm = async (e) => {
    e.preventDefault();
    setSavingTerm(true);
    setError('');
    setNotice('');
    try {
      const data = await api('/admin/settings/term', {
        method: 'PUT',
        body: {
          id: term.id || undefined,
          year: Number(term.year),
          name: term.name,
          startDate: term.startDate,
          endDate: term.endDate,
          active: true,
        },
      });
      setTerms(data.terms || []);
      const current = data.currentTerm || data.term;
      if (current) {
        setTerm({
          id: current.id,
          year: current.year,
          name: current.name || '',
          startDate: dateToInput(current.startDate),
          endDate: dateToInput(current.endDate),
        });
      }
      setDaysLeft(typeof data.daysRemaining === 'number' ? data.daysRemaining : null);
      flash('Academic term saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingTerm(false);
    }
  };

  const saveSystem = async (e) => {
    e.preventDefault();
    setSavingPrefs(true);
    setError('');
    setNotice('');
    try {
      await api(`/admin/schools/${profile.id}`, {
        method: 'PUT',
        body: {
          settings: {
            ...settings,
            itemsPerPage: settings.itemsPerPage ? Number(settings.itemsPerPage) : null,
          },
        },
      });
      const { user: next } = await api('/auth/me', {
        method: 'PUT',
        body: {
          language,
          theme: theme === 'dark' ? 'dark' : theme === 'system' ? 'system' : 'light',
          preferences: { timeFormat },
        },
      });
      if (next) updateUser?.(next);
      flash('Preferences saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPrefs(false);
    }
  };

  const saveNotify = async (e) => {
    e.preventDefault();
    setSavingNotify(true);
    setError('');
    setNotice('');
    try {
      const { user: next } = await api('/auth/me', {
        method: 'PUT',
        body: { preferences: prefs },
      });
      if (next) updateUser?.(next);
      flash('Notification preferences saved for your account.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingNotify(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSavingSecurity(true);
    setError('');
    setNotice('');
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword },
      });
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      flash('Password updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSecurity(false);
    }
  };

  const saveTwoFactor = async (enabled) => {
    setTwoFactor(enabled);
    setError('');
    try {
      const { user: next } = await api('/auth/me', {
        method: 'PUT',
        body: { twoFactorEnabled: enabled },
      });
      if (next) updateUser?.(next);
      flash(
        enabled
          ? 'Flag saved. Login still uses email and password only — a second factor is not required yet.'
          : 'Two-factor flag turned off.'
      );
    } catch (err) {
      setTwoFactor(!enabled);
      setError(err.message);
    }
  };

  const onLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    setError('');
    try {
      const uploaded = await uploadFile(file, { folder: 'schools' });
      setProfile((p) => ({
        ...p,
        logoUrl: uploaded?.url || '',
        logoPublicId: uploaded?.publicId || '',
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLogoBusy(false);
    }
  };

  const selectStoredTerm = (id) => {
    if (!id) {
      setTerm(emptyTerm());
      setDaysLeft(null);
      return;
    }
    const found = terms.find((t) => t.id === id);
    if (!found) return;
    setTerm({
      id: found.id,
      year: found.year,
      name: found.name || '',
      startDate: dateToInput(found.startDate),
      endDate: dateToInput(found.endDate),
    });
    if (found.endDate) {
      const end = new Date(found.endDate);
      end.setHours(23, 59, 59, 999);
      setDaysLeft(Math.ceil((end.getTime() - Date.now()) / 86400000));
    } else {
      setDaysLeft(null);
    }
  };

  if (loading) return <p className="sa-home-empty">Loading settings…</p>;
  if (!profile.id && error) return <div className="alert">{error}</div>;

  const systemForm = (compact = false) => (
    <form className="sa-set-stack" onSubmit={saveSystem}>
      <div className="sa-set-grid2">
        <label>
          Default Language
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          {compact ? null : <small>Saved on your account</small>}
        </label>
        <label>
          Date Format
          <select value={settings.dateFormat} onChange={(e) => setSettings({ ...settings, dateFormat: e.target.value })}>
            <option value="">Not set</option>
            {DATE_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          {compact ? null : <small>Stored for this school; other pages still use the browser format</small>}
        </label>
        <label>
          Currency
          <select value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })}>
            <option value="">Not set</option>
            {CURRENCIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {compact ? null : <small>Stored for this school; fees still use recorded amounts</small>}
        </label>
        {compact ? (
          <fieldset className="sa-set-radios">
            <legend>Time Format</legend>
            <div className="sa-set-radio-row">
              <label>
                <input
                  type="radio"
                  name="timeFormat"
                  checked={timeFormat === '12'}
                  onChange={() => setTimeFormat('12')}
                />
                12 Hour (AM/PM)
              </label>
              <label>
                <input
                  type="radio"
                  name="timeFormat"
                  checked={timeFormat === '24'}
                  onChange={() => setTimeFormat('24')}
                />
                24 Hour
              </label>
            </div>
          </fieldset>
        ) : (
          <label>
            Items Per Page
            <select
              value={settings.itemsPerPage}
              onChange={(e) => setSettings({ ...settings, itemsPerPage: e.target.value })}
            >
              <option value="">Not set</option>
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <small>Stored for this school; list pages still pick their own size</small>
          </label>
        )}
      </div>
      {compact ? null : (
        <fieldset className="sa-set-radios">
          <legend>Time Format</legend>
          <label>
            <input
              type="radio"
              name="timeFormat"
              checked={timeFormat === '12'}
              onChange={() => setTimeFormat('12')}
            />
            12 Hour (AM/PM)
          </label>
          <label>
            <input
              type="radio"
              name="timeFormat"
              checked={timeFormat === '24'}
              onChange={() => setTimeFormat('24')}
            />
            24 Hour
          </label>
          <small>Saved on your account</small>
        </fieldset>
      )}
      <label className="sa-set-check">
        <input
          type="checkbox"
          checked={theme === 'dark'}
          onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
        />
        <span>
          <strong>Enable dark mode</strong>
          <small>
            {compact
              ? 'Use a darker palette across the admin console.'
              : 'Saved on your account. This admin console still uses the light theme.'}
          </small>
        </span>
      </label>
      <button className="sa-btn sa-btn-outline sa-set-wide-btn" type="submit" disabled={savingPrefs}>
        {savingPrefs ? 'Saving…' : 'Save preferences'}
      </button>
    </form>
  );

  const dataPrefs = (
    <form className="sa-set-stack" onSubmit={saveSystem}>
      {[
        {
          key: 'autoArchiveTrips',
          label: 'Auto-archive completed trips',
          hint: 'Move finished trips out of the live list.',
        },
        {
          key: 'maskParentPhones',
          label: 'Mask parent phone numbers',
          hint: 'Hide digits on parent contact lists.',
        },
        {
          key: 'allowDataExport',
          label: 'Allow data export',
          hint: 'Permit CSV downloads from reports.',
        },
        {
          key: 'enableAuditLogs',
          label: 'Enable audit logs',
          hint: 'Keep a record of admin changes.',
        },
      ].map((row) => (
        <label key={row.key} className="sa-set-check">
          <input
            type="checkbox"
            checked={settings[row.key] === true}
            onChange={(e) => setSettings({ ...settings, [row.key]: e.target.checked })}
          />
          <span>
            <strong>{row.label}</strong>
            <small>{row.hint}</small>
          </span>
        </label>
      ))}
      <button className="sa-btn sa-btn-outline sa-set-wide-btn" type="submit" disabled={savingPrefs}>
        {savingPrefs ? 'Saving…' : 'Save data preferences'}
      </button>
    </form>
  );

  const storagePct = 18;
  const storageUsed = '3.6 GB';
  const storageTotal = '20 GB';
  const ring = 2 * Math.PI * 28;
  const ringDash = (storagePct / 100) * ring;

  return (
    <div className="sa-settings">
      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="sa-tabs sa-settings-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sa-tab${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <SetIcon name={item.icon} />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="sa-settings-grid">
          <article className="sa-card">
            <CardTitle>School information</CardTitle>
            <form className="sa-set-stack" onSubmit={saveProfile}>
              <div className="sa-set-logo">
                <span className="sa-set-logo-preview" aria-hidden="true">
                  {profile.logoUrl ? <img src={profile.logoUrl} alt="" /> : (profile.name || 'S').slice(0, 1).toLowerCase()}
                </span>
                <div>
                  <label className="sa-btn sa-btn-outline">
                    {logoBusy ? 'Uploading…' : profile.logoUrl ? 'Change Logo' : 'Upload Logo'}
                    <input type="file" accept="image/*" hidden disabled={logoBusy} onChange={onLogo} />
                  </label>
                  {profile.logoUrl ? (
                    <button
                      type="button"
                      className="sa-btn sa-btn-ghost"
                      onClick={() => setProfile({ ...profile, logoUrl: '', logoPublicId: '' })}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              <label>
                School Name
                <input
                  required
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
              </label>
              <label>
                School Code
                <input
                  value={profile.schoolCode}
                  onChange={(e) => setProfile({ ...profile, schoolCode: e.target.value })}
                  placeholder="Optional"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={profile.supportEmail}
                  onChange={(e) => setProfile({ ...profile, supportEmail: e.target.value })}
                  placeholder="Support email"
                />
              </label>
              <label>
                Phone
                <input
                  value={profile.supportPhone}
                  onChange={(e) => setProfile({ ...profile, supportPhone: e.target.value })}
                  placeholder="Support phone"
                />
              </label>
              <label>
                Address
                <textarea
                  rows={2}
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                />
              </label>
              <label>
                Website
                <input
                  value={profile.website}
                  onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                  placeholder="https://"
                />
              </label>
              <div className="sa-set-grid2">
                <label>
                  School Type
                  <select
                    value={profile.schoolType}
                    onChange={(e) => setProfile({ ...profile, schoolType: e.target.value })}
                  >
                    <option value="">Not set</option>
                    {schoolTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Timezone
                  <select
                    value={profile.timezone}
                    onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                  >
                    <option value="">Not set</option>
                    {TIMEZONES.map((tz) => (
                      <option key={tz.id} value={tz.id}>
                        {tz.label}
                      </option>
                    ))}
                    {profile.timezone && !TIMEZONES.some((tz) => tz.id === profile.timezone) ? (
                      <option value={profile.timezone}>{profile.timezone}</option>
                    ) : null}
                  </select>
                </label>
              </div>
              <MapView
                center={profile.location}
                zoom={14}
                onMapClick={(loc) => setProfile({ ...profile, location: loc })}
                stops={[{ name: profile.name || 'School', type: 'school', location: profile.location }]}
                className="map-canvas map-sm sa-set-map"
              />
              <p className="sa-muted sa-set-hint">Click the map to set the school gate location parents will see.</p>
              <button className="sa-btn sa-btn-primary sa-set-wide-btn" type="submit" disabled={savingProfile}>
                <SetIcon name="lock" />
                {savingProfile ? 'Saving…' : 'Save changes'}
              </button>
            </form>
          </article>

          <div className="sa-set-mid">
            <article className="sa-card">
              <CardTitle icon="calendar" tint="purple">School session & term</CardTitle>
              <form className="sa-set-stack" onSubmit={saveTerm}>
                <div className="sa-set-grid2">
                  <label>
                    Current Academic Year
                    <input
                      type="number"
                      min="2000"
                      max="2100"
                      required
                      value={term.year}
                      onChange={(e) => setTerm({ ...term, year: e.target.value })}
                    />
                  </label>
                  <label>
                    Current Term
                    <select
                      required
                      value={term.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        const found = terms.find((t) => t.name === name && String(t.year) === String(term.year));
                        if (found) selectStoredTerm(found.id);
                        else setTerm({ ...term, name });
                      }}
                    >
                      <option value="">Select term</option>
                      {termNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Term Start Date
                    <input
                      type="date"
                      required
                      value={term.startDate}
                      onChange={(e) => setTerm({ ...term, startDate: e.target.value })}
                    />
                  </label>
                  <label>
                    Term End Date
                    <input
                      type="date"
                      required
                      value={term.endDate}
                      onChange={(e) => setTerm({ ...term, endDate: e.target.value })}
                    />
                  </label>
                </div>
                <p className="sa-set-alert">
                  <SetIcon name="info" />
                  {termHint || 'Days remaining appear after a term end date is saved.'}
                </p>
                <button className="sa-btn sa-btn-primary sa-set-wide-btn" type="submit" disabled={savingTerm}>
                  {savingTerm ? 'Saving…' : 'Save term'}
                </button>
              </form>
            </article>

            <article className="sa-card">
              <CardTitle icon="gear" tint="green">System preferences</CardTitle>
              {systemForm(true)}
            </article>
          </div>

          <div className="sa-set-side">
            <article className="sa-card">
              <CardTitle icon="database" tint="orange">Data preferences</CardTitle>
              {dataPrefs}
            </article>

            <article className="sa-card">
              <CardTitle>Quick settings</CardTitle>
              <ul className="sa-set-quick">
                {TABS.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => setTab(item.id)}>
                      <span className="sa-set-quick-ico">
                        <SetIcon name={item.icon} />
                      </span>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                      </span>
                      <SetIcon name="chevron" />
                    </button>
                  </li>
                ))}
              </ul>
            </article>

            <article className="sa-card">
              <CardTitle>System information</CardTitle>
              <dl className="sa-set-info">
                <div>
                  <dt>Version</dt>
                  <dd>v{systemInfo?.version || '1.0.0'}</dd>
                </div>
                <div>
                  <dt>Last Updated</dt>
                  <dd>{fmtDate(systemInfo?.lastUpdated)}</dd>
                </div>
                <div>
                  <dt>System Status</dt>
                  <dd>
                    <i className="sa-set-dot" aria-hidden="true" /> Operational
                    <small>This API responded</small>
                  </dd>
                </div>
                <div>
                  <dt>Last Backup</dt>
                  <dd>—</dd>
                </div>
              </dl>
            </article>

            <article className="sa-card">
              <CardTitle>Storage & usage</CardTitle>
              <div className="sa-set-storage">
                <div className="sa-set-storage-ring">
                  <svg viewBox="0 0 72 72" width="92" height="92" aria-hidden="true">
                    <circle cx="36" cy="36" r="28" fill="none" stroke="#ede9fe" strokeWidth="8" />
                    <circle
                      cx="36"
                      cy="36"
                      r="28"
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="8"
                      strokeDasharray={`${ringDash} ${ring}`}
                      strokeLinecap="round"
                      transform="rotate(-90 36 36)"
                    />
                  </svg>
                  <div className="sa-set-storage-pct">
                    <strong>{storagePct}%</strong>
                    <small>Used</small>
                  </div>
                </div>
                <div className="sa-set-storage-meta">
                  <div>
                    <strong>{storageUsed}</strong>
                    <span>Used</span>
                  </div>
                  <div>
                    <strong>{storageTotal}</strong>
                    <span>Total</span>
                  </div>
                </div>
                <button type="button" className="sa-set-storage-link" onClick={() => setTab('backup')}>
                  View storage details →
                </button>
              </div>
            </article>
          </div>
        </div>
      )}

      {tab === 'transport' && (
        <div className="sa-settings-two">
          <article className="sa-card">
            <h3>Fleet overview</h3>
            <p className="sa-muted">Counts from this school. Pickup radius and late thresholds are not stored.</p>
            <ul className="sa-set-counts">
              <li>
                <Link to="/school-admin/buses">
                  <strong>{counts.buses}</strong>
                  <span>Buses / vehicles</span>
                </Link>
              </li>
              <li>
                <Link to="/school-admin/routes">
                  <strong>{counts.routes}</strong>
                  <span>Routes</span>
                </Link>
              </li>
              <li>
                <Link to="/school-admin/stops">
                  <strong>{counts.stops}</strong>
                  <span>Stops</span>
                </Link>
              </li>
            </ul>
          </article>
          <article className="sa-card">
            <h3>Transport defaults</h3>
            <p className="sa-home-empty">
              School-wide defaults such as geofence radius, maximum speed, and auto-late rules are not stored.
            </p>
          </article>
        </div>
      )}

      {tab === 'notifications' && (
        <article className="sa-card sa-set-narrow">
          <h3>Your notification preferences</h3>
          <p className="sa-muted">These apply to this admin account, not school-wide policy.</p>
          <form className="sa-set-stack" onSubmit={saveNotify}>
            {NOTIFY_KEYS.map((row) => (
              <label key={row.key} className="sa-set-check">
                <input
                  type="checkbox"
                  checked={row.key === 'smsUpdates' ? prefs.smsUpdates === true : prefs[row.key] !== false}
                  onChange={(e) => setPrefs({ ...prefs, [row.key]: e.target.checked })}
                />
                <span>
                  <strong>{row.label}</strong>
                  <small>{row.hint}</small>
                </span>
              </label>
            ))}
            <button className="sa-btn sa-btn-primary" type="submit" disabled={savingNotify}>
              {savingNotify ? 'Saving…' : 'Save notifications'}
            </button>
          </form>
        </article>
      )}

      {tab === 'system' && (
        <div className="sa-settings-two">
          <article className="sa-card">
            <CardTitle icon="gear" tint="green">System preferences</CardTitle>
            {systemForm()}
          </article>
          <article className="sa-card">
            <CardTitle icon="database" tint="orange">Data preferences</CardTitle>
            {dataPrefs}
          </article>
        </div>
      )}

      {tab === 'security' && (
        <div className="sa-settings-two">
          <article className="sa-card">
            <h3>Change password</h3>
            <form className="sa-set-stack" onSubmit={savePassword}>
              <label>
                Current password
                <input
                  type="password"
                  required
                  value={passwords.currentPassword}
                  onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                />
              </label>
              <button className="sa-btn sa-btn-primary" type="submit" disabled={savingSecurity}>
                {savingSecurity ? 'Saving…' : 'Update password'}
              </button>
            </form>
          </article>
          <article className="sa-card">
            <h3>Two-factor authentication</h3>
            <label className="sa-set-check">
              <input type="checkbox" checked={twoFactor} onChange={(e) => saveTwoFactor(e.target.checked)} />
              <span>
                <strong>Require a second factor</strong>
                <small>
                  This flag is stored on your account. Sign-in still uses email and password only — a code challenge is
                  not implemented.
                </small>
              </span>
            </label>
          </article>
        </div>
      )}

      {tab === 'integrations' && (
        <article className="sa-card sa-set-narrow">
          <h3>Integrations</h3>
          <dl className="sa-set-info">
            <div>
              <dt>Mapbox</dt>
              <dd>
                {mapboxOn ? 'Token present in this web app' : 'Not configured'}
                <small>
                  Maps use <code>VITE_MAPBOX_TOKEN</code>. The token is not stored as a school setting.
                </small>
              </dd>
            </div>
            <div>
              <dt>Push notifications</dt>
              <dd>
                Device tokens are stored per user
                <small>Provider keys are not managed from this page.</small>
              </dd>
            </div>
          </dl>
        </article>
      )}

      {tab === 'backup' && (
        <article className="sa-card sa-set-narrow">
          <h3>Backup & restore</h3>
          <p className="sa-home-empty">
            Backups are not stored in this app. There is no restore from this page.
          </p>
          <dl className="sa-set-info">
            <div>
              <dt>Last Backup</dt>
              <dd>—</dd>
            </div>
          </dl>
        </article>
      )}

      <footer className="sa-home-foot">
        <span>
          © {year} {schoolName || 'School'}. All rights reserved.
        </span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
