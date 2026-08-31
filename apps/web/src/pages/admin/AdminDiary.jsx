import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import '../../diary-module.css';

function ymd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminDiary() {
  const [date, setDate] = useState(() => ymd());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = async (day = date) => {
    const res = await api(`/admin/diary/monitor?date=${day}`);
    setData(res);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="adiary">
      <div className="tdiary-head">
        <div>
          <h2>Diary monitoring</h2>
          <p className="tw-lede">See which classes submitted today&apos;s diary and how many parents acknowledged it.</p>
        </div>
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              load(e.target.value).catch((err) => setError(err.message));
            }}
          />
        </label>
      </div>
      {error && <div className="tw-alert">{error}</div>}
      {data && (
        <>
          <div className="adiary-grid">
            <div className="adiary-card"><b>{data.classes}</b><span>Classes</span></div>
            <div className="adiary-card"><b>{data.diaryCompletion}%</b><span>Diary completion</span></div>
            <div className="adiary-card"><b>{data.teachersSubmitted}/{data.teachersTotal}</b><span>Teachers submitted</span></div>
            <div className="adiary-card"><b>{data.pendingEntries}</b><span>Pending diary entries</span></div>
            <div className="adiary-card"><b>{data.homeworkPublished}</b><span>Homework published</span></div>
            <div className="adiary-card"><b>{data.parentAcknowledgement}%</b><span>Parent acknowledgement</span></div>
          </div>
          {data.missing?.length > 0 && (
            <div className="adiary-warn">
              <strong>Teachers with missing diary</strong>
              <ul>
                {data.missing.map((row) => (
                  <li key={row.grade}>{row.grade} · {row.teacherName} · {row.subject}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="tw-table-wrap">
            <table className="tw-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Teacher</th>
                  <th>Entries</th>
                  <th>Lessons</th>
                  <th>Homework</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data.classesToday || []).map((row) => (
                  <tr key={row.classId || row.grade}>
                    <td>{row.grade}</td>
                    <td>{row.teacherName || '—'}</td>
                    <td>{row.entries}</td>
                    <td>{row.lessons}</td>
                    <td>{row.homework}</td>
                    <td>{row.submitted ? 'Submitted' : 'Missing'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
