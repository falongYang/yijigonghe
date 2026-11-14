// Presentation helpers accept simulation snapshots and never mutate them.
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function timeLabel(seconds) {
  const n = Number.isFinite(Number(seconds)) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${String(Math.floor(n / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}`;
}
export function timelineHTML(events, highlights = false) {
  if (!Array.isArray(events) || !events.length) return '<p class="chronicle-empty">尚无关键事件。侦察、建设与交战后将在这里留下记录。</p>';
  return events.map(e => {
    const color = Number.isFinite(e.color) ? '#' + (e.color >>> 0 & 0xffffff).toString(16).padStart(6,'0') : '#9fe0c8';
    const side = e.side === 'P' ? '我方' : e.side === 'E' ? '敌方' : '战场';
    return `<li class="chronicle-event${highlights ? ' highlight' : ''}" style="--event-color:${color}"><time>${timeLabel(e.at)}</time><div><b>${escapeHTML(e.label)}</b><small>${side}</small><p>${escapeHTML(e.text)}</p></div></li>`;
  }).join('');
}
export function victoryReason(payload, objective) {
  if (payload.type !== 'win') return '我方蚁后巢被攻破。重整蚁群，再次出征。';
  return payload.reason || (objective && objective.type !== 'destroy' ? objective.label : '') || '敌方蚁后巢已被摧毁。';
}
