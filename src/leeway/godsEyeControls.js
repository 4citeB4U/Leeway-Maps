import { scheduleLabel } from '../data/airlineIdentity.js';

/** Reuse the retained God's Eye controllers, rather than reimplementing camera modes. */
export function createGodsEyeActions({
  styleManager,
  catalog,
  onAdvanced = () => {},
}) {
  return {
    async cockpit() {
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
    advanced(enabled = true) {
      onAdvanced(enabled);
      return { ok: true };
    },
    exit() {
      styleManager?.controlCockpit?.('exit');
      onAdvanced(false);
      return { ok: true };
    },
  };
}

export function mountGodsEyeControls({
  application,
  shell,
  onPresentation = () => {},
  documentRef = document,
  eventTarget = window,
}) {
  const components = application.getComponents(),
    styleManager = components.controls?.styleManager,
    catalog = components.data?.catalog;
  let advanced = false,
    destroyed = false;
  const body = documentRef.body;
  const dock = shell.querySelector('.lws-dock');
  const launcher = documentRef.createElement('button');
  launcher.type = 'button';
  launcher.className = 'lws-dock-btn';
  launcher.textContent = "God's Eye";
  launcher.title =
    'Original camera views, full layers, scenes and visual presets';
  dock?.appendChild(launcher);
  const cockpitLauncher = documentRef.createElement('button');
  cockpitLauncher.type = 'button';
  cockpitLauncher.className = 'lws-dock-btn';
  cockpitLauncher.textContent = 'Cockpit';
  dock?.appendChild(cockpitLauncher);
  const host = documentRef.createElement('section');
  host.id = 'leeway-gods-eye-controls';
  host.setAttribute('aria-label', "God's Eye view controls");
  const restore = documentRef.createElement('button');
  restore.type = 'button';
  restore.textContent = 'Back to map workspace';
  restore.hidden = true;
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
  cockpit.textContent = 'Cockpit · first person';
  card.append(title, details, follow, cockpit);
  host.append(restore, card, status);
  body.appendChild(host);
  const style = documentRef.createElement('style');
  style.textContent = `
 body.leeway-gods-eye #leeway-world-shell,body.cockpit-mode #leeway-world-shell{display:none!important}
 body:is(.leeway-gods-eye,.cockpit-mode) :is(#first-run-launcher,#leeway-agent-lee:not(.leeway-open),#leeway-transit-world,#leeway-enterprise-workspace){display:none!important}
 #leeway-gods-eye-controls{position:fixed;left:100px;bottom:110px;z-index:9801;pointer-events:none;max-width:min(390px,80vw);font:13px/1.45 system-ui;color:#edfaff}
 #leeway-gods-eye-controls button{pointer-events:auto;color:#edfaff;background:#102333;border:1px solid #479eb6;border-radius:7px;padding:8px;margin:4px;cursor:pointer}
 #leeway-gods-eye-controls .lge-aircraft{pointer-events:auto;background:rgba(3,14,23,.96);border:1px solid #479eb6;border-radius:10px;padding:12px;white-space:pre-line;max-height:40vh;overflow:auto}
 #leeway-gods-eye-controls [hidden]{display:none!important}
 #leeway-gods-eye-controls [role=status]:empty{display:none}
 #leeway-gods-eye-controls [role=status]:not(:empty){background:#102333;padding:8px}
 body.leeway-gods-eye #leeway-gods-eye-controls,body.cockpit-mode #leeway-gods-eye-controls{left:auto;right:12px;bottom:12px}
 body.leeway-gods-eye #leeway-gods-eye-controls .lge-aircraft,body.cockpit-mode #leeway-gods-eye-controls .lge-aircraft{display:none}
 `;
  documentRef.head.appendChild(style);
  function presentation() {
    const cockpitActive = body.classList.contains('cockpit-mode');
    const original = advanced || cockpitActive;
    body.classList.toggle('leeway-gods-eye', advanced);
    body.classList.toggle('leeway-enterprise-shell', !original);
    restore.hidden = !original;
    onPresentation(original);
    eventTarget.dispatchEvent(new Event('resize'));
  }
  function openAdvanced(enabled) {
    advanced = enabled;
    status.textContent = '';
    presentation();
    if (enabled) {
      for (const [id, button] of [
        ['data-panel', '[data-collapse-target="data-panel"]'],
        ['control-panel', '#control-panel-toggle'],
      ]) {
        const panel = documentRef.getElementById(id);
        if (panel?.classList.contains('collapsed'))
          documentRef.querySelector(button)?.click();
      }
    }
  }
  const actions = createGodsEyeActions({
    styleManager,
    catalog,
    onAdvanced: openAdvanced,
  });
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
  launcher.onclick = () => run('advanced');
  cockpitLauncher.onclick = () => run('cockpit');
  cockpit.onclick = () => run('cockpit');
  follow.onclick = () => run('follow');
  restore.onclick = () => run('exit');
  function refresh() {
    if (destroyed) return;
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
    presentation();
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
      launcher.remove();
      cockpitLauncher.remove();
      body.classList.remove('leeway-gods-eye');
    },
  };
}
