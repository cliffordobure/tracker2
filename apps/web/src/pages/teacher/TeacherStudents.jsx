import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

export default function TeacherStudents() {
  const [kids, setKids] = useState([]);
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('/teacher/kids')
      .then((d) => setKids(d.kids || []))
      .catch((e) => setError(e.message));
  }, []);

  const grades = useMemo(
    () => [...new Set(kids.map((k) => k.grade).filter(Boolean))].sort(),
    [kids]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return kids.filter((k) => {
      if (grade && k.grade !== grade) return false;
      if (!needle) return true;
      const hay = [k.name, k.grade, k.admissionNo, ...(k.parentIds || []).map((p) => p.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [kids, q, grade]);

  return (
    <div className="tw-page">
      <div>
        <h2>Students</h2>
        <p className="tw-lede">Class list with parent contacts. Use this to pick who to message.</p>
      </div>
      {error && <div className="tw-alert">{error}</div>}

      <div className="tw-toolbar">
        <label>
          Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, parent, grade" />
        </label>
        <label>
          Grade
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">All</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <Link className="tw-btn tw-btn-secondary" to="/teacher/notes">
          Message a parent
        </Link>
      </div>

      <div className="tw-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Grade</th>
              <th>Parent / guardian</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => (
              <tr key={k._id}>
                <td>
                  <div className="tw-student">
                    {k.photoUrl ? <img src={k.photoUrl} alt="" /> : null}
                    <div>
                      <strong>{k.name}</strong>
                      {k.admissionNo ? <div className="tw-muted">{k.admissionNo}</div> : null}
                    </div>
                  </div>
                </td>
                <td>{k.grade || '—'}</td>
                <td>
                  {(k.parentIds || []).map((p) => p.name).join(', ') || '—'}
                  <div className="tw-muted">
                    {(k.parentIds || [])
                      .map((p) => p.phone || p.email)
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={3} className="tw-muted">
                  No students match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
