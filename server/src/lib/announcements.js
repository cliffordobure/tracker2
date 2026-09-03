export function normalizeAnnouncementGrade(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function announcementGradesOf(row = {}) {
  const list = [...(Array.isArray(row.grades) ? row.grades : []), row.grade];
  return [...new Set(list.map(normalizeAnnouncementGrade).filter(Boolean))];
}

export function parseAnnouncementGrades(body = {}) {
  const raw = body.grades ?? body.grade ?? [];
  const list = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(',')
        .map((part) => part.trim());
  return [...new Set(list.map(normalizeAnnouncementGrade).filter(Boolean))];
}

export function announcementAudienceLabel(scope, grades = []) {
  if (scope === 'class' && grades.length) {
    if (grades.length === 1) return grades[0];
    if (grades.length <= 3) return grades.join(', ');
    return `${grades.length} classes`;
  }
  return 'All Teachers, Parents & Students';
}

export function kidAudienceKeys(kid = {}) {
  const grade = normalizeAnnouncementGrade(kid.grade);
  const section = normalizeAnnouncementGrade(kid.section);
  const combined = [grade, section].filter(Boolean).join(' ');
  return [...new Set([grade, combined].filter(Boolean))];
}

export function audienceKeysFromKids(kids = []) {
  return [...new Set((kids || []).flatMap((kid) => kidAudienceKeys(kid)))];
}

export function announcementIsClassTargeted(row = {}) {
  return row.scope === 'class' || announcementGradesOf(row).length > 0;
}

export function audienceKeysMatch(keys = [], targets = []) {
  const allowed = new Set((keys || []).map(normalizeAnnouncementGrade).filter(Boolean));
  return (targets || []).some((grade) => allowed.has(normalizeAnnouncementGrade(grade)));
}

function schoolWideAnnouncementClause() {
  return {
    $and: [
      { scope: { $ne: 'class' } },
      { $or: [{ grades: { $exists: false } }, { grades: { $size: 0 } }, { grades: null }] },
      { $or: [{ grade: { $exists: false } }, { grade: '' }, { grade: null }] },
    ],
  };
}

export function classAnnouncementVisibleOr(grades = []) {
  const allowed = [...new Set((grades || []).map(normalizeAnnouncementGrade).filter(Boolean))];
  const clauses = [schoolWideAnnouncementClause()];
  if (allowed.length) {
    clauses.push({ grade: { $in: allowed } }, { grades: { $in: allowed } });
  }
  return clauses;
}

export function announcementVisibleToGrades(row, grades = []) {
  if (!row) return false;
  const targets = announcementGradesOf(row);
  if (!announcementIsClassTargeted(row) || !targets.length) {
    return row.scope !== 'class';
  }
  return audienceKeysMatch(grades, targets);
}
