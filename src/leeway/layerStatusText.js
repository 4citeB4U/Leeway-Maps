export const escapeLayerText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function layerStatusText(row) {
  if (!row.enabled) return 'Off';
  const s = row.stats || {};
  if (s.error || s.managerRefreshError) return `Unavailable · ${s.error || s.managerRefreshError}`;
  if (s.loading || s.refreshing) return 'Loading…';
  if (s.stale) return 'Older or unavailable data';
  return [s.countLabel && Number.isFinite(s.count) ? `${s.count} ${s.countLabel}` : s.source, s.modelWarning].filter(Boolean).join(' · ') || 'Enabled';
}
