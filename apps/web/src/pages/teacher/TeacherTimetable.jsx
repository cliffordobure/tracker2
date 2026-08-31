import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';

function mondayOf(value) {
  const d = value ? new Date(`${value}T00:00:00`) : new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftWeek(week, delta) {
  const d = new Date(`${week}T00:00:00`);
  d.setDate(d.getDate() + delta * 7);
  return mondayOf(d.toISOString().slice(0, 10));
}

export default function TeacherTimetable() {
  const [params, setParams] = useSearchParams();
  const [week, setWeek] = useState(params.get('week') || mondayOf());
  const [grade, setGrade] = useState(params.get('grade') || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = async (nextWeek = week, nextGrade = grade) => {
    const qs = new URLSearchParams({ week: nextWeek });
    if (nextGrade) qs.set('grade', nextGrade);
    const res = await api(`/teacher/timetable?${qs}`);
    setData(res);
    if (!nextGrade && res.grade) setGrade(res.grade);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = async (nextWeek, nextGrade) => {
    setWeek(nextWeek);
    setGrade(nextGrade);
    setParams({ week: nextWeek, grade: nextGrade }, { replace: true });
    try {
      await load(nextWeek, nextGrade);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="tw-page">
      <div>
        <h2>Timetable</h2>
        <p className="tw-lede">Weekly class timetable. Open register or class details from here.</p>
      </div>
      {error && <div className="tw-alert">{error}</div>}
      <div className="tw-toolbar">
        <button type="button" className="tw-btn tw-btn-ghost" onClick={() => apply(shiftWeek(week, -1), grade)}>
          Previous week
        </button>
        <strong>{data?.weekStart ? new Date(data.weekStart).toLocaleDateString() : week}</strong>
        <button type="button" className="tw-btn tw-btn-ghost" onClick={() => apply(shiftWeek(week, 1), grade)}>
          Next week
        </button>
        <label>
          Class
          <select value={grade} onChange={(e) => apply(week, e.target.value)}>
            {(data?.grades || []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <Link className="tw-btn tw-btn-secondary" to={`/teacher/register?grade=${encodeURIComponent(grade)}`}>
          Open register
        </Link>
        <Link className="tw-btn tw-btn-secondary" to={`/teacher/class?grade=${encodeURIComponent(grade)}`}>
          Class details
        </Link>
      </div>
      {data?.term?.name ? <p className="tw-muted">{data.term.name}</p> : null}

      <div className="tw-table-wrap">
        <table className="tw-timetable">
          <thead>
            <tr>
              <th>Period</th>
              {(data?.days || []).map((d) => (
                <th key={d.day}>
                  {d.day}
                  <div className="tw-muted">{d.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.periods || []).map((period, i) => (
              <tr key={`${period.startTime}-${i}`}>
                <td>
                  <strong>{period.periodLabel || period.startTime}</strong>
                  <div className="tw-muted">
                    {period.startTime}–{period.endTime}
                  </div>
                </td>
                {(data?.days || []).map((d) => {
                  const slot = d.slots?.[i];
                  return (
                    <td key={`${d.day}-${i}`}>
                      {slot && !slot.empty ? (
                        <>
                          <strong>{slot.subject}</strong>
                          <div className="tw-muted">{slot.room || data.classroom}</div>
                        </>
                      ) : (
                        <span className="tw-muted">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!data?.periods?.length && (
              <tr>
                <td colSpan={6} className="tw-muted">
                  No timetable periods for this class.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(data?.notes || []).length ? (
        <div className="tw-panel">
          <h3>Notes</h3>
          <ul className="tw-list">
            {data.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
