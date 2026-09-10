import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';

function mondayOf(value) {
  const d = value ? new Date(`${value}T00:00:00`) : new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftWeek(week, delta) {
  const d = new Date(`${week}T00:00:00`);
  d.setDate(d.getDate() + delta * 7);
  return mondayOf(d.toISOString().slice(0, 10));
}

function prettyDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function prettyRange(start, end) {
  const a = start instanceof Date ? start : new Date(start);
  const b = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  const left = a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const right = b.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${left} – ${right}`;
}

const iconProps = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Icon({ name }) {
  switch (name) {
    case 'cal':
      return (
        <svg {...iconProps}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
      );
    case 'book':
      return (
        <svg {...iconProps}>
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Z" />
          <path d="M8 4v16" />
        </svg>
      );
    case 'flask':
      return (
        <svg {...iconProps}>
          <path d="M9 3h6M10 3v5l-4.5 8.5A2.5 2.5 0 0 0 7.7 21h8.6a2.5 2.5 0 0 0 2.2-4.5L14 8V3" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c2.5 2.8 2.5 13.2 0 16M12 4c-2.5 2.8-2.5 13.2 0 16" />
        </svg>
      );
    case 'run':
      return (
        <svg {...iconProps}>
          <circle cx="14" cy="6" r="2" />
          <path d="M8 21l3-6 3 2 2-4 3 1M6 14l4-1 2-3" />
        </svg>
      );
    case 'pc':
      return (
        <svg {...iconProps}>
          <rect x="4" y="5" width="16" height="11" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </svg>
      );
    case 'art':
      return (
        <svg {...iconProps}>
          <path d="M12 4a8 8 0 1 0 0 16 2.2 2.2 0 0 0 0-4.4 2.2 2.2 0 0 1 0-4.4A8 8 0 0 0 12 4Z" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...iconProps}>
          <path d="M6 17h12l-1.2-2.2V10a4.8 4.8 0 0 0-9.6 0v4.8L6 17Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'people':
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 18c.6-3 2.6-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
        </svg>
      );
    case 'cup':
      return (
        <svg {...iconProps}>
          <path d="M6 8h10v5a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V8Z" />
          <path d="M16 9h2a2 2 0 0 1 0 4h-2" />
        </svg>
      );
    case 'print':
      return (
        <svg {...iconProps}>
          <path d="M7 8V4h10v4M7 16H5a2 2 0 0 1-2-2v-4h18v4a2 2 0 0 1-2 2h-2" />
          <rect x="7" y="14" width="10" height="6" rx="1" />
        </svg>
      );
    case 'download':
      return (
        <svg {...iconProps}>
          <path d="M12 4v10M8 10l4 4 4-4M5 19h14" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.4 6.4l1.4 1.4M16.2 16.2l1.4 1.4M17.6 6.4l-1.4 1.4M7.8 16.2l-1.4 1.4" />
        </svg>
      );
    default:
      return (
        <svg {...iconProps}>
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Z" />
        </svg>
      );
  }
}

function subjectMeta(subject, kind) {
  const s = String(subject || '').toLowerCase();
  if (kind === 'break' || s.includes('break')) return { tone: 'break', icon: 'cup' };
  if (kind === 'lunch' || s.includes('lunch')) return { tone: 'lunch', icon: 'cup' };
  if (s.includes('math')) return { tone: 'blue', icon: 'book' };
  if (s.includes('english')) return { tone: 'sky', icon: 'book' };
  if (s.includes('science')) return { tone: 'violet', icon: 'flask' };
  if (s.includes('kiswahili')) return { tone: 'amber', icon: 'bell' };
  if (s.includes('social')) return { tone: 'mint', icon: 'globe' };
  if (s.includes('p.e') || s === 'pe' || s.includes('physical')) return { tone: 'teal', icon: 'run' };
  if (s.includes('computer')) return { tone: 'rose', icon: 'pc' };
  if (s.includes('art') || s.includes('craft')) return { tone: 'pink', icon: 'art' };
  if (s.includes('library')) return { tone: 'gold', icon: 'book' };
  if (s.includes('club')) return { tone: 'green', icon: 'people' };
  if (s.includes('guidance') || s.includes('counsel')) return { tone: 'leaf', icon: 'people' };
  return { tone: 'slate', icon: 'book' };
}

export default function TeacherTimetable() {
  const [params, setParams] = useSearchParams();
  const [week, setWeek] = useState(params.get('week') || mondayOf());
  const [grade, setGrade] = useState(params.get('grade') || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const load = async (nextWeek = week, nextGrade = grade) => {
    const qs = new URLSearchParams({ week: nextWeek });
    if (nextGrade) qs.set('grade', nextGrade);
    const res = await api(`/teacher/timetable?${qs}`);
    setData(res);
    if (!nextGrade && res.grade) setGrade(res.grade);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = async (nextWeek, nextGrade) => {
    setWeek(nextWeek);
    setGrade(nextGrade);
    setParams({ week: nextWeek, grade: nextGrade }, { replace: true });
    try {
      await load(nextWeek, nextGrade);
    } catch (e) {
      setError(e.message);
    }
  };

  const query = (params.get('q') || '').trim().toLowerCase();
  const days = data?.days || [];
  const periods = data?.periods || [];
  const notes = data?.notes?.length
    ? data.notes
    : [
        'Timetable is subject to change. Any updates will be communicated.',
        'Please ensure you arrive in class 5 minutes before each period.',
      ];

  const weekLabel = useMemo(() => {
    if (data?.weekStart && data?.weekEnd) return prettyRange(data.weekStart, data.weekEnd);
    const end = new Date(`${week}T00:00:00`);
    end.setDate(end.getDate() + 4);
    return prettyRange(week, end);
  }, [data, week]);

  const printGrid = () => window.print();

  return (
    <div className="ttime">
      <div className="ttime-head">
        <div>
          <p className="tw-kicker">Teacher / Timetable</p>
          <h2>Class Timetable</h2>
          <p>Weekly class timetable. Open register or class details from here.</p>
        </div>
        <div className="ttime-art" aria-hidden="true">
          <div className="ttime-art-copy">
            <strong>Plan today</strong>
            <span>Inspire tomorrow</span>
          </div>
          <em>📅 📚 ⏰ 🌿</em>
          <small>“A well organized day leads to a brighter tomorrow.”</small>
        </div>
      </div>

      {error && <div className="tw-alert">{error}</div>}

      <div className="ttime-toolbar">
        <div className="ttime-week">
          <button type="button" onClick={() => apply(shiftWeek(week, -1), grade)}>‹ Previous week</button>
          <strong><Icon name="cal" /> {weekLabel}</strong>
          <button type="button" onClick={() => apply(shiftWeek(week, 1), grade)}>Next week ›</button>
        </div>
        <label className="ttime-class">
          Class
          <select value={grade} onChange={(e) => apply(week, e.target.value)}>
            {(data?.grades || []).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <Link className="ttime-btn ttime-btn--teal" to={`/teacher/register?grade=${encodeURIComponent(grade)}`}>
          <Icon name="book" /> Open register
        </Link>
        <Link className="ttime-btn ttime-btn--mint" to={`/teacher/class?grade=${encodeURIComponent(grade)}`}>
          <Icon name="people" /> Class details
        </Link>
      </div>

      <section className="ttime-card">
        <div className="ttime-card-head">
          <h3><Icon name="cal" /> {data?.term?.name || 'Academic term'}</h3>
          <div className="ttime-tools">
            <button type="button" onClick={printGrid}><Icon name="print" /> Print</button>
            <button type="button" onClick={printGrid}><Icon name="download" /> Export PDF</button>
            <button type="button" onClick={() => setShowSettings((v) => !v)}><Icon name="gear" /> Settings</button>
          </div>
        </div>
        {showSettings && (
          <div className="ttime-settings">
            <p>Class room: <strong>{data?.classroom || 'Room 12'}</strong></p>
            <Link to={`/teacher/class?grade=${encodeURIComponent(grade)}`}>Edit class details</Link>
          </div>
        )}
        <div className="ttime-wrap">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                {days.map((d) => (
                  <th key={d.day}>
                    {d.day}
                    <small>{prettyDay(d.date || d.label)}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((period, i) => {
                const rest = days.every((d) => {
                  const slot = d.slots?.[i];
                  const kind = slot?.kind || period.kind;
                  return kind === 'break' || kind === 'lunch';
                });
                return (
                  <tr key={`${period.startTime}-${i}`} className={rest ? 'is-gap' : ''}>
                    <td>
                      <strong>{period.periodLabel || period.startTime}</strong>
                      <small>{period.startTime} – {period.endTime}</small>
                    </td>
                    {days.map((d) => {
                      const slot = d.slots?.[i];
                      if (!slot || slot.empty) {
                        return <td key={`${d.day}-${i}`} className="is-empty">—</td>;
                      }
                      const meta = subjectMeta(slot.subject, slot.kind);
                      const hit = query && String(slot.subject || '').toLowerCase().includes(query);
                      return (
                        <td key={`${d.day}-${i}`}>
                          <div className={`ttime-cell is-${meta.tone}${hit ? ' is-hit' : ''}`}>
                            <Icon name={meta.icon} />
                            <div>
                              <strong>{slot.subject}</strong>
                              {slot.kind !== 'break' && slot.kind !== 'lunch' ? (
                                <small>{slot.room || data.classroom}</small>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!periods.length && (
                <tr>
                  <td colSpan={6} className="tw-muted">No timetable periods for this class.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ttime-notes">
        <div>
          <h3>Notes</h3>
          <ul>
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
        <blockquote>“Good teaching creates brighter futures.”</blockquote>
      </section>
    </div>
  );
}
