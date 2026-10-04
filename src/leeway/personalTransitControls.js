/*
REGION: LeeWay Maps / Personal Transit
TAG: LEEWAY.PERSONAL.TRANSIT.CONTROLS
WHAT = Personal-use transit layer controller.
WHY = Transit must expose nearby route/stop/live-vehicle layers explicitly instead of silently enabling a bundle.
WHO = LeeWay Maps personal edition.
WHERE = Left-side personal controls.
WHEN = User opens Transit.
HOW = Reuse canonical dataManager layers and their getStats/setParams methods; no duplicate transit renderer.
LICENSE = MIT.
*/

const LAYERS = Object.freeze([
  ['transit', 'Live agency vehicles'],
  ['transit-routes', 'Routes'],
  ['transit-stops', 'Stops & stations'],
  ['transit-vehicles', 'Regional live fallback'],
]);

const MODES = Object.freeze([
  ['bus', 'Bus'],
  ['rail', 'Rail'],
  ['subway', 'Subway / metro'],
  ['tram', 'Tram / light rail'],
  ['ferry', 'Ferry'],
]);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
}

export function mountPersonalTransitControls({
  shell,
  dataManager,
  documentRef = document,
  notify = () => {},
} = {}) {
  if (!shell || !dataManager || !documentRef)
    return { open() {}, close() {}, destroy() {} };

  const root = documentRef.createElement('section');
  root.className = 'lm-transit-controls';
  root.hidden = true;
  root.innerHTML = `
    <header>
      <div><strong>Transit</strong><span>Choose what appears on the map.</span></div>
      <button type="button" data-close aria-label="Close transit controls">×</button>
    </header>
    <div class="lm-transit-actions">
      <button type="button" data-all>Show nearby network</button>
      <button type="button" data-none>Clear transit</button>
    </div>
    <div class="lm-transit-layer-list" data-layer-list></div>
    <fieldset class="lm-transit-modes">
      <legend>Route types</legend>
      ${MODES.map(([id,label]) => `<label><input type="checkbox" data-mode="${id}" checked><span>${label}</span></label>`).join('')}
    </fieldset>
    <div class="lm-transit-status" data-status>Open Transit to inspect nearby coverage.</div>
  `;
  shell.append(root);

  const layerList = root.querySelector('[data-layer-list]');
  const status = root.querySelector('[data-status]');
  let timer = null;
  let destroyed = false;

  function renderLayers() {
    layerList.innerHTML = LAYERS
      .filter(([id]) => dataManager.layers?.has(id))
      .map(([id,label]) => {
        const enabled = Boolean(dataManager.isEnabled?.(id));
        const stats = dataManager.layers.get(id)?.module?.getStats?.() || {};
        const detail = stats.coverage || stats.source || (stats.error ? 'Unavailable' : enabled ? 'On' : 'Off');
        return `<label class="lm-transit-layer-row">
          <input type="checkbox" data-layer="${esc(id)}" ${enabled ? 'checked' : ''}>
          <span><strong>${esc(label)}</strong><small>${esc(detail)}</small></span>
        </label>`;
      })
      .join('');
  }

  function modeSelection() {
    return [...root.querySelectorAll('[data-mode]:checked')].map((el) => el.dataset.mode);
  }

  async function applyModes() {
    const routes = dataManager.layers?.get('transit-routes')?.module;
    routes?.setParams?.({ allowedModes: modeSelection() }, { origin: 'user' });
  }

  async function setLayer(id, enabled) {
    if (!dataManager.layers?.has(id)) return;
    try {
      await dataManager.setEnabled(id, enabled, { origin: 'user' });
    } catch (error) {
      notify(`${id} could not be changed · ${error?.message || 'unavailable'}`);
    }
    renderLayers();
  }

  async function showNearby() {
    for (const id of ['transit', 'transit-routes', 'transit-stops']) {
      await setLayer(id, true);
    }
    // Regional vehicles remain fallback/opt-in to avoid duplicate vehicle work.
    await applyModes();
    notify('Transit network on · routes, stops and available live agency vehicles');
  }

  async function clearAll() {
    for (const [id] of LAYERS) {
      if (dataManager.layers?.has(id) && dataManager.isEnabled?.(id))
        await setLayer(id, false);
    }
    notify('Transit layers cleared');
  }

  async function onChange(event) {
    const layerId = event.target?.dataset?.layer;
    if (layerId) {
      await setLayer(layerId, event.target.checked);
      return;
    }
    if (event.target?.dataset?.mode) {
      await applyModes();
      renderLayers();
    }
  }

  function refreshStatus() {
    if (destroyed || root.hidden) return;
    const enabled = LAYERS
      .map(([id]) => id)
      .filter((id) => dataManager.layers?.has(id) && dataManager.isEnabled?.(id));
    const routeStats = dataManager.layers?.get('transit-routes')?.module?.getStats?.();
    const vehicleStats = dataManager.layers?.get('transit')?.module?.getStats?.();
    status.textContent = enabled.length
      ? `${enabled.length} layers on · ${routeStats?.coverage || 'route coverage loading'} · ${vehicleStats?.count ?? 0} direct live vehicles`
      : 'No transit layers selected.';
    renderLayers();
  }

  function open() {
    root.hidden = false;
    renderLayers();
    refreshStatus();
    if (!timer) timer = setInterval(refreshStatus, 2500);
  }

  function close() {
    root.hidden = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  root.addEventListener('change', onChange);
  root.querySelector('[data-close]').addEventListener('click', close);
  root.querySelector('[data-all]').addEventListener('click', showNearby);
  root.querySelector('[data-none]').addEventListener('click', clearAll);

  return {
    root,
    open,
    close,
    refresh: refreshStatus,
    destroy() {
      destroyed = true;
      close();
      root.removeEventListener('change', onChange);
      root.remove();
    },
  };
}
