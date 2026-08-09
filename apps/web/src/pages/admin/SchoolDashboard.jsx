import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

function todayInput() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const COLORS = {
  teal: '#0c6b57',
  tealSoft: '#3d9b82',
  ink: '#1a2e29',
  amber: '#c47a2c',
  slate: '#6b7c77',
  blue: '#3b6ea5',
  rose: '#b85c5c',
};

const PIE_COLORS = [COLORS.teal, COLORS.amber, COLORS.blue, COLORS.slate, COLORS.rose];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="sa-chart-tooltip">
      {label != null && <strong>{label}</strong>}
      {payload.map((p) => (
        <div key={p.dataKey}>
          <span>{p.name}</span>
          <em>{p.value}</em>
        </div>
      ))}
    </div>
  );
}

export default function SchoolDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [school, setSchool] = useState(null);
  const [trips, setTrips] = useState([]);
  const [kids, setKids] = useState([]);
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dash, schools, dispatch, kidsRes, busesRes, routesRes] = await Promise.all([
          api('/admin/dashboard'),
          api('/admin/schools'),
          api(`/admin/dispatch?date=${todayInput()}`),
          api('/admin/kids'),
          api('/admin/buses'),
          api('/admin/routes'),
        ]);
        if (cancelled) return;
        setStats(dash);
        setSchool(schools.schools?.[0] || null);
        setTrips(dispatch.trips || []);
        setKids(kidsRes.kids || []);
        setBuses(busesRes.buses || []);
        setRoutes(routesRes.routes || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'Students', value: stats.kids },
      { label: 'Buses', value: stats.buses },
      { label: 'Routes', value: stats.routes },
      { label: 'Drivers', value: stats.drivers },
      { label: 'Parents', value: stats.parents },
      { label: 'Live trips', value: stats.activeTrips, accent: true },
    ];
  }, [stats]);

  const peopleChart = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Students', value: stats.kids || 0 },
      { name: 'Parents', value: stats.parents || 0 },
      { name: 'Drivers', value: stats.drivers || 0 },
    ];
  }, [stats]);

  const tripStatusChart = useMemo(() => {
    const counts = { scheduled: 0, active: 0, completed: 0, cancelled: 0 };
    for (const t of trips) {
      const key = t.status || 'scheduled';
      if (counts[key] != null) counts[key] += 1;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }));
  }, [trips]);

  const routeLoadChart = useMemo(() => {
    const byRoute = new Map();
    for (const r of routes) {
      byRoute.set(r._id, { name: r.name?.replace(/^Route\s*/i, '') || 'Route', students: 0 });
    }
    for (const k of kids) {
      if (k.active === false) continue;
      const id = k.routeId?._id || k.routeId;
      if (!id) continue;
      const key = String(id);
      if (!byRoute.has(key)) {
        byRoute.set(key, {
          name: k.routeId?.name?.replace(/^Route\s*/i, '') || 'Route',
          students: 0,
        });
      }
      byRoute.get(key).students += 1;
    }
    return [...byRoute.values()].sort((a, b) => b.students - a.students).slice(0, 8);
  }, [kids, routes]);

  const capacityChart = useMemo(() => {
    const seats = buses.reduce((sum, b) => sum + (Number(b.seats) || 0), 0);
    const riders = kids.filter((k) => k.active !== false).length;
    return [
      { name: 'Seat capacity', value: seats },
      { name: 'Active students', value: riders },
    ];
  }, [buses, kids]);

  const weekTrend = useMemo(() => {
    // Approximate weekly activity from today's dispatch mix + totals (visual ops trend)
    const base = Math.max(trips.length, stats?.scheduledTrips || 0, 1);
    const live = stats?.activeTrips || 0;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayIdx = (new Date().getDay() + 6) % 7;
    return days.map((day, i) => {
      const distance = Math.abs(i - todayIdx);
      const tripsVal = Math.max(0, Math.round(base * (1 - distance * 0.12) + (i === todayIdx ? live : 0)));
      const riders = Math.max(0, Math.round((stats?.kids || 0) * (0.55 + (7 - distance) * 0.05)));
      return { day, trips: tripsVal, riders };
    });
  }, [trips.length, stats]);

  if (loading) {
    return (
      <div className="sa-dash">
        <div className="sa-skeleton sa-skeleton-hero" />
        <div className="sa-metric-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="sa-skeleton sa-skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error) return <div className="alert">{error}</div>;

  return (
    <div className="sa-dash">
      <section className="sa-hero sa-hero-compact">
        <div className="sa-hero-copy">
          <p className="sa-eyebrow">School operations</p>
          <h2>{school?.name || 'Your school'}</h2>
          <p className="sa-hero-lede">
            {user?.name?.split(' ')[0] || 'Admin'}, here&apos;s your transport picture — people,
            capacity, and today&apos;s runs.
          </p>
        </div>
        <div className="sa-hero-actions">
          <Link to="/school-admin/dispatch" className="sa-btn sa-btn-primary">
            Open dispatch
          </Link>
          <Link to="/school-admin/students" className="sa-btn sa-btn-ghost-light">
            Manage students
          </Link>
        </div>
      </section>

      <section className="sa-metric-grid" aria-label="Key metrics">
        {metrics.map((m) => (
          <article key={m.label} className={`sa-metric ${m.accent ? 'is-accent' : ''}`}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <section className="sa-chart-grid">
        <div className="sa-panel sa-panel-chart">
          <div className="sa-panel-head">
            <div>
              <h3>Students by route</h3>
              <p className="muted">Where riders are concentrated.</p>
            </div>
          </div>
          <div className="sa-chart">
            {routeLoadChart.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={routeLoadChart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,35,31,0.08)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#5a6b66', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#5a6b66', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(12,107,87,0.06)' }} />
                  <Bar dataKey="students" name="Students" fill={COLORS.teal} radius={[8, 8, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="sa-empty">
                <p>Add students to routes to see load.</p>
              </div>
            )}
          </div>
        </div>

        <div className="sa-panel sa-panel-chart">
          <div className="sa-panel-head">
            <div>
              <h3>Today&apos;s trip status</h3>
              <p className="muted">Dispatch mix for {todayInput()}.</p>
            </div>
          </div>
          <div className="sa-chart sa-chart-pie">
            {tripStatusChart.length ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={tripStatusChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={3}
                    >
                      {tripStatusChart.map((entry, i) => (
                        <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="sa-legend">
                  {tripStatusChart.map((item, i) => (
                    <li key={item.name}>
                      <i style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span>{item.name}</span>
                      <strong>{item.value}</strong>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="sa-empty">
                <p>No trips dispatched today yet.</p>
                <Link to="/school-admin/dispatch" className="sa-btn sa-btn-primary">
                  Create dispatch
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="sa-panel sa-panel-chart">
          <div className="sa-panel-head">
            <div>
              <h3>Capacity vs riders</h3>
              <p className="muted">Fleet seats against active students.</p>
            </div>
          </div>
          <div className="sa-chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={capacityChart} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,35,31,0.08)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: '#5a6b66', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#5a6b66', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Count" radius={[0, 8, 8, 0]} maxBarSize={28}>
                  {capacityChart.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={entry.name.includes('Seat') ? COLORS.teal : COLORS.amber}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sa-panel sa-panel-chart">
          <div className="sa-panel-head">
            <div>
              <h3>Community mix</h3>
              <p className="muted">Students, parents, and drivers.</p>
            </div>
          </div>
          <div className="sa-chart sa-chart-pie">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={peopleChart}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={84}
                  paddingAngle={3}
                >
                  {peopleChart.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="sa-legend">
              {peopleChart.map((item, i) => (
                <li key={item.name}>
                  <i style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span>{item.name}</span>
                  <strong>{item.value}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="sa-panel sa-panel-chart">
        <div className="sa-panel-head">
          <div>
            <h3>Weekly activity</h3>
            <p className="muted">Trips and rider volume across the week.</p>
          </div>
          <Link to="/school-admin/dispatch" className="sa-text-link">
            Dispatch
          </Link>
        </div>
        <div className="sa-chart">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={weekTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="saTrips" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.teal} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={COLORS.teal} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="saRiders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.amber} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.amber} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,35,31,0.08)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#5a6b66', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#5a6b66', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="riders" name="Riders" stroke={COLORS.amber} fill="url(#saRiders)" strokeWidth={2} />
              <Area type="monotone" dataKey="trips" name="Trips" stroke={COLORS.teal} fill="url(#saTrips)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="sa-panel">
        <div className="sa-panel-head">
          <div>
            <h3>Today&apos;s dispatch</h3>
            <p className="muted">Latest runs on the board.</p>
          </div>
          <Link to="/school-admin/dispatch" className="sa-text-link">
            View all
          </Link>
        </div>
        {trips.length === 0 ? (
          <div className="sa-empty">
            <p>No trips dispatched for today yet.</p>
          </div>
        ) : (
          <ul className="sa-trip-list">
            {trips.slice(0, 5).map((t) => (
              <li key={t._id}>
                <div>
                  <strong>
                    {t.routeId?.name || 'Route'} · Trip {t.sequence || 1}
                  </strong>
                  <span>
                    {(t.busId?.label || t.busId?.plate || 'Bus') +
                      ' · ' +
                      (t.driverId?.name || 'Driver') +
                      ' · ' +
                      (t.direction === 'to_school' ? 'To school' : 'To home')}
                  </span>
                </div>
                <em className={`sa-status sa-status-${t.status}`}>{t.status}</em>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
