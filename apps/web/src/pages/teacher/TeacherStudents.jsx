import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function TeacherStudents() {
  const { showToast } = useAuth();
  const [kids, setKids] = useState([]);
  const [grades, setGrades] = useState([]);
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('');
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', grade: '', admissionNo: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const d = await api('/teacher/kids');
    setKids(d.kids || []);
    setGrades(d.grades || []);
    setForm((f) => ({ ...f, grade: f.grade || d.grades?.[0] || '' }));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

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
    <div className="tw-page">
      <div>
        <h2>Students</h2>
        <p className="tw-lede">Class list with parent contacts. Open a profile or send a parent note.</p>
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
        {grade ? (
          <>
            <Link className="tw-btn tw-btn-secondary" to={`/teacher/class?grade=${encodeURIComponent(grade)}`}>
              Class details
            </Link>
            <Link className="tw-btn tw-btn-secondary" to={`/teacher/reports?grade=${encodeURIComponent(grade)}`}>
              Progress reports
            </Link>
          </>
        ) : null}
        <button type="button" className="tw-btn tw-btn-primary" onClick={() => setShowAdd((v) => !v)}>
          Add student
        </button>
        <Link className="tw-btn tw-btn-ghost" to="/teacher/notes">
          Message a parent
        </Link>
      </div>

      {showAdd ? (
        <form className="tw-form" onSubmit={addStudent}>
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
          <button className="tw-btn tw-btn-primary" disabled={busy}>
            Save student
          </button>
        </form>
      ) : null}

      <div className="tw-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Grade</th>
              <th>Parent / guardian</th>
              <th />
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
                <td>
                  <div className="tw-inline-actions">
                    <Link className="tw-btn tw-btn-secondary" to={`/teacher/students/${k._id}`}>
                      Profile
                    </Link>
                    <Link className="tw-btn tw-btn-ghost" to={`/teacher/notes?kidId=${k._id}`}>
                      Note
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={4} className="tw-muted">
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
