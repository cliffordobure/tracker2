/** Bolt-style top-down car marker (matches Flutter BoltCarMarker). */

export function createBoltCarElement({
  heading = 0,
  selected = false,
  label = '',
  detail = '',
  pulse = true,
} = {}) {
  const el = document.createElement('div');
  el.className = `marker-bolt-car${selected ? ' is-selected' : ''}${pulse ? ' is-pulse' : ''}`;
  el.removeAttribute('title');
  el.setAttribute('aria-label', [label, detail].filter(Boolean).join(', ') || 'Bus');

  const deg = Number.isFinite(heading) && heading >= 0 ? heading : 0;
  const uid = `bolt${Math.random().toString(36).slice(2, 9)}`;
  el.innerHTML = `
    <div class="marker-bolt-pulse" aria-hidden="true"></div>
    <div class="marker-bolt-inner">
      <div class="marker-bolt-rotator" style="transform: rotate(${deg}deg)">
        <svg viewBox="0 0 52 52" aria-hidden="true">
          <defs>
            <filter id="${uid}Shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.28"/>
            </filter>
          </defs>
          <g filter="url(#${uid}Shadow)">
            <rect x="16" y="8" width="20" height="36" rx="7" fill="#2BEE8C" stroke="#fff" stroke-width="2"/>
            <rect x="16" y="16" width="3.5" height="20" rx="2" fill="#10B981"/>
            <rect x="32.5" y="16" width="3.5" height="20" rx="2" fill="#10B981"/>
            <rect x="19.5" y="12" width="13" height="8" rx="3" fill="#0F172A" fill-opacity="0.85"/>
            <rect x="20" y="30.5" width="12" height="6.5" rx="2.5" fill="#0F172A" fill-opacity="0.85"/>
            <rect x="20.5" y="22" width="11" height="7" rx="2" fill="#fff" fill-opacity="0.35"/>
            <circle cx="20.5" cy="9.5" r="1.6" fill="#fff"/>
            <circle cx="31.5" cy="9.5" r="1.6" fill="#fff"/>
            <rect x="20.5" y="39.2" width="11" height="3.1" rx="0.45" fill="#F7E017" stroke="#111827" stroke-width="0.45"/>
          </g>
        </svg>
      </div>
      ${label ? `<span class="marker-bolt-label">${escapeHtml(label)}</span>` : ''}
      ${detail ? `<span class="marker-bolt-detail">${escapeHtml(detail)}</span>` : ''}
    </div>
  `;
  return el;
}

export function setBoltCarHeading(el, heading) {
  if (!el) return;
  const rotator = el.querySelector('.marker-bolt-rotator');
  if (!rotator) return;
  const deg = Number.isFinite(heading) && heading >= 0 ? heading : 0;
  rotator.style.transform = `rotate(${deg}deg)`;
}

export function setBoltCarSelected(el, selected) {
  if (!el) return;
  el.classList.toggle('is-selected', !!selected);
}

function syncBoltCarA11y(el) {
  const label = el.querySelector('.marker-bolt-label')?.textContent || '';
  const detail = el.querySelector('.marker-bolt-detail')?.textContent || '';
  el.removeAttribute('title');
  el.setAttribute('aria-label', [label, detail].filter(Boolean).join(', ') || 'Bus');
}

export function setBoltCarLabel(el, label) {
  if (!el) return;
  const text = String(label || '').trim();
  const inner = el.querySelector('.marker-bolt-inner');
  let span = el.querySelector('.marker-bolt-label');
  if (!text) {
    span?.remove();
    syncBoltCarA11y(el);
    return;
  }
  if (!span) {
    span = document.createElement('span');
    span.className = 'marker-bolt-label';
    inner?.appendChild(span);
  }
  span.textContent = text;
  syncBoltCarA11y(el);
}

export function setBoltCarDetail(el, detail) {
  if (!el) return;
  const text = String(detail || '').trim();
  const inner = el.querySelector('.marker-bolt-inner');
  let span = el.querySelector('.marker-bolt-detail');
  if (!text) {
    span?.remove();
    syncBoltCarA11y(el);
    return;
  }
  if (!span) {
    span = document.createElement('span');
    span.className = 'marker-bolt-detail';
    inner?.appendChild(span);
  }
  span.textContent = text;
  syncBoltCarA11y(el);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function eventKidId(e) {
  return String(e?.kidId?._id || e?.kidId || '');
}

export function isKidOnBus(events, kidId) {
  const id = String(kidId?._id || kidId || '');
  if (!id) return false;
  const list = events || [];
  const picked = list.some((e) => eventKidId(e) === id && e.type === 'picked_up');
  const dropped = list.some((e) => eventKidId(e) === id && e.type === 'dropped_off');
  return picked && !dropped;
}

export function anyKidOnBus(events, kids) {
  return (kids || []).some((kid) => isKidOnBus(events, kid._id || kid.id || kid));
}
