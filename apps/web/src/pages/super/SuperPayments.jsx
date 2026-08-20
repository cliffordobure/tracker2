import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, PageFoot, formatKes, formatWhen } from './shared';

export default function SuperPayments() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/platform/payments')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!data) return <p>Loading payments…</p>;

  const rows = data.platform || [];
  const fees = data.schoolFees || [];

  return (
    <div className="sa-page">
      <article className="sa-card">
        <h3>Platform subscription payments</h3>
        <p className="muted">These are invoices you marked paid. Empty until you issue and settle invoices.</p>
        {rows.length ? (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>School</th>
                  <th>Reference</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p._id}>
                    <td>{formatWhen(p.at)}</td>
                    <td>{p.schoolName}</td>
                    <td>{p.reference}</td>
                    <td>{formatKes(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No platform payments yet.</Empty>
        )}
      </article>
      <article className="sa-card">
        <h3>School fee collections</h3>
        <p className="muted">Parent fee payments recorded inside schools — not platform SaaS revenue.</p>
        {fees.length ? (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>School</th>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((p) => (
                  <tr key={String(p._id)}>
                    <td>{formatWhen(p.at)}</td>
                    <td>{p.schoolName}</td>
                    <td>{p.description}</td>
                    <td>{formatKes(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No school fee payments recorded.</Empty>
        )}
      </article>
      <PageFoot />
    </div>
  );
}
