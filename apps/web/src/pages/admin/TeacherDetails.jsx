import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'schedule', label: 'Schedule', icon: 'clock' },
  { id: 'classes', label: 'Classes', icon: 'class' },
  { id: 'attendance', label: 'Attendance', icon: 'check' },
  { id: 'documents', label: 'Documents', icon: 'file' },
  { id: 'performance', label: 'Performance', icon: 'chart' },
  { id: 'notes', label: 'Notes', icon: 'note' },
  { id: 'activity', label: 'Activity Log', icon: 'log' },
];

function TabIcon({ name }) {
  const p = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'clock') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4.2l2.4 1.6" /></svg>;
  if (name === 'class') return <svg {...p}><path d="M4 19V7l8-3 8 3v12" /><path d="M12 4v16M8 12h3M8 15h3" /></svg>;
  if (name === 'check') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></svg>;
  if (name === 'file') return <svg {...p}><path d="M7 4h7l5 5v11H7z" /><path d="M14 4v5h5" /></svg>;
  if (name === 'chart') return <svg {...p}><path d="M4 19h16M7 16v-5M12 16V8M17 16v-3" /></svg>;
  if (name === 'note') return <svg {...p}><path d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2z" /></svg>;
  if (name === 'log') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4.2l2.4 1.6" /></svg>;
  return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 10h8M8 14h5" /></svg>;
}

function dash(value) {
  if (value == null || value === 0) return value === 0 ? '0' : '—';
  const s = String(value).trim();
  return s || '—';
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function genderLabel(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function employeeNo(t) {
  return t?.employeeId || t?.idNumber || '';
}

export default function TeacherDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api(`/admin/teachers/${id}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const teacher = data?.teacher;
  const year = new Date().getFullYear();
  const statusKey = teacher?.active === false ? 'inactive' : 'active';
  const statusLabel = teacher?.active === false ? 'Inactive' : 'Active';
  const experience =
    teacher?.yearsOfService > 0
      ? `${teacher.yearsOfService} year${teacher.yearsOfService === 1 ? '' : 's'}`
      : '';

  const headerBits = useMemo(() => {
    if (!teacher) return [];
    return [
      employeeNo(teacher) ? `ID ${employeeNo(teacher)}` : null,
      teacher.department || null,
      teacher.jobTitle || null,
      genderLabel(teacher.gender) || null,
      teacher.createdAt ? `Joined ${fmtDate(teacher.createdAt)}` : null,
    ].filter(Boolean);
  }, [teacher]);

  const activity = useMemo(() => {
    const items = [];
    if (teacher?.createdAt) items.push({ at: teacher.createdAt, title: 'Profile created', detail: 'Teacher account' });
    if (teacher?.updatedAt && teacher.updatedAt !== teacher.createdAt) {
      items.push({ at: teacher.updatedAt, title: 'Profile updated', detail: teacher.name });
    }
    for (const d of data?.registerDays || []) {
      items.push({ at: d, title: 'Class register marked', detail: 'Attendance' });
    }
    for (const a of data?.assessments || []) {
      items.push({ at: a.date, title: a.title || 'Assessment recorded', detail: [a.kidName, a.subject].filter(Boolean).join(' · ') });
    }
    for (const a of data?.assignments || []) {
      items.push({ at: a.dueDate || a.createdAt, title: a.title || 'Assignment', detail: a.subject || a.status });
    }
    return items
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [teacher, data]);

  const nextLesson = data?.schedule?.find((s) => s.ongoing) || data?.schedule?.[0] || null;
  const todayTone = data?.schedule?.some((s) => s.ongoing)
    ? { title: 'Lesson in progress', tone: 'good' }
    : data?.schedule?.length
      ? { title: `${data.schedule.length} lesson${data.schedule.length === 1 ? '' : 's'} today`, tone: 'info' }
      : { title: 'No lessons scheduled today', tone: 'muted' };

  const setActive = async (next) => {
    try {
      await api(`/admin/teachers/${teacher.id}`, { method: 'PUT', body: { active: next } });
      setMenuOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${teacher.name}?`)) return;
    try {
      await api(`/admin/teachers/${teacher.id}`, { method: 'DELETE' });
      navigate('/school-admin/teachers');
    } catch (e) {
      setError(e.message);
    }
  };

  const resetPassword = async () => {
    const password = window.prompt(`New password for ${teacher.name}`);
    if (!password) return;
    try {
      await api(`/admin/teachers/${teacher.id}`, { method: 'PUT', body: { password } });
      setError('');
      setMenuOpen(false);
      alert('Password updated.');
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="sa-sd">
        <div className="sa-skeleton sa-skeleton-hero" />
      </div>
    );
  }

  if (error && !teacher) return <div className="alert">{error}</div>;
  if (!teacher) return <div className="sa-empty-panel"><h2>Teacher not found</h2></div>;

  return (
    <div className="sa-sd sa-td">
      {error && <div className="alert">{error}</div>}

      <div className="sa-sd-top">
        <Link to="/school-admin/teachers" className="sa-text-link">
          ← Back to Teachers
        </Link>
        <div className="sa-sd-top-actions">
          <Link to={`/school-admin/teachers?edit=${teacher.id}`} className="sa-btn sa-btn-outline">
            Edit Teacher
          </Link>
          <div className={`sa-stu-more sa-sd-menu-wrap${menuOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="sa-icon-ghost"
              aria-label="More"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                setMenuOpen((v) => !v);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="12" cy="19" r="1.6" />
              </svg>
            </button>
            {menuOpen && (
              <div className="sa-stu-menu sa-sd-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                <button type="button" role="menuitem" onClick={() => setActive(teacher.active === false)}>
                  <i aria-hidden="true">
                    {teacher.active === false ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M10 9v6M14 9v6" /></svg>
                    )}
                  </i>
                  {teacher.active === false ? 'Activate' : 'Deactivate'}
                </button>
                <button type="button" role="menuitem" onClick={resetPassword}>
                  <i aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0" /></svg>
                  </i>
                  Reset password
                </button>
                <span className="sa-stu-menu-sep" />
                <button type="button" role="menuitem" className="is-danger" onClick={remove}>
                  <i aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" /></svg>
                  </i>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="sa-card sa-sd-profile">
        <div className="sa-sd-identity">
          {teacher.photoUrl ? <img src={teacher.photoUrl} alt="" /> : <span>{initials(teacher.name)}</span>}
          <div>
            <div className="sa-sd-name">
              <h2>{teacher.name}</h2>
              <em className={`sa-stu-status is-${statusKey}`}>{statusLabel}</em>
              <span className="sa-role-pill">Teacher</span>
            </div>
            {headerBits.length ? <p className="sa-sd-meta">{headerBits.join('  ·  ')}</p> : null}
          </div>
        </div>
        <div className="sa-sd-sidebits">
          <div>
            <strong>Contact</strong>
            {teacher.email || teacher.phone ? (
              <>
                {teacher.email ? <p>{teacher.email}</p> : null}
                {teacher.phone ? (
                  <p>
                    <a className="sa-text-link" href={`tel:${teacher.phone}`}>{teacher.phone}</a>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="sa-muted">No contact saved</p>
            )}
          </div>
          <div>
            <strong>Role</strong>
            <p>{dash(teacher.department)}</p>
            <p>{dash(teacher.jobTitle)}</p>
            <p>{experience ? `${experience} experience` : dash(teacher.qualification)}</p>
          </div>
        </div>
      </section>

      <nav className="sa-sd-tabs" aria-label="Teacher sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            <TabIcon name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'schedule' && (
        <section className="sa-card sa-sd-tab">
          <h3>Timetable</h3>
          {data.timetable?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Room</th>
                </tr>
              </thead>
              <tbody>
                {data.timetable.map((s, i) => (
                  <tr key={`${s.day}-${s.startTime}-${i}`}>
                    <td>{s.day}</td>
                    <td>
                      {s.startTime}
                      {s.endTime ? ` – ${s.endTime}` : ''}
                    </td>
                    <td>{s.className}</td>
                    <td>{s.kind === 'lesson' ? s.subject || '—' : s.kind}</td>
                    <td>{s.room || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No timetable slots are stored on the assigned classes.</p>
          )}
        </section>
      )}

      {tab === 'classes' && (
        <section className="sa-card sa-sd-tab">
          <div className="sa-rd-card-head">
            <h3>Classes</h3>
            <Link to="/school-admin/classes" className="sa-btn sa-btn-outline">
              Manage classes
            </Link>
          </div>
          {data.classes?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Room</th>
                  <th>Role</th>
                  <th>Students</th>
                  <th>Subjects</th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((c) => (
                  <tr key={c._id || c.id}>
                    <td>{[c.grade, c.section].filter(Boolean).join(' ') || c.classCode || '—'}</td>
                    <td>{c.classroom || '—'}</td>
                    <td>{c.role}</td>
                    <td>{c.studentCount ?? 0}</td>
                    <td>{c.subjects?.length ? c.subjects.join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">This teacher is not assigned as a class teacher yet.</p>
          )}
        </section>
      )}

      {tab === 'attendance' && (
        <section className="sa-card sa-sd-tab">
          <div className="sa-rd-card-head">
            <h3>Register days</h3>
            <Link to="/school-admin/attendance" className="sa-btn sa-btn-outline">
              Class register
            </Link>
          </div>
          <p className="sa-muted">Days this teacher marked the class register. Staff clock-in is not stored.</p>
          {data.registerDays?.length ? (
            <ul className="sa-sd-week">
              {data.registerDays.map((d) => (
                <li key={d}>
                  <span>{fmtDate(d) || d}</span>
                  <em className="sa-stu-status is-active">Marked</em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No register marks stored for this teacher.</p>
          )}
        </section>
      )}

      {tab === 'documents' && (
        <section className="sa-card sa-sd-tab">
          <h3>Documents</h3>
          {teacher.photoUrl ? (
            <p>
              <a href={teacher.photoUrl} target="_blank" rel="noreferrer">
                Profile photo
              </a>
            </p>
          ) : (
            <p className="sa-muted">No staff documents are stored for this teacher.</p>
          )}
        </section>
      )}

      {tab === 'performance' && (
        <section className="sa-card sa-sd-tab">
          <div className="sa-rd-card-head">
            <h3>Assessments recorded</h3>
            <Link to="/school-admin/examinations" className="sa-btn sa-btn-outline">
              Examinations
            </Link>
          </div>
          <dl className="sa-sd-dl">
            <div><dt>Records</dt><dd>{data.assessmentStats?.total ?? 0}</dd></div>
            <div>
              <dt>Average score</dt>
              <dd>{data.assessmentStats?.average == null ? '—' : data.assessmentStats.average}</dd>
            </div>
          </dl>
          {data.assessments?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Title</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {data.assessments.map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDate(a.date) || '—'}</td>
                    <td>
                      {a.kidName}
                      {a.grade ? <div className="sa-muted">{a.grade}</div> : null}
                    </td>
                    <td>{a.title}{a.subject ? ` · ${a.subject}` : ''}</td>
                    <td>{a.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No assessments stored for this teacher.</p>
          )}
          {data.assignments?.length ? (
            <>
              <h3>Assignments</h3>
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Subject</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assignments.map((a) => (
                    <tr key={a.id}>
                      <td>{a.title}</td>
                      <td>{a.subject || '—'}</td>
                      <td>{fmtDate(a.dueDate) || '—'}</td>
                      <td>{a.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </section>
      )}

      {tab === 'notes' && (
        <section className="sa-card sa-sd-tab">
          <h3>Notes</h3>
          {teacher.aboutMe ? <p className="sa-sd-remarks">{teacher.aboutMe}</p> : null}
          {data.notes?.length ? (
            <ul className="sa-sd-notes-list">
              {data.notes.map((n) => (
                <li key={n.id}>
                  <strong>{n.title}</strong>
                  <span>{n.body}</span>
                  <small>{[n.className, n.author, fmtDate(n.at)].filter(Boolean).join(' · ')}</small>
                </li>
              ))}
            </ul>
          ) : !teacher.aboutMe ? (
            <p className="sa-muted">No class notes stored for this teacher.</p>
          ) : null}
        </section>
      )}

      {tab === 'activity' && (
        <section className="sa-card sa-sd-tab">
          <h3>Activity log</h3>
          {activity.length ? (
            <ul className="sa-activity">
              {activity.map((item, i) => (
                <li key={`${item.at}-${i}`}>
                  <strong>{item.title}</strong>
                  {item.detail ? <span>{item.detail}</span> : null}
                  <small>{fmtDate(item.at) || '—'}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No register marks, assessments, or profile events yet.</p>
          )}
        </section>
      )}

      {tab === 'overview' && (
        <>
          <section className="sa-sd-overview-grid">
            <article className="sa-card">
              <h3>Personal Information</h3>
              <dl className="sa-sd-dl">
                <div><dt>Full name</dt><dd>{dash(teacher.name)}</dd></div>
                <div><dt>Date of birth</dt><dd>{dash(fmtDate(teacher.dateOfBirth))}</dd></div>
                <div><dt>Gender</dt><dd>{dash(genderLabel(teacher.gender))}</dd></div>
                <div><dt>Nationality</dt><dd>{dash(teacher.nationality)}</dd></div>
                <div><dt>ID / Passport no.</dt><dd>{dash(teacher.idNumber)}</dd></div>
                <div><dt>Phone</dt><dd>{teacher.phone ? <a className="sa-text-link" href={`tel:${teacher.phone}`}>{teacher.phone}</a> : '—'}</dd></div>
                <div><dt>Email</dt><dd>{dash(teacher.email)}</dd></div>
              </dl>
            </article>

            <article className="sa-card">
              <h3>Employment Information</h3>
              <dl className="sa-sd-dl">
                <div><dt>Employee ID</dt><dd>{dash(employeeNo(teacher))}</dd></div>
                <div><dt>Department</dt><dd>{dash(teacher.department)}</dd></div>
                <div><dt>Position</dt><dd>{dash(teacher.jobTitle)}</dd></div>
                <div><dt>Qualification</dt><dd>{dash(teacher.qualification)}</dd></div>
                <div><dt>Experience</dt><dd>{experience || '—'}</dd></div>
                <div><dt>Date of joining</dt><dd>{dash(fmtDate(teacher.createdAt))}</dd></div>
                <div>
                  <dt>Status</dt>
                  <dd><span className={`sa-stu-status is-${statusKey}`}>{statusLabel}</span></dd>
                </div>
              </dl>
              {teacher.aboutMe ? <p className="sa-sd-remarks">{teacher.aboutMe}</p> : null}
            </article>
          </section>

          <section className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Recent Activity</h3>
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setTab('activity')}>View all activity</button>
            </div>
            {activity.length ? (
              <ul className="sa-sd-activity-row">
                {activity.slice(0, 4).map((item, i) => (
                  <li key={`${item.at}-${i}`}>
                    <i className={`sa-sd-act-icon ${i % 4 === 0 ? 'is-green' : i % 4 === 1 ? 'is-blue' : i % 4 === 2 ? 'is-orange' : 'is-purple'}`} aria-hidden="true" />
                    <strong>{item.title}</strong>
                    <small>{fmtDate(item.at)}{item.detail ? ` · ${item.detail}` : ''}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sa-muted">No recent activity yet.</p>
            )}
          </section>

          <section className="sa-sd-grid sa-td-overview-grid">
            <article className="sa-card">
              <h3>Subjects & Classes</h3>
              {data.subjects?.length ? (
                <div className="sa-td-chips">
                  {data.subjects.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
              ) : (
                <p className="sa-muted">No subjects listed on assigned classes.</p>
              )}
              {data.classes?.length ? (
                <ul className="sa-td-class-list">
                  {data.classes.map((c) => (
                    <li key={c._id || c.id}>
                      <strong>{[c.grade, c.section].filter(Boolean).join(' ') || c.classCode || 'Class'}</strong>
                      <span>{c.role}{c.studentCount != null ? ` · ${c.studentCount} students` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">Not assigned as a class teacher yet.</p>
              )}
              <button type="button" className="sa-text-link" onClick={() => setTab('classes')}>
                View all classes
              </button>
            </article>

            <article className="sa-card sa-sd-actions-card">
              <h3>Quick Actions</h3>
              <div className="sa-sd-quick">
                <Link to={`/school-admin/teachers?edit=${teacher.id}`}>Edit Teacher</Link>
                <button type="button" onClick={() => setTab('classes')}>Assign to Class</button>
                <button type="button" onClick={() => setTab('schedule')}>View Timetable</button>
                <Link to="/school-admin/attendance">Mark Attendance</Link>
                <button type="button" onClick={() => setTab('notes')}>Add Note</button>
                <Link to={`/school-admin/messages?to=${teacher.id}&kind=teacher`}>Send Message</Link>
              </div>
            </article>
          </section>

          <section className="sa-sd-bottom sa-td-bottom">
            <article className="sa-card">
              <h3>Today&apos;s Schedule</h3>
              <div className={`sa-sd-today tone-${todayTone.tone}`}>
                <strong>{todayTone.title}</strong>
                {nextLesson ? (
                  <p>
                    {nextLesson.startTime}
                    {nextLesson.className ? ` · ${nextLesson.className}` : ''}
                    {nextLesson.subject ? ` · ${nextLesson.subject}` : ''}
                  </p>
                ) : (
                  <p>No timetable slots for today.</p>
                )}
              </div>
              {data.schedule?.length ? (
                <ul className="sa-td-sched">
                  {data.schedule.slice(0, 3).map((s, i) => (
                    <li key={`${s.startTime}-${i}`}>
                      <div>
                        <strong>
                          {s.startTime}
                          {s.endTime ? ` – ${s.endTime}` : ''}
                        </strong>
                        <span>
                          {s.className}
                          {s.subject ? ` · ${s.subject}` : ''}
                        </span>
                      </div>
                      {s.ongoing ? <em className="sa-stu-status is-active">Ongoing</em> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <button type="button" className="sa-text-link" onClick={() => setTab('schedule')}>
                View full timetable
              </button>
            </article>

            <article className="sa-card">
              <h3>Recent Attendance</h3>
              <ul className="sa-sd-week">
                {(data.register || []).map((d) => (
                  <li key={d.date}>
                    <span>{d.weekday}</span>
                    <em className={`sa-stu-status is-${d.marked ? 'active' : 'muted'}`}>
                      {d.marked ? 'Marked' : 'No record'}
                    </em>
                  </li>
                ))}
              </ul>
              <button type="button" className="sa-text-link" onClick={() => setTab('attendance')}>
                View all
              </button>
            </article>

            <article className="sa-card">
              <h3>Assessments</h3>
              <dl className="sa-sd-dl">
                <div><dt>Records</dt><dd>{data.assessmentStats?.total ?? 0}</dd></div>
                <div>
                  <dt>Average score</dt>
                  <dd>{data.assessmentStats?.average == null ? '—' : data.assessmentStats.average}</dd>
                </div>
              </dl>
              <button type="button" className="sa-text-link" onClick={() => setTab('performance')}>
                View performance
              </button>
            </article>

            <article className="sa-card sa-sd-notes">
              <h3>Important Notes</h3>
              {teacher.aboutMe ? <p>{teacher.aboutMe}</p> : null}
              {data.notes?.length ? (
                <ul>
                  {data.notes.slice(0, 2).map((n) => (
                    <li key={n.id}>
                      <strong>{n.title}</strong>
                      <span>{n.body}</span>
                    </li>
                  ))}
                </ul>
              ) : !teacher.aboutMe ? (
                <p className="sa-muted">No notes yet.</p>
              ) : null}
              <button type="button" className="sa-text-link" onClick={() => setTab('notes')}>
                Add new note
              </button>
            </article>
          </section>
        </>
      )}

      <footer className="sa-home-foot">
        <span>© {year} {data.schoolName || 'School'} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
