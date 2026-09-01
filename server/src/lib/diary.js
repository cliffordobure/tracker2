export const DIARY_TYPES = [
  { value: 'lesson', label: 'Lesson / Class Work', emoji: '📚', filter: 'lessons', category: 'Lessons' },
  { value: 'homework', label: 'Homework', emoji: '📝', filter: 'homework', category: 'Homework' },
  { value: 'observation', label: 'Teacher Observation', emoji: '⚠️', filter: 'observations', category: 'Observations' },
  { value: 'behaviour', label: 'Behaviour', emoji: '⚠️', filter: 'behaviour', category: 'Behaviour' },
  { value: 'achievement', label: 'Achievement', emoji: '⭐', filter: 'achievements', category: 'Achievements' },
  { value: 'communication', label: 'Parent Communication', emoji: '💬', filter: 'communication', category: 'Communication' },
  { value: 'notice', label: 'General Notice', emoji: '📢', filter: 'communication', category: 'Communication' },
  { value: 'activity', label: 'Student Activity', emoji: '🎯', filter: 'lessons', category: 'Lessons' },
  { value: 'reminder', label: 'Reminder', emoji: '⏰', filter: 'communication', category: 'Communication' },
  { value: 'incident', label: 'Incident', emoji: '🚨', filter: 'behaviour', category: 'Behaviour' },
  { value: 'general', label: 'General Note', emoji: '📝', filter: 'communication', category: 'Note' },
  { value: 'class', label: 'Class Diary', emoji: '📚', filter: 'lessons', category: 'Academic' },
  { value: 'academic', label: 'Academic', emoji: '📚', filter: 'lessons', category: 'Academic' },
  { value: 'meal', label: 'Meal', emoji: '🍴', filter: 'lessons', category: 'Note' },
  { value: 'health', label: 'Health', emoji: '🩺', filter: 'observations', category: 'Note' },
];

export const DIARY_LABELS = DIARY_TYPES.map((t) => t.value);

export function diaryTypeMeta(label) {
  const key = String(label || 'general').toLowerCase();
  return DIARY_TYPES.find((t) => t.value === key) || DIARY_TYPES.find((t) => t.value === 'general');
}

export function diaryTypeLabel(label) {
  return diaryTypeMeta(label).label;
}

export const MAX_DIARY_COMMENT_MEDIA = 4;

export function normalizeDiaryCommentMedia(raw, max = MAX_DIARY_COMMENT_MEDIA) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && m.url)
    .slice(0, max)
    .map((m) => ({
      url: String(m.url),
      publicId: String(m.publicId || ''),
      resourceType: ['image', 'video', 'raw'].includes(m.resourceType) ? m.resourceType : 'image',
      originalName: String(m.originalName || ''),
      bytes: Number.isFinite(Number(m.bytes)) ? Math.max(0, Number(m.bytes)) : 0,
    }));
}

function diaryCommentKind(m) {
  const type = String(m?.resourceType || '').toLowerCase();
  if (type === 'image') return 'image';
  const hay = `${m?.url || ''} ${m?.originalName || ''}`;
  if (/\.(jpe?g|png|gif|webp|heic|bmp)($|\?)/i.test(hay) || /\/image\/upload\//i.test(hay)) return 'image';
  if (/\.pdf($|\?)/i.test(hay)) return 'pdf';
  return type === 'raw' || type === 'video' ? type : 'file';
}

export function serializeDiaryCommentMedia(comment) {
  return (comment?.media || [])
    .filter((m) => m && m.url)
    .map((m) => {
      const name = m.originalName || (String(m.url || '').split('/').pop() || 'Attachment');
      const kind = diaryCommentKind(m);
      const bytes = Number(m.bytes) || 0;
      let sizeLabel = '';
      if (bytes > 0) {
        sizeLabel = bytes < 1024 * 1024
          ? `${Math.max(1, Math.round(bytes / 1024))} KB`
          : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      }
      return {
        url: m.url,
        name,
        kind,
        sizeLabel,
        originalName: name,
        publicId: m.publicId || '',
        resourceType: m.resourceType || (kind === 'image' ? 'image' : 'raw'),
        bytes,
      };
    });
}

/** School diary dates are calendar days, not timezone-local midnights. */
export function diaryCalendarDate(dateInput) {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    const [y, m, day] = dateInput.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, day));
  }
  const d = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function diaryCalendarRange(dateInput) {
  const from = diaryCalendarDate(dateInput);
  const local = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)
    ? new Date(...dateInput.slice(0, 10).split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))))
    : null;
  if (local) local.setHours(0, 0, 0, 0);
  const start = local && local < from ? local : from;
  const utcEnd = new Date(from);
  utcEnd.setUTCHours(23, 59, 59, 999);
  const localEnd = local ? new Date(local) : null;
  if (localEnd) localEnd.setHours(23, 59, 59, 999);
  const end = localEnd && localEnd > utcEnd ? localEnd : utcEnd;
  return { from: start, to: end };
}

export function diaryNotifyCopy(entry, kid, teacherName) {
  const first = String(kid?.name || 'your child').trim().split(/\s+/)[0] || 'your child';
  const teacher = teacherName || 'Teacher';
  const topic = entry.topic || entry.title || 'today';
  switch (String(entry.label || '')) {
    case 'achievement':
      return {
        title: `Great job, ${first}!`,
        body: `${teacher} recorded an achievement: ${topic}`,
      };
    case 'behaviour':
    case 'incident':
      return {
        title: 'Behaviour notice',
        body: `Please read ${first}'s behaviour note and acknowledge it.`,
      };
    case 'homework':
      return {
        title: `Homework: ${topic}`,
        body: `${first} has new homework. Please review and acknowledge.`,
      };
    case 'observation':
      return {
        title: 'Teacher observation',
        body: `${teacher} shared an observation about ${first}.`,
      };
    case 'lesson':
    case 'class':
    case 'academic':
      return {
        title: `Class diary: ${topic}`,
        body: `${teacher} posted ${first}'s lesson diary. Please read and acknowledge.`,
      };
    default:
      return {
        title: `Class diary: ${entry.title || topic}`,
        body: `${teacher} posted about ${first}. Please read and acknowledge.`,
      };
  }
}
