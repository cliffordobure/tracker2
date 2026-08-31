export function formatKes(value) {
  const n = Number(value) || 0;
  return `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatWhen(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function pct(part, total) {
  if (!total) return '0.0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

export function StatusDot({ status }) {
  const s = String(status || 'active');
  return (
    <span className={`pa-status pa-status--${s}`}>
      <i />
      {s.replace('_', ' ')}
    </span>
  );
}

export function PlanBadge({ plan }) {
  const p = String(plan || 'standard');
  return <span className={`pa-plan pa-plan--${p}`}>{p}</span>;
}

export function PageFoot({ name = 'Track Toto' }) {
  return (
    <footer className="sa-home-foot">
      <span>© {new Date().getFullYear()} {name}</span>
      <span>Transport Management System v1.0.0</span>
    </footer>
  );
}

export function Empty({ children }) {
  return <p className="sa-home-empty">{children}</p>;
}
