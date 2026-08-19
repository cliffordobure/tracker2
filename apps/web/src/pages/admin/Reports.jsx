import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';

const DONUT = {
  used: '#5d3fd3',
  noTrip: '#0ea5e9',
  added: '#16a34a',
  inactive: '#94a3b8',
};

function monthStartInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function deltaHint(delta, suffix = 'vs previous month') {
  if (!delta || (delta.pct == null && !delta.abs)) return suffix;
  if (delta.pct == null) {
    const sign = delta.abs > 0 ? '+' : '';
    return `${sign}${delta.abs} ${suffix}`;
  }
  const sign = delta.pct > 0 ? '+' : '';
  return `${sign}${delta.pct}% ${suffix}`;
}

function hintClass(delta, invert) {
  if (!delta || delta.dir === 'flat' || !delta.dir) return '';
  if (invert) return delta.dir === 'down' ? 'is-good' : 'is-bad';
  return delta.dir === 'up' ? 'is-up' : 'is-down';
}

function donutStyle(items, total) {
  if (!total) return { background: '#e2e8f0' };
  let acc = 0;
  const parts = items.filter((i) => i.count > 0).map((item) => {
    const start = acc;
    acc += (item.count / total) * 100;
    return `${item.color} ${start}% ${acc}%`;
  });
  return { background: parts.length ? `conic-gradient(${parts.join(', ')})` : '#e2e8f0' };
}

function MultiLineChart({ points, series, ariaLabel }) {
  if (!points?.length || !series?.length) return null;
  const max = Math.max(...points.flatMap((p) => series.map((s) => Number(p[s.key]) || 0)), 1);
  const w = 520;
  const h = 180;
  const pad = 28;
  const innerW = w - pad * 2;
  const innerH = h - 36;
  const toPoints = (key) =>
    points
      .map((p, i) => {
        const x = points.length <= 1 ? pad + innerW / 2 : pad + (i / (points.length - 1)) * innerW;
        const y = pad / 2 + innerH - ((Number(p[key]) || 0) / max) * innerH;
        return `${x},${y}`;
      })
      .join(' ');
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((i, idx, arr) => arr.indexOf(i) === idx);
  return (
    <svg className="sa-reports-line" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel || 'Trend'}>
      {series.map((s) => (
        <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2.4" points={toPoints(s.key)} />
      ))}
      {ticks.map((i) => (
        <text key={points[i].day} x={points.length <= 1 ? w / 2 : pad + (i / (points.length - 1)) * innerW} y={h - 6} textAnchor="middle" fill="#64748b" fontSize="10">
          {fmtDay(points[i].day)}
        </text>
      ))}
    </svg>
  );
}

function Spark({ values }) {
  const nums = values?.length ? values : [0];
  const max = Math.max(...nums, 1);
  const w = 64;
  const h = 22;
  const coords = nums.map((n, i) => {
    const x = nums.length <= 1 ? w / 2 : (i / (nums.length - 1)) * w;
    const y = h - 2 - (n / max) * (h - 4);
    return `${x},${y}`;
  });
  return (
    <svg className="sa-reports-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline fill="none" stroke="#5d3fd3" strokeWidth="1.8" points={coords.join(' ')} />
    </svg>
  );
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function severityMeta(severity) {
  if (severity === 'high') return { key: 'noroute', label: 'High' };
  if (severity === 'low') return { key: 'active', label: 'Low' };
  return { key: 'inactive', label: 'Medium' };
}

function fmtTimeOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fmtMinutes(mins) {
  if (mins == null || !Number.isFinite(mins)) return '—';
  const d = new Date();
  d.setHours(Math.floor(mins / 60) % 24, Math.round(mins % 60), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function rateLabel(value) {
  return value == null ? '—' : `${value}%`;
}

function attendStatus(status) {
  if (status === 'present') return { key: 'active', label: 'Present' };
  if (status === 'absent') return { key: 'noroute', label: 'Absent' };
  if (status === 'late') return { key: 'inactive', label: 'Late' };
  return { key: 'muted', label: 'Not marked' };
}

function pageItems(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const items = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) items.push('…');
  for (let i = start; i <= end; i += 1) items.push(i);
  if (end < pages - 1) items.push('…');
  items.push(pages);
  return items;
}

const PAGE_SIZES = [10, 25, 50];
const ATTEND_DONUT = { present: '#16a34a', absent: '#e11d48', late: '#f97316' };
const SEVERITY_DONUT = {
  high: '#e11d48',
  medium: '#f97316',
  low: '#16a34a',
};

function UtilizationGauge({ value }) {
  if (value == null) return null;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="sa-live-gauge sa-reports-util-gauge" style={{ '--sa-live-gauge': `${(pct / 100) * 50}%` }}>
      <span className="sa-live-gauge-arc" />
    </div>
  );
}

export default function Reports() {
  const { globalSearch = '' } = useOutletContext() || {};
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const reportType = params.get('type') || 'overview';
  const [from, setFrom] = useState(monthStartInput());
  const [to, setTo] = useState(todayInput());
  const [compare, setCompare] = useState('previous_month');
  const [routeId, setRouteId] = useState('');
  const [busId, setBusId] = useState('');
  const [grade, setGrade] = useState('');
  const [attType, setAttType] = useState('');
  const [attendPage, setAttendPage] = useState(1);
  const [attendPageSize, setAttendPageSize] = useState(10);
  const [applied, setApplied] = useState({
    from: monthStartInput(),
    to: todayInput(),
    compare: 'previous_month',
    routeId: '',
    busId: '',
    grade: '',
  });
  const [data, setData] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSchedule, setShowSchedule] = useState(false);
  const [q, setQ] = useState('');
  const [vehiclePage, setVehiclePage] = useState(1);
  const [incidentPage, setIncidentPage] = useState(1);

  useEffect(() => {
    api('/admin/routes')
      .then((d) => setRoutes(d.routes || []))
      .catch(() => {});
    api('/admin/buses')
      .then((d) => setBuses(d.buses || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          from: applied.from,
          to: applied.to,
          compare: applied.compare,
        });
        if (applied.routeId) params.set('routeId', applied.routeId);
        if (applied.busId) params.set('busId', applied.busId);
        if (applied.grade) params.set('grade', applied.grade);
        const next = await api(`/admin/reports?${params.toString()}`);
        if (!cancelled) {
          setData(next);
          setError('');
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applied]);

  const needle = q.trim().toLowerCase();
  const routeRows = useMemo(() => {
    const rows = data?.routes || [];
    if (!needle) return rows;
    return rows.filter((r) => `${r.name} ${r.path || ''}`.toLowerCase().includes(needle));
  }, [data, needle]);
  const driverRows = useMemo(() => {
    const rows = data?.drivers || [];
    if (!needle) return rows;
    return rows.filter((d) => (d.name || '').toLowerCase().includes(needle));
  }, [data, needle]);
  const vehicleRows = useMemo(() => {
    const rows = data?.vehicles || [];
    if (!needle) return rows;
    return rows.filter((v) => `${v.label} ${v.plate}`.toLowerCase().includes(needle));
  }, [data, needle]);
  const incidentRows = useMemo(() => {
    const rows = data?.safety?.rows || [];
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.tripCode} ${r.label} ${r.type} ${r.location} ${r.driverName} ${r.details}`.toLowerCase().includes(needle)
    );
  }, [data, needle]);
  const incidentPages = Math.max(1, Math.ceil(incidentRows.length / 8));
  const incidentPageSafe = Math.min(incidentPage, incidentPages);
  const pagedIncidents = incidentRows.slice((incidentPageSafe - 1) * 8, incidentPageSafe * 8);
  const attendRows = useMemo(() => {
    let rows = data?.attendance?.list || [];
    if (attType === 'late') return [];
    if (attType === 'present' || attType === 'absent') rows = rows.filter((r) => r.status === attType);
    if (!needle) return rows;
    return rows.filter((r) => `${r.name} ${r.admissionNo} ${r.grade} ${r.routeName}`.toLowerCase().includes(needle));
  }, [data, attType, needle]);
  const attendPages = Math.max(1, Math.ceil(attendRows.length / attendPageSize));
  const attendPageSafe = Math.min(attendPage, attendPages);
  const pagedAttend = attendRows.slice((attendPageSafe - 1) * attendPageSize, attendPageSafe * attendPageSize);
  const vehiclePages = Math.max(1, Math.ceil(vehicleRows.length / 5));
  const page = Math.min(vehiclePage, vehiclePages);
  const pagedVehicles = vehicleRows.slice((page - 1) * 5, page * 5);

  useEffect(() => {
    setVehiclePage(1);
    setIncidentPage(1);
    setAttendPage(1);
  }, [applied, needle, attType, attendPageSize]);

  const kpis = data?.kpis;
  const studentDonut = [
    { key: 'used', label: 'Used transport', count: data?.students?.used || 0, color: DONUT.used },
    { key: 'noTrip', label: 'No trip this period', count: data?.students?.noTrip || 0, color: DONUT.noTrip },
    { key: 'added', label: 'New this period', count: data?.students?.added || 0, color: DONUT.added },
    { key: 'inactive', label: 'Inactive', count: data?.students?.inactive || 0, color: DONUT.inactive },
  ];
  const studentTotal = studentDonut.reduce((a, i) => a + i.count, 0);
  const show = (section) => {
    if (reportType === 'fleet') return section === 'fleet';
    if (reportType === 'safety') return section === 'safety';
    if (reportType === 'attendance') return section === 'attendance';
    return reportType === 'overview' || reportType === section;
  };
  const setReportType = (type) => {
    const next = new URLSearchParams(params);
    if (!type || type === 'overview') next.delete('type');
    else next.set('type', type);
    setParams(next, { replace: true });
  };
  const year = new Date().getFullYear();
  const compareHint = applied.compare === 'none' ? 'This period' : 'vs previous month';

  const exportCsv = () => {
    const lines = [
      ['Reports & Analytics', applied.from, applied.to].map(csvEscape).join(','),
      ['Total trips', kpis?.trips?.value ?? ''].join(','),
      ['Total students', kpis?.students?.value ?? ''].join(','),
      ['On-time performance', 'Not tracked'].join(','),
      ['Incidents', kpis?.incidents?.value ?? ''].join(','),
      ['Total distance', 'Not tracked'].join(','),
      ['Fuel litres', 'Not tracked'].join(','),
      ['Fuel cost', 'Not tracked'].join(','),
      ['CO2 emissions', 'Not tracked'].join(','),
      ['Maintenance cost', 'Not tracked'].join(','),
      ['Cost per km', 'Not tracked'].join(','),
      ['Vehicles with a trip', data?.fleet?.usedVehicles ?? '', 'of', data?.fleet?.totalVehicles ?? ''].join(','),
      '',
      ['Vehicle', 'Plate', 'Trips', 'Students', 'Liters', 'Fuel cost', 'KM', 'L/100km'].join(','),
      ...(data?.vehicles || []).map((v) =>
        [
          csvEscape(v.label || 'Vehicle'),
          csvEscape(v.plate || ''),
          v.trips,
          v.students,
          'Not tracked',
          'Not tracked',
          'Not tracked',
          'Not tracked',
        ].join(',')
      ),
      '',
      ['Route', 'Path', 'Trips', 'Students'].join(','),
      ...(data?.routes || []).map((r) =>
        [csvEscape(r.name), csvEscape(r.path || ''), r.trips, r.students].join(',')
      ),
      '',
      ['Driver', 'Trips', 'Students'].join(','),
      ...(data?.drivers || []).map((d) => [csvEscape(d.name), d.trips, d.students].join(',')),
      '',
      ['Incident type', 'Count'].join(','),
      ...(data?.incidents || []).map((i) => [csvEscape(i.label), i.count].join(',')),
      '',
      ['Incident trip', 'When', 'Type', 'Location', 'Severity'].join(','),
      ...(data?.safety?.rows || []).map((r) =>
        [csvEscape(r.tripCode || r.tripId), csvEscape(r.at || ''), csvEscape(r.label), csvEscape(r.location || ''), r.severity].join(',')
      ),
      '',
      ['Student', 'Admission', 'Grade', 'Route', 'Status', 'Pickup'].join(','),
      ...(data?.attendance?.list || []).map((r) =>
        [csvEscape(r.name), csvEscape(r.admissionNo), csvEscape(r.grade), csvEscape(r.routeName), r.status, r.pickupAt || ''].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reports-${applied.from}-to-${applied.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fleet = data?.fleet;
  const safety = data?.safety;
  const att = data?.attendance;
  const todayHint = att?.todayMarked
    ? `${((att.todayPresent / att.todayMarked) * 100).toFixed(1)}% of marked today`
    : 'No pickup marks today';
  const attendanceCards = [
    {
      label: 'Total Students',
      value: kpis?.students?.value ?? (loading ? '…' : 0),
      hint: kpis?.students?.delta ? deltaHint(kpis.students.delta, compareHint) : 'Active directory',
      hintClass: hintClass(kpis?.students?.delta),
      tint: 'violet',
    },
    {
      label: 'Avg. Attendance Rate',
      value: rateLabel(att?.avgRate),
      hint: att?.avgRateDelta ? deltaHint(att.avgRateDelta, compareHint) : 'Daily present / marked',
      hintClass: hintClass(att?.avgRateDelta),
      tint: 'green',
    },
    {
      label: 'Present Today',
      value: att?.todayPresent ?? (loading ? '…' : 0),
      hint: todayHint,
      tint: 'purple',
    },
    {
      label: 'Absent Today',
      value: att?.todayAbsent ?? (loading ? '…' : 0),
      hint: att?.todayMarked ? `${att.todayAbsent} not picked up` : 'No pickup marks today',
      tint: 'rose',
    },
    { label: 'Students Late Today', value: '—', hint: 'Late is not tracked', tint: 'orange' },
    {
      label: 'Attendance This Period',
      value: rateLabel(att?.periodRate),
      hint: att?.periodRateDelta ? deltaHint(att.periodRateDelta, compareHint) : 'Present / marked in range',
      hintClass: hintClass(att?.periodRateDelta),
      tint: 'sky',
    },
  ];
  const safetyCards = [
    {
      label: 'Total Incidents',
      value: safety?.total ?? (loading ? '…' : 0),
      hint: safety?.totalDelta ? deltaHint(safety.totalDelta, compareHint) : compareHint,
      hintClass: hintClass(safety?.totalDelta, true),
      tint: 'rose',
    },
    {
      label: 'Accidents',
      value: safety?.accidents ?? (loading ? '…' : 0),
      hint: safety?.accidentDelta ? deltaHint(safety.accidentDelta, compareHint) : compareHint,
      hintClass: hintClass(safety?.accidentDelta, true),
      tint: 'orange',
    },
    { label: 'Policy Violations', value: '—', hint: 'Not tracked', tint: 'purple' },
    { label: 'Safety Score', value: '—', hint: 'Not tracked', tint: 'sky' },
    { label: 'Compliance Rate', value: '—', hint: 'Not tracked', tint: 'green' },
    { label: 'Pending Actions', value: '—', hint: 'Not tracked', tint: 'orange' },
  ];
  const fleetCards = [
    { label: 'Total Fuel Consumed', value: '—', hint: 'Litres not tracked', tint: 'purple' },
    { label: 'Total Fuel Cost', value: '—', hint: 'Not tracked', tint: 'green' },
    { label: 'CO2 Emissions Avoided', value: '—', hint: 'Not tracked', tint: 'violet' },
    { label: 'Maintenance Cost', value: '—', hint: 'Not tracked', tint: 'rose' },
    { label: 'Cost per KM', value: '—', hint: 'Not tracked', tint: 'orange' },
  ];
  const overviewCards = [
    {
      label: 'Total Trips',
      value: kpis?.trips?.value ?? (loading ? '…' : 0),
      hint: kpis?.trips?.delta ? deltaHint(kpis.trips.delta, compareHint) : compareHint,
      hintClass: hintClass(kpis?.trips?.delta),
      tint: 'purple',
    },
    {
      label: 'Total Students',
      value: kpis?.students?.value ?? (loading ? '…' : 0),
      hint: kpis?.students?.delta ? deltaHint(kpis.students.delta, compareHint) : 'Active directory',
      hintClass: hintClass(kpis?.students?.delta),
      tint: 'violet',
    },
    {
      label: 'On-time Performance',
      value: '—',
      hint: 'Not tracked',
      tint: 'green',
    },
    {
      label: 'Incidents',
      value: kpis?.incidents?.value ?? (loading ? '…' : 0),
      hint: kpis?.incidents?.delta ? deltaHint(kpis.incidents.delta, compareHint) : compareHint,
      hintClass: hintClass(kpis?.incidents?.delta, true),
      tint: 'rose',
    },
    {
      label: 'Total Distance',
      value: '—',
      hint: 'Not tracked',
      tint: 'sky',
    },
  ];
  const cards =
    reportType === 'fleet'
      ? fleetCards
      : reportType === 'safety'
        ? safetyCards
        : reportType === 'attendance'
          ? attendanceCards
          : overviewCards;

  return (
    <div className="sa-students sa-reports">
      {error && <div className="alert">{error}</div>}

      <div className="sa-reports-actions">
        <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowSchedule(true)}>
          Schedule Report
        </button>
        <button type="button" className="sa-btn sa-btn-primary" onClick={exportCsv} disabled={!data}>
          Export Report
        </button>
      </div>

      <section className="sa-card sa-reports-filters">
        <select value={reportType} onChange={(e) => setReportType(e.target.value)} aria-label="Report type">
          <option value="overview">Overview</option>
          <option value="fleet">Fleet Performance</option>
          <option value="safety">Safety & Compliance</option>
          <option value="attendance">Student Attendance</option>
          <option value="trips">Trips</option>
          <option value="students">Students</option>
          <option value="drivers">Drivers</option>
          <option value="incidents">Incidents</option>
        </select>
        <label className="sa-reports-dates">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="sa-reports-dates">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <select value={compare} onChange={(e) => setCompare(e.target.value)} aria-label="Compare with">
          <option value="previous_month">Previous Month</option>
          <option value="none">No comparison</option>
        </select>
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)} aria-label="Route">
          <option value="">All Routes</option>
          {routes.map((r) => (
            <option key={r._id || r.id} value={r._id || r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select value={busId} onChange={(e) => setBusId(e.target.value)} aria-label="Vehicle">
          <option value="">All Vehicles</option>
          {buses.map((b) => (
            <option key={b._id || b.id} value={b._id || b.id}>
              {b.label || b.plate || 'Bus'}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="sa-btn sa-btn-outline"
          onClick={() => setApplied({ from, to, compare, routeId, busId, grade })}
        >
          Apply Filters
        </button>
      </section>
      {reportType === 'attendance' && (
        <div className="sa-card sa-reports-extra">
          <select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade">
            <option value="">All Grades</option>
            {(data?.attendance?.gradesFilter || []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select value={attType} onChange={(e) => setAttType(e.target.value)} aria-label="Attendance type">
            <option value="">All pickup marks</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
          </select>
          <button
            type="button"
            className="sa-btn sa-btn-outline"
            onClick={() => setApplied({ from, to, compare, routeId, busId, grade })}
          >
            Apply Filters
          </button>
        </div>
      )}

      <section
        className={`sa-stu-kpis sa-reports-kpis${
          reportType === 'fleet'
            ? ' is-fleet sa-tch-kpis'
            : reportType === 'safety'
              ? ' is-safety'
              : reportType === 'attendance'
                ? ' is-attendance'
                : ' sa-tch-kpis'
        }`}
        aria-label="Report metrics"
      >
        {cards.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em className={m.hintClass || ''}>{m.hint}</em>
            </div>
            <i className="sa-stu-kpi-icon" aria-hidden="true" />
          </article>
        ))}
      </section>

      {show('fleet') && (
        <section className="sa-reports-fleet">
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Fuel Consumption Trend (Liters)</h3>
              <Link to="/school-admin/buses" className="sa-text-link">
                View Fuel Report
              </Link>
            </div>
            <p className="sa-muted">Fuel litres are not tracked, so this month vs previous month cannot be charted.</p>
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Vehicles by trips</h3>
              <Link to="/school-admin/buses" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Trips</th>
                    <th>Liters</th>
                    <th>Fuel Cost</th>
                    <th>KM</th>
                    <th>L/100km</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedVehicles.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.label || 'Vehicle'}</strong>
                        <small className="sa-stu-phone">{v.plate || '—'}</small>
                      </td>
                      <td>{v.trips}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                    </tr>
                  ))}
                  {!pagedVehicles.length && (
                    <tr>
                      <td colSpan={6} className="sa-stu-empty">
                        No vehicles in this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {vehiclePages > 1 && (
              <div className="sa-stu-foot">
                <button type="button" className="sa-btn sa-btn-outline" disabled={page <= 1} onClick={() => setVehiclePage((p) => p - 1)}>
                  Previous
                </button>
                <span>
                  {page} / {vehiclePages}
                </span>
                <button type="button" className="sa-btn sa-btn-outline" disabled={page >= vehiclePages} onClick={() => setVehiclePage((p) => p + 1)}>
                  Next
                </button>
              </div>
            )}
            <p className="sa-muted">Litres, fuel cost, and distance are not tracked. Sorted by trip count.</p>
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Maintenance Cost Breakdown (KES)</h3>
              <Link to="/school-admin/buses" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <p className="sa-muted">Maintenance costs by category are not stored.</p>
            {fleet?.maintenanceCount ? (
              <p className="sa-muted">{fleet.maintenanceCount} vehicle{fleet.maintenanceCount === 1 ? '' : 's'} marked under maintenance.</p>
            ) : null}
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Fleet Utilization</h3>
              <Link to="/school-admin/trip-instances" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            {fleet?.utilizationPct != null ? (
              <>
                <UtilizationGauge value={fleet.utilizationPct} />
                <p className="sa-trips-gauge">
                  <strong>{fleet.utilizationPct}%</strong>
                  <span>
                    {fleet.usedVehicles} of {fleet.totalVehicles} vehicles had a trip
                  </span>
                </p>
              </>
            ) : (
              <p className="sa-muted">No vehicles in the fleet.</p>
            )}
            <ul className="sa-reports-util-list">
              <li>
                <span>Total Distance</span>
                <strong>—</strong>
                <small>Not tracked</small>
              </li>
              <li>
                <span>Total Trips</span>
                <strong>{fleet?.trips ?? 0}</strong>
                <small className={hintClass(fleet?.tripsDelta)}>
                  {fleet?.tripsDelta ? deltaHint(fleet.tripsDelta, compareHint) : compareHint}
                </small>
              </li>
              <li>
                <span>Total Engine Hours</span>
                <strong>—</strong>
                <small>Not tracked</small>
              </li>
            </ul>
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Cost Summary (KES)</h3>
              <Link to="/school-admin/buses" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>This period</th>
                    <th>Previous month</th>
                    <th>% Change</th>
                  </tr>
                </thead>
                <tbody>
                  {['Fuel Cost', 'Maintenance Cost', 'Other Costs', 'Total Cost'].map((row) => (
                    <tr key={row}>
                      <td>{row}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sa-muted">Running costs are not stored.</p>
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Environmental Impact</h3>
              <Link to="/school-admin/reports" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <ul className="sa-reports-env">
              <li>
                <span>CO2 Emissions Avoided</span>
                <strong>—</strong>
              </li>
              <li>
                <span>Trees Equivalent</span>
                <strong>—</strong>
              </li>
              <li>
                <span>Fuel Saved</span>
                <strong>—</strong>
              </li>
            </ul>
            <p className="sa-muted">CO2 and fuel savings are not calculated because fuel use is not tracked.</p>
          </article>
        </section>
      )}

      {show('safety') && (
        <section className="sa-reports-safety">
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Incidents Trend</h3>
              <Link to="/school-admin/incidents" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            {safety?.trend?.length && safety.total ? (
              <>
                <MultiLineChart
                  points={safety.trend}
                  series={[
                    { key: 'total', color: '#e11d48' },
                    { key: 'accident', color: '#f97316' },
                    { key: 'other', color: '#5d3fd3' },
                  ]}
                  ariaLabel="Incidents over time"
                />
                <ul className="sa-rd-legend">
                  <li><i style={{ background: '#e11d48' }} /> Total</li>
                  <li><i style={{ background: '#f97316' }} /> Accidents</li>
                  <li><i style={{ background: '#5d3fd3' }} /> Other reports</li>
                </ul>
              </>
            ) : (
              <p className="sa-muted">No incident reports in this date range.</p>
            )}
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Incidents by Severity</h3>
              <Link to="/school-admin/incidents" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            {safety?.total ? (
              <div className="sa-stops-donut-wrap">
                <div className="sa-live-donut-ring">
                  <div
                    className="sa-stops-donut"
                    style={donutStyle(
                      [
                        { count: safety.bySeverity?.high || 0, color: SEVERITY_DONUT.high },
                        { count: safety.bySeverity?.medium || 0, color: SEVERITY_DONUT.medium },
                        { count: safety.bySeverity?.low || 0, color: SEVERITY_DONUT.low },
                      ],
                      safety.total
                    )}
                  />
                  <div className="sa-live-donut-center">
                    <strong>{safety.total}</strong>
                    <span>Incidents</span>
                  </div>
                </div>
                <ul className="sa-stops-donut-key">
                  <li><i style={{ background: SEVERITY_DONUT.high }} /> High <strong>{safety.bySeverity?.high || 0}</strong></li>
                  <li><i style={{ background: SEVERITY_DONUT.medium }} /> Medium <strong>{safety.bySeverity?.medium || 0}</strong></li>
                  <li><i style={{ background: SEVERITY_DONUT.low }} /> Low <strong>{safety.bySeverity?.low || 0}</strong></li>
                </ul>
              </div>
            ) : (
              <p className="sa-muted">No incident reports in this date range.</p>
            )}
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Top Incident Locations</h3>
              <Link to="/school-admin/stops" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            {safety?.locations?.length ? (
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Count</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safety.locations.map((loc) => (
                      <tr key={loc.name}>
                        <td>{loc.name}</td>
                        <td>{loc.count}</td>
                        <td>{loc.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="sa-muted">Incident locations are only shown when a next stop or GPS point was saved.</p>
            )}
          </article>
          <article className="sa-card sa-reports-span2">
            <div className="sa-rd-card-head">
              <h3>Incident Details</h3>
              <Link to="/school-admin/incidents" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Trip</th>
                    <th>Date &amp; Time</th>
                    <th>Type</th>
                    <th>Location</th>
                    <th>Severity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedIncidents.map((r) => {
                    const sev = severityMeta(r.severity);
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link to={`/school-admin/trip-instances`}>{r.tripCode || 'Trip'}</Link>
                          <small className="sa-stu-phone">{r.routeName || r.busLabel || '—'}</small>
                        </td>
                        <td>{fmtDateTime(r.at)}</td>
                        <td>{r.label}</td>
                        <td>{r.location || '—'}</td>
                        <td><span className={`sa-stu-status is-${sev.key}`}>{sev.label}</span></td>
                        <td>—</td>
                      </tr>
                    );
                  })}
                  {!pagedIncidents.length && (
                    <tr>
                      <td colSpan={6} className="sa-stu-empty">
                        No incident reports in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {incidentPages > 1 && (
              <div className="sa-stu-foot">
                <button type="button" className="sa-btn sa-btn-outline" disabled={incidentPageSafe <= 1} onClick={() => setIncidentPage((p) => p - 1)}>
                  Previous
                </button>
                <span>
                  {incidentPageSafe} / {incidentPages}
                </span>
                <button type="button" className="sa-btn sa-btn-outline" disabled={incidentPageSafe >= incidentPages} onClick={() => setIncidentPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            )}
            <p className="sa-muted">Incident status (open / closed) is not stored.</p>
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Compliance Checklist</h3>
              <Link to="/school-admin/buses" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <p className="sa-muted">Vehicle inspection, first-aid, and other checklist items are not stored.</p>
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Safety Score Trend</h3>
              <Link to="/school-admin/incidents" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <p className="sa-muted">A safety score is not calculated.</p>
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Driver Safety</h3>
              <Link to="/school-admin/drivers" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Safety score</th>
                    <th>Incidents</th>
                    <th>High severity</th>
                  </tr>
                </thead>
                <tbody>
                  {(safety?.drivers || []).map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="sa-reports-driver">
                          {d.photoUrl ? <img src={d.photoUrl} alt="" /> : <span>{initials(d.name)}</span>}
                          <strong>{d.name}</strong>
                        </div>
                      </td>
                      <td>—</td>
                      <td>{d.incidents}</td>
                      <td>{d.high}</td>
                    </tr>
                  ))}
                  {!safety?.drivers?.length && (
                    <tr>
                      <td colSpan={4} className="sa-stu-empty">
                        No driver incident reports in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="sa-muted">Safety scores are not stored. Sorted by incident count.</p>
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Corrective Actions</h3>
              <Link to="/school-admin/incidents" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <p className="sa-muted">Corrective actions and due dates are not stored.</p>
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Recommendations</h3>
              <Link to="/school-admin/incidents" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <p className="sa-muted">Recommendations are not generated from this data.</p>
          </article>
        </section>
      )}

      {show('attendance') && (
        <section className="sa-reports-attend">
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Daily Attendance Overview</h3>
              <Link to="/school-admin/students" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            {att?.markedTotal ? (
              <>
                <MultiLineChart
                  points={att.trend}
                  series={[
                    { key: 'present', color: ATTEND_DONUT.present },
                    { key: 'absent', color: ATTEND_DONUT.absent },
                  ]}
                  ariaLabel="Daily present and absent pickup marks"
                />
                <ul className="sa-rd-legend">
                  <li><i style={{ background: ATTEND_DONUT.present }} /> Present</li>
                  <li><i style={{ background: ATTEND_DONUT.absent }} /> Absent</li>
                </ul>
              </>
            ) : (
              <p className="sa-muted">No pickup or not-picked-up marks in this date range.</p>
            )}
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Attendance by Grade</h3>
              <Link to="/school-admin/students" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            {att?.grades?.length ? (
              <div className="sa-stops-donut-wrap">
                <div className="sa-live-donut-ring">
                  <div
                    className="sa-stops-donut"
                    style={donutStyle(
                      att.grades.map((g, i) => ({
                        count: g.present,
                        color: ['#5d3fd3', '#0ea5e9', '#16a34a', '#f97316', '#e11d48', '#14b8a6'][i % 6],
                      })),
                      att.grades.reduce((s, g) => s + g.present, 0) || 1
                    )}
                  />
                  <div className="sa-live-donut-center">
                    <strong>{rateLabel(att.periodRate)}</strong>
                    <span>Period</span>
                  </div>
                </div>
                <ul className="sa-stops-donut-key">
                  {att.grades.map((g) => (
                    <li key={g.name}>
                      {g.name}
                      <strong>{g.rate != null ? `${g.rate}%` : '—'}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="sa-muted">No graded pickup marks in this date range.</p>
            )}
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Attendance by Route</h3>
              <Link to="/school-admin/routes" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            {att?.routes?.length ? (
              <ul className="sa-trips-bars">
                {att.routes.map((r) => (
                  <li key={r.name}>
                    <span>{r.name}</span>
                    <i style={{ width: `${Math.max(8, r.rate || 0)}%` }} />
                    <strong>{r.rate != null ? `${r.rate}%` : '—'}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sa-muted">No route pickup marks in this date range.</p>
            )}
          </article>
          <article className="sa-card sa-reports-span2">
            <div className="sa-rd-card-head">
              <h3>Attendance List ({fmtDay(att?.focusDay)})</h3>
              <Link to="/school-admin/students" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            {attType === 'late' ? (
              <p className="sa-muted">Late pickup is not tracked.</p>
            ) : (
              <>
                <div className="sa-table-wrap">
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>Student ID</th>
                        <th>Student</th>
                        <th>Grade</th>
                        <th>Route</th>
                        <th>Status</th>
                        <th>Pickup Time</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {pagedAttend.map((r) => {
                        const st = attendStatus(r.status);
                        return (
                          <tr key={r.id}>
                            <td>{r.admissionNo || '—'}</td>
                            <td>
                              <div className="sa-reports-driver">
                                {r.photoUrl ? <img src={r.photoUrl} alt="" /> : <span>{initials(r.name)}</span>}
                                <strong>{r.name}</strong>
                              </div>
                            </td>
                            <td>{r.grade || '—'}</td>
                            <td>{r.routeName || '—'}</td>
                            <td><span className={`sa-stu-status is-${st.key}`}>{st.label}</span></td>
                            <td>{fmtTimeOnly(r.pickupAt)}</td>
                            <td>
                              <button type="button" className="sa-text-link" onClick={() => navigate(`/school-admin/students/${r.id}`)}>
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {!pagedAttend.length && (
                        <tr>
                          <td colSpan={7} className="sa-stu-empty">
                            No pickup marks on {fmtDay(att?.focusDay) || 'this day'}.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="sa-stu-foot">
                  <span>
                    Showing {attendRows.length ? (attendPageSafe - 1) * attendPageSize + 1 : 0} to{' '}
                    {Math.min(attendPageSafe * attendPageSize, attendRows.length)} of {attendRows.length} marked students
                  </span>
                  <label className="sa-stu-pagesize">
                    Rows
                    <select value={attendPageSize} onChange={(e) => setAttendPageSize(Number(e.target.value))}>
                      {PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  {attendPages > 1 && (
                    <div className="sa-pager">
                      <button type="button" disabled={attendPageSafe <= 1} onClick={() => setAttendPage((p) => p - 1)}>
                        Previous
                      </button>
                      {pageItems(attendPageSafe, attendPages).map((item, i) =>
                        item === '…' ? (
                          <span key={`e${i}`}>…</span>
                        ) : (
                          <button
                            type="button"
                            key={item}
                            className={item === attendPageSafe ? 'is-current' : ''}
                            onClick={() => setAttendPage(item)}
                          >
                            {item}
                          </button>
                        )
                      )}
                      <button type="button" disabled={attendPageSafe >= attendPages} onClick={() => setAttendPage((p) => p + 1)}>
                        Next
                      </button>
                    </div>
                  )}
                </div>
                <p className="sa-muted">Shows transport pickup marks for the selected day. Unmarked students are omitted, not counted absent.</p>
              </>
            )}
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Attendance Summary</h3>
            </div>
            {att?.todayMarked ? (
              <div className="sa-stops-donut-wrap">
                <div className="sa-live-donut-ring">
                  <div
                    className="sa-stops-donut"
                    style={donutStyle(
                      [
                        { count: att.todayPresent, color: ATTEND_DONUT.present },
                        { count: att.todayAbsent, color: ATTEND_DONUT.absent },
                      ],
                      att.todayMarked
                    )}
                  />
                  <div className="sa-live-donut-center">
                    <strong>{att.todayMarked}</strong>
                    <span>Today</span>
                  </div>
                </div>
                <ul className="sa-stops-donut-key">
                  <li><i style={{ background: ATTEND_DONUT.present }} /> Present <strong>{att.todayPresent}</strong></li>
                  <li><i style={{ background: ATTEND_DONUT.absent }} /> Absent <strong>{att.todayAbsent}</strong></li>
                  <li><i style={{ background: ATTEND_DONUT.late }} /> Late <strong>—</strong></li>
                </ul>
              </div>
            ) : (
              <p className="sa-muted">No pickup marks today.</p>
            )}
            <ul className="sa-reports-env">
              <li>
                <span>Best attendance day</span>
                <strong>{att?.bestDay ? `${fmtDay(att.bestDay.day)} (${att.bestDay.rate}%)` : '—'}</strong>
              </li>
              <li>
                <span>Lowest attendance day</span>
                <strong>{att?.worstDay ? `${fmtDay(att.worstDay.day)} (${att.worstDay.rate}%)` : '—'}</strong>
              </li>
              <li>
                <span>Average pickup time</span>
                <strong>{fmtMinutes(att?.avgPickupMinutes)}</strong>
              </li>
            </ul>
            <p className="sa-muted">Rates use pickup vs not-picked-up marks only. Late is not stored.</p>
          </article>
        </section>
      )}

      {show('trips') && (
        <section className="sa-reports-top">
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Trip Overview</h3>
              <Link to="/school-admin/trip-instances" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            {data?.tripOverview?.length ? (
              <>
                <MultiLineChart
                  points={data.tripOverview}
                  series={[
                    { key: 'completed', color: '#16a34a' },
                    { key: 'active', color: '#f97316' },
                    { key: 'cancelled', color: '#e11d48' },
                  ]}
                  ariaLabel="Trips by status"
                />
                <ul className="sa-rd-legend">
                  <li><i style={{ background: '#16a34a' }} /> Completed</li>
                  <li><i style={{ background: '#f97316' }} /> In Progress</li>
                  <li><i style={{ background: '#e11d48' }} /> Cancelled</li>
                </ul>
              </>
            ) : (
              <p className="sa-muted">No trips in this date range.</p>
            )}
          </article>
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Route Performance</h3>
              <Link to="/school-admin/routes" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Trips</th>
                    <th>On-time</th>
                    <th>Avg delay</th>
                    <th>Students</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {routeRows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                        <small className="sa-stu-phone">{r.path || '—'}</small>
                      </td>
                      <td>{r.trips}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>{r.students}</td>
                      <td><Spark values={r.spark} /></td>
                    </tr>
                  ))}
                  {!routeRows.length && (
                    <tr>
                      <td colSpan={6} className="sa-stu-empty">
                        No route trips in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="sa-muted">On-time % and delay minutes are not stored.</p>
          </article>
        </section>
      )}

      {(show('students') || show('overview')) && (
      <section className="sa-reports-mid">
        {show('students') && (
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Student Transport Summary</h3>
              <Link to="/school-admin/students" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            {studentTotal ? (
              <div className="sa-stops-donut-wrap">
                <div className="sa-live-donut-ring">
                  <div className="sa-stops-donut" style={donutStyle(studentDonut, studentTotal)} />
                  <div className="sa-live-donut-center">
                    <strong>{studentTotal}</strong>
                    <span>Students</span>
                  </div>
                </div>
                <ul className="sa-stops-donut-key">
                  {studentDonut.map((item) => (
                    <li key={item.key}>
                      <i style={{ background: item.color }} />
                      {item.label}
                      <strong>{item.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="sa-muted">No students in the directory.</p>
            )}
          </article>
        )}
        {show('overview') && (
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Time Performance</h3>
              <Link to="/school-admin/trip-instances" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <p className="sa-muted">On-time and delay bands are not stored.</p>
          </article>
        )}
        {show('overview') && (
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Distance Summary</h3>
              <Link to="/school-admin/trip-instances" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <p className="sa-muted">Trip distance is not tracked.</p>
          </article>
        )}
      </section>
      )}

      {(show('drivers') || show('incidents') || show('overview')) && (
      <section className="sa-reports-bottom">
        {show('drivers') && (
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Drivers by trips</h3>
              <Link to="/school-admin/drivers" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>On-time</th>
                    <th>Trips</th>
                    <th>Students</th>
                  </tr>
                </thead>
                <tbody>
                  {driverRows.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="sa-reports-driver">
                          {d.photoUrl ? <img src={d.photoUrl} alt="" /> : <span>{initials(d.name)}</span>}
                          <strong>{d.name}</strong>
                        </div>
                      </td>
                      <td>—</td>
                      <td>{d.trips}</td>
                      <td>{d.students}</td>
                    </tr>
                  ))}
                  {!driverRows.length && (
                    <tr>
                      <td colSpan={4} className="sa-stu-empty">
                        No driver trips in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="sa-muted">On-time % is not stored. Sorted by trip count.</p>
          </article>
        )}
        {show('incidents') && (
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Incidents Summary</h3>
              <Link to="/school-admin/incidents" className="sa-text-link">
                View Full Report
              </Link>
            </div>
            {data?.incidents?.length ? (
              <ul className="sa-trips-bars">
                {data.incidents.map((i) => (
                  <li key={i.type}>
                    <span>{i.label}</span>
                    <i style={{ width: `${Math.max(8, (i.count / Math.max(...data.incidents.map((x) => x.count), 1)) * 100)}%` }} />
                    <strong>{i.count}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sa-muted">No incident reports in this date range.</p>
            )}
          </article>
        )}
        {show('overview') && (
          <article className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Report Schedule</h3>
              <button type="button" className="sa-text-link" onClick={() => setShowSchedule(true)}>
                View Full Report
              </button>
            </div>
            <p className="sa-muted">Automated report schedules are not stored yet.</p>
          </article>
        )}
      </section>
      )}

      {showSchedule && (
        <div className="sa-reports-modal" role="dialog" aria-labelledby="sa-schedule-title">
          <div className="sa-card">
            <h3 id="sa-schedule-title">Schedule Report</h3>
            <p className="sa-muted">Report scheduling is not stored yet. Export a CSV for the current filters instead.</p>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowSchedule(false)}>
                Close
              </button>
              <button type="button" className="sa-btn sa-btn-primary" onClick={exportCsv} disabled={!data}>
                Export Report
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="sa-home-foot">
        <span>© {year} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
