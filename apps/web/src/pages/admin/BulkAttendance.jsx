import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

function ymd(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUSES = ['present', 'absent', 'late', 'excused'];

export default function BulkAttendance() {
  const { schoolName = '' } = useOutletContext() || {};
  const [date, setDate] = useState(ymd());
  const [grade, setGrade] = useState('');
  const [data, setData] = useState(null);
  const [marks, setMarks] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

  const load = async () => {
    const query = new URLSearchParams({ date });
    if (grade) query.set('grade', grade);
    const next = await api(`/admin/attendance?${query}`);
    setData(next);
    const initial = {};
    for (const k of next.kids || []) initial[k.id] = k.status || 'present';
    setMarks(initial);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [date, grade]);

  const setAll = (status) => {
    const next = {};
    for (const k of data?.kids || []) next[k.id] = status;
    setMarks(next);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = Object.entries(marks).map(([kidId, status]) => ({ kidId, status }));
      const res = await api('/admin/attendance/bulk', { method: 'POST', body: { date, marks: payload } });
      setNotice(`Saved ${res.saved} mark${res.saved === 1 ? '' : 's'}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onCsv = async (file) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const header = lines[0].toLowerCase();
    const start = header.includes('admission') || header.includes('name') || header.includes('status') ? 1 : 0;
    const kids = data?.kids || [];
    const next = { ...marks };
    for (const line of lines.slice(start)) {
      const [a, b] = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      const status = STATUSES.includes(b?.toLowerCase()) ? b.toLowerCase() : STATUSES.includes(a?.toLowerCase()) ? a.toLowerCase() : '';
      const key = STATUSES.includes(b?.toLowerCase()) ? a : '';
      if (!status || !key) continue;
      const kid = kids.find(
        (k) =>
          String(k.admissionNo || '').toLowerCase() === key.toLowerCase() ||
          k.name.toLowerCase() === key.toLowerCase()
      );
      if (kid) next[kid.id] = status;
    }
    setMarks(next);
    setNotice('CSV applied to the list. Click Save to write the register.');
  };

  const kids = data?.kids || [];

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}
      <div className="sa-users-head">
        <p className="sa-muted">
          Mark a whole class for one day. CSV columns: admission number or name, then status
          (present, absent, late, excused).
        </p>
        <Link className="sa-btn sa-btn-outline" to="/school-admin/attendance">
          Class register
        </Link>
      </div>
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
          <button type="button" className="sa-btn sa-btn-outline" onClick={() => setAll('present')}>
            Mark all present
          </button>
          <label className="sa-btn sa-btn-outline">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onCsv(file);
              }}
            />
          </label>
          <button type="button" className="sa-btn sa-btn-primary" disabled={saving || !kids.length} onClick={save}>
            {saving ? 'Saving…' : 'Save register'}
          </button>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table sa-users-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Grade</th>
                <th>Status</th>
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
                  <td>
                    <select
                      value={marks[k.id] || 'present'}
                      onChange={(e) => setMarks({ ...marks, [k.id]: e.target.value })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
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
