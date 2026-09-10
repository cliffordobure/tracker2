import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const PAGE_SIZE = 8;

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
    case 'people':
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 18c.6-3 2.6-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
          <circle cx="17" cy="8.5" r="2.2" />
          <path d="M16 13.6c2 .3 3.6 1.6 4.2 4.4" />
        </svg>
      );
    case 'cap':
      return (
        <svg {...iconProps}>
          <path d="M3 10 12 5l9 5-9 5-9-5Z" />
          <path d="M7 12.5v4.2c2 1.6 8 1.6 10 0V12.5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...iconProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'send':
      return (
        <svg {...iconProps}>
          <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...iconProps}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...iconProps}>
          <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.4" />
        </svg>
      );
    case 'phone':
      return (
        <svg {...iconProps}>
          <path d="M7 3.5h3.2l1 3.2-2 1.4a12 12 0 0 0 6.7 6.7l1.4-2 3.2 1V17a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 5 5.7 2 2 0 0 1 7 3.5Z" />
        </svg>
      );
    case 'note':
      return (
        <svg {...iconProps}>
          <path d="M7 4h8l4 4v12H7V4Z" />
          <path d="M15 4v4h4M9 12h6M9 16h4" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...iconProps}>
          <path d="M5 19V9.5M10 19V5M15 19v-6.5M20 19V8" />
        </svg>
      );
    default:
      return null;
  }
}

function classOf(k) {
  const grade = String(k.grade || '').trim();
  const section = String(k.section || k.stream || '').trim();
  if (section && grade) {
    if (grade.toLowerCase().endsWith(section.toLowerCase())) return grade;
    return `${grade}${section.length === 1 ? section.toUpperCase() : ` ${section}`}`;
  }
  return section || grade || '—';
}

function parentOf(k) {
  const p = (k.parentIds || [])[0];
  return {
    name: p?.name || '—',
    phone: p?.phone || '',
    email: p?.email || '',
  };
}

export default function TeacherStudents() {
  const { showToast } = useAuth();
  const [params] = useSearchParams();
  const [kids, setKids] = useState([]);
  const [grades, setGrades] = useState([]);
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('');
  const [klass, setKlass] = useState('');
  const [more, setMore] = useState(false);
  const [admission, setAdmission] = useState('');
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', grade: '', admissionNo: '' });
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState('');

  const load = async () => {
    const d = await api('/teacher/kids');
    setKids(d.kids || []);
    setGrades(d.grades || []);
    setForm((f) => ({ ...f, grade: f.grade || d.grades?.[0] || '' }));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const headerQ = (params.get('q') || '').trim().toLowerCase();
  const classes = useMemo(
    () => [...new Set(kids.map(classOf).filter((c) => c && c !== '—'))].sort(),
    [kids],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return kids.filter((k) => {
      if (grade && k.grade !== grade) return false;
      if (klass && classOf(k) !== klass) return false;
      if (admission && !(k.admissionNo || '').toLowerCase().includes(admission.trim().toLowerCase())) return false;
      const parentNames = (k.parentIds || []).map((p) => `${p.name || ''} ${p.phone || ''} ${p.email || ''}`).join(' ');
      const hay = [k.name, k.grade, k.admissionNo, classOf(k), parentNames].filter(Boolean).join(' ').toLowerCase();
      if (needle && !hay.includes(needle)) return false;
      if (headerQ && !hay.includes(headerQ)) return false;
      return true;
    });
  }, [kids, q, grade, klass, admission, headerQ]);

  const gradeCounts = useMemo(() => {
    const map = {};
    for (const k of kids) {
      const g = k.grade || 'Ungraded';
      map[g] = (map[g] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 3);
  }, [kids]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const slice = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, grade, klass, admission, headerQ]);

  const addStudent = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/teacher/kids', { method: 'POST', body: form });
      setForm({ name: '', grade: form.grade, admissionNo: '' });
      setShowAdd(false);
      showToast('Student added', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tstu">
      <div className="tstu-head">
        <div>
          <p className="tw-kicker">Teacher / Students</p>
          <h2>Students</h2>
          <p>Class list with parent contacts. Open a profile or send a parent note.</p>
        </div>
        <div className="tstu-art" aria-hidden="true">
          <span className="tstu-kids">👦 👧 🙋</span>
          <strong>Great students</strong>
          <small>brighter tomorrows.</small>
        </div>
      </div>

      {error && <div className="tw-alert">{error}</div>}

      <div className="tstu-stats">
        <article className="tstu-stat tstu-stat--mint">
          <span><Icon name="people" /></span>
          <div>
            <strong>{kids.length}</strong>
            <small>Total students</small>
            <em>All grades</em>
          </div>
        </article>
        {gradeCounts.map(([g, n], i) => (
          <article key={g} className={`tstu-stat ${['tstu-stat--blue', 'tstu-stat--purple', 'tstu-stat--orange'][i] || 'tstu-stat--mint'}`}>
            <span><Icon name="cap" /></span>
            <div>
              <strong>{n}</strong>
              <small>{g}</small>
              <em>Students</em>
            </div>
          </article>
        ))}
        {Array.from({ length: Math.max(0, 3 - gradeCounts.length) }).map((_, i) => (
          <article key={`pad-${i}`} className="tstu-stat tstu-stat--slate">
            <span><Icon name="cap" /></span>
            <div>
              <strong>0</strong>
              <small>No class yet</small>
              <em>Students</em>
            </div>
          </article>
        ))}
      </div>

      <div className="tstu-toolbar">
        <label className="tstu-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, parent or grade..." />
        </label>
        <select value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">All grades</option>
          {grades.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select value={klass} onChange={(e) => setKlass(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button type="button" className="tstu-more" onClick={() => setMore((v) => !v)}>
          More filters
        </button>
        <Link className="tstu-btn tstu-btn--mint" to="/teacher/notes">
          <Icon name="send" /> Message a parent
        </Link>
        <button type="button" className="tstu-btn tstu-btn--teal" onClick={() => setShowAdd((v) => !v)}>
          <Icon name="plus" /> Add student
        </button>
      </div>

      {more && (
        <label className="tstu-extra">
          Admission no.
          <input value={admission} onChange={(e) => setAdmission(e.target.value)} placeholder="Filter by admission number" />
        </label>
      )}

      {showAdd ? (
        <form className="tstu-add" onSubmit={addStudent}>
          <h3>Add student</h3>
          <label>
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Grade
            <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
          </label>
          <label>
            Admission no.
            <input value={form.admissionNo} onChange={(e) => setForm({ ...form, admissionNo: e.target.value })} />
          </label>
          <button className="tstu-btn tstu-btn--teal" disabled={busy}>
            Save student
          </button>
        </form>
      ) : null}

      <section className="tstu-table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Student</th>
              <th>Grade</th>
              <th>Class</th>
              <th>Parent / guardian</th>
              <th>Contact</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((k, i) => {
              const parent = parentOf(k);
              return (
                <tr key={k._id}>
                  <td className="tstu-idx">{(pageSafe - 1) * PAGE_SIZE + i + 1}</td>
                  <td>
                    <div className="tstu-person">
                      <span className="td-ava">
                        {k.photoUrl ? <img src={k.photoUrl} alt="" /> : (k.name || 'S')[0]}
                      </span>
                      <strong>{k.name}</strong>
                    </div>
                  </td>
                  <td>{k.grade || '—'}</td>
                  <td>{classOf(k)}</td>
                  <td>
                    <div className="tstu-parent">
                      <span className="td-ava">{parent.name[0]}</span>
                      {parent.name}
                    </div>
                  </td>
                  <td>
                    <div className="tstu-contact">
                      {parent.phone ? (
                        <span><Icon name="phone" /> {parent.phone}</span>
                      ) : null}
                      {parent.email ? <small>{parent.email}</small> : null}
                      {!parent.phone && !parent.email ? '—' : null}
                    </div>
                  </td>
                  <td>
                    <div className="tstu-actions">
                      <Link to={`/teacher/students/${k._id}`}>
                        <Icon name="eye" /> Profile
                      </Link>
                      <div className="tstu-menu">
                        <button type="button" aria-label="More" onClick={() => setMenuId(menuId === k._id ? '' : k._id)}>⋯</button>
                        {menuId === k._id && (
                          <div className="tstu-menu-pop">
                            <Link to={`/teacher/notes?kidId=${k._id}`}>Send note</Link>
                            {k.grade ? <Link to={`/teacher/class?grade=${encodeURIComponent(k.grade)}`}>Class details</Link> : null}
                            {k.grade ? <Link to={`/teacher/reports?grade=${encodeURIComponent(k.grade)}`}>Reports</Link> : null}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!slice.length && (
              <tr>
                <td colSpan={7} className="tw-muted">No students match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="tstu-pager">
          <small>
            Showing {filtered.length ? (pageSafe - 1) * PAGE_SIZE + 1 : 0} to {Math.min(pageSafe * PAGE_SIZE, filtered.length)} of {filtered.length} students
          </small>
          <div>
            <button type="button" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>‹</button>
            <strong>{pageSafe}</strong>
            <button type="button" disabled={pageSafe >= pages} onClick={() => setPage(pageSafe + 1)}>›</button>
          </div>
        </div>
      </section>

      <div className="tstu-cards">
        <Link to="/teacher/notes" className="tstu-card">
          <span className="is-mint"><Icon name="people" /></span>
          <div>
            <strong>Parent communication</strong>
            <p>Send notes and keep parents informed about their child&apos;s progress.</p>
          </div>
        </Link>
        <Link to="/teacher/diary" className="tstu-card">
          <span className="is-purple"><Icon name="note" /></span>
          <div>
            <strong>View student progress</strong>
            <p>Check attendance, diary entries and assignments.</p>
          </div>
        </Link>
        <Link to="/teacher/reports" className="tstu-card">
          <span className="is-blue"><Icon name="chart" /></span>
          <div>
            <strong>Student reports</strong>
            <p>See class performance and generate reports.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
