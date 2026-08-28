import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import {
  HANDOVER_DATE,
  HANDOVER_SECTIONS,
  HANDOVER_SUBTITLE,
  HANDOVER_TITLE,
  HANDOVER_VERSION,
  QA_ROWS,
} from '../src/lib/handoverQa.js';

const root = dirname(fileURLToPath(import.meta.url));
const outPath = join(root, '../public/handover.html');
const docxPath = join(root, '../public/handover.docx');
const DOCX_FILENAME = 'School-Bus-Tracker-Handover.docx';

const PURPLE = '5D3FD3';
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pill(dev) {
  const cls = String(dev || '').toLowerCase();
  return `<span class="pill ${esc(cls)}">${esc(dev)}</span>`;
}

const yes = QA_ROWS.filter((r) => r.developer === 'Yes').length;
const partial = QA_ROWS.filter((r) => r.developer === 'Partial').length;
const no = QA_ROWS.filter((r) => r.developer === 'No').length;
const gaps = QA_ROWS.filter((r) => r.developer !== 'Yes');

const sections = HANDOVER_SECTIONS.map(
  (s) => `<h2>${esc(s.heading)}</h2><p>${esc(s.body)}</p>`
).join('\n');

const gapRows = gaps
  .map(
    (r) => `<tr>
      <td>${esc(r.id)}</td>
      <td>${esc(r.area)}</td>
      <td>${esc(r.test)}</td>
      <td>${pill(r.developer)}</td>
      <td>${esc(r.note || r.procedure)}</td>
    </tr>`
  )
  .join('\n');

const qaRows = QA_ROWS.map(
  (r) => `<tr>
    <td>${esc(r.id)}</td>
    <td>${esc(r.area)}</td>
    <td>${esc(r.test)}${r.note ? `<div class="note-inline">${esc(r.note)}</div>` : ''}</td>
    <td>${esc(r.where)}</td>
    <td>${esc(r.procedure)}</td>
    <td>${pill(r.developer)}</td>
    <td></td>
    <td></td>
  </tr>`
).join('\n');

function docCell(text, { header = false, bold = false, size = 16 } = {}) {
  return new TableCell({
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.TOP,
    shading: header ? { fill: PURPLE, type: ShadingType.CLEAR } : undefined,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: String(text ?? ''),
            bold: header || bold,
            color: header ? 'FFFFFF' : undefined,
            size,
          }),
        ],
      }),
    ],
  });
}

function docTable(headers, rows, cellSize = 14) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map((h) => docCell(h, { header: true, size: 15 })) }),
      ...rows.map((cells) => new TableRow({ children: cells.map((c) => docCell(c, { size: cellSize })) })),
    ],
  });
}

function docHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, color: PURPLE, size: 26 })],
  });
}

function docBody(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 20 })],
  });
}

async function writeDocx() {
  const gapTableRows = gaps.map((r) => [
    r.id,
    r.area,
    r.test,
    r.developer,
    r.note || r.procedure || '',
  ]);
  const qaTableRows = QA_ROWS.map((r) => [
    r.id,
    r.area,
    `${r.test}${r.note ? `\n${r.note}` : ''}`,
    r.where,
    r.procedure,
    r.developer,
    '',
    '',
  ]);

  const doc = new Document({
    creator: 'SchoolKids Tracker',
    title: `${HANDOVER_TITLE} — Handover & QA`,
    description: HANDOVER_SUBTITLE,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: HANDOVER_TITLE, bold: true, color: PURPLE, size: 40 })],
          }),
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new TextRun({ text: HANDOVER_SUBTITLE, size: 22, color: '64748B' }),
            ],
          }),
          docBody(
            `${HANDOVER_VERSION} · ${HANDOVER_DATE}\nSuper Admin login: admin@schooltracker.test / password123`
          ),
          new Paragraph({
            spacing: { before: 120, after: 200 },
            children: [
              new TextRun({ text: `${QA_ROWS.length} checks`, bold: true, size: 22 }),
              new TextRun({ text: `  ·  ${yes} Developer Yes  ·  ${partial} Partial  ·  ${no} Not in build`, size: 22 }),
            ],
          }),
          ...HANDOVER_SECTIONS.flatMap((s) => [docHeading(s.heading), docBody(s.body)]),
          docHeading('Remaining gaps'),
          docBody('Only these items are not Developer Yes. QA should still re-test the Yes rows.'),
          docTable(['ID', 'Area', 'Item', 'Dev', 'Note'], gapTableRows),
          docHeading('QA test paper'),
          docBody(
            'Developer column is pre-filled for this build. QA marks Yes / No / Blocked after testing and writes a comment.'
          ),
          docTable(
            ['ID', 'Area', 'Test', 'Where', 'Procedure', 'Developer', 'QA', 'Comment'],
            qaTableRows,
            12
          ),
          new Paragraph({ spacing: { before: 360 } }),
          new Paragraph({
            children: [
              new TextRun({ text: 'QA engineer name / date / sign-off', size: 20 }),
              new TextRun({ text: '\t\t\t\tSchool / platform admin sign-off / date', size: 20 }),
            ],
          }),
          new Paragraph({
            spacing: { before: 280 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `SchoolKids Tracker · Transport Management System ${HANDOVER_VERSION} · ${HANDOVER_DATE}`,
                size: 16,
                color: '64748B',
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await writeFile(docxPath, buffer);
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(HANDOVER_TITLE)} — Handover &amp; QA</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: auto !important;
      overflow: visible !important;
      background: #fff;
      color: #0f172a;
      font-family: "Segoe UI", Calibri, Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
    }
    .sheet { max-width: 210mm; margin: 0 auto; padding: 16px 18px 32px; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 10px 18px;
    }
    .toolbar button, .toolbar a.btn {
      background: #5d3fd3;
      color: #fff;
      border: 0;
      border-radius: 8px;
      padding: 8px 14px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      font-size: inherit;
      display: inline-block;
    }
    .toolbar a.btn.secondary {
      background: #fff;
      color: #5d3fd3;
      border: 1px solid #c4b5fd;
    }
    .toolbar span { color: #64748b; font-size: 9.5pt; }
    h1 { font-size: 20pt; margin: 0 0 4px; color: #5d3fd3; }
    h2 {
      font-size: 13pt;
      margin: 22px 0 8px;
      padding-bottom: 4px;
      border-bottom: 2px solid #5d3fd3;
      page-break-after: avoid;
      break-after: avoid;
    }
    p { margin: 0 0 10px; }
    .meta { color: #64748b; font-size: 9.5pt; margin-bottom: 14px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 16px; }
    .kpi { border: 1px solid #e2e8f0; padding: 10px 12px; background: #f8fafc; }
    .kpi strong { display: block; font-size: 18pt; }
    .kpi span { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
    .kpi.yes strong { color: #15803d; }
    .kpi.partial strong { color: #b45309; }
    .kpi.no strong { color: #b91c1c; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
      font-size: 8pt;
      margin: 0 0 12px;
      page-break-inside: auto;
      break-inside: auto;
    }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr {
      page-break-inside: auto;
      break-inside: auto;
      page-break-after: auto;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 6px;
      vertical-align: top;
      text-align: left;
      page-break-inside: auto;
      break-inside: auto;
    }
    th { background: #5d3fd3; color: #fff; font-weight: 700; }
    .pill {
      display: inline-block;
      font-size: 7.5pt;
      font-weight: 800;
      text-transform: uppercase;
      padding: 1px 6px;
      border-radius: 999px;
    }
    .pill.yes { background: #dcfce7; color: #166534; }
    .pill.partial { background: #fef3c7; color: #92400e; }
    .pill.no { background: #fee2e2; color: #991b1b; }
    .note-inline { color: #64748b; margin-top: 4px; font-size: 7.5pt; }
    .sign { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; page-break-inside: avoid; }
    .line { border-top: 1px solid #94a3b8; margin-top: 36px; padding-top: 6px; font-size: 9pt; color: #475569; }
    .footer { margin-top: 18px; font-size: 8pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    @media print {
      .toolbar { display: none !important; }
      html, body, .sheet {
        height: auto !important;
        overflow: visible !important;
        max-width: none;
        margin: 0;
        padding: 0;
        background: #fff;
      }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" onclick="window.print()">Print / Save PDF</button>
    <a class="btn secondary" href="/handover.docx" download="${esc(DOCX_FILENAME)}">Download Word (.docx)</a>
    <span>Word download opens in Microsoft Word or Google Docs. Use Print for PDF.</span>
  </div>
  <div class="sheet">
    <h1>${esc(HANDOVER_TITLE)}</h1>
    <p class="meta">${esc(HANDOVER_SUBTITLE)}<br/>
    ${esc(HANDOVER_VERSION)} · ${esc(HANDOVER_DATE)} · Public file: <code>/handover.html</code><br/>
    Super Admin login: admin@schooltracker.test / password123 (not shown on the dashboard mockup)</p>

    <div class="kpis">
      <div class="kpi"><strong>${QA_ROWS.length}</strong><span>Checks in this paper</span></div>
      <div class="kpi yes"><strong>${yes}</strong><span>Developer Yes</span></div>
      <div class="kpi partial"><strong>${partial}</strong><span>Partial</span></div>
      <div class="kpi no"><strong>${no}</strong><span>Not in this build</span></div>
    </div>

    ${sections}

    <h2>Remaining gaps</h2>
    <p>Only these items are not Developer Yes. QA should still re-test the Yes rows.</p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Area</th>
          <th>Item</th>
          <th>Dev</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        ${gapRows}
      </tbody>
    </table>

    <h2>QA test paper</h2>
    <p>Developer column is pre-filled for this build. QA marks Yes / No / Blocked after testing and writes a comment. Procedure says whether to use Super Admin, School Admin web, or the mobile app.</p>
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
      <tbody>
        ${qaRows}
      </tbody>
    </table>

    <div class="sign">
      <div class="line">QA engineer name / date / sign-off</div>
      <div class="line">School / platform admin sign-off / date</div>
    </div>
    <p class="footer">SchoolKids Tracker · Transport Management System ${esc(HANDOVER_VERSION)} · ${esc(HANDOVER_DATE)} · ${QA_ROWS.length} checks (${yes} Yes, ${partial} Partial, ${no} No)</p>
  </div>
</body>
</html>
`;

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, html, 'utf8');
await writeDocx();
console.log(`Wrote ${outPath} (${QA_ROWS.length} rows)`);
console.log(`Wrote ${docxPath}`);
