import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function campusRefId(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
}

export default function CampusSelect({
  value,
  onChange,
  campuses,
  allowEmpty = true,
  label = 'Campus',
  emptyLabel = 'Unassigned',
}) {
  const [own, setOwn] = useState([]);

  useEffect(() => {
    if (campuses) return undefined;
    let live = true;
    api('/admin/campuses')
      .then((data) => {
        if (live) setOwn(data.campuses || []);
      })
      .catch(() => {
        if (live) setOwn([]);
      });
    return () => {
      live = false;
    };
  }, [campuses]);

  const list = campuses || own;

  return (
    <label className="sa-field">
      <span>{label}</span>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {list.map((c) => (
          <option key={c.id || c._id} value={c.id || c._id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
