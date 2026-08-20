import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

function ymd(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUSES = [
  { id: 'present', label: 'Present' },
  { id: 'absent', label: 'Absent' },
  { id: 'late', label: 'Late' },
  { id: 'excused', label: 'Excused' },
];

function busLabel(value) {
  if (value === 'picked_up') return 'Picked up';
  if (value === 'not_picked_up') return 'Not picked up';
  if (value === 'dropped_off') return 'Dropped off';
  return '—';
}

export default function Attendance() {
  const { schoolName = '' } = useOutletContext() || {};
  const [date, setDate] = useState(ymd());
  const [grade, setGrade] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const year = new Date().getFullYear();

  const load = async () => {
    const query = new URLSearchParams({ date });
    if (grade) query.set('grade', grade);
    setData(await api(`/admin/attendance?${query}`));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [date, grade]);

  const mark = async (kidId, status) => {
    setBusyId(kidId);
    setError('');
    try {
      await api('/admin/attendance', { method: 'POST', body: { kidId, status, date } });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const stats = data?.stats || {};
  const kids = data?.kids || [];

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      <div className="sa-users-head">
        <p className="sa-muted">
          Class register for the selected day. Bus column is from trip pickup events that day, not estimated.
        </p>
        <Link className="sa-btn sa-btn-outline" to="/school-admin/attendance/bulk">
          Bulk attendance
        </Link>
      </div>
      <section className="sa-stu-kpis sa-users-kpis">
        {[
          { label: 'Present', value: stats.present ?? '…', tint: 'green' },
          { label: 'Absent', value: stats.absent ?? '…', tint: 'rose' },
          { label: 'Late', value: stats.late ?? '…', tint: 'orange' },
          { label: 'Unmarked', value: stats.unmarked ?? '…', tint: 'sky' },
        ].map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
            </div>
          </article>
        ))}
      </section>
      <article className="sa-card">
        <div className="sa-stu-toolbar">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">All grades</option>
            {(data?.grades || []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table sa-users-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Grade</th>
                <th>Bus</th>
                <th>Register</th>
              </tr>
            </thead>
            <tbody>
              {kids.map((k) => (
                <tr key={k.id}>
                  <td>
                    <strong>{k.name}</strong>
                    {k.admissionNo ? <div className="sa-muted">{k.admissionNo}</div> : null}
                  </td>
                  <td>{k.grade || '—'}</td>
                  <td>{busLabel(k.bus)}</td>
                  <td>
                    <div className="sa-att-marks">
                      {STATUSES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={k.status === s.id ? 'is-on' : ''}
                          disabled={busyId === k.id}
                          onClick={() => mark(k.id, s.id)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!kids.length && <p className="sa-home-empty">No students in this view.</p>}
      </article>
      <footer className="sa-home-foot">
        <span>
          © {year} {schoolName || 'School'}. All rights reserved.
        </span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
