import { useMemo, useState } from 'react';

const OPTIONS = [
  { id: 'class', label: 'One class', hint: 'Every student in one class' },
  { id: 'individuals', label: 'Specific students', hint: 'Only the students you pick' },
  { id: 'all', label: 'Everyone', hint: 'Every student in the school' },
];

function kidIdOf(k) {
  return k?._id || k?.id || '';
}

function kidName(kids, id) {
  const match = kids.find((k) => kidIdOf(k) === id);
  return match?.name || 'Student';
}

export default function AudiencePicker({
  audience,
  onAudienceChange,
  grade,
  onGradeChange,
  grades = [],
  kids = [],
  kidIds = [],
  onKidIdsChange,
}) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return kids.filter((k) => {
      if (grade && k.grade !== grade) return false;
      if (!q) return true;
      return `${k.name || ''} ${k.grade || ''} ${k.admissionNo || ''}`.toLowerCase().includes(q);
    });
  }, [kids, grade, query]);

  const toggle = (id) => {
    onKidIdsChange(kidIds.includes(id) ? kidIds.filter((x) => x !== id) : [...kidIds, id]);
  };

  return (
    <div className="audience-picker">
      <p className="audience-picker-label">Who should receive this?</p>
      <div className="audience-picker-cards">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`audience-picker-card${audience === opt.id ? ' is-on' : ''}`}
            onClick={() => {
              onAudienceChange(opt.id);
              if (opt.id === 'all') {
                onGradeChange('');
                onKidIdsChange([]);
              } else if (opt.id === 'class') {
                onKidIdsChange([]);
              }
            }}
          >
            <strong>{opt.label}</strong>
            <span>{opt.hint}</span>
          </button>
        ))}
      </div>
      {audience !== 'all' && (
        <label className="audience-picker-field">
          {audience === 'individuals' ? 'Class filter (optional)' : 'Class'}
          <select
            value={grade}
            onChange={(e) => {
              onGradeChange(e.target.value);
              if (audience === 'individuals') onKidIdsChange([]);
            }}
          >
            <option value="">{audience === 'individuals' ? 'All classes' : 'Select class'}</option>
            {grades.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
      )}
      {audience === 'individuals' && (
        <div className="audience-picker-students">
          <div className="audience-picker-tools">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or class"
            />
            <button
              type="button"
              className="tw-btn tw-btn-ghost"
              onClick={() => onKidIdsChange([...new Set([...kidIds, ...visible.map(kidIdOf)])])}
            >
              Select visible
            </button>
            {kidIds.length > 0 && (
              <button type="button" className="tw-btn tw-btn-ghost" onClick={() => onKidIdsChange([])}>
                Clear
              </button>
            )}
          </div>
          <p className="audience-picker-count">
            {kidIds.length ? `${kidIds.length} student${kidIds.length === 1 ? '' : 's'} selected` : 'Pick at least one student'}
          </p>
          {kidIds.length > 0 && (
            <div className="audience-picker-chips">
              {kidIds.map((id) => (
                <button key={id} type="button" className="audience-chip" onClick={() => toggle(id)}>
                  {kidName(kids, id)} ×
                </button>
              ))}
            </div>
          )}
          <div className="audience-picker-list">
            {visible.map((k) => {
              const id = kidIdOf(k);
              const on = kidIds.includes(id);
              return (
                <label key={id} className={`audience-kid${on ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(id)} />
                  <span className="audience-kid-photo" aria-hidden>
                    {k.photoUrl ? <img src={k.photoUrl} alt="" /> : (k.name || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <b>{k.name || 'Student'}</b>
                    <small>{[k.grade, k.admissionNo].filter(Boolean).join(' · ')}</small>
                  </span>
                </label>
              );
            })}
            {!visible.length && <p className="tw-empty">No students match that search.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
