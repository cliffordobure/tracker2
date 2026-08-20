import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, PageFoot, StatusDot, formatDate, formatKes } from './shared';

const empty = { schoolId: '', amount: '', description: '', dueDate: '' };

export default function SuperInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  const load = async () => {
    const [inv, s] = await Promise.all([api('/admin/platform/invoices'), api('/admin/platform/schools')]);
    setInvoices(inv.invoices || []);
    setSchools(s.schools || []);
    setForm((f) => ({ ...f, schoolId: f.schoolId || s.schools[0]?._id || '' }));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/platform/invoices', {
        method: 'POST',
        body: {
          schoolId: form.schoolId,
          amount: Number(form.amount),
          description: form.description,
          dueDate: form.dueDate || undefined,
        },
      });
      setForm((f) => ({ ...empty, schoolId: f.schoolId }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const setStatus = async (id, status) => {
    await api(`/admin/platform/invoices/${id}`, { method: 'PUT', body: { status } });
    await load();
  };

  return (
    <div className="sa-page">
      {error && <div className="alert">{error}</div>}
      <div className="pa-split">
        <article className="sa-card">
          {invoices.length ? (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>School</th>
                    <th>Amount</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv._id}>
                      <td>
                        <strong>{inv.invoiceNo}</strong>
                        <div className="muted">{inv.description}</div>
                      </td>
                      <td>{inv.schoolId?.name || '—'}</td>
                      <td>{formatKes(inv.amount)}</td>
                      <td>{formatDate(inv.dueDate)}</td>
                      <td>
                        <StatusDot status={inv.status} />
                      </td>
                      <td className="pa-actions">
                        {inv.status !== 'paid' && (
                          <button type="button" className="sa-btn sa-btn-success" onClick={() => setStatus(inv._id, 'paid')}>
                            Mark paid
                          </button>
                        )}
                        {inv.status !== 'void' && inv.status !== 'paid' && (
                          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setStatus(inv._id, 'void')}>
                            Void
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No invoices yet. Issue one for a school on the right.</Empty>
          )}
        </article>
        <form className="sa-card card-form" onSubmit={submit}>
          <h3>Issue invoice</h3>
          <label className="sa-field">
            <span>School</span>
            <select required value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })}>
              <option value="">Select school</option>
              {schools.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="sa-field">
            <span>Amount (KES)</span>
            <input required type="number" min="0" step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label className="sa-field">
            <span>Description</span>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Monthly subscription" />
          </label>
          <label className="sa-field">
            <span>Due date</span>
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </label>
          <button className="sa-btn sa-btn-primary" type="submit">
            Create invoice
          </button>
        </form>
      </div>
      <PageFoot />
    </div>
  );
}
