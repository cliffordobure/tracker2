import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, PageFoot, PlanBadge, StatusDot, pct } from './shared';

export default function SuperSubscriptions() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api('/admin/platform/subscriptions')
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const changePlan = async (id, plan) => {
    await api(`/admin/platform/schools/${id}`, { method: 'PUT', body: { plan } });
    await load();
  };

  if (error) return <div className="alert">{error}</div>;
  if (!data) return <p>Loading subscriptions…</p>;

  const total = (data.schools || []).length;
  const by = data.byPlan || {};

  return (
    <div className="sa-page">
      <div className="sa-stu-kpis">
        {['premium', 'standard', 'basic', 'trial'].map((plan) => (
          <article key={plan} className="sa-stu-kpi">
            <div>
              <span>{plan}</span>
              <strong>{by[plan] || 0}</strong>
              <em>{pct(by[plan] || 0, total)} of schools</em>
            </div>
          </article>
        ))}
      </div>
      <article className="sa-card">
        {(data.schools || []).length ? (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>School</th>
                  <th>Status</th>
                  <th>Plan</th>
                </tr>
              </thead>
              <tbody>
                {data.schools.map((s) => (
                  <tr key={s._id}>
                    <td>{s.name}</td>
                    <td>
                      <StatusDot status={s.status} />
                    </td>
                    <td>
                      <select value={s.plan || 'standard'} onChange={(e) => changePlan(s._id, e.target.value)}>
                        <option value="trial">Trial</option>
                        <option value="basic">Basic</option>
                        <option value="standard">Standard</option>
                        <option value="premium">Premium</option>
                      </select>
                      <PlanBadge plan={s.plan} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No schools to subscribe yet.</Empty>
        )}
      </article>
      <PageFoot />
    </div>
  );
}
