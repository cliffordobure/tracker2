import { useEffect, useMemo, useRef, useState } from 'react';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function parseTime(value) {
  const [h = '06', m = '30'] = String(value || '06:30').split(':');
  return {
    hour: String(h).padStart(2, '0').slice(0, 2),
    minute: String(m).padStart(2, '0').slice(0, 2),
  };
}

function labelTime(value) {
  const { hour, minute } = parseTime(value);
  const n = Number(hour);
  const suffix = n >= 12 ? 'PM' : 'AM';
  const h12 = n % 12 || 12;
  return `${h12}:${minute} ${suffix}`;
}

export default function TimeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const parsed = parseTime(value);
  const minutes = useMemo(() => {
    if (MINUTES.includes(parsed.minute)) return MINUTES;
    return [...MINUTES, parsed.minute].sort((a, b) => Number(a) - Number(b));
  }, [parsed.minute]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="sa-time-select" ref={box}>
      <button
        type="button"
        className={`sa-time-select-btn${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{labelTime(value)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="sa-time-select-pop" role="dialog" aria-label="Set time">
          <div className="sa-time-select-row">
            <label className="sa-field">
              <span>Hour</span>
              <select value={parsed.hour} onChange={(e) => onChange(`${e.target.value}:${parsed.minute}`)}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="sa-field">
              <span>Minute</span>
              <select value={parsed.minute} onChange={(e) => onChange(`${parsed.hour}:${e.target.value}`)}>
                {minutes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="sa-btn sa-btn-primary sa-time-select-done" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}
