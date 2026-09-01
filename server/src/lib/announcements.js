export function announcementGradesOf(row = {}) {
  const list = [...(Array.isArray(row.grades) ? row.grades : []), row.grade];
  return [...new Set(list.map((g) => String(g || '').trim()).filter(Boolean))];
}

export function parseAnnouncementGrades(body = {}) {
  const raw = body.grades ?? body.grade ?? [];
  const list = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(',')
        .map((part) => part.trim());
  return [...new Set(list.map((g) => String(g || '').trim()).filter(Boolean))];
}

export function announcementAudienceLabel(scope, grades = []) {
  if (scope === 'class' && grades.length) {
    if (grades.length === 1) return grades[0];
    if (grades.length <= 3) return grades.join(', ');
    return `${grades.length} classes`;
  }
  return 'All Teachers, Parents & Students';
}

export function classAnnouncementVisibleOr(grades = []) {
  return [
    { scope: { $ne: 'class' } },
    { scope: 'class', grade: { $in: grades } },
    { scope: 'class', grades: { $in: grades } },
    { category: 'class', grade: { $in: grades } },
  ];
}

export function announcementVisibleToGrades(row, grades = []) {
  if (!row || row.scope !== 'class') return true;
  const targets = announcementGradesOf(row);
  if (!targets.length) return true;
  const allowed = new Set((grades || []).map((g) => String(g || '').trim()).filter(Boolean));
  return targets.some((grade) => allowed.has(grade));
}
