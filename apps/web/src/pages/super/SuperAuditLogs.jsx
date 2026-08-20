import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, PageFoot, formatWhen } from './shared';

export default function SuperAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/platform/audit')
      .then((d) => setLogs(d.logs || []))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;

  return (
    <div className="sa-page">
      <article className="sa-card">
        {logs.length ? (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>School</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l._id}>
                    <td>{formatWhen(l.createdAt)}</td>
                    <td>{l.actorName || '—'}</td>
                    <td>{l.action}</td>
                    <td>{l.schoolId?.name || '—'}</td>
                    <td>{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No audited actions yet. Admit a school or change a plan to write the first log.</Empty>
        )}
      </article>
      <PageFoot />
    </div>
  );
}
