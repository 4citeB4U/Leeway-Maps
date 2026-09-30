/*
REGION: LeeWay Maps / Feature Center
TAG: LEEWAY.MAPS.FEATURE_CENTER
5WH:
WHAT = Searchable launcher for the complete business/personal capability catalog.
WHY = Keeps requested map capabilities visible, separated by edition, and routed to canonical controls instead of duplicated UIs.
WHO = LeeWay Industries under Creator authority.
WHERE = Browser shell.
WHEN = Operator opens Capabilities.
HOW = Renders immutable catalog domains and delegates each launch to the owning map control.
LICENSE = MIT, matching this repository.
*/

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const STATE_LABEL = Object.freeze({
  'map-native': 'BUILT IN',
  runtime: 'LIVE RUNTIME',
  'connector-ready': 'CONNECTOR READY',
  'transit-hub': 'TRANSIT HUB',
});

export function mountFeatureCenter({
  catalog = [],
  edition = 'business',
  onAction = async () => false,
  documentRef = globalThis.document,
} = {}) {
  const root = documentRef.createElement('section');
  root.id = 'leeway-feature-center';
  root.hidden = true;
  root.innerHTML = `
    <header class="lfc-head">
      <div>
        <small>${edition === 'personal' ? 'LEEWAY MAPS' : 'LEEWAY LOGISTICS'} · CAPABILITY CENTER</small>
        <h2>${edition === 'personal' ? 'Personal map features' : 'Business map features'}</h2>
        <p>${edition === 'personal'
          ? 'Navigation, traffic, weather, public transit, cameras, roadside, fuel, offline travel and accessibility.'
          : 'Trucking, freight, fleet, municipal transit, CAD/AVL, ADA, paratransit, fares, maintenance, safety, reporting and integrations.'}</p>
      </div>
      <button type="button" data-close aria-label="Close capability center">×</button>
    </header>
    <div class="lfc-tools">
      <input data-search type="search" placeholder="Search every feature…" aria-label="Search features">
      <span data-count></span>
    </div>
    <div class="lfc-domains" data-domains></div>
  `;
  documentRef.body.append(root);

  const style = documentRef.createElement('style');
  style.dataset.leewayFeatureCenter = '1';
  style.textContent = `
    #leeway-feature-center{position:fixed;inset:72px 18px 18px 92px;z-index:10040;background:rgba(3,13,21,.98);border:1px solid rgba(80,225,245,.34);border-radius:22px;color:#edfdff;box-shadow:0 28px 90px rgba(0,0,0,.62);backdrop-filter:blur(18px);overflow:hidden;font:14px/1.45 Inter,ui-sans-serif,system-ui,sans-serif}
    #leeway-feature-center[hidden]{display:none!important}
    .lfc-head{display:flex;justify-content:space-between;gap:18px;padding:20px 22px;border-bottom:1px solid rgba(255,255,255,.08)}
    .lfc-head small{color:#74effa;letter-spacing:.12em;font-weight:800}.lfc-head h2{margin:4px 0 3px;font-size:24px}.lfc-head p{margin:0;color:#acc5cd;max-width:900px}
    .lfc-head button{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:#0a2130;color:#fff;font-size:22px;cursor:pointer}
    .lfc-tools{display:flex;gap:12px;align-items:center;padding:14px 22px;border-bottom:1px solid rgba(255,255,255,.06)}
    .lfc-tools input{flex:1;height:42px;border-radius:12px;border:1px solid rgba(95,220,240,.28);background:#071722;color:#fff;padding:0 12px;font:inherit;outline:none}.lfc-tools input:focus{border-color:#4eeeff}
    .lfc-tools span{font-size:11px;color:#8ca7b0;white-space:nowrap}
    .lfc-domains{height:calc(100% - 151px);overflow:auto;padding:18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px;align-content:start}
    .lfc-domain{border:1px solid rgba(83,224,243,.16);border-radius:18px;background:linear-gradient(145deg,rgba(19,47,62,.74),rgba(4,17,27,.88));padding:16px;box-shadow:inset 0 1px rgba(255,255,255,.06)}
    .lfc-domain header{display:flex;justify-content:space-between;gap:10px;align-items:start}.lfc-domain h3{margin:0;font-size:17px}.lfc-state{font-size:9px;letter-spacing:.09em;border:1px solid rgba(103,234,250,.25);border-radius:99px;padding:4px 7px;color:#86eff9;white-space:nowrap}
    .lfc-list{margin:12px 0 14px;padding-left:18px;max-height:230px;overflow:auto;color:#c5dbe1}.lfc-list li{margin:4px 0}
    .lfc-open{width:100%;min-height:40px;border-radius:11px;border:1px solid rgba(76,232,250,.28);background:#0a2936;color:#efffff;font:700 12px/1 system-ui,sans-serif;cursor:pointer}.lfc-open:hover{background:#104052}
    @media(max-width:720px){#leeway-feature-center{inset:64px 8px 8px}.lfc-head{padding:14px}.lfc-head h2{font-size:20px}.lfc-tools{padding:10px 14px}.lfc-domains{padding:10px;grid-template-columns:1fr;height:calc(100% - 150px)}}
  `;

  documentRef.head.append(style);
  const list = root.querySelector('[data-domains]');
  const search = root.querySelector('[data-search]');
  const count = root.querySelector('[data-count]');

  function render() {
    const q = String(search.value || '').trim().toLowerCase();
    const filtered = catalog
      .map((row) => ({
        ...row,
        visibleFeatures: q
          ? row.features.filter((feature) =>
              `${row.label} ${feature}`.toLowerCase().includes(q),
            )
          : row.features,
      }))
      .filter((row) => !q || row.visibleFeatures.length);

    count.textContent = `${filtered.reduce((sum, row) => sum + row.visibleFeatures.length, 0)} features · ${filtered.length} groups`;
    list.innerHTML = filtered
      .map(
        (row) => `
          <article class="lfc-domain" data-domain="${esc(row.id)}">
            <header>
              <h3>${esc(row.label)}</h3>
              <span class="lfc-state">${esc(STATE_LABEL[row.state] || row.state)}</span>
            </header>
            <ul class="lfc-list">${row.visibleFeatures.map((feature) => `<li>${esc(feature)}</li>`).join('')}</ul>
            <button class="lfc-open" type="button" data-launch="${esc(row.id)}" data-action="${esc(row.action)}">OPEN ${esc(row.label.toUpperCase())}</button>
          </article>
        `,
      )
      .join('');
  }

  root.addEventListener('click', async (event) => {
    if (event.target.closest('[data-close]')) {
      root.hidden = true;
      return;
    }
    const button = event.target.closest('[data-launch]');
    if (!button) return;
    const row = catalog.find((candidate) => candidate.id === button.dataset.launch);
    if (!row) return;
    button.disabled = true;
    try {
      await onAction(row.action, row);
    } finally {
      button.disabled = false;
    }
  });
  search.addEventListener('input', render);
  render();

  return Object.freeze({
    root,
    open() {
      root.hidden = false;
      search.focus();
    },
    close() {
      root.hidden = true;
    },
    toggle() {
      root.hidden ? this.open() : this.close();
    },
    destroy() {
      root.remove();
      style.remove();
    },
  });
}
