import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  HANDOVER_DATE,
  HANDOVER_SECTIONS,
  HANDOVER_SUBTITLE,
  HANDOVER_TITLE,
  HANDOVER_VERSION,
  QA_ROWS,
} from '../../lib/handoverQa';

const STORAGE_KEY = 'schoolkids-handover-qa-v1';

function loadAnswers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAnswers(next) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDocument({ schoolName, tester, answers }) {
  const rows = QA_ROWS.map((r) => {
    const a = answers[r.id] || {};
    return `<tr>
      <td>${escapeHtml(r.id)}</td>
      <td>${escapeHtml(r.area)}</td>
      <td>${escapeHtml(r.test)}</td>
      <td>${escapeHtml(r.where)}</td>
      <td>${escapeHtml(r.procedure)}</td>
      <td class="dev">${escapeHtml(r.developer)}</td>
      <td class="qa">${escapeHtml(a.qa || '')}</td>
      <td>${escapeHtml(a.comment || r.note || '')}</td>
    </tr>`;
  }).join('');

  const sections = HANDOVER_SECTIONS.map(
    (s) => `<h2>${escapeHtml(s.heading)}</h2><p>${escapeHtml(s.body)}</p>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(HANDOVER_TITLE)} — QA Test Paper</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #0f172a; margin: 32px; }
    h1 { color: #5d3fd3; margin-bottom: 0.2rem; }
    .meta { color: #475569; margin-bottom: 1.5rem; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
    th { background: #5d3fd3; color: #fff; text-align: left; }
    td.dev { font-weight: 700; }
    .yes { color: #15803d; }
    .sign { margin-top: 2rem; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .line { border-top: 1px solid #94a3b8; margin-top: 40px; padding-top: 6px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(HANDOVER_TITLE)}</h1>
  <p class="meta">${escapeHtml(HANDOVER_SUBTITLE)}<br/>
  Version ${escapeHtml(HANDOVER_VERSION)} · ${escapeHtml(HANDOVER_DATE)}<br/>
  School: ${escapeHtml(schoolName || '—')} · QA tester: ${escapeHtml(tester || '—')}</p>
  ${sections}
  <h2>QA test paper</h2>
  <p>Developer column is pre-filled for items known to work in this build. Procedure says whether to use Web admin or the mobile app. QA marks Yes (or No) after testing and adds a comment.</p>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Area</th>
        <th>Test</th>
        <th>Where</th>
        <th>Procedure</th>
        <th>Developer</th>
        <th>QA</th>
        <th>Comment</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sign">
    <div class="line">QA engineer name / date / Yes</div>
    <div class="line">School admin sign-off / date</div>
  </div>
</body>
</html>`;
}

function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HandoverQA() {
  const { user } = useAuth();
  const [answers, setAnswers] = useState(loadAnswers);
  const [tester, setTester] = useState('');
  const [filter, setFilter] = useState('all');

  const visible = useMemo(() => {
    if (filter === 'yes') return QA_ROWS.filter((r) => r.developer === 'Yes');
    if (filter === 'open') return QA_ROWS.filter((r) => r.developer !== 'Yes');
    if (filter === 'web') return QA_ROWS.filter((r) => /web/i.test(r.where) && !/mobile/i.test(r.where));
    if (filter === 'mobile') return QA_ROWS.filter((r) => /mobile/i.test(r.where));
    return QA_ROWS;
  }, [filter]);

  const counts = useMemo(() => {
    const yes = QA_ROWS.filter((r) => r.developer === 'Yes').length;
    const qaYes = QA_ROWS.filter((r) => (answers[r.id]?.qa || '').toLowerCase() === 'yes').length;
    return { total: QA_ROWS.length, yes, qaYes };
  }, [answers]);

  function patch(id, field, value) {
    setAnswers((prev) => {
      const next = { ...prev, [id]: { ...(prev[id] || {}), [field]: value } };
      saveAnswers(next);
      return next;
    });
  }

  function onDownload() {
    const html = buildDocument({
      schoolName: user?.schoolName || user?.school?.name,
      tester,
      answers,
    });
    downloadHtml(html, 'School_Bus_Tracking_Steps_1-52_QA_Test_Paper.html');
  }

  return (
    <div className="sa-qa">
      <header className="sa-qa-hero">
        <div>
          <p className="sa-qa-kicker">{HANDOVER_VERSION} · {HANDOVER_DATE}</p>
          <h2>{HANDOVER_TITLE}</h2>
          <p>{HANDOVER_SUBTITLE}</p>
          <p className="sa-qa-counts">
            Developer Yes: <strong>{counts.yes}</strong> / {counts.total}
            {' · '}
            QA Yes saved: <strong>{counts.qaYes}</strong>
          </p>
        </div>
        <div className="sa-qa-actions">
          <label>
            QA tester
            <input value={tester} onChange={(e) => setTester(e.target.value)} placeholder="Your name" />
          </label>
          <button type="button" className="sa-btn sa-btn-primary" onClick={onDownload}>
            Download test paper
          </button>
          <button type="button" className="sa-btn sa-btn-outline" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </header>

      <div className="sa-qa-brief">
        {HANDOVER_SECTIONS.map((s) => (
          <article key={s.heading}>
            <h3>{s.heading}</h3>
            <p>{s.body}</p>
          </article>
        ))}
      </div>

      <div className="sa-qa-toolbar">
        <span>Test paper</span>
        <div className="sa-tabs">
          {[
            { id: 'all', label: 'All items' },
            { id: 'web', label: 'Web admin' },
            { id: 'mobile', label: 'Mobile app' },
            { id: 'yes', label: 'Developer Yes' },
            { id: 'open', label: 'Needs QA / gaps' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={`sa-tab${filter === t.id ? ' is-active' : ''}`}
              onClick={() => setFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sa-qa-table-wrap">
        <table className="sa-qa-table">
          <thead>
            <tr>
              <th>Area</th>
              <th>Test</th>
              <th>Where</th>
              <th>Procedure</th>
              <th>Developer</th>
              <th>QA</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const a = answers[r.id] || {};
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.area}</strong>
                    <small>{r.id}</small>
                  </td>
                  <td>
                    {r.test}
                    {r.note ? <small className="sa-qa-note">{r.note}</small> : null}
                  </td>
                  <td>
                    <span className="sa-qa-where">{r.where}</span>
                  </td>
                  <td className="sa-qa-proc">{r.procedure}</td>
                  <td>
                    <span className={`sa-qa-pill is-${r.developer.toLowerCase()}`}>{r.developer}</span>
                  </td>
                  <td>
                    <select
                      value={a.qa || ''}
                      onChange={(e) => patch(r.id, 'qa', e.target.value)}
                      aria-label={`QA result for ${r.id}`}
                    >
                      <option value="">—</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                      <option value="Blocked">Blocked</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={a.comment ?? ''}
                      onChange={(e) => patch(r.id, 'comment', e.target.value)}
                      placeholder={r.note || 'QA comment'}
                      aria-label={`Comment for ${r.id}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
