import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
    case 'calendar':
      return (
        <svg {...iconProps}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
      );
    case 'cap':
      return (
        <svg {...iconProps}>
          <path d="M3 10 12 5l9 5-9 5-9-5Z" />
          <path d="M7 12.5v4.2c2 1.6 8 1.6 10 0V12.5" />
        </svg>
      );
    case 'people':
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 18c.6-3 2.6-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
          <circle cx="17" cy="8.5" r="2.2" />
          <path d="M16 13.6c2 .3 3.6 1.6 4.2 4.4" />
        </svg>
      );
    case 'save':
      return (
        <svg {...iconProps}>
          <path d="M5 5h11l3 3v11H5V5Z" />
          <path d="M8 5v5h7V5M8 19v-5h8v5" />
        </svg>
      );
    case 'send':
      return (
        <svg {...iconProps}>
          <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
        </svg>
      );
    case 'search':
      return (
        <svg {...iconProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'check':
      return (
        <svg {...iconProps}>
          <path d="m5 12 5 5 9-10" />
        </svg>
      );
    case 'absent':
      return (
        <svg {...iconProps}>
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      );
    case 'late':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </svg>
      );
    case 'excused':
      return (
        <svg {...iconProps}>
          <path d="M5 16.5 15.2 6.3a1.8 1.8 0 0 1 2.5 2.5L7.5 19H5v-2.5Z" />
        </svg>
      );
    case 'note':
      return (
        <svg {...iconProps}>
          <path d="M7 4h8l4 4v12H7V4Z" />
          <path d="M15 4v4h4M9 12h6M9 16h4" />
        </svg>
      );
    case 'present':
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M4 18c.6-3 2.4-4.4 5-4.4s4.4 1.4 5 4.4" />
        </svg>
      );
    case 'list':
      return (
        <svg {...iconProps}>
          <path d="M8 7h11M8 12h11M8 17h11M4 7h.01M4 12h.01M4 17h.01" />
        </svg>
      );
    default:
      return null;
  }
}

const STATUSES = [
  { v: 'present', l: 'Present', icon: 'check' },
  { v: 'absent', l: 'Absent', icon: 'absent' },
  { v: 'late', l: 'Late', icon: 'late' },
  { v: 'excused', l: 'Excused', icon: 'excused' },
];

export default function TeacherRegister() {
  const { showToast } = useAuth();
  const [params] = useSearchParams();
  const [date, setDate] = useState(todayInput());
  const [grade, setGrade] = useState(params.get('grade') || '');
  const [grades, setGrades] = useState([]);
  const [kids, setKids] = useState([]);
  const [draft, setDraft] = useState({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const qs = new URLSearchParams({ date });
    if (grade) qs.set('grade', grade);
    const data = await api(`/teacher/attendance?${qs}`);
    setKids(data.kids || []);
    setGrades(data.grades || []);
    const next = {};
    for (const k of data.kids || []) {
      if (k.attendance?.status) next[k._id] = k.attendance.status;
    }
    setDraft(next);
    setError('');
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, grade]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return kids;
    return kids.filter((k) => {
      const name = (k.name || '').toLowerCase();
      const adm = (k.admissionNo || '').toLowerCase();
      return name.includes(q) || adm.includes(q);
    });
  }, [kids, search]);

  const summary = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
    for (const k of kids) {
      const s = draft[k._id];
      if (s && counts[s] != null) counts[s] += 1;
      else counts.unmarked += 1;
    }
    return counts;
  }, [kids, draft]);

  const total = kids.length || 1;
  const pct = (n) => Math.round((n / total) * 100);
  const todayLong = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const markLocal = (kidId, status) => {
    setDraft((prev) => ({ ...prev, [kidId]: status }));
  };

  const save = async (marks) => {
    setBusy(true);
    setError('');
    try {
      await api('/teacher/attendance/bulk', { method: 'POST', body: { date, marks } });
      showToast('Register saved', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveAll = () => {
    const marks = kids.filter((k) => draft[k._id]).map((k) => ({ kidId: k._id, status: draft[k._id] }));
    if (!marks.length) return;
    return save(marks);
  };

  const markAllPresent = () => {
    const next = { ...draft };
    for (const k of kids) {
      if (!next[k._id]) next[k._id] = 'present';
    }
    setDraft(next);
    const marks = kids.filter((k) => !draft[k._id]).map((k) => ({ kidId: k._id, status: 'present' }));
    if (marks.length) save(marks);
  };

  return (
    <div className="tr-page">
      <div className="tr-head">
        <div>
          <p className="tw-kicker">Teacher</p>
          <h2>Class register</h2>
          <p>
            Mark who is present, absent, late, or excused. Parents are notified when a child is absent or late.
          </p>
        </div>
        <div className="tr-head-date">
          <strong>{todayLong}</strong>
          <small>A great teacher makes a difference.</small>
        </div>
      </div>

      {error && <div className="tw-alert">{error}</div>}

      <div className="tr-toolbar">
        <label className="tr-field">
          Date
          <span className="tr-control">
            <Icon name="calendar" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </span>
        </label>
        <label className="tr-field">
          Grade
          <span className="tr-control">
            <Icon name="cap" />
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">All grades</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </span>
        </label>
        <button type="button" className="tr-btn tr-btn--mint" onClick={markAllPresent} disabled={busy}>
          <Icon name="people" />
          Mark remaining present
        </button>
        <button type="button" className="tr-btn tr-btn--teal" onClick={saveAll} disabled={busy}>
          <Icon name="save" />
          {busy ? 'Saving…' : 'Save register'}
        </button>
        <Link className="tr-btn tr-btn--ghost" to="/teacher/notes">
          <Icon name="send" />
          Message a parent
        </Link>
      </div>

      <div className="tr-stats">
        <StatCard tone="mint" icon="people" label="Present" value={summary.present} hint="Students in class today" pct={pct(summary.present)} />
        <StatCard tone="rose" icon="absent" label="Absent" value={summary.absent} hint="Students absent today" pct={pct(summary.absent)} />
        <StatCard tone="amber" icon="late" label="Late" value={summary.late} hint="Students arrived late" pct={pct(summary.late)} />
        <StatCard tone="slate" icon="list" label="Not marked" value={summary.unmarked} hint="Students not yet marked" pct={pct(summary.unmarked)} />
      </div>

      <section className="tr-table">
        <div className="tr-table-head">
          <div>
            <h3>Student register</h3>
            <p>Mark each student&apos;s attendance, then save the register.</p>
          </div>
          <label className="tr-search">
            <Icon name="search" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student name..."
            />
          </label>
        </div>
        <div className="tr-table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Grade</th>
                <th>Attendance</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((k, i) => {
                const current = draft[k._id] || '';
                return (
                  <tr key={k._id}>
                    <td className="tr-idx">{i + 1}</td>
                    <td>
                      <div className="tw-student">
                        {k.photoUrl ? <img src={k.photoUrl} alt="" /> : <span className="td-ava">{(k.name || 'S')[0]}</span>}
                        <div>
                          <strong>{k.name}</strong>
                          {k.admissionNo ? <div className="tw-muted">{k.admissionNo}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td>{k.grade || '—'}</td>
                    <td>
                      <div className="tr-marks">
                        {STATUSES.map((s) => (
                          <button
                            key={s.v}
                            type="button"
                            data-status={s.v}
                            className={`tr-mark ${current === s.v ? 'is-on' : ''}`}
                            onClick={() => markLocal(k._id, s.v)}
                          >
                            <Icon name={s.icon} />
                            {s.l}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Link className="tr-note" to={`/teacher/notes?kidId=${k._id}`}>
                        <Icon name="note" />
                        Add note
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!visible.length && (
                <tr>
                  <td colSpan={5} className="tw-muted">
                    No students in this class.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ tone, icon, label, value, hint, pct }) {
  return (
    <article className={`tr-stat tr-stat--${tone}`}>
      <span className="tr-stat-ico" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{hint}</p>
      </div>
      <span className="tr-ring" style={{ '--pct': `${pct}%` }}>
        <b>{pct}%</b>
      </span>
    </article>
  );
}
