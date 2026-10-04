import { scheduleLabel } from '../data/airlineIdentity.js';

/** Aircraft camera actions within the regular map workspace. */
export function createMapViewActions({
  styleManager,
  catalog,
}) {
  return {
    async cockpit() {
      if (styleManager?.getCockpitState?.()?.active)
        return styleManager.controlCockpit?.('exit') || { ok: true };
      const target = styleManager?.getAircraftTrackingTarget?.();
      if (!target?.id)
        return {
          ok: false,
          error:
            'Select an aircraft on the map first. Its operator and aircraft details appear beside Cockpit.',
        };
      const context = await styleManager.setContextMode?.('flights');
      if (context?.ok === false) return context;
      const result = styleManager.controlCockpit?.('enter', {
        selectedTarget: target,
      });
      return result || { ok: false, error: 'Cockpit controller unavailable' };
    },
    follow() {
      styleManager?.controlCockpit?.('exit');
      const target = styleManager?.getAircraftTrackingTarget?.();
      const layer = catalog?.get(target?.layerId);
      const ok = !!layer?.refocusTrackedById?.(target.id, { origin: 'user' });
      return { ok, error: ok ? null : 'Select an aircraft to follow first' };
    },
    exit() {
      styleManager?.controlCockpit?.('exit');
      return { ok: true };
    },
  };
}

export function mountMapViewControls({
  application,
  shell,
  documentRef = document,
  eventTarget = window,
  addLauncher = true,
}) {
  const components = application.getComponents(),
    styleManager = components.controls?.styleManager,
    catalog = components.data?.catalog;
  let destroyed = false;
  const body = documentRef.body;
  body.classList.remove('leeway-gods-eye');
  body.classList.add('leeway-enterprise-shell');
  const dock = shell.querySelector('.lws-dock');
  const cockpitLauncher = addLauncher ? documentRef.createElement('button') : null;
  if (cockpitLauncher) {
    cockpitLauncher.type = 'button';
    cockpitLauncher.className = 'lws-dock-btn';
    cockpitLauncher.textContent = 'Cockpit';
    dock?.appendChild(cockpitLauncher);
  }
  const host = documentRef.createElement('section');
  host.id = 'leeway-map-view-controls';
  host.setAttribute('aria-label', 'Aircraft view controls');
  const card = documentRef.createElement('section');
  card.className = 'lge-aircraft';
  card.hidden = true;
  const title = documentRef.createElement('strong'),
    details = documentRef.createElement('div'),
    status = documentRef.createElement('p');
  status.setAttribute('role', 'status');
  const follow = documentRef.createElement('button');
  follow.type = 'button';
  follow.textContent = 'Follow aircraft';
  const cockpit = documentRef.createElement('button');
  cockpit.type = 'button';
  cockpit.textContent = 'Cockpit - first person';
  card.append(title, details, follow, cockpit);
  host.append(card, status);
  body.appendChild(host);
  const style = documentRef.createElement('style');
  style.textContent = `
 #leeway-map-view-controls{position:fixed;top:166px;left:12px;bottom:auto;z-index:9801;pointer-events:none;max-width:min(390px,80vw);font:13px/1.45 system-ui;color:#edfaff}
 #leeway-map-view-controls button{pointer-events:auto;color:#edfaff;background:#102333;border:1px solid #479eb6;border-radius:7px;padding:8px;margin:4px;cursor:pointer}
 #leeway-map-view-controls .lge-aircraft{pointer-events:auto;background:rgba(3,14,23,.96);border:1px solid #479eb6;border-radius:10px;padding:12px;white-space:pre-line;max-height:calc(100dvh - 336px);overflow:auto}
 @media(max-width:700px){
 #leeway-map-view-controls{top:245px;left:10px;max-width:calc(100vw - 82px)}
 #leeway-map-view-controls .lge-aircraft{max-height:calc(100dvh - 475px)}
 }
 #leeway-map-view-controls [hidden]{display:none!important}
 #leeway-map-view-controls [role=status]:empty{display:none}
 #leeway-map-view-controls [role=status]:not(:empty){background:#102333;padding:8px}
 `;
  documentRef.head.appendChild(style);
  const actions = createMapViewActions({ styleManager, catalog });
  async function run(action) {
    try {
      const result = await actions[action]();
      status.textContent = result?.ok
        ? ''
        : result?.error || 'View unavailable';
      refresh();
    } catch (error) {
      status.textContent = error.message || 'View unavailable';
    }
  }
  if (cockpitLauncher) cockpitLauncher.onclick = () => run('cockpit');
  cockpit.onclick = () => run('cockpit');
  follow.onclick = () => run('follow');
  function refresh() {
    if (destroyed) return;
    const cockpitActive = Boolean(styleManager?.getCockpitState?.()?.active);
    if (cockpitLauncher) {
      cockpitLauncher.textContent = cockpitActive ? 'Exit cockpit' : 'Cockpit';
      cockpitLauncher.setAttribute('aria-pressed', String(cockpitActive));
    }
    cockpit.textContent = cockpitActive ? 'Exit cockpit' : 'Cockpit - first person';
    const target = styleManager?.getAircraftTrackingTarget?.();
    const info = catalog?.get(target?.layerId)?.getTrackedInfo?.();
    card.hidden = !info;
    if (!info) return;
    title.textContent =
      info.callsign || info.registration || info.icao24 || 'Selected aircraft';
    details.textContent = [
      info.airline
        ? `Operator: ${info.airline}${info.airlineIdentityBasis === 'ICAO callsign' ? ' (callsign)' : ''}`
        : 'Operator unavailable',
      info.typeName || info.typeCode || 'Aircraft type unavailable',
      info.registration ? `Registration: ${info.registration}` : '',
      info.origin && info.destination
        ? `${info.origin} → ${info.destination}`
        : 'Route unavailable',
      scheduleLabel(info.schedule),
      [info.stale ? 'STALE' : '', info.positionStatus].filter(Boolean).join(' · '),
      info.positionTimeMs ? 'Position received: ' + new Date(info.positionTimeMs).toLocaleTimeString() : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  const onCockpit = () => {
    body.classList.remove('leeway-gods-eye');
    body.classList.add('leeway-enterprise-shell');
    refresh();
  };
  eventTarget.addEventListener('gev:cockpit-mode-changed', onCockpit);
  eventTarget.addEventListener('gev:awareness-subject-selected', refresh);
  eventTarget.addEventListener('gev:awareness-subject-cleared', refresh);
  const timer = setInterval(refresh, 2000);
  refresh();
  return {
    actions,
    destroy() {
      destroyed = true;
      clearInterval(timer);
      eventTarget.removeEventListener('gev:cockpit-mode-changed', onCockpit);
      eventTarget.removeEventListener(
        'gev:awareness-subject-selected',
        refresh,
      );
      eventTarget.removeEventListener('gev:awareness-subject-cleared', refresh);
      host.remove();
      style.remove();
      cockpitLauncher?.remove();
      body.classList.remove('leeway-gods-eye');
    },
  };
}
