const MODE_ROWS = [
  ['bus', 'Bus'],
  ['tram', 'Tram / light rail'],
  ['subway', 'Subway / metro'],
  ['rail', 'Rail / train'],
  ['ferry', 'Ferry'],
];

export function mountPersonalTransitControls({
  shell,
  dataManager,
  enableTransitSuite,
  notify = () => {},
  documentRef = document,
} = {}) {
  if (!shell || !dataManager) return { open() {}, close() {}, destroy() {} };
  const root = documentRef.createElement('section');
  root.className = 'lm-transit-controls';
  root.hidden = true;
  root.innerHTML = `
    <header><div><strong>Transit</strong><span>Choose what appears on the map</span></div><button type="button" data-close>×</button></header>
    <div class="lm-transit-section">
      <h3>Layers</h3>
      <label><input type="checkbox" data-layer="transit" checked> Live agency vehicles</label>
      <label><input type="checkbox" data-layer="transit-routes" checked> Routes / network</label>
      <label><input type="checkbox" data-layer="transit-stops" checked> Stops / stations</label>
      <label><input type="checkbox" data-layer="transit-vehicles"> Regional live fallback</label>
    </div>
    <div class="lm-transit-section">
      <h3>Route types</h3>
      ${MODE_ROWS.map(([id,label]) => `<label><input type="checkbox" data-mode="${id}" checked> ${label}</label>`).join('')}
    </div>
    <div class="lm-transit-status" data-status>Open Transit to load nearby public transportation.</div>
  `;
  shell.append(root);
  const status = root.querySelector('[data-status]');

  function sync() {
    for (const input of root.querySelectorAll('[data-layer]')) {
      input.checked = Boolean(dataManager.isEnabled?.(input.dataset.layer));
    }
    const params = dataManager.layers?.get('transit-routes')?.module?.getParams?.();
    const visible = new Set(params?.visibleModes || MODE_ROWS.map(([id]) => id));
    for (const input of root.querySelectorAll('[data-mode]'))
      input.checked = visible.has(input.dataset.mode);
    const rows = ['transit','transit-routes','transit-stops','transit-vehicles']
      .map((id) => {
        const stats = dataManager.layers?.get(id)?.module?.getStats?.();
        return { id, enabled: Boolean(dataManager.isEnabled?.(id)), stats };
      })
      .filter((row) => row.enabled);
    status.textContent = rows.length
      ? rows
          .map((row) => {
            const count = Number(row.stats?.count || 0);
            const coverage = String(row.stats?.coverage || '').trim();
            return `${row.id.replace('transit-', '')}: ${count}${coverage ? ' · ' + coverage : ''}`;
          })
          .join('\n')
      : 'No transit layers enabled.';
  }

  root.addEventListener('change', async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.dataset.layer) {
      try {
        await dataManager.setEnabled(
          input.dataset.layer,
          input.checked,
          { origin: 'personal-transit-controls' },
        );
      } catch {
        input.checked = !input.checked;
        notify('That transit layer is unavailable here.');
      }
      sync();
      return;
    }
    if (input.dataset.mode) {
      const visibleModes = [...root.querySelectorAll('[data-mode]:checked')]
        .map((node) => node.dataset.mode);
      dataManager.layers
        ?.get('transit-routes')
        ?.module?.setParams?.({ visibleModes }, { origin: 'personal-transit-controls' });
      sync();
    }
  });

  root.querySelector('[data-close]').onclick = () => {
    root.hidden = true;
  };

  let timer = null;
  async function open() {
    root.hidden = false;
    await enableTransitSuite?.();
    sync();
    clearInterval(timer);
    timer = setInterval(sync, 2500);
  }
  function close() {
    root.hidden = true;
    clearInterval(timer);
    timer = null;
  }
  return {
    root,
    open,
    close,
    sync,
    destroy() {
      close();
      root.remove();
    },
  };
}
