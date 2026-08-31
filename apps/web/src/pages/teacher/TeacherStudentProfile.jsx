import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const TABS = ['Overview', 'Attendance', 'Performance', 'Assignments', 'Notes'];

export default function TeacherStudentProfile() {
  const { id } = useParams();
  const { showToast } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [range, setRange] = useState('term');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState({ name: '', about: '', admissionNo: '', gender: '', dateOfBirth: '' });
  const [score, setScore] = useState({ subject: '', title: 'Assessment', kind: 'academic', score: '' });

  const load = async (nextRange = range) => {
    const res = await api(`/teacher/kids/${id}/profile?range=${nextRange}`);
    setData(res);
    const kid = res.kid || {};
    setEdit({
      name: kid.name || '',
      about: kid.about || '',
      admissionNo: kid.admissionNo || '',
      gender: kid.gender || '',
      dateOfBirth: kid.dateOfBirth ? String(kid.dateOfBirth).slice(0, 10) : '',
    });
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const kid = data?.kid || {};

  const saveKid = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/teacher/kids/${id}`, { method: 'PUT', body: edit });
      showToast('Student updated', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await uploadFile(file, { folder: 'kids' });
      await api(`/teacher/kids/${id}`, {
        method: 'PUT',
        body: { photoUrl: uploaded.url, photoPublicId: uploaded.publicId },
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addScore = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/teacher/kids/${id}/assessments`, {
        method: 'POST',
        body: { ...score, score: Number(score.score) },
      });
      setScore({ subject: '', title: 'Assessment', kind: 'academic', score: '' });
      showToast('Score recorded', 'success');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data && !error) return <p className="tw-muted">Loading student…</p>;

  return (
    <div className="tw-page">
      {error && <div className="tw-alert">{error}</div>}
      <div className="tw-panel tw-profile-head">
        <div className="tw-student">
          {kid.photoUrl ? <img src={kid.photoUrl} alt="" /> : <span className="tw-avatar">{(kid.name || '?')[0]}</span>}
          <div>
            <h2>{kid.name}</h2>
            <p className="tw-muted">
              {[kid.grade, kid.admissionNo, data.todayStatus].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="tw-inline-actions">
          <label className="tw-btn tw-btn-secondary">
            Change photo
            <input type="file" accept="image/*" hidden onChange={(e) => changePhoto(e.target.files?.[0])} />
          </label>
          <Link className="tw-btn tw-btn-primary" to={`/teacher/notes?kidId=${id}`}>
            Message parent
          </Link>
        </div>
      </div>

      <div className="tw-tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`tw-tab ${tab === t ? 'is-on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <form className="tw-form" onSubmit={saveKid}>
          <h3>Student details</h3>
          <label>
            Name
            <input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </label>
          <label>
            Admission no.
            <input value={edit.admissionNo} onChange={(e) => setEdit({ ...edit, admissionNo: e.target.value })} />
          </label>
          <label>
            Gender
            <select value={edit.gender} onChange={(e) => setEdit({ ...edit, gender: e.target.value })}>
              <option value="">Not set</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Date of birth
            <input type="date" value={edit.dateOfBirth} onChange={(e) => setEdit({ ...edit, dateOfBirth: e.target.value })} />
          </label>
          <label>
            About
            <textarea rows={4} value={edit.about} onChange={(e) => setEdit({ ...edit, about: e.target.value })} />
          </label>
          <button className="tw-btn tw-btn-primary" disabled={busy}>
            Save profile
          </button>
        </form>
      )}

      {tab === 'Attendance' && (
        <div className="tw-page">
          <div className="tw-toolbar">
            <label>
              Range
              <select
                value={range}
                onChange={(e) => {
                  setRange(e.target.value);
                  load(e.target.value).catch((err) => setError(err.message));
                }}
              >
                <option value="term">This term</option>
                <option value="month">This month</option>
                <option value="year">This year</option>
              </select>
            </label>
          </div>
          <div className="tw-metrics tw-metrics-4">
            <div className="tw-metric is-present">
              <span>Present</span>
              <strong>{data.attendance?.present ?? 0}</strong>
            </div>
            <div className="tw-metric is-away">
              <span>Absent</span>
              <strong>{data.attendance?.absent ?? 0}</strong>
            </div>
            <div className="tw-metric">
              <span>Late</span>
              <strong>{data.attendance?.late ?? 0}</strong>
            </div>
            <div className="tw-metric">
              <span>Present %</span>
              <strong>{data.attendance?.presentPct ?? 0}%</strong>
            </div>
          </div>
        </div>
      )}

      {tab === 'Performance' && (
        <div className="tw-split">
          <div className="tw-panel">
            <h3>Subjects</h3>
            <p className="tw-muted">
              Overall {data.performance?.overallAverage ?? 0} · {data.performance?.overallGrade || '—'}
            </p>
            <ul className="tw-list">
              {(data.performance?.subjects || []).map((s) => (
                <li key={s.subject}>
                  <strong>{s.subject}</strong>
                  <span>
                    {s.average} · {s.grade}
                  </span>
                </li>
              ))}
              {!data.performance?.subjects?.length && <p className="tw-empty">No scores in this range.</p>}
            </ul>
          </div>
          <form className="tw-form" onSubmit={addScore}>
            <h3>Add assessment</h3>
            <label>
              Subject
              <input required value={score.subject} onChange={(e) => setScore({ ...score, subject: e.target.value })} />
            </label>
            <label>
              Title
              <input value={score.title} onChange={(e) => setScore({ ...score, title: e.target.value })} />
            </label>
            <label>
              Kind
              <select value={score.kind} onChange={(e) => setScore({ ...score, kind: e.target.value })}>
                <option value="academic">Academic</option>
                <option value="behaviour">Behaviour</option>
                <option value="skill">Skill</option>
              </select>
            </label>
            <label>
              Score (0–100)
              <input
                required
                type="number"
                min="0"
                max="100"
                value={score.score}
                onChange={(e) => setScore({ ...score, score: e.target.value })}
              />
            </label>
            <button className="tw-btn tw-btn-primary" disabled={busy}>
              Save score
            </button>
          </form>
        </div>
      )}

      {tab === 'Assignments' && (
        <ul className="tw-list">
          {(data.assignments || []).map((a) => (
            <li key={a._id}>
              <div>
                <strong>{a.title}</strong>
                <div className="tw-muted">
                  {a.subject || 'Class'}
                  {a.dueDate ? ` · due ${new Date(a.dueDate).toLocaleDateString()}` : ''}
                </div>
              </div>
            </li>
          ))}
          {!data.assignments?.length && <p className="tw-empty">No assignments for this student.</p>}
        </ul>
      )}

      {tab === 'Notes' && (
        <div className="tw-page">
          {(data.notes || []).map((n) => (
            <article key={n._id} className="tw-note">
              <span className="tw-pill">{n.category}</span>
              <strong>{n.title}</strong>
              <p className="tw-lede" style={{ margin: 0 }}>
                {n.body}
              </p>
            </article>
          ))}
          {!data.notes?.length && <p className="tw-empty">No parent notes yet.</p>}
          <Link className="tw-btn tw-btn-primary" to={`/teacher/notes?kidId=${id}`}>
            Write a note
          </Link>
        </div>
      )}
    </div>
  );
}
