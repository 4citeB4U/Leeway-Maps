import * as Cesium from 'cesium';
import { mountRoutePlanner } from './routePlanner.js';
import { createRouteClient } from './routePlannerCore.js';
import './mapFirst.css';
import { mountRoadsidePlaces } from './roadsidePlaces.js';
import { mountDriveMode } from './driveMode.js';
import { mountFuelAdvisor } from './fuelAdvisor.js';
import { mountHazardReports } from './hazardReports.js';
import { mountPeerComms } from './peerComms.js';
import { mountNationalCameraCatalog } from './nationalCameraCatalog.js';
import { mountOfflineTrip } from './offlineTrip.js';
import { mountFuelLedger } from './fuelLedger.js';
import { mapIcon } from './mapIcons.js';
import { mountExperiencePreferences } from './experiencePreferences.js';

function ensureStyles(documentRef) {
  if (documentRef.getElementById('leeway-enterprise-shell-styles')) return;
  const style = documentRef.createElement('style');
  style.id = 'leeway-enterprise-shell-styles';
  style.textContent = `
    body.leeway-enterprise-shell #title-bar,
    body.leeway-enterprise-shell #style-indicator,
    body.leeway-enterprise-shell #top-center-actions,
    body.leeway-enterprise-shell #command-dock,
    body.leeway-enterprise-shell #left-panel-stack,
    body.leeway-enterprise-shell #first-run-launcher { display:none !important; }
    body.leeway-enterprise-shell #leeway-agent-lee { display:none; }
    /* LeeWay Logistics is a full-screen world map. The inherited optical keyhole,
       tactical coordinate HUD and celestial ring belong to the legacy God’s-eye
       presentation and must never crop or print over the enterprise map. */
    body.leeway-enterprise-shell #scope-mask,
    body.leeway-enterprise-shell #intel-hud,
    body.leeway-enterprise-shell #cockpit-cloud-effects,
    body.leeway-enterprise-shell .celestial-ring-overlay { display:none !important; }
    body.leeway-enterprise-shell #cesiumContainer { inset:0 !important; width:100vw !important; height:100vh !important; clip-path:none !important; border-radius:0 !important; }
    body.leeway-enterprise-shell #leeway-agent-lee.leeway-open { display:block; left:98px; bottom:92px; width:min(430px,calc(100vw - 120px)); }
    #leeway-world-shell { position:fixed; inset:0; z-index:9700; pointer-events:none; color:#edfaff; font:12px/1.35 Inter,ui-sans-serif,system-ui,sans-serif; }
    #leeway-world-shell * { box-sizing:border-box; }
    .lws-top { pointer-events:auto; position:absolute; top:0; left:0; right:0; height:64px; display:grid; grid-template-columns:390px minmax(280px,650px) 1fr; align-items:center; gap:18px; padding:0 20px; background:rgba(2,12,20,.94); border-bottom:1px solid rgba(62,211,236,.20); backdrop-filter:blur(16px); }
    .lws-brand { display:flex; gap:12px; align-items:center; min-width:0; }
    .lws-mark { width:40px; height:40px; border:1px solid #3ee5f2; border-radius:50%; display:grid; place-items:center; color:#72f3ff; font-weight:800; }
    .lws-brand strong { display:block; font-size:17px; letter-spacing:.23em; white-space:nowrap; }
    .lws-brand span { display:block; margin-top:3px; font-size:8px; letter-spacing:.22em; opacity:.48; white-space:nowrap; }
    .lws-search { position:relative; }
    .lws-search input { width:100%; height:42px; padding:0 44px 0 42px; border-radius:12px; border:1px solid rgba(119,210,229,.24); background:rgba(9,25,36,.86); color:#eaffff; outline:none; font:inherit; }
    .lws-search input:focus { border-color:#47e5f4; box-shadow:0 0 0 2px rgba(71,229,244,.08); }
    .lws-search:before { content:'⌕'; position:absolute; left:15px; top:7px; font-size:23px; opacity:.68; }
    .lws-search kbd { position:absolute; right:10px; top:10px; font-size:9px; padding:4px 6px; border-radius:6px; border:1px solid rgba(255,255,255,.10); opacity:.55; }
    .lws-top-actions { justify-self:end; display:flex; gap:8px; align-items:center; }
    .lws-chip { pointer-events:auto; border:1px solid transparent; background:transparent; color:#d9edf2; padding:9px 10px; border-radius:10px; cursor:pointer; font:inherit; white-space:nowrap; }
    .lws-chip:hover { border-color:rgba(69,224,241,.22); background:rgba(69,224,241,.05); }
    .lws-avatar { width:36px; height:36px; border:1px solid rgba(72,227,241,.55); border-radius:50%; display:grid; place-items:center; font-weight:700; }
    .lws-agent-status { font-size:9px; color:#59f0ac; margin-left:-3px; }
    .lws-rail { pointer-events:auto; position:absolute; top:78px; left:10px; bottom:18px; width:72px; padding:8px; border-radius:15px; background:rgba(3,14,23,.92); border:1px solid rgba(78,217,238,.22); backdrop-filter:blur(14px); display:flex; flex-direction:column; gap:4px; }
    .lws-nav { border:1px solid rgba(91,193,211,.18); background:rgba(8,24,34,.55); color:#e5f4f7; border-radius:10px; padding:9px 4px; min-height:60px; display:grid; place-items:center; gap:4px; cursor:pointer; font:inherit; font-size:10px; font-weight:650; }
    .lws-nav .i { font-size:19px; line-height:1; }
    .lws-nav:hover,.lws-nav.active { color:#70f2ff; background:rgba(52,219,239,.10); box-shadow:inset 3px 0 0 #2ce3f3; }
    .lws-spacer { flex:1; }
    .lws-rail.compact { width:48px; padding-inline:5px; }
    .lws-rail.compact .lws-nav span:not(.i) { display:none; }
    .lws-rail.compact .lws-nav { min-height:48px; padding:6px 2px; }
    .lws-route-planner { pointer-events:auto; position:absolute; top:76px; left:94px; width:min(468px,calc(100vw - 120px)); padding:14px; border-radius:15px; background:rgba(3,15,24,.97); border:1px solid rgba(68,221,241,.24); box-shadow:0 18px 55px rgba(0,0,0,.40); backdrop-filter:blur(16px); display:none; }
    .lws-route-planner.open { display:block; }
    .lws-route-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
    .lws-route-head strong { font-size:12px; letter-spacing:.12em; }
    .lws-route-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
    .lws-route-grid label { display:grid; gap:5px; font-size:8px; letter-spacing:.12em; opacity:.72; }
    .lws-route-grid input { min-width:0; height:39px; padding:0 10px; border-radius:9px; border:1px solid rgba(119,210,229,.24); background:#071722; color:#edffff; font:inherit; outline:none; }
    .lws-route-grid input:focus { border-color:#47e5f4; }
    .lws-route-actions { display:flex; gap:8px; margin-top:10px; }
    .lws-route-actions button { flex:1; }
    .lws-primary { background:#28dff0 !important; color:#031018 !important; font-weight:800 !important; border-color:#4eeeff !important; }
    .lws-inspector-toggle { pointer-events:auto; position:absolute; top:82px; right:20px; z-index:9805; display:none; min-width:34px; height:30px; border-radius:9px; border:1px solid rgba(71,225,242,.35); background:rgba(3,15,24,.96); color:#dffcff; cursor:pointer; }
    .lws-context-inspector.open + .lws-inspector-toggle { display:block; }
    .lws-context-inspector.minimized { width:54px; height:54px; overflow:hidden; }
    .lws-context-inspector.minimized > * { visibility:hidden; pointer-events:none; }
    .lws-dock { pointer-events:auto; position:absolute; left:50%; bottom:18px; transform:translateX(-50%); min-height:66px; display:flex; align-items:center; gap:3px; padding:7px 10px; border-radius:23px; background:rgba(3,15,24,.94); border:1px solid rgba(74,215,236,.20); backdrop-filter:blur(16px); box-shadow:0 18px 55px rgba(0,0,0,.35); }
    .lws-dock-btn { min-width:70px; border:1px solid rgba(91,193,211,.18); background:rgba(8,24,34,.62); color:#effbff; padding:8px 8px; border-radius:12px; cursor:pointer; font:inherit; font-size:10px; font-weight:650; }
    .lws-dock-btn .i { display:block; color:#7feeff; font-size:18px; margin-bottom:4px; }
    .lws-dock-btn:hover { background:rgba(66,225,242,.08); }
    .lws-ai { width:88px; height:88px; margin:-18px 4px; border-radius:50%; border:1px solid #43ecfa; background:radial-gradient(circle at 50% 35%,rgba(61,226,245,.20),rgba(4,20,31,.96) 62%); box-shadow:0 0 25px rgba(42,223,241,.22); color:#fff; cursor:pointer; display:grid; place-items:center; align-content:center; }
    .lws-ai strong { font-size:10px; } .lws-ai span { font-size:8px; color:#7feeff; }
    .lws-live { position:absolute; left:98px; bottom:22px; pointer-events:auto; display:flex; gap:8px; align-items:center; padding:9px 12px; border:1px solid rgba(255,255,255,.10); border-radius:12px; background:rgba(3,15,24,.86); cursor:pointer; }
    .lws-live b { color:#57f1a9; font-size:9px; } .lws-live span { opacity:.56; font-size:9px; }
    .lws-layer-menu { pointer-events:auto; position:absolute; top:76px; left:94px; width:260px; padding:12px; border-radius:14px; background:rgba(3,15,24,.96); border:1px solid rgba(68,221,241,.22); box-shadow:0 18px 55px rgba(0,0,0,.35); backdrop-filter:blur(16px); display:none; }
    .lws-layer-menu.open { display:block; }
    .lws-layer-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .lws-layer-head strong { font-size:11px; letter-spacing:.12em; }
    .lws-layer-row { width:100%; border:0; background:transparent; color:#d7e8ed; padding:9px 8px; border-radius:9px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; font:inherit; }
    .lws-layer-row:hover { background:rgba(66,225,242,.07); }
    .lws-layer-state { font-size:8px; letter-spacing:.08em; opacity:.58; }
    .lws-layer-row.on .lws-layer-state { color:#54efae; opacity:1; }
    .lws-layer-row.unavailable { opacity:.38; cursor:default; }
    .lws-layer-group { margin:10px 6px 4px; font-size:8px; letter-spacing:.14em; color:#69e9f7; opacity:.72; }
    .lws-layer-id { display:block; margin-top:2px; font-size:7px; opacity:.38; }
    body.leeway-enterprise-shell #leeway-transit-world { top:76px; right:12px; width:min(425px,calc(100vw - 106px)); max-height:calc(100vh - 94px); border-radius:15px; z-index:9780; display:none; }
    body.leeway-enterprise-shell.leeway-right-ops-open #leeway-transit-world { display:block; }
    .lws-right-tabs { pointer-events:auto; position:absolute; top:132px; right:0; z-index:9810; display:grid; gap:7px; }
    .lws-right-tab { width:42px; min-height:78px; padding:7px 4px; border:1px solid rgba(71,225,242,.30); border-right:0; border-radius:11px 0 0 11px; background:rgba(3,15,24,.96); color:#dffcff; cursor:pointer; font:700 8px/1.2 Inter,ui-sans-serif,sans-serif; letter-spacing:.10em; writing-mode:vertical-rl; transform:rotate(180deg); }
    .lws-right-tab.active { color:#07131b; background:#42e5f2; border-color:#70f2ff; }
    .lws-right-tab:hover { box-shadow:0 0 18px rgba(66,229,242,.22); }
    body.leeway-enterprise-shell #leeway-transit-world .ltw-title { font-size:24px; }
    body.leeway-enterprise-shell #leeway-transit-world .ltw-section { padding:16px; }
    body.leeway-enterprise-shell #leeway-transit-world .ltw-section h3 { font-size:16px; }
    body.leeway-enterprise-shell #leeway-transit-world [data-action="world-awareness"] { display:none; }
    body.leeway-enterprise-shell.leeway-cctv-inspecting #leeway-transit-world { display:none !important; }
    body.leeway-enterprise-shell:not(.leeway-right-cctv-open) .lws-context-inspector { display:none !important; }
    .lws-context-inspector { pointer-events:auto; position:absolute; top:76px; right:12px; width:min(425px,calc(100vw - 106px)); max-height:calc(100vh - 94px); display:none; z-index:9790; }
    .lws-context-inspector.open { display:block; }
    .lws-context-inspector #cctv-panel { position:relative !important; inset:auto !important; top:auto !important; left:auto !important; right:auto !important; bottom:auto !important; width:100% !important; max-height:calc(100vh - 94px) !important; z-index:auto !important; margin:0 !important; transform:none !important; }
    .lws-context-inspector #cctv-panel.collapsed { display:none !important; }
    .lws-context-inspector .cctv-panel-inner { max-height:calc(100vh - 94px) !important; border-radius:15px !important; background:rgba(3,15,24,.96) !important; border-color:rgba(71,225,242,.24) !important; box-shadow:0 18px 55px rgba(0,0,0,.42) !important; }
    .lws-context-inspector #cctv-frame-wrap { border-radius:12px; overflow:hidden; }
    .lws-context-inspector #cctv-source-badge { font-size:9px; letter-spacing:.08em; }
    .lws-location-badge { pointer-events:none; position:absolute; top:76px; left:98px; z-index:9750; max-width:min(520px,calc(100vw - 620px)); padding:8px 12px; border:1px solid rgba(68,221,241,.25); border-radius:10px; background:rgba(3,15,24,.82); backdrop-filter:blur(12px); color:#ecfbff; box-shadow:0 8px 30px rgba(0,0,0,.22); }
    .lws-location-badge strong { font-size:12px; letter-spacing:.06em; }
    .lws-location-badge span { margin-left:8px; font-size:9px; opacity:.65; }
    .lws-ui-restore { display:none; pointer-events:auto; position:absolute; top:12px; right:12px; z-index:9900; border:1px solid rgba(72,227,241,.55); border-radius:10px; padding:9px 12px; background:rgba(3,15,24,.92); color:#eaffff; cursor:pointer; font:700 10px Inter,ui-sans-serif,sans-serif; }
    body.leeway-map-only #leeway-world-shell > :not(.lws-ui-restore) { display:none !important; }
    body.leeway-map-only #leeway-world-shell .lws-ui-restore { display:block !important; }
    body.leeway-map-only #leeway-transit-world,
    body.leeway-map-only #leeway-agent-lee,
    body.leeway-map-only #right-context-rail { display:none !important; }
    body.leeway-enterprise-shell #right-context-rail { display:none; pointer-events:auto; position:fixed !important; top:76px !important; right:12px !important; bottom:auto !important; left:auto !important; width:min(425px,calc(100vw - 106px)) !important; max-height:calc(100vh - 94px) !important; z-index:9795 !important; }
    body.leeway-enterprise-shell.leeway-right-weather-open #right-context-rail { display:block !important; }
    body.leeway-enterprise-shell.leeway-right-weather-open #right-context-rail > * { display:none !important; }
    body.leeway-enterprise-shell.leeway-right-weather-open #right-context-rail > #weather-panel { display:block !important; position:relative !important; inset:auto !important; width:100% !important; max-height:calc(100vh - 94px) !important; }
    body.leeway-enterprise-shell.leeway-right-weather-open #weather-panel .weather-panel-inner { background:rgba(3,15,24,.96); border-color:rgba(71,225,242,.24); border-radius:15px; }
    .lws-truck-status { grid-column:1/-1; padding:9px 10px; border:1px solid rgba(255,216,119,.35); border-radius:9px; background:rgba(255,216,119,.06); color:#ffd877; font-size:9px; letter-spacing:.06em; }
    .lws-truck-status[data-state="blocked"] { border-color:rgba(255,105,105,.5); color:#ff8f8f; background:rgba(255,80,80,.08); }
    .lws-truck-status[data-state="checked"] { border-color:rgba(100,230,190,.32); color:#9df1cf; background:rgba(80,220,170,.06); }
    .lws-toast { position:absolute; top:76px; left:50%; transform:translateX(-50%); opacity:0; pointer-events:none; padding:9px 14px; border-radius:10px; background:#071722; border:1px solid rgba(64,221,238,.24); transition:opacity .2s; }
    .lws-toast.show { opacity:1; }
    #leeway-load-comparison { position:fixed; z-index:10020; left:98px; top:76px; width:min(560px,calc(100vw - 122px)); max-height:calc(100vh - 100px); overflow:auto; padding:16px; border:1px solid rgba(75,231,255,.30); border-radius:18px; background:rgba(3,15,24,.97); color:#edffff; box-shadow:0 22px 68px rgba(0,0,0,.55); backdrop-filter:blur(16px); }
    #leeway-load-comparison header { display:flex; gap:14px; justify-content:space-between; } #leeway-load-comparison h2 { margin:3px 0; font-size:20px; } #leeway-load-comparison small { color:#8eeefa; letter-spacing:.1em; } #leeway-load-comparison p { margin:6px 0; color:#b9d5db; font-size:12px; line-height:1.4; } #leeway-load-comparison textarea { width:100%; min-height:100px; box-sizing:border-box; padding:10px; border-radius:10px; border:1px solid rgba(119,210,229,.30); background:#06141d; color:#efffff; font:12px/1.35 ui-monospace,monospace; resize:vertical; } #leeway-load-comparison label { display:grid; gap:4px; font-size:10px; color:#a9d7dd; } #leeway-load-comparison input { min-width:0; box-sizing:border-box; height:38px; padding:0 9px; border-radius:9px; border:1px solid rgba(119,210,229,.30); background:#06141d; color:#efffff; font:inherit; } #leeway-load-comparison button { border:1px solid rgba(75,231,255,.32); border-radius:9px; padding:7px 10px; color:#eaffff; background:#0b2733; font:inherit; cursor:pointer; } #leeway-load-comparison button:hover { background:#124151; } .llc-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:12px 0; } .llc-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:8px; } .llc-status { padding:8px; border-left:3px solid #4be7ff; background:rgba(75,231,255,.08); } .llc-offers { display:grid; gap:8px; margin-top:10px; } .llc-offer { --offer-color:#4be7ff; padding:10px; border-left:4px solid var(--offer-color); border-radius:10px; background:rgba(255,255,255,.04); } .llc-offer strong { display:block; color:var(--offer-color); } .llc-offer span { font-size:11px; color:#bddce2; } .llc-offer b { color:var(--offer-color); } .llc-offer small { display:block; margin-top:4px; color:#d2e7ea; letter-spacing:0; } .llc-note { opacity:.78; } .llc-file { display:inline-flex !important; place-items:center; gap:5px; min-height:34px; padding:7px 10px; border:1px solid rgba(75,231,255,.32); border-radius:9px; background:#0b2733; color:#eaffff !important; cursor:pointer; } .llc-file input { position:absolute; inline-size:1px; block-size:1px; opacity:0; pointer-events:none; } .llc-triangle { margin-top:14px; padding-top:12px; border-top:1px solid rgba(75,231,255,.18); } .llc-triangle-summary { margin-top:10px; padding:10px; border:1px solid rgba(255,182,89,.30); border-radius:10px; background:rgba(255,182,89,.07); color:#e7f5f7; } .llc-triangle-summary strong { color:#ffca78; } .llc-triangle-summary small { color:#bcd9de; } .llc-select { display:flex !important; grid-template-columns:none !important; align-items:center; gap:7px; margin-bottom:7px; color:#e5f8fa !important; } .llc-select input { width:15px !important; height:15px !important; accent-color:#4be7ff; }
    @media(max-width:720px){ #leeway-load-comparison { left:12px; top:64px; width:calc(100vw - 24px); max-height:calc(100vh - 78px); } .llc-grid { grid-template-columns:1fr; } }
    @media(max-width:1000px){.lws-top{grid-template-columns:270px 1fr}.lws-top-actions .hide-sm{display:none}.lws-brand strong{font-size:13px}.lws-brand span{display:none}.lws-dock-btn{min-width:58px}.lws-live{display:none}}
  `;
  documentRef.head.appendChild(style);
}

function icon(name) {
  return (
    {
      map: '▦',
      loads: '▣',
      drivers: '♙',
      fleet: '▰',
      transit: '▤',
      rail: '▥',
      facilities: '⌂',
      crm: '◇',
      intel: '▥',
      ai: '✦',
      layers: '▱',
      traffic: '▥',
      weather: '☁',
      freight: '▰',
      three: '◆',
      locate: '⌾',
    }[name] || '•'
  );
}

export function mountMapsShell(
  application,
  { edition = 'personal' } = {},
) {
  if (document.getElementById('leeway-world-shell')) return null;
  const isBusiness = false;
  ensureStyles(document);
  document.body.classList.add('leeway-enterprise-shell');
  document.body.dataset.leewayEdition = isBusiness ? 'business' : 'personal';

  const components = application.getComponents();
  const viewer = components.scene?.viewer;
  const dataManager = components.data?.dataManager;
  const mapStackController = components.scene?.mapStackController;
  const operations = components.scene?.operations;
  let labeledWorldStackRequested = false;
  const agentPanel = () => document.getElementById('leeway-agent-lee');
  const layerCategoryOrder = [
    'Transportation',
    'World Awareness',
    'Infrastructure',
    'Weather',
    'Media / Context',
    'Special',
  ];
  const layerCategories = {
    traffic: 'Transportation',
    'traffic-incidents': 'Transportation',
    'weather-alerts': 'Weather',
    transit: 'Transportation',
    'transit-routes': 'Transportation',
    'transit-stops': 'Transportation',
    'transit-vehicles': 'Transportation',
    bikeshare: 'Transportation',
    directions: 'Transportation',
    flights: 'Transportation',
    military: 'Transportation',
    'local-adsb': 'Transportation',
    'ais-live-vessels': 'Transportation',
    cctv: 'World Awareness',
    earthquakes: 'World Awareness',
    'fire-perimeters': 'World Awareness',
    'local-firms': 'World Awareness',
    satellites: 'World Awareness',
    'rocket-launches': 'World Awareness',
    'military-awareness': 'World Awareness',
    'local-datacenters': 'Infrastructure',
    'local-dams': 'Infrastructure',
    'military-installations': 'Infrastructure',
    'osm-pipelines': 'Infrastructure',
    'telegeography-submarine-cables': 'Infrastructure',
    'alpr-cameras': 'Infrastructure',
    wind: 'Weather',
    'weather-radar': 'Weather',
    'weather-satellite': 'Weather',
    'weather-lightning': 'Weather',
    'weather-cyclones': 'Weather',
    radio: 'Media / Context',
    'recent-imagery': 'Media / Context',
    'bhote-koshi-2026': 'Special',
    'bhote-koshi-locator': 'Special',
  };

  const shell = document.createElement('div');
  shell.id = 'leeway-world-shell';
  shell.innerHTML = `
    <header class="lws-top">
      <div class="lws-brand"><img class="lws-logo" src="${import.meta.env.BASE_URL}leeway-approved-logo.jpg" alt="LeeWay — approved blue circular logo" /><div><strong data-brand-name>${isBusiness ? 'LEEWAY LOGISTICS' : 'LEEWAY MAPS'}</strong><span data-brand-tagline>YOUR ROAD. YOUR ROUTE.</span></div></div>
      <div class="lws-search"><input aria-label="Global search" placeholder="${isBusiness ? 'Search locations, loads, drivers, equipment, facilities...' : 'Search addresses, places, trips, and roadside stops...'}" /><kbd>⌘ K</kbd></div>
      <div class="lws-top-actions">
        <button class="lws-chip" data-action="map">Map</button>
        <button class="lws-chip" data-action="world">◉ World</button>
        <button class="lws-chip" data-action="route">Directions</button>
        <button class="lws-chip hide-sm" data-action="layers">▱ Layers⌄</button>
        ${isBusiness ? '<button class="lws-chip hide-sm" data-action="workspace">Sales & CRM</button>' : ''}
        <button class="lws-chip" data-action="roadside">Road stops</button>${isBusiness ? '<button class="lws-chip" data-action="workspace-menu">Business</button>' : ''}<button class="lws-chip hide-sm" data-action="map-only">Hide controls</button>
        <div class="lws-avatar">AL</div><div class="lws-agent-status">Agent Lee · Copilot<br>Open to connect</div>
      </div>
    </header>
    <nav class="lws-rail" aria-label="Business workspace">
      ${(isBusiness
        ? [
            ['map', 'Map'],
            ['loads', 'Loads'],
            ['drivers', 'Drivers'],
            ['fleet', 'Fleet'],
            ['transit', 'Transit'],
            ['rail', 'Rail'],
            ['facilities', 'Facilities'],
            ['crm', 'CRM'],
            ['intel', 'Intelligence'],
            ['ai', 'AI'],
          ]
        : [
            ['map', 'Map'],
            ['transit', 'Transit'],
            ['intel', 'Intelligence'],
            ['ai', 'AI'],
          ]
      )
        .map(
          ([id, label], i) =>
            `<button class="lws-nav ${i === 0 ? 'active' : ''}" data-nav="${id}"><span class="i">${icon(id)}</span><span>${label}</span></button>`,
        )
        .join('')}
      <div class="lws-spacer"></div>
      <button class="lws-nav" data-action="collapse"><span class="i">«</span><span>Collapse</span></button>
    </nav>
    <aside class="lws-layer-menu" data-layer-menu>
      <div class="lws-layer-head"><strong>WORLD LAYERS</strong><button class="lws-chip" data-action="close-layers">×</button></div>
      <div data-layer-list></div>
    </aside>
    <div data-route-planner></div>
    <button class="lws-live" data-action="connect-world" type="button"><b data-world-led>● CHECK</b><span data-world-status>Connect live world data</span></button>
    <nav class="lws-dock">
      <button class="lws-dock-btn" data-action="peer-comms">${mapIcon('mic')}<span>Driver radio</span></button>
      ${[
        ['layers', 'Layers'],
        ['traffic', 'Traffic'],
        ['flights', 'Flights'],
        ['weather', 'Weather'],
      ]
        .map(
          ([id, label]) =>
            `<button class="lws-dock-btn" data-dock="${id}">${mapIcon(id)}<span>${label}</span></button>`,
        )
        .join('')}
      <button class="lws-dock-btn" data-action="view-map">${mapIcon('map')}<span>Map</span></button>
      <button class="lws-dock-btn" data-action="view-satellite">${mapIcon('satellite')}<span>Satellite</span></button>
      <button class="lws-dock-btn" data-action="report-hazard">${mapIcon('report')}<span>Report</span></button>
      <button class="lws-ai" data-action="ai" aria-label="Talk to Agent Lee">${mapIcon('mic')}<strong>Agent Lee</strong></button>
      <button class="lws-dock-btn" data-action="preferences">${mapIcon('settings')}<span>Language and music</span></button>
      ${(isBusiness
        ? [
            ['transit', 'Transit'],
            ['freight', 'Freight'],
            ['rail', 'Rail'],
            ['three', '3D'],
          ]
        : [
            ['transit', 'Transit'],
            ['three', '3D'],
          ]
      )
        .map(
          ([id, label]) =>
            `<button class="lws-dock-btn ${id === 'freight' || id === 'rail' ? 'business-only' : ''}" data-dock="${id}"><span class="i">${icon(id)}</span>${label}</button>`,
        )
        .join('')}
    </nav>
    <button class="lws-my-location" data-dock="locate" aria-label="My Location">⌾ My Location</button>
    <div class="lws-location-badge" data-location-badge><strong>WORLD</strong><span>Geographic identification loading…</span></div>
    <aside class="lws-context-inspector" data-context-inspector></aside>
    <div class="lws-right-tabs" aria-label="Right-side information panels">
      <button class="lws-right-tab" data-action="right-ops" type="button">OPS</button>
      <button class="lws-right-tab" data-action="right-cctv" type="button">CCTV</button>
      <button class="lws-right-tab" data-action="right-weather" type="button">WEATHER</button>
      <button class="lws-right-tab" data-action="right-national" type="button">NATION</button>
    </div>
    <button class="lws-ui-restore" data-action="restore-ui" type="button">SHOW CONTROLS</button>
    <button class="lws-inspector-toggle" data-action="collapse-inspector" type="button" aria-label="Collapse inspector">‹</button>
    <div class="lws-toast" role="status" aria-live="polite"></div>
  `;
  document.body.appendChild(shell);

  const toast = shell.querySelector('.lws-toast');
  const layerMenu = shell.querySelector('[data-layer-menu]');
  const layerList = shell.querySelector('[data-layer-list]');
  const routePlanner = shell.querySelector('[data-route-planner]');
  const locationBadge = shell.querySelector('[data-location-badge]');
  const worldLed = shell.querySelector('[data-world-led]');
  const worldStatus = shell.querySelector('[data-world-status]');
  const contextInspector = shell.querySelector('[data-context-inspector]');
  const cctvPanel = document.getElementById('cctv-panel');
  const cctvOriginalParent = cctvPanel?.parentNode || null;
  const cctvOriginalNextSibling = cctvPanel?.nextSibling || null;
  let cctvObserver = null;
  let weatherObserver = null;
  let toastTimer;
  let activeRightPanel = null;
  let recenteringDistantGlobe = false;
  const rightOpsTab = shell.querySelector('[data-action="right-ops"]');
  const rightCctvTab = shell.querySelector('[data-action="right-cctv"]');
  const rightWeatherTab = shell.querySelector('[data-action="right-weather"]');
  const rightNationalTab = shell.querySelector(
    '[data-action="right-national"]',
  );
  const weatherPanel = document.getElementById('weather-panel');
  let locationCell = '';
  let locationRequestGeneration = 0;
  function syncRightTabs() {
    document.body.classList.toggle(
      'leeway-right-ops-open',
      activeRightPanel === 'ops',
    );
    document.body.classList.toggle(
      'leeway-right-cctv-open',
      activeRightPanel === 'cctv',
    );
    document.body.classList.toggle(
      'leeway-right-weather-open',
      activeRightPanel === 'weather',
    );
    rightOpsTab?.classList.toggle('active', activeRightPanel === 'ops');
    rightCctvTab?.classList.toggle('active', activeRightPanel === 'cctv');
    rightWeatherTab?.classList.toggle('active', activeRightPanel === 'weather');
    rightNationalTab?.classList.toggle(
      'active',
      activeRightPanel === 'national',
    );
  }

  function setRightPanel(panel = null, { toggle = true } = {}) {
    const next = toggle && panel === activeRightPanel ? null : panel;
    activeRightPanel = next;
    if (next === 'cctv') {
      cctvPanel?.classList.remove('collapsed');
    } else if (cctvPanel && !cctvPanel.classList.contains('collapsed')) {
      cctvPanel.classList.add('collapsed');
    }
    if (next === 'weather') {
      weatherPanel?.removeAttribute('hidden');
      weatherPanel?.classList.remove('collapsed');
    } else if (weatherPanel && !weatherPanel.classList.contains('collapsed')) {
      weatherPanel.classList.add('collapsed');
    }
    contextInspector.classList.remove('minimized');
    syncRightTabs();
  }

  function syncCctvInspector() {
    const open = Boolean(
      cctvPanel && !cctvPanel.classList.contains('collapsed'),
    );
    contextInspector.classList.toggle('open', open);
    if (!open) contextInspector.classList.remove('minimized');
    if (open) {
      activeRightPanel = 'cctv';
      syncRightTabs();
    } else if (activeRightPanel === 'cctv') {
      activeRightPanel = null;
      syncRightTabs();
    }
    document.body.classList.toggle(
      'leeway-cctv-inspecting',
      open && activeRightPanel === 'cctv',
    );
  }

  if (cctvPanel) {
    contextInspector.appendChild(cctvPanel);
    cctvPanel.classList.add('collapsed');
    cctvObserver = new MutationObserver(syncCctvInspector);
    cctvObserver.observe(cctvPanel, {
      attributes: true,
      attributeFilter: ['class'],
    });
    syncCctvInspector();
  }
  if (weatherPanel) {
    const syncWeatherPanel = () => {
      const open =
        !weatherPanel.hidden && !weatherPanel.classList.contains('collapsed');
      if (!open && activeRightPanel === 'weather') {
        activeRightPanel = null;
        syncRightTabs();
      }
    };
    weatherObserver = new MutationObserver(syncWeatherPanel);
    weatherObserver.observe(weatherPanel, {
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
  }
  const closeRightPanel = () => setRightPanel(null, { toggle: false });
  document.addEventListener('leeway:right-panel-close', closeRightPanel);
  let cctvRecoveryTimer = null;
  let cctvRecoveryCount = 0;
  const recoverFailedCctv = (event) => {
    if (activeRightPanel !== 'cctv' || cctvRecoveryTimer) return;
    if (cctvRecoveryCount >= 6) {
      say(
        'Several public camera feeds failed. Choose another jurisdiction or camera; no live image is being claimed.',
      );
      return;
    }
    cctvRecoveryCount += 1;
    cctvRecoveryTimer = setTimeout(() => {
      cctvRecoveryTimer = null;
      const frame = document.getElementById('cctv-frame');
      if (
        frame?.dataset.cameraId !== event.detail?.cameraId ||
        frame?.dataset.error !== 'true'
      )
        return;
      document.getElementById('cctv-next-btn')?.click();
    }, 1200);
  };
  const confirmWorkingCctv = () => {
    cctvRecoveryCount = 0;
  };
  cctvPanel?.addEventListener(
    'leeway:cctv-frame-unavailable',
    recoverFailedCctv,
  );
  cctvPanel?.addEventListener('leeway:cctv-frame-ready', confirmWorkingCctv);

  function renderLayerMenu() {
    const rows = (dataManager?.getAll?.() || []).map((row) => ({
      ...row,
      category: layerCategories[row.id] || 'Special',
    }));

    const groups = new Map(layerCategoryOrder.map((name) => [name, []]));
    for (const row of rows) {
      if (!groups.has(row.category)) groups.set(row.category, []);
      groups.get(row.category).push(row);
    }

    layerList.innerHTML = [...groups.entries()]
      .filter(([, items]) => items.length)
      .map(([category, items]) => {
        const body = items
          .sort((a, b) =>
            String(a.name || a.id).localeCompare(String(b.name || b.id)),
          )
          .map((row) => {
            const enabled = Boolean(row.enabled);
            return `<button class="lws-layer-row ${enabled ? 'on' : ''}" data-shell-layer="${row.id}">
              <span>${row.name || row.id}<small class="lws-layer-id">${row.id}</small></span>
              <span class="lws-layer-state">${enabled ? 'ON' : 'OFF'}</span>
            </button>${enabled && ['weather-alerts', 'traffic-incidents'].includes(row.id) ? `<button class="lws-layer-row" data-alert-list="${row.id}">Read ${row.id === 'weather-alerts' ? 'weather alerts' : 'traffic incidents'}</button>` : ''}`;
          })
          .join('');
        return `<div class="lws-layer-group">${category}</div>${body}`;
      })
      .join('');
  }

  function toggleLayerMenu(open = null) {
    const next = open == null ? !layerMenu.classList.contains('open') : open;
    if (next) renderLayerMenu();
    layerMenu.classList.toggle('open', next);
  }

  function say(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function setWorldStatus(state, message) {
    const colors = {
      live: '#57f1a9',
      permission: '#ffd36b',
      offline: '#ff8c8c',
      checking: '#72eefa',
    };
    worldLed.style.color = colors[state] || colors.checking;
    worldLed.textContent =
      state === 'live'
        ? '● LIVE'
        : state === 'permission'
          ? '● PERMISSION'
          : state === 'offline'
            ? '● OFFLINE'
            : '● CHECK';
    worldStatus.textContent = message;
  }

  async function probeWorldProvider({ explain = false } = {}) {
    const bridge = globalThis.__leewayWorldApiBridge;
    if (!bridge?.installed || typeof bridge.probe !== 'function') {
      setWorldStatus('offline', 'Local live-data bridge not configured');
      if (explain)
        say('Live-world provider bridge is not configured in this build');
      return false;
    }

    setWorldStatus('checking', 'Checking LeeWay world providers…');
    const result = await bridge.probe();
    if (result.ok) {
      setWorldStatus('live', 'CCTV · world providers connected');
      if (explain) say('LeeWay live-world provider connected');
      return true;
    }

    const error = String(result.error || '');
    const permissionLikely =
      /permission|network|failed to fetch|load failed|blocked/i.test(error);
    if (permissionLikely) {
      setWorldStatus('permission', 'Click to allow local world data');
      if (explain) {
        say(
          'Allow this site to access loopback/local network when your browser asks',
        );
      }
    } else {
      setWorldStatus('offline', 'Start LeeWay World Providers');
      if (explain)
        say('Start the LeeWay World Provider runtime on this device');
    }
    return false;
  }

  const routing = mountRoutePlanner({ viewer, container: routePlanner });
  const offlineTrip = mountOfflineTrip({ planner: routing });
  const preferences = mountExperiencePreferences();
  const driveMode = mountDriveMode({
    planner: routing,
    viewer,
    onCopilot: () => toggleAgent(),
    onCloseCopilot: () => toggleAgent(false),
    onRadio: () => peerComms.open(),
  });
  const fuelAdvisor = mountFuelAdvisor({ planner: routing });
  const fuelLedger = mountFuelLedger({ planner: routing });
  const loadComparison = { open() {}, destroy() {} };
  const peerComms = mountPeerComms({ viewer });
  let hazardEntities = [];
  const hazardReports = mountHazardReports({
    container: document.body,
    getMapPoint: viewCenterPoint,
    onReports: (rows) => {
      for (const entity of hazardEntities) viewer.entities.remove(entity);
      hazardEntities = rows.map((row) =>
        viewer.entities.add({
          name: `${row.kind} · community report · unverified`,
          position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
          point: {
            pixelSize: 14,
            color: Cesium.Color.ORANGE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        }),
      );
      viewer.scene.requestRender?.();
    },
  });
  hazardReports.root.hidden = true;
  const roadside = mountRoadsidePlaces({
    viewer,
    getCenter: viewCenterPoint,
    onAdd: (point) => {
      routing.addMapStop(point);
      routing.open();
    },
    onFuel: (price, source) => {
      routing.setFuelPrice(price, source);
      routing.open();
    },
  });
  function toggleRoutePlanner(open = null) {
    if (open === false) routing.close();
    else if (open === true) routing.open();
    else routing.toggle();
    toggleLayerMenu(false);
  }

  function viewCenterPoint() {
    const canvas = viewer?.scene?.canvas;
    if (!viewer?.camera || !canvas) return null;
    try {
      const picked = viewer.camera.pickEllipsoid(
        new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
        viewer.scene.globe?.ellipsoid,
      );
      if (picked) {
        const carto = Cesium.Cartographic.fromCartesian(picked);
        return {
          lat: Cesium.Math.toDegrees(carto.latitude),
          lon: Cesium.Math.toDegrees(carto.longitude),
        };
      }
    } catch {}
    const carto = viewer.camera.positionCartographic;
    return carto
      ? {
          lat: Cesium.Math.toDegrees(carto.latitude),
          lon: Cesium.Math.toDegrees(carto.longitude),
        }
      : null;
  }

  async function updateLocationBadge() {
    const point = viewCenterPoint();
    if (!point || !locationBadge) return;
    const cell = `${point.lat.toFixed(1)},${point.lon.toFixed(1)}`;
    if (cell === locationCell) return;
    locationCell = cell;
    const generation = ++locationRequestGeneration;
    locationBadge.querySelector('strong').textContent = 'LOCATING…';
    try {
      const response = await fetch(
        `/api/regional-brief?latitude=${encodeURIComponent(point.lat)}&longitude=${encodeURIComponent(point.lon)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) throw new Error('Regional context unavailable');
      const payload = await response.json();
      if (generation !== locationRequestGeneration) return;
      const place = payload?.place;
      const strong = locationBadge.querySelector('strong');
      const detail = locationBadge.querySelector('span');
      strong.textContent =
        place?.locality || place?.region || place?.country || 'WORLD';
      detail.textContent =
        [place?.region, place?.country]
          .filter(
            (value, index, values) => value && values.indexOf(value) === index,
          )
          .join(' · ') || 'Geographic context';
    } catch {
      if (generation !== locationRequestGeneration) return;
      locationBadge.querySelector('strong').textContent = 'MAP';
      locationBadge.querySelector('span').textContent =
        'Geographic context unavailable';
    }
  }

  async function switchMapMode(mode) {
    const target =
      mode === 'map'
        ? 'osm'
        : mode === 'satellite'
          ? 'esri-labeled'
          : 'photoreal';
    if (!mapStackController?.isStackAvailable?.(target)) {
      if (mode === '3d') {
        await ensureLabeledWorldStack({ announce: true });
        return false;
      }
      say(`${mode} map source is unavailable`);
      return false;
    }
    await mapStackController.setStack(target);
    say(
      mode === '3d'
        ? '3D world view'
        : mode === 'satellite'
          ? 'Satellite + labels view'
          : '2D road map view',
    );
    void updateLocationBadge();
    return true;
  }

  async function ensureLabeledWorldStack({ announce = false } = {}) {
    if (!mapStackController) return false;
    const stacks = mapStackController.getStacks?.() || [];
    const available = (id) => {
      if (typeof mapStackController.isStackAvailable === 'function') {
        return mapStackController.isStackAvailable(id) === true;
      }
      const row = stacks.find((stack) => stack.id === id);
      return Boolean(row && row.available !== false);
    };
    const preferred = available('esri-labeled')
      ? 'esri-labeled'
      : available('bing-labels')
        ? 'bing-labels'
        : available('osm')
          ? 'osm'
          : null;
    if (!preferred) {
      if (announce) say('Labeled basemap is unavailable');
      return false;
    }
    try {
      const current = mapStackController.getActiveId?.();
      if (current !== preferred) await mapStackController.setStack(preferred);
      labeledWorldStackRequested = true;
      if (announce) {
        say(
          preferred === 'esri-labeled'
            ? 'Satellite map labels enabled'
            : preferred === 'bing-labels'
              ? 'Aerial map labels enabled'
              : 'OpenStreetMap labels enabled',
        );
      }
      return true;
    } catch {
      if (announce) say('Could not enable map labels');
      return false;
    }
  }

  function showWorld() {
    workspace.close();
    toggleAgent(false);
    toggleRoutePlanner(false);
    toggleLayerMenu(false);
    try {
      viewer?.camera?.flyTo?.({
        destination: Cesium.Cartesian3.fromDegrees(0, 18, 22_000_000),
        orientation: {
          heading: 0,
          pitch: -Cesium.Math.PI_OVER_TWO,
          roll: 0,
        },
        duration: 1.4,
      });
      say('World view');
    } catch {
      say('World view is unavailable');
    }
  }

  function recenterDistantGlobe() {
    if (!viewer?.camera || recenteringDistantGlobe) return;
    const activeStack = mapStackController?.getActiveId?.();
    if (activeStack === 'photoreal') return;
    const carto = viewer.camera.positionCartographic;
    if (!carto || !Number.isFinite(carto.height) || carto.height < 9_000_000)
      return;
    const pitchError = Math.abs(viewer.camera.pitch + Cesium.Math.PI_OVER_TWO);
    if (pitchError < Cesium.Math.toRadians(2)) return;
    recenteringDistantGlobe = true;
    try {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromRadians(
          carto.longitude,
          carto.latitude,
          carto.height,
        ),
        orientation: {
          heading: viewer.camera.heading || 0,
          pitch: -Cesium.Math.PI_OVER_TWO,
          roll: 0,
        },
      });
      viewer.scene.requestRender?.();
    } finally {
      recenteringDistantGlobe = false;
    }
  }

  const removeWorldCentering =
    viewer?.camera?.moveEnd?.addEventListener?.(recenterDistantGlobe) || null;
  const removeLocationBadgeListener =
    viewer?.camera?.moveEnd?.addEventListener?.(
      () => void updateLocationBadge(),
    ) || null;

  async function locate(query) {
    if (!query || !viewer) return false;
    try {
      const matches = await locationSearch.search(query);
      const point = matches[0];
      if (!point) throw new Error('No matching location');
      await viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 6000),
        duration: 1.2,
      });
      say(
        `Showing ${point.label}${matches.length > 1 ? ' · use Directions to select an exact address' : ''}`,
      );
      return true;
    } catch (error) {
      say(`Could not locate ${query}`);
      return false;
    }
  }

  const locationSearch = createRouteClient();

  const workspace = { open() {}, close() {}, openPeople() {}, openEquipment() {}, openCrm() {}, destroy() {} };
  const nationalCatalog = mountNationalCameraCatalog({
    host: shell,
    notify: say,
  });

  function setNav(id) {
    shell
      .querySelectorAll('[data-nav]')
      .forEach((button) =>
        button.classList.toggle('active', button.dataset.nav === id),
      );
  }

  function toggleAgent(open = null) {
    const panel = agentPanel();
    if (!panel) return;
    const next = open == null ? !panel.classList.contains('leeway-open') : open;
    panel.classList.toggle('leeway-open', next);
    panel.dispatchEvent(
      new CustomEvent(next ? 'leeway:agent-open' : 'leeway:agent-close'),
    );
  }

  function openWeather() {
    nationalCatalog.close();
    setRightPanel('weather');
    say('Loading weather observations…');
    // One slow wind feed must never prevent radar, clouds or controls from opening.
    for (const id of [
      'weather-radar',
      'weather-satellite',
      'weather-lightning',
    ]) {
      if (!dataManager?.layers?.has(id)) continue;
      void dataManager
        .setEnabled(id, true, { origin: 'user' })
        .catch((error) => {
          console.warn('Weather layer unavailable', id, error);
          say('Some weather data is unavailable; inspect layer status');
        });
    }
  }

  async function toggleLayer(id) {
    if (!dataManager?.layers?.has(id)) {
      say(`${id} layer is not available in this build`);
      return;
    }
    const layer = dataManager.getAll().find((row) => row.id === id);
    const nextEnabled = !layer?.enabled;
    await dataManager.setEnabled(id, nextEnabled, { origin: 'tool' });
    renderLayerMenu();
    say(`${layer?.name || id}: ${nextEnabled ? 'on' : 'off'}`);
  }

  async function handleSearch(value) {
    const q = String(value || '').trim();
    if (!q) return;
    toggleRoutePlanner(false);
    await locate(q);
  }

  shell
    .querySelector('.lws-search input')
    .addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        void handleSearch(event.currentTarget.value);
        event.currentTarget.select();
      }
    });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      shell.querySelector('.lws-search input').focus();
    }
  });

  shell.addEventListener('click', async (event) => {
    const nav = event.target.closest('[data-nav]');
    const action = event.target.closest('[data-action]')?.dataset.action;
    const dock = event.target.closest('[data-dock]')?.dataset.dock;
    const layerButton = event.target.closest('[data-shell-layer]');

    const alertButton = event.target.closest('[data-alert-list]');
    if (alertButton) {
      dataManager.layers.get(alertButton.dataset.alertList)?.module?.setParams?.({ list: true });
      toggleLayerMenu(false);
      return;
    }

    if (layerButton) {
      await toggleLayer(layerButton.dataset.shellLayer);
      return;
    }

    if (nav) {
      const id = nav.dataset.nav;
      setNav(id);
      if (id === 'map') {
        workspace.close();
        toggleAgent(false);
        return;
      }
      if (id === 'drivers') {
        workspace.openPeople();
        return;
      }
      if (id === 'fleet') {
        workspace.openEquipment();
        return;
      }
      if (id === 'facilities' || id === 'crm') {
        workspace.openCrm();
        return;
      }
      if (id === 'loads') {
        workspace.close();
        loadComparison.open();
        say(
          'Dispatch load comparison opened. Add up to three offers to map their separate pickup and delivery paths.',
        );
        return;
      }
      if (id === 'transit') {
        workspace.close();
        await toggleLayer('transit');
        return;
      }
      if (id === 'rail') {
        workspace.close();
        say('Rail operating view ready for rail provider binding');
        return;
      }
      if (id === 'intel') {
        workspace.close();
        toggleLayerMenu(true);
        return;
      }
      if (id === 'ai') {
        workspace.close();
        toggleAgent(true);
        return;
      }
    }

    if (action === 'ai') {
      toggleAgent();
      return;
    }
    if (action === 'preferences') {
      preferences.open();
      return;
    }
    if (action === 'connect-world') {
      await probeWorldProvider({ explain: true });
      return;
    }
    if (action === 'workspace-menu') {
      shell.classList.toggle('business-open');
      return;
    }
    if (action === 'roadside') {
      roadside.toggle();
      return;
    }
    if (action === 'peer-comms') {
      peerComms.toggle();
      return;
    }
    if (action === 'report-hazard') {
      hazardReports.root.hidden = !hazardReports.root.hidden;
      return;
    }
    if (action === 'map') {
      workspace.close();
      shell.classList.remove('business-open');
      setNav('map');
      return;
    }
    if (action === 'world') {
      showWorld();
      setNav('map');
      return;
    }
    if (action === 'route') {
      toggleRoutePlanner();
      return;
    }
    if (action === 'view-map') {
      await switchMapMode('map');
      return;
    }
    if (action === 'view-satellite') {
      await switchMapMode('satellite');
      return;
    }
    if (action === 'labels') {
      await ensureLabeledWorldStack({ announce: true });
      return;
    }
    if (action === 'map-only') {
      document.body.classList.add('leeway-map-only');
      return;
    }
    if (action === 'restore-ui') {
      document.body.classList.remove('leeway-map-only');
      return;
    }
    if (action === 'close-route') {
      toggleRoutePlanner(false);
      return;
    }
    if (action === 'right-ops') {
      nationalCatalog.close();
      setRightPanel('ops');
      return;
    }
    if (action === 'right-cctv') {
      nationalCatalog.close();
      const wasOpen = activeRightPanel === 'cctv';
      if (
        dataManager?.layers?.has('cctv') &&
        !dataManager.isEnabled?.('cctv')
      ) {
        await dataManager.setEnabled('cctv', true, { origin: 'user' });
      }
      setRightPanel(wasOpen ? null : 'cctv', { toggle: false });
      return;
    }
    if (action === 'right-national') {
      const next = activeRightPanel === 'national' ? null : 'national';
      activeRightPanel = next;
      if (next === 'national') {
        nationalCatalog.open();
        if (cctvPanel && !cctvPanel.classList.contains('collapsed'))
          cctvPanel.classList.add('collapsed');
        if (weatherPanel && !weatherPanel.classList.contains('collapsed'))
          weatherPanel.classList.add('collapsed');
      } else {
        nationalCatalog.close();
      }
      syncRightTabs();
      return;
    }
    if (action === 'right-weather') {
      openWeather();
      return;
    }
    if (action === 'collapse-inspector') {
      const minimized = contextInspector.classList.toggle('minimized');
      const button = shell.querySelector('[data-action="collapse-inspector"]');
      if (button) button.textContent = minimized ? '›' : '‹';
      return;
    }
    if (action === 'workspace') {
      workspace.open();
      return;
    }
    if (action === 'layers') {
      toggleLayerMenu();
      return;
    }
    if (action === 'close-layers') {
      toggleLayerMenu(false);
      return;
    }
    if (action === 'collapse') {
      shell.querySelector('.lws-rail').classList.toggle('compact');
      return;
    }

    if (dock === 'layers') {
      toggleLayerMenu();
      return;
    }
    if (dock === 'traffic') {
      await toggleLayer('traffic');
      return;
    }
    if (dock === 'flights') {
      await toggleLayer('flights');
      say(
        'Select an aircraft to view its tail, operator, route, origin and destination',
      );
      return;
    }
    if (dock === 'weather') {
      openWeather();
      return;
    }
    if (dock === 'transit') {
      await toggleLayer('transit');
      return;
    }
    if (dock === 'freight') {
      workspace.close();
      loadComparison.open();
      say('Freight load comparison opened');
      return;
    }
    if (dock === 'rail') {
      say('Rail provider binding is not yet verified');
      return;
    }
    if (dock === 'three') {
      try {
        await switchMapMode('3d');
      } catch {
        say('3D map stack unavailable');
      }
      return;
    }
    if (dock === 'locate') {
      routing.open();
      await routing.useMyLocation();
    }
  });

  /* Preserve the application's 3D option. Geographic
     identity is independent through the location badge, while Map and
     Satellite are explicit operator-selectable labeled views. */
  queueMicrotask(() => {
    syncRightTabs();
    void switchMapMode('map');
    recenterDistantGlobe();
    void updateLocationBadge();
    if (
      dataManager?.layers?.has('flights') &&
      !dataManager.isEnabled?.('flights')
    ) {
      void dataManager
        .setEnabled('flights', true, { origin: 'business-default' })
        .catch((error) => {
          console.warn('Live aircraft awareness unavailable', error);
        });
    }
  });

  async function selectCctv(query) {
    const requested = String(query || '').trim().toLowerCase();
    if (!requested)
      return { ok: false, reason: 'camera-query-required' };
    nationalCatalog.close();
    if (
      dataManager?.layers?.has('cctv') &&
      !dataManager.isEnabled?.('cctv')
    ) {
      await dataManager.setEnabled('cctv', true, { origin: 'copilot' });
    }
    setRightPanel('cctv', { toggle: false });
    const cctv = dataManager?.layers?.get('cctv')?.module;
    const cameras = cctv?.getUIState?.()?.cameras || [];
    const match =
      cameras.find(
        (camera) => String(camera.id || '').toLowerCase() === requested,
      ) ||
      cameras.find(
        (camera) => String(camera.name || '').toLowerCase() === requested,
      ) ||
      cameras.find((camera) =>
        `${camera.id || ''} ${camera.name || ''}`
          .toLowerCase()
          .includes(requested),
      );
    if (!match) {
      say(`No loaded CCTV camera matched ${query}.`);
      return {
        ok: false,
        reason: 'camera-not-found',
        cameraCount: cameras.length,
      };
    }
    const selected = cctv?.selectCamera?.(match.id);
    if (!selected) {
      say(`Camera ${match.name || match.id} could not be selected.`);
      return { ok: false, reason: 'camera-select-failed', id: match.id };
    }
    cctv?.focusCamera?.(match.id, 1.8);
    say(`Showing ${match.name || match.id}.`);
    return {
      ok: true,
      id: match.id,
      name: match.name || match.id,
      provider: match.provider || null,
      city: match.city || null,
    };
  }

  return {
    root: shell,
    workspace,
    routePlanner: routing,
    locate,
    openWorkspace: (tab = 'overview') => workspace.open(tab),
    openLoadPlanning: () => {
      workspace.close();
      loadComparison.open();
      say('Dispatch planning belongs to LeeWay Logistics.');
    },
    openWeather,
    async openCctv() {
      nationalCatalog.close();
      if (
        dataManager?.layers?.has('cctv') &&
        !dataManager.isEnabled?.('cctv')
      ) {
        await dataManager.setEnabled('cctv', true, { origin: 'tool' });
      }
      setRightPanel('cctv', { toggle: false });
    },
    selectCctv,
    openAgent: () => toggleAgent(true),
    closeAgent: () => toggleAgent(false),
    notify: say,
    destroy() {
      cctvObserver?.disconnect();
      weatherObserver?.disconnect();
      document.removeEventListener('leeway:right-panel-close', closeRightPanel);
      clearTimeout(cctvRecoveryTimer);
      cctvPanel?.removeEventListener(
        'leeway:cctv-frame-unavailable',
        recoverFailedCctv,
      );
      cctvPanel?.removeEventListener(
        'leeway:cctv-frame-ready',
        confirmWorkingCctv,
      );
      cctvObserver = null;
      weatherObserver = null;
      removeWorldCentering?.();
      removeLocationBadgeListener?.();
      if (cctvPanel && cctvOriginalParent) {
        if (
          cctvOriginalNextSibling &&
          cctvOriginalNextSibling.parentNode === cctvOriginalParent
        ) {
          cctvOriginalParent.insertBefore(cctvPanel, cctvOriginalNextSibling);
        } else {
          cctvOriginalParent.appendChild(cctvPanel);
        }
      }
      document.body.classList.remove(
        'leeway-enterprise-shell',
        'leeway-cctv-inspecting',
        'leeway-right-ops-open',
        'leeway-right-cctv-open',
        'leeway-right-weather-open',
        'leeway-map-only',
      );
      driveMode.destroy();
      preferences.destroy();
      offlineTrip.destroy();
      fuelAdvisor.destroy();
      fuelLedger.destroy();
      loadComparison.destroy();
      hazardReports.destroy();
      peerComms.destroy();
      routing.destroy();
      roadside.destroy();
      nationalCatalog.destroy();
      workspace.destroy();
      shell.remove();
    },
  };
}

