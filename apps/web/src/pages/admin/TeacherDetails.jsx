import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'classes', label: 'Classes' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'documents', label: 'Documents' },
  { id: 'performance', label: 'Performance' },
  { id: 'notes', label: 'Notes' },
  { id: 'activity', label: 'Activity Log' },
];

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

  const teacher = data?.teacher;
  const year = new Date().getFullYear();
  const statusKey = teacher?.active === false ? 'inactive' : 'active';
  const statusLabel = teacher?.active === false ? 'Inactive' : 'Active';
  const experience =
    teacher?.yearsOfService > 0
      ? `${teacher.yearsOfService} year${teacher.yearsOfService === 1 ? '' : 's'}`
      : '';

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
          <div className="sa-sd-menu-wrap">
            <button type="button" className="sa-btn sa-btn-primary" onClick={() => setMenuOpen((v) => !v)}>
              Actions ▾
            </button>
            {menuOpen && (
              <div className="sa-stu-menu sa-sd-menu">
                <button type="button" onClick={() => setActive(teacher.active === false)}>
                  {teacher.active === false ? 'Activate' : 'Deactivate'}
                </button>
                <button type="button" onClick={resetPassword}>
                  Reset password
                </button>
                <button type="button" className="is-danger" onClick={remove}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="sa-card sa-sd-profile sa-td-profile">
        <div className="sa-sd-identity">
          {teacher.photoUrl ? <img src={teacher.photoUrl} alt="" /> : <span>{initials(teacher.name)}</span>}
          <div>
            <div className="sa-sd-name">
              <h2>{teacher.name}</h2>
              <em className={`sa-stu-status is-${statusKey}`}>{statusLabel}</em>
            </div>
            <p className="sa-sd-meta">
              {[
                employeeNo(teacher) ? `ID ${employeeNo(teacher)}` : null,
                teacher.createdAt ? `Joined ${fmtDate(teacher.createdAt)}` : null,
              ]
                .filter(Boolean)
                .join('  ·  ') || '—'}
            </p>
            <p className="sa-sd-meta">
              {[teacher.email, teacher.phone].filter(Boolean).join('  ·  ') || 'No contact saved'}
            </p>
          </div>
        </div>
        <div className="sa-sd-sidebits sa-td-bits">
          <div>
            <strong>Department</strong>
            <p>{dash(teacher.department)}</p>
            <strong>Position</strong>
            <p>{dash(teacher.jobTitle)}</p>
          </div>
          <div>
            <strong>Qualification</strong>
            <p>{dash(teacher.qualification)}</p>
            <strong>Experience</strong>
            <p>{experience || '—'}</p>
          </div>
        </div>
      </section>

      <nav className="sa-sd-tabs" aria-label="Teacher sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
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
          <ul className="sa-activity">
            <li>
              <strong>Profile updated</strong>
              <small>{fmtDate(teacher.updatedAt) || '—'}</small>
            </li>
            <li>
              <strong>Profile created</strong>
              <small>{fmtDate(teacher.createdAt) || '—'}</small>
            </li>
            {(data.registerDays || []).slice(0, 10).map((d) => (
              <li key={d}>
                <strong>Class register marked</strong>
                <small>{fmtDate(d) || d}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'overview' && (
        <>
          <section className="sa-td-grid">
            <article className="sa-card">
              <h3>Personal Information</h3>
              <dl className="sa-sd-dl">
                <div><dt>Full name</dt><dd>{dash(teacher.name)}</dd></div>
                <div><dt>Date of birth</dt><dd>{dash(fmtDate(teacher.dateOfBirth))}</dd></div>
                <div><dt>Gender</dt><dd>{dash(genderLabel(teacher.gender))}</dd></div>
                <div><dt>Nationality</dt><dd>{dash(teacher.nationality)}</dd></div>
                <div><dt>ID / Passport no.</dt><dd>{dash(teacher.idNumber)}</dd></div>
                <div><dt>Phone</dt><dd>{dash(teacher.phone)}</dd></div>
                <div><dt>Email</dt><dd>{dash(teacher.email)}</dd></div>
              </dl>
            </article>

            <article className="sa-card">
              <h3>Subjects & Classes</h3>
              {data.subjects?.length ? (
                <ul className="sa-td-list">
                  {data.subjects.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">No subjects listed on assigned classes.</p>
              )}
              {data.classes?.length ? (
                <table className="sa-td-mini">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.classes.map((c) => (
                      <tr key={c._id}>
                        <td>{[c.grade, c.section].filter(Boolean).join(' ') || c.classCode || '—'}</td>
                        <td>{c.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="sa-muted">This teacher is not assigned as a class teacher yet.</p>
              )}
              <button type="button" className="sa-text-link" onClick={() => setTab('classes')}>
                View all classes
              </button>
            </article>

            <article className="sa-card">
              <h3>Employment Information</h3>
              <dl className="sa-sd-dl">
                <div><dt>Employee ID</dt><dd>{dash(employeeNo(teacher))}</dd></div>
                <div><dt>Department</dt><dd>{dash(teacher.department)}</dd></div>
                <div><dt>Position</dt><dd>{dash(teacher.jobTitle)}</dd></div>
                <div><dt>Date of joining</dt><dd>{dash(fmtDate(teacher.createdAt))}</dd></div>
                <div>
                  <dt>Status</dt>
                  <dd><span className={`sa-stu-status is-${statusKey}`}>{statusLabel}</span></dd>
                </div>
              </dl>
            </article>

            <article className="sa-card sa-sd-actions-card">
              <h3>Quick Actions</h3>
              <div className="sa-sd-quick">
                <Link to={`/school-admin/teachers?edit=${teacher.id}`}>Edit Teacher Profile</Link>
                <button type="button" onClick={() => setTab('classes')}>Assign to Class</button>
                <button type="button" onClick={() => setTab('schedule')}>View Timetable</button>
                <Link to="/school-admin/attendance">Mark Attendance</Link>
                <button type="button" onClick={() => setTab('documents')}>View Documents</button>
                <button type="button" onClick={() => setTab('notes')}>Add Note</button>
                <Link to={`/school-admin/messages?to=${teacher.id}&kind=teacher`}>Send Message</Link>
                <button type="button" className="is-danger" onClick={resetPassword}>
                  Reset Password
                </button>
              </div>
            </article>
          </section>

          <section className="sa-td-bottom">
            <article className="sa-card">
              <h3>Today&apos;s Schedule</h3>
              {data.schedule?.length ? (
                <ul className="sa-td-sched">
                  {data.schedule.map((s, i) => (
                    <li key={`${s.startTime}-${i}`}>
                      <div>
                        <strong>
                          {s.startTime}
                          {s.endTime ? ` – ${s.endTime}` : ''}
                        </strong>
                        <span>
                          {s.className}
                          {s.subject ? ` · ${s.subject}` : ''}
                          {s.room ? ` · ${s.room}` : ''}
                        </span>
                      </div>
                      {s.ongoing ? <em className="sa-stu-status is-active">Ongoing</em> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">No timetable slots for today.</p>
              )}
              <button type="button" className="sa-text-link" onClick={() => setTab('schedule')}>
                View full timetable
              </button>
            </article>

            <article className="sa-card">
              <h3>Recent Attendance Records</h3>
              <p className="sa-muted sa-td-hint">Days this teacher marked the class register.</p>
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
                View attendance history
              </button>
            </article>

            <article className="sa-card">
              <h3>Documents</h3>
              <p className="sa-muted">No staff documents are stored for this teacher yet.</p>
              <button type="button" className="sa-text-link" onClick={() => setTab('documents')}>
                Upload new document
              </button>
            </article>

            <article className="sa-card sa-sd-notes">
              <h3>Notes</h3>
              {teacher.aboutMe ? <p>{teacher.aboutMe}</p> : <p className="sa-muted">No notes saved.</p>}
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
