export const PERSONAL_WORLD_LAYER_BUNDLES = Object.freeze({
  travel: Object.freeze({
    label: 'Road + transit',
    description:
      'Traffic, incidents, directions, public transit, bike share, cameras, imagery, flights and vessels.',
    layers: Object.freeze([
      'traffic',
      'traffic-incidents',
      'directions',
      'transit',
      'transit-routes',
      'transit-stops',
      'transit-vehicles',
      'bikeshare',
      'cctv',
      'recent-imagery',
      'flights',
      'ais-live-vessels',
    ]),
  }),
  weather: Object.freeze({
    label: 'Weather',
    description:
      'Wind, alerts, radar, satellite, lightning and cyclone awareness.',
    layers: Object.freeze([
      'wind',
      'weather-alerts',
      'weather-radar',
      'weather-satellite',
      'weather-lightning',
      'weather-cyclones',
    ]),
  }),
  infrastructure: Object.freeze({
    label: 'Infrastructure',
    description:
      'Publicly mapped data centers, dams, pipelines, submarine cables and camera infrastructure.',
    layers: Object.freeze([
      'local-datacenters',
      'local-dams',
      'osm-pipelines',
      'telegeography-submarine-cables',
      'alpr-cameras',
      'military-installations',
    ]),
  }),
  world: Object.freeze({
    label: 'World activity',
    description:
      'Satellites, launches, earthquakes, active fires and fire perimeters.',
    layers: Object.freeze([
      'satellites',
      'rocket-launches',
      'earthquakes',
      'local-firms',
      'fire-perimeters',
    ]),
  }),
});

export async function enablePersonalWorldBundle(manager, layerIds = []) {
  const requested = [];
  const missing = [];
  for (const id of layerIds) {
    if (manager?.layers?.has?.(id)) requested.push(id);
    else missing.push(id);
  }

  const results = await Promise.allSettled(
    requested.map((id) => manager.setEnabled(id, true, { origin: 'user' })),
  );
  const fulfilled = results.filter((result) => result.status === 'fulfilled')
    .length;
  return {
    requested: requested.length,
    fulfilled,
    failed: results.length - fulfilled,
    missing,
  };
}

export async function mountPersonalTravelPanel(application) {
  const manager = application.getComponents().data.dataManager;
  const root = document.createElement('aside');
  root.id = 'leeway-transit-world';
  root.style.cssText =
    'background:#071722;color:#eaffff;padding:18px;overflow:auto;max-height:calc(100vh - 94px)';
  root.innerHTML = `
    <button aria-label="Close travel panel" style="float:right">×</button>
    <small style="letter-spacing:.12em;color:#76ecfa;font-weight:800">LEEWAY MAPS · PERSONAL</small>
    <h2>Travel Cockpit</h2>
    <p>Directions, traffic, weather, transit, cameras, roadside services, fuel, flights, vessels and offline trip context in one personal map surface.</p>
    <p>Turn on the public-data families you need without loading every feed at once.</p>
    <p>Layer activation and feed availability are separate. Missing, stale, degraded, keyed or unavailable sources remain labeled by the underlying layer.</p>
    <div data-bundles style="display:grid;gap:8px;margin:14px 0">
      ${Object.entries(PERSONAL_WORLD_LAYER_BUNDLES)
        .map(
          ([id, bundle]) => `
            <button data-bundle="${id}" type="button" style="text-align:left;padding:10px;border:1px solid rgba(71,225,242,.28);border-radius:10px;background:#0a2430;color:#eaffff">
              <strong style="display:block">${bundle.label}</strong>
              <small style="display:block;margin-top:4px;opacity:.72">${bundle.description}</small>
            </button>
          `,
        )
        .join('')}
    </div>
    <p role="status">Choose a layer family. Individual layers remain available from Layers.</p>
  `;
  document.body.appendChild(root);

  root.querySelector('[aria-label="Close travel panel"]').onclick = () =>
    root.dispatchEvent(
      new CustomEvent('leeway:right-panel-close', { bubbles: true }),
    );

  root.querySelector('[data-bundles]').addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-bundle]');
    if (!button || button.disabled) return;
    const bundle = PERSONAL_WORLD_LAYER_BUNDLES[button.dataset.bundle];
    if (!bundle) return;

    const status = root.querySelector('[role="status"]');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = `Requesting ${bundle.label.toLowerCase()} layers…`;
    try {
      const result = await enablePersonalWorldBundle(manager, bundle.layers);
      const missingText = result.missing.length
        ? ` ${result.missing.length} layer(s) are not registered in this build.`
        : '';
      status.textContent =
        `${bundle.label}: ${result.fulfilled}/${result.requested} layer requests completed` +
        (result.failed ? `; ${result.failed} failed` : '') +
        `.${missingText} Feed status remains authoritative.`;
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });

  return {
    root,
    destroy() {
      root.remove();
    },
  };
}
