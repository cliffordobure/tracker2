import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';

const TYPES = [
  { id: 'progress', label: 'Progress' },
  { id: 'midterm', label: 'Mid-term' },
  { id: 'endterm', label: 'End of term' },
];

const TABS = ['Overview', 'Academic', 'Attendance', 'Behaviour', 'Skills'];

export default function TeacherReports() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState('');
  const grade = params.get('grade') || '';
  const type = params.get('type') || 'progress';
  const termId = params.get('termId') || '';

  const load = async (next = {}) => {
    const qs = new URLSearchParams({
      type: next.type || type,
      grade: next.grade ?? grade,
    });
    if (next.termId || termId) qs.set('termId', next.termId || termId);
    const res = await api(`/teacher/reports?${qs}`);
    setData(res);
    const nextParams = { type: res.reportType || type };
    if (res.grade) nextParams.grade = res.grade;
    if (res.term?._id) nextParams.termId = res.term._id;
    setParams(nextParams, { replace: true });
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = (patch) => load(patch).catch((e) => setError(e.message));

  return (
    <div className="tw-page">
      <div>
        <h2>Progress reports</h2>
        <p className="tw-lede">Class performance, attendance, behaviour, and skills for the selected term.</p>
      </div>
      {error && <div className="tw-alert">{error}</div>}
      <div className="tw-toolbar">
        <label>
          Class
          <select value={data?.grade || grade} onChange={(e) => change({ grade: e.target.value })}>
            {(data?.grades || []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label>
          Term
          <select value={data?.term?._id || termId} onChange={(e) => change({ termId: e.target.value })}>
            {(data?.terms || []).map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Report
          <select value={data?.reportType || type} onChange={(e) => change({ type: e.target.value })}>
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="tw-tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`tw-tab ${tab === t ? 'is-on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="tw-page">
          <div className="tw-metrics tw-metrics-4">
            <div className="tw-metric">
              <span>Students</span>
              <strong>{data?.overview?.students || 0}</strong>
            </div>
            {(data?.overview?.bands || []).slice(0, 3).map((b) => (
              <div key={b.key} className="tw-metric">
                <span>{b.label}</span>
                <strong>{b.count}</strong>
              </div>
            ))}
          </div>
          <div className="tw-grid">
            <div className="tw-panel">
              <h3>Top</h3>
              <ul className="tw-list">
                {(data?.top || []).map((s) => (
                  <li key={s._id}>
                    <Link to={`/teacher/students/${s._id}`}>{s.name}</Link>
                    <span>{s.average ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="tw-panel">
              <h3>Needs support</h3>
              <ul className="tw-list">
                {(data?.support || []).map((s) => (
                  <li key={s._id}>
                    <Link to={`/teacher/students/${s._id}`}>{s.name}</Link>
                    <span>{s.average ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === 'Academic' && (
        <div className="tw-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Average</th>
                <th>Band</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {(data?.students || []).map((s) => (
                <tr key={s._id}>
                  <td>
                    <Link to={`/teacher/students/${s._id}`}>{s.name}</Link>
                  </td>
                  <td>{s.average ?? '—'}</td>
                  <td>{s.band}</td>
                  <td>{s.improvement || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Attendance' && (
        <div className="tw-metrics tw-metrics-4">
          <div className="tw-metric is-present">
            <span>Present</span>
            <strong>{data?.attendance?.presentPct ?? 0}%</strong>
          </div>
          <div className="tw-metric is-away">
            <span>Absent</span>
            <strong>{data?.attendance?.absent ?? 0}</strong>
          </div>
          <div className="tw-metric">
            <span>Late</span>
            <strong>{data?.attendance?.late ?? 0}</strong>
          </div>
          <div className="tw-metric">
            <span>Records</span>
            <strong>{data?.attendance?.total ?? 0}</strong>
          </div>
        </div>
      )}

      {tab === 'Behaviour' && (
        <ul className="tw-list">
          {(data?.behaviour || []).map((b) => (
            <li key={b.name}>
              <strong>{b.name}</strong>
              <span>{b.average}</span>
            </li>
          ))}
          {!data?.behaviour?.length && <p className="tw-empty">No behaviour scores for this term.</p>}
        </ul>
      )}

      {tab === 'Skills' && (
        <ul className="tw-list">
          {(data?.skills || []).map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong>
              <span>{s.average}</span>
            </li>
          ))}
          {!data?.skills?.length && <p className="tw-empty">No skill scores for this term.</p>}
        </ul>
      )}
    </div>
  );
}
