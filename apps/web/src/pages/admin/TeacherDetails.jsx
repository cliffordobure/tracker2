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

const TAB_COPY = {
  schedule: 'A full timetable for this teacher will be added here.',
  classes: 'Class assignments will be managed from this tab.',
  attendance: 'Teacher attendance history will sit here.',
  documents: 'Staff documents will be uploaded and reviewed here.',
  performance: 'Performance reviews are not enabled yet.',
  notes: 'Staff notes about this teacher will live here.',
  activity: 'An activity log of profile and class changes is coming next.',
};

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

      {tab !== 'overview' && (
        <div className="sa-empty-panel">
          <div className="sa-empty-icon" aria-hidden="true">◈</div>
          <h2>Coming Soon</h2>
          <p>{TAB_COPY[tab]}</p>
        </div>
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
                <Link to="/school-admin/coming-soon/attendance">Mark Attendance</Link>
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
