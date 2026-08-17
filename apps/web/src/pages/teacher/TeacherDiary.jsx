import { useEffect, useMemo, useState } from 'react';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const LABELS = [
  { value: 'general', label: 'General' },
  { value: 'class', label: 'Class' },
  { value: 'activity', label: 'Activity' },
  { value: 'meal', label: 'Meal' },
  { value: 'academic', label: 'Academic' },
  { value: 'health', label: 'Health' },
];

function ymd(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function emptyForm(date) {
  return {
    title: '',
    body: '',
    label: 'class',
    grade: '',
    kidIds: [],
    media: [],
    date: date || ymd(new Date()),
  };
}

export default function TeacherDiary() {
  const { showToast } = useAuth();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => ymd(new Date()));
  const [entries, setEntries] = useState([]);
  const [dates, setDates] = useState([]);
  const [kids, setKids] = useState([]);
  const [grades, setGrades] = useState([]);
  const [form, setForm] = useState(() => emptyForm());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = async (month = monthKey(cursor), date = selected) => {
    const [d, k] = await Promise.all([
      api(`/teacher/diary?month=${month}&date=${date}`),
      api('/teacher/kids'),
    ]);
    setEntries(d.entries || []);
    setDates(d.dates || []);
    setKids(k.kids || []);
    setGrades(k.grades || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shiftMonth = async (delta) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    setCursor(next);
    try {
      await load(monthKey(next), selected);
    } catch (e) {
      setError(e.message);
    }
  };

  const pickDay = async (day) => {
    setSelected(day);
    setForm((f) => ({ ...f, date: day }));
    setCursor(new Date(`${day}T00:00:00`));
    try {
      await load(monthKey(new Date(`${day}T00:00:00`)), day);
    } catch (e) {
      setError(e.message);
    }
  };

  const addPhotos = async (files) => {
    const remaining = 8 - form.media.length;
    const batch = [...files].slice(0, remaining);
    if (!batch.length) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of batch) {
        uploaded.push(await uploadFile(file, { folder: 'diary' }));
      }
      setForm((f) => ({ ...f, media: [...f.media, ...uploaded] }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/teacher/diary', { method: 'POST', body: form });
      setForm(emptyForm(selected));
      showToast('Diary posted. Parents can see the photos and update.', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Remove this diary entry?')) return;
    try {
      await api(`/teacher/diary/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const calendarDays = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const pad = start.getDay();
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < pad; i += 1) cells.push(null);
    for (let d = 1; d <= last; d += 1) {
      cells.push(ymd(new Date(cursor.getFullYear(), cursor.getMonth(), d)));
    }
    return cells;
  }, [cursor]);

  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const selectedEntries = entries.filter((e) => ymd(e.date) === selected);
  const open = selectedEntries.find((e) => e._id === openId) || selectedEntries[0] || null;

  return (
    <div className="diary-layout">
      <div className="stack">
        <div>
          <h2>Class diary</h2>
          <p className="lede">
            Post the day’s story with photos of the children. Parents of the tagged class or
            students see it in their diary.
          </p>
        </div>
        {error && <div className="alert">{error}</div>}

        <div className="diary-cal card-form">
          <div className="diary-cal-head">
            <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(-1)}>
              ‹
            </button>
            <strong>{monthLabel}</strong>
            <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(1)}>
              ›
            </button>
          </div>
          <div className="diary-cal-grid diary-cal-dow">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="diary-cal-grid">
            {calendarDays.map((day, i) =>
              day ? (
                <button
                  key={day}
                  type="button"
                  className={[
                    'diary-day',
                    day === selected ? 'is-selected' : '',
                    dates.includes(day) ? 'has-entry' : '',
                    day === ymd(new Date()) ? 'is-today' : '',
                  ].join(' ')}
                  onClick={() => pickDay(day)}
                >
                  {Number(day.slice(-2))}
                </button>
              ) : (
                <span key={`pad-${i}`} />
              )
            )}
          </div>
        </div>

        <div className="stack">
          {selectedEntries.map((e) => (
            <article
              key={e._id}
              className={`diary-card ${open?._id === e._id ? 'is-open' : ''}`}
              onClick={() => setOpenId(e._id)}
            >
              {e.media?.[0]?.url ? (
                <img src={e.media[0].url} alt="" className="diary-cover" />
              ) : null}
              <div className="diary-card-body">
                <span className="pill">{e.label || 'general'}</span>
                <h3>{e.title}</h3>
                {e.body ? <p>{e.body}</p> : null}
                {e.media?.length > 1 ? (
                  <div className="diary-thumbs">
                    {e.media.slice(1, 5).map((m) => (
                      <img key={m.publicId || m.url} src={m.url} alt="" />
                    ))}
                    {e.media.length > 5 ? <span className="diary-more">+{e.media.length - 5}</span> : null}
                  </div>
                ) : null}
                <small>
                  {e.grade || (e.kidIds?.length ? e.kidIds.map((k) => k.name).join(', ') : 'Whole school')}
                  {' · '}
                  {e.teacherId?.name || 'You'}
                </small>
                <button type="button" className="btn btn-ghost" onClick={() => remove(e._id)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
          {!selectedEntries.length && (
            <p className="muted">No diary posts on this day yet. Use the form to add one.</p>
          )}
        </div>
      </div>

      <form className="card-form" onSubmit={submit}>
        <h3>Write today’s diary</h3>
        <label>
          Date
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label>
          Title
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Lunch time / Art class / Playground"
          />
        </label>
        <label>
          Story
          <textarea
            rows={5}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="What happened, and who was involved…"
          />
        </label>
        <label>
          Label
          <select value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}>
            {LABELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Class / grade
          <select
            value={form.grade}
            onChange={(e) => setForm({ ...form, grade: e.target.value, kidIds: [] })}
          >
            <option value="">Whole school (or pick students below)</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="diary-kids">
          <legend>Tag specific children (optional)</legend>
          <p className="hint">Leave empty to share with the whole class or school above.</p>
          {(form.grade ? kids.filter((k) => k.grade === form.grade) : kids).map((k) => {
            const on = form.kidIds.includes(k._id);
            return (
              <label key={k._id} className="diary-kid-row">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    setForm((f) => ({
                      ...f,
                      kidIds: on ? f.kidIds.filter((id) => id !== k._id) : [...f.kidIds, k._id],
                    }));
                  }}
                />
                {k.name}
                {k.grade ? ` · ${k.grade}` : ''}
              </label>
            );
          })}
        </fieldset>
        <div className="media-picker">
          <span className="media-picker-label">Photos of the kids</span>
          <div className="diary-thumbs">
            {form.media.map((m) => (
              <button
                type="button"
                key={m.publicId || m.url}
                className="diary-thumb-wrap"
                onClick={() => setForm((f) => ({ ...f, media: f.media.filter((x) => x.url !== m.url) }))}
                title="Remove"
              >
                <img src={m.url} alt="" />
              </button>
            ))}
          </div>
          <label className="btn btn-secondary">
            {uploading ? 'Uploading…' : form.media.length ? 'Add more photos' : 'Upload photos'}
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={uploading || form.media.length >= 8}
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <p className="hint">Up to 8 photos. They are stored on Cloudinary and shown to parents.</p>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || uploading}>
          {busy ? 'Posting…' : 'Post to parent diary'}
        </button>
      </form>
    </div>
  );
}
