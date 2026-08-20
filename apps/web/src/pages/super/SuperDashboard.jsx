import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../lib/api';
import { Empty, PageFoot, PlanBadge, StatusDot, formatKes, pct } from './shared';

const STATUS_COLORS = {
  active: '#16a34a',
  trial: '#2563eb',
  pending: '#ea580c',
  suspended: '#dc2626',
};
const PLAN_COLORS = {
  premium: '#7c3aed',
  standard: '#2563eb',
  basic: '#64748b',
  trial: '#ea580c',
};

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="sa-chart-tooltip">
      {label ? <strong>{label}</strong> : null}
      {payload.map((p) => (
        <div key={p.name}>
          <span>{p.name}</span>
          <em>{p.value}</em>
        </div>
      ))}
    </div>
  );
}

function weekHint(n, suffix = 'this week') {
  const v = Number(n) || 0;
  if (v <= 0) return { text: 'No change this week', up: false };
  return { text: `↑ ${v} ${suffix}`, up: true };
}

export default function SuperDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/platform/overview')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const statusChart = useMemo(() => {
    const by = data?.byStatus || {};
    return [
      { key: 'active', name: 'Active', value: by.active || 0, color: STATUS_COLORS.active },
      { key: 'trial', name: 'Trial', value: by.trial || 0, color: STATUS_COLORS.trial },
      { key: 'pending', name: 'Pending Approval', value: by.pending || 0, color: STATUS_COLORS.pending },
      { key: 'suspended', name: 'Suspended', value: by.suspended || 0, color: STATUS_COLORS.suspended },
    ];
  }, [data]);

  const planChart = useMemo(() => {
    const by = data?.byPlan || {};
    return [
      { key: 'premium', name: 'Premium', value: by.premium || 0, color: PLAN_COLORS.premium },
      { key: 'standard', name: 'Standard', value: by.standard || 0, color: PLAN_COLORS.standard },
      { key: 'basic', name: 'Basic', value: by.basic || 0, color: PLAN_COLORS.basic },
      { key: 'trial', name: 'Trial', value: by.trial || 0, color: PLAN_COLORS.trial },
    ];
  }, [data]);

  if (error) return <div className="alert">{error}</div>;
  if (!data) {
    return (
      <div className="sa-home">
        <div className="sa-home-kpis">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="sa-skeleton sa-skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  const k = data.kpis || {};
  const schoolTotal = k.schools || 0;
  const activeShare = schoolTotal ? pct(k.activeSchools || 0, schoolTotal) : '0.0%';
  const health = data.health || {};
  const heapPct = health.storage?.heapTotalMb
    ? Math.min(100, Math.round((health.storage.heapUsedMb / health.storage.heapTotalMb) * 100))
    : 0;

  const kpis = [
    { label: 'Total Schools', value: k.schools, hint: weekHint(k.addedSchools), tint: 'blue' },
    { label: 'Active Schools', value: k.activeSchools, hint: { text: `${activeShare} of total`, up: false }, tint: 'green' },
    { label: 'Total Users', value: k.users, hint: weekHint(k.addedUsers), tint: 'violet' },
    { label: 'Total Buses', value: k.buses, hint: weekHint(k.addedBuses), tint: 'sky' },
    { label: 'Active Routes', value: k.routes, hint: weekHint(k.addedRoutes), tint: 'amber' },
    {
      label: 'Monthly Revenue',
      value: formatKes(k.revenueKes),
      hint: {
        text: k.revenueKes
          ? `${k.revenuePct >= 0 ? '↑' : '↓'} ${Math.abs(k.revenuePct)}% vs last month`
          : 'No paid invoices this month',
        up: k.revenueKes > 0 && k.revenuePct >= 0,
      },
      tint: 'rose',
    },
  ];

  return (
    <div className="sa-home">
      <section className="sa-home-kpis" aria-label="Key metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-home-kpi tint-${m.tint}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value ?? 0}</strong>
              <em className={m.hint.up ? 'is-up' : ''}>{m.hint.text}</em>
            </div>
            <i className="sa-home-kpi-icon" aria-hidden="true" />
          </article>
        ))}
      </section>

      <section className="pa-charts">
        <article className="sa-home-card">
          <header>
            <div>
              <h3>Schools Overview</h3>
              <p>{schoolTotal} schools on the platform</p>
            </div>
          </header>
          {schoolTotal ? (
            <div className="sa-home-donut">
              <div className="sa-home-donut-chart">
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={statusChart} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3}>
                      {statusChart.map((row) => (
                        <Cell key={row.key} fill={row.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="sa-home-donut-label">
                  <strong>{schoolTotal}</strong>
                  <span>schools</span>
                </div>
              </div>
              <ul className="sa-home-legend">
                {statusChart.map((row) => (
                  <li key={row.key}>
                    <i style={{ background: row.color }} />
                    <span>{row.name}</span>
                    <strong>
                      {row.value} · {pct(row.value, schoolTotal)}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Empty>No schools yet. Admit the first one from Schools.</Empty>
          )}
        </article>

        <article className="sa-home-card">
          <header>
            <div>
              <h3>Platform Activity</h3>
              <p>New schools, users, and trips over the last 7 days</p>
            </div>
          </header>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.activitySeries || []}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
              <Tooltip content={<ChartTip />} />
              <Line type="monotone" dataKey="schools" name="New Schools" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="users" name="New Users" stroke="#16a34a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="trips" name="Active Trips" stroke="#ea580c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="sa-home-card">
          <header>
            <div>
              <h3>Subscription Summary</h3>
              <p>Current plan mix</p>
            </div>
          </header>
          {schoolTotal ? (
            <div className="sa-home-donut">
              <div className="sa-home-donut-chart">
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={planChart} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3}>
                      {planChart.map((row) => (
                        <Cell key={row.key} fill={row.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="sa-home-legend">
                {planChart.map((row) => (
                  <li key={row.key}>
                    <i style={{ background: row.color }} />
                    <span>{row.name}</span>
                    <strong>
                      {row.value} · {pct(row.value, schoolTotal)}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Empty>Plans appear once schools are admitted.</Empty>
          )}
        </article>
      </section>

      <section className="pa-dash-bottom">
        <article className="sa-home-card">
          <header>
            <div>
              <h3>Recent Schools</h3>
              <p>Newest admissions</p>
            </div>
            <Link to="/super-admin/schools" className="sa-text-link">
              Manage
            </Link>
          </header>
          {(data.recentSchools || []).length ? (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>School Name</th>
                    <th>Admin</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Joined On</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSchools.map((s) => (
                    <tr key={s._id}>
                      <td>{s.name}</td>
                      <td>
                        {s.admin ? (
                          <>
                            <strong>{s.admin.name}</strong>
                            <div className="muted">{s.admin.email}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <PlanBadge plan={s.plan} />
                      </td>
                      <td>
                        <StatusDot status={s.status} />
                      </td>
                      <td>{new Date(s.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No schools on record yet.</Empty>
          )}
        </article>

        <article className="sa-home-card">
          <header>
            <div>
              <h3>System Health</h3>
              <p>Live checks from this API process</p>
            </div>
            <Link to="/super-admin/health" className="sa-text-link">
              Details
            </Link>
          </header>
          <ul className="pa-health-list">
            <li>
              <strong>Server Status</strong>
              <StatusDot status={health.api === 'operational' ? 'operational' : 'down'} />
            </li>
            <li>
              <strong>Database</strong>
              <StatusDot status={health.database === 'operational' ? 'operational' : 'down'} />
            </li>
            <li>
              <strong>Backup Status</strong>
              <span>Not configured on this server</span>
            </li>
            <li>
              <strong>Memory</strong>
              <span>
                {health.storage?.heapUsedMb || 0} MB / {health.storage?.heapTotalMb || 0} MB heap
              </span>
              <div className="pa-meter">
                <i style={{ width: `${heapPct}%` }} />
              </div>
            </li>
            <li>
              <strong>Active Sessions</strong>
              <span>{health.activeSessions || 0} socket clients · {health.registeredDevices || 0} devices</span>
            </li>
          </ul>
        </article>
      </section>
      <PageFoot name={data.settings?.platformName} />
    </div>
  );
}
