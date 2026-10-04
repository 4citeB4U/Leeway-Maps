import { mountDeviceLocation } from './deviceLocation.js';
import { layerStatusText, escapeLayerText } from './layerStatusText.js';
import { mountMapViewControls } from './mapViewControls.js';
import { mountMapToolsPanel } from './mapToolsPanel.js';
import { mountMapReports } from './mapReports.js';
import * as Cesium from 'cesium';
import { mountRoutePlanner } from './routePlanner.js';
import { createRouteClient } from './routePlannerCore.js';
import './mapFirst.css';
import './personalTheme.css';
import './mobileReadability.css';
import { mountRoadsidePlaces } from './roadsidePlaces.js';
import { mountDriveMode } from './driveMode.js';
import { mountFuelAdvisor } from './fuelAdvisor.js';
import { mountHazardReports } from './hazardReports.js';
import { mountPeerComms } from './peerComms.js';
import { mountNationalCameraCatalog } from './nationalCameraCatalog.js';
import { mountOfflineTrip } from './offlineTrip.js';
import { mapIcon } from './mapIcons.js';
import { mountExperiencePreferences } from './experiencePreferences.js';
import { openNearestCctv } from './cctvExperience.js';
import { mountFeatureCenter } from './featureCenter.js';
import { featureCatalogForEdition } from './productFeatureCatalog.js';
import { mountJourneyContinuityMonitor } from './journeyContinuityMonitor.js';
import { applyMobileRenderPolicy, deviceCapabilityProfile } from './devicePerformanceProfile.js';
import { buildWorkloadPlan, discoverRuntimeCapabilities } from './runtimeWorkloadBroker.js';
import { mountPersonalCockpitViewport } from './personalCockpitViewport.js';

const PERSONAL_HIDDEN_LAYER_IDS = new Set([
  'military',
  'local-adsb',
  'military-awareness',
  'military-installations',
  'alpr-cameras',
]);

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
    @media(max-width:1000px){.lws-top{grid-template-columns:270px 1fr}.lws-top-actions .hide-sm{display:none}.lws-brand strong{font-size:13px}.lws-brand span{display:none}.lws-dock-btn{min-width:58px}.lws-live{display:none}}
  `;
  documentRef.head.appendChild(style);
}

function icon(name) {
  return (
    {
      map: '▦',
      transit: '▤',
      rail: '▥',
      intel: '▥',
      ai: '✦',
      layers: '▱',
      traffic: '▥',
      weather: '☁',
      three: '◆',
      locate: '⌾',
      features: '◎',
    }[name] || '•'
  );
}

export function mountMapsShell(application, { edition = 'personal' } = {}) {
  if (document.getElementById('leeway-world-shell')) return null;
  ensureStyles(document);
  document.body.classList.add('leeway-enterprise-shell');
  document.body.dataset.leewayEdition = 'personal';

  const components = application.getComponents();
  const styleManager = components.controls?.styleManager;
  const viewer = components.scene?.viewer;
  const dataManager = components.data?.dataManager;
  const catalog = components.data?.catalog;
  const mapStackController = components.scene?.mapStackController;
  const operations = components.scene?.operations;
  let labeledWorldStackRequested = false;
  const agentPanel = () => document.getElementById('leeway-agent-lee');
  const layerCategoryOrder = [
    'Getting around',
    'Nearby & live',
    'Places & infrastructure',
    'Weather',
    'Media & context',
    'Other',
  ];
  const layerCategories = {
    traffic: 'Getting around',
    'traffic-incidents': 'Getting around',
    'weather-alerts': 'Weather',
    transit: 'Getting around',
    'transit-routes': 'Getting around',
    'transit-stops': 'Getting around',
    'transit-vehicles': 'Getting around',
    bikeshare: 'Getting around',
    directions: 'Getting around',
    flights: 'Getting around',
    military: 'Getting around',
    'local-adsb': 'Getting around',
    'ais-live-vessels': 'Getting around',
    cctv: 'Nearby & live',
    earthquakes: 'Nearby & live',
    'fire-perimeters': 'Nearby & live',
    'local-firms': 'Nearby & live',
    satellites: 'Nearby & live',
    'rocket-launches': 'Nearby & live',
    'military-awareness': 'Nearby & live',
    'local-datacenters': 'Places & infrastructure',
    'local-dams': 'Places & infrastructure',
    'military-installations': 'Places & infrastructure',
    'osm-pipelines': 'Places & infrastructure',
    'telegeography-submarine-cables': 'Places & infrastructure',
    'alpr-cameras': 'Places & infrastructure',
    wind: 'Weather',
    'weather-radar': 'Weather',
    'weather-satellite': 'Weather',
    'weather-lightning': 'Weather',
    'weather-cyclones': 'Weather',
    radio: 'Media & context',
    'recent-imagery': 'Media & context',
    'bhote-koshi-2026': 'Other',
    'bhote-koshi-locator': 'Other',
  };

  const shell = document.createElement('div');
  shell.id = 'leeway-world-shell';
  shell.innerHTML = `
    <header class="lws-top lm-top">
      <div class="lws-brand lm-brand">
        <button class="lm-brand-button" data-action="map" type="button" aria-label="LeeWay Maps home">
          <span class="lm-brand-mark" aria-hidden="true">
            <img class="lm-brand-logo" src="${import.meta.env.BASE_URL}icon-192.png" alt="" />
          </span>
          <span class="lm-brand-copy"><strong data-brand-name>LeeWay Maps</strong><span data-brand-tagline>Go anywhere. Know what's around you.</span></span>
        </button>
      </div>
      <div class="lws-search lm-search">
        <span class="lm-search-icon" aria-hidden="true">⌕</span>
        <input aria-label="Search LeeWay Maps" placeholder="Where do you want to go?" />
      </div>
      <div class="lws-top-actions lm-top-actions" aria-hidden="true"></div>
    </header>

    <nav class="lws-rail lm-rail" aria-label="LeeWay Maps navigation">
      <button class="lws-nav active" data-nav="map" type="button">${mapIcon('home')}<span>Home</span></button>
      <button class="lws-nav" data-dock="locate" type="button">${mapIcon('locate')}<span>My location</span></button>
      <button class="lws-nav" data-nav="transit" type="button">${mapIcon('transit')}<span>Transit</span></button>
      <button class="lws-nav" data-nav="features" type="button">${mapIcon('explore')}<span>Explore</span></button>
      <button class="lws-nav" data-dock="traffic" type="button">${mapIcon('traffic')}<span>Traffic</span></button>
      <button class="lws-nav" data-dock="cctv" type="button">${mapIcon('cctv')}<span>Cameras</span></button>
      <button class="lws-nav" data-dock="weather" type="button">${mapIcon('weather')}<span>Weather</span></button>
      <button class="lws-nav" data-action="cockpit" type="button">${mapIcon('cockpit')}<span>Cockpit</span></button>
      <div class="lws-spacer"></div>
      <button class="lws-nav lm-rail-more" data-dock="layers" type="button">${mapIcon('more')}<span>More</span></button>
    </nav>
    <button class="lm-rail-toggle" data-action="toggle-personal-rail" type="button" aria-label="Collapse map controls" aria-expanded="true">‹</button>

    <aside class="lws-layer-menu lm-sheet" data-layer-menu>
      <div class="lws-layer-head"><strong>More</strong><div class="lm-sheet-actions"><button class="lws-chip" data-action="help" type="button">Help / Atlas</button><button class="lws-chip" data-action="preferences" type="button">Settings</button><button class="lws-chip" data-action="map-tools" type="button">Map display</button><button class="lws-chip" data-action="close-layers" aria-label="Close more menu">×</button></div></div>
      <p class="lm-sheet-help">Turn on only what you want to see. LeeWay keeps live, scheduled and mapped information separate.</p>
      <div data-layer-list></div>
    </aside>

    <div data-route-planner></div>
    <button class="lws-live" data-action="connect-world" type="button"><b data-world-led>● CHECK</b><span data-world-status>Connect live world data</span></button>

    <nav class="lws-dock lm-dock lm-agent-dock" aria-label="Agent Lee">
      <div class="lm-agent-flip" data-agent-flip>
        <button class="lws-ai lm-agent-mic" data-action="ai" type="button" aria-label="Talk to Agent Lee">${mapIcon('mic')}<strong>Agent Lee</strong></button>
        <div class="lm-agent-card-slot" data-agent-slot></div>
      </div>
    </nav>

    <div class="lws-location-badge lm-location-card" data-location-badge hidden aria-hidden="true"><strong></strong><span></span></div>
    <aside class="lws-context-inspector lm-left-drawer" data-context-inspector></aside>

    <section class="lm-cctv-viewport" data-cctv-viewport hidden aria-label="Current CCTV view">
      <header><span class="lm-live-dot" aria-hidden="true"></span><strong data-cctv-channel>CCTV</strong><button type="button" data-action="hide-cctv-view" aria-label="Hide CCTV view">×</button></header>
      <div class="lm-cctv-frame-slot" data-cctv-frame-slot></div>
    </section>

    <button class="lws-ui-restore" data-action="restore-ui" type="button">Show controls</button>
    <button class="lws-inspector-toggle" data-action="collapse-inspector" type="button" aria-label="Collapse panel">‹</button>
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
  let cctvViewportArmed = false;
  let personalCctvPerfInitialized = false;
  let toastTimer;
  let activeRightPanel = null;
  let recenteringDistantGlobe = false;
  const cctvViewport = shell.querySelector('[data-cctv-viewport]');
  const cctvFrameSlot = shell.querySelector('[data-cctv-frame-slot]');
  const cctvChannel = shell.querySelector('[data-cctv-channel]');
  const weatherPanel = document.getElementById('weather-panel');
  const weatherOriginalParent = weatherPanel?.parentNode || null;
  const weatherOriginalNextSibling = weatherPanel?.nextSibling || null;
  let locationCell = '';
  let locationRequestGeneration = 0;
  function syncRightTabs() {
    document.body.classList.toggle('leeway-right-ops-open', activeRightPanel === 'ops');
    document.body.classList.toggle('leeway-right-cctv-open', activeRightPanel === 'cctv');
    document.body.classList.toggle('leeway-right-weather-open', activeRightPanel === 'weather');
  }

  function setRightPanel(panel = null, { toggle = true } = {}) {
    const next = toggle && panel === activeRightPanel ? null : panel;
    activeRightPanel = next;
    contextInspector.classList.toggle('open', Boolean(next));
    if (next === 'cctv') {
      cctvPanel?.classList.remove('collapsed');
      if (cctvViewport) cctvViewport.hidden = false;
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
    const cctvOpen = Boolean(
      cctvPanel && !cctvPanel.classList.contains('collapsed'),
    );
    const weatherOpen = Boolean(
      weatherPanel &&
        !weatherPanel.hidden &&
        !weatherPanel.classList.contains('collapsed'),
    );
    contextInspector.classList.toggle('open', cctvOpen || weatherOpen);
    if (!cctvOpen && !weatherOpen) contextInspector.classList.remove('minimized');
    if (cctvOpen) {
      activeRightPanel = 'cctv';
    } else if (activeRightPanel === 'cctv') {
      activeRightPanel = weatherOpen ? 'weather' : null;
    }
    syncRightTabs();
    document.body.classList.toggle(
      'leeway-cctv-inspecting',
      cctvOpen && activeRightPanel === 'cctv',
    );
  }

  if (cctvPanel) {
    contextInspector.appendChild(cctvPanel);
    cctvPanel.classList.add('collapsed');
    const frameWrap = cctvPanel.querySelector('#cctv-frame-wrap');
    if (frameWrap && cctvFrameSlot) cctvFrameSlot.appendChild(frameWrap);
    const updateCctvChannel = () => {
      const select = document.getElementById('cctv-camera-select');
      const option = select?.selectedOptions?.[0];
      const label =
        option?.textContent?.trim() ||
        document.getElementById('cctv-meta')?.textContent?.trim() ||
        'CCTV';
      if (cctvChannel) cctvChannel.textContent = label;
      if (cctvViewportArmed && cctvViewport) cctvViewport.hidden = false;
    };
    document.getElementById('cctv-camera-select')?.addEventListener('change', updateCctvChannel);
    cctvViewport?.addEventListener('leeway:cctv-frame-ready', updateCctvChannel);
    cctvObserver = new MutationObserver(syncCctvInspector);
    cctvObserver.observe(cctvPanel, {
      attributes: true,
      attributeFilter: ['class'],
    });
    syncCctvInspector();
  }
  if (weatherPanel) {
    contextInspector.appendChild(weatherPanel);
    weatherPanel.classList.add('collapsed');
    const syncWeatherPanel = () => {
      const weatherOpen =
        !weatherPanel.hidden && !weatherPanel.classList.contains('collapsed');
      const cctvOpen = Boolean(
        cctvPanel && !cctvPanel.classList.contains('collapsed'),
      );
      if (weatherOpen) activeRightPanel = 'weather';
      else if (activeRightPanel === 'weather')
        activeRightPanel = cctvOpen ? 'cctv' : null;
      contextInspector.classList.toggle('open', weatherOpen || cctvOpen);
      syncRightTabs();
    };
    weatherObserver = new MutationObserver(syncWeatherPanel);
    weatherObserver.observe(weatherPanel, {
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
  }
  const closeRightPanel = () => setRightPanel(null, { toggle: false });

  function makeFloatingPanel(panel) {
    if (!panel) return () => {};
    const handle = panel.querySelector('header');
    if (!handle) return () => {};
    let drag = null;
    const move = (event) => {
      if (!drag) return;
      const left = Math.max(8, Math.min(globalThis.innerWidth - panel.offsetWidth - 8, drag.left + event.clientX - drag.x));
      const top = Math.max(86, Math.min(globalThis.innerHeight - panel.offsetHeight - 8, drag.top + event.clientY - drag.y));
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };
    const up = () => {
      drag = null;
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', up);
    };
    const down = (event) => {
      if (event.target.closest('button,input,select,a')) return;
      const rect = panel.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      globalThis.addEventListener('pointermove', move);
      globalThis.addEventListener('pointerup', up, { once: true });
    };
    handle.addEventListener('pointerdown', down);
    return () => {
      handle.removeEventListener('pointerdown', down);
      up();
    };
  }
  const stopCctvViewportDrag = makeFloatingPanel(cctvViewport);
  document.addEventListener('leeway:right-panel-close', closeRightPanel);
  let cctvRecoveryTimer = null;
  let cctvRecoveryCount = 0;
  const recoverFailedCctv = (event) => {
    if (activeRightPanel !== 'cctv' || cctvRecoveryTimer) return;
    if (
      !document
        .getElementById('cctv-auto-hop-btn')
        ?.classList.contains('active')
    )
      return;
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
      if (
        document
          .getElementById('cctv-auto-hop-btn')
          ?.classList.contains('active')
      )
        document.getElementById('cctv-next-btn')?.click();
    }, 1200);
  };
  const confirmWorkingCctv = () => {
    cctvRecoveryCount = 0;
  };
  cctvViewport?.addEventListener(
    'leeway:cctv-frame-unavailable',
    recoverFailedCctv,
  );
  cctvViewport?.addEventListener(
    'leeway:cctv-frame-ready',
    confirmWorkingCctv,
  );

  function renderLayerMenu() {
    const rows = (dataManager?.getAll?.() || [])
      .filter((row) => !PERSONAL_HIDDEN_LAYER_IDS.has(row.id))
      .map((row) => ({
        ...row,
        category: layerCategories[row.id] || 'Other',
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
              <span>${escapeLayerText(row.name || row.id)}<small class="lws-layer-id">${escapeLayerText(layerStatusText(row))}</small></span>
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

  const routing = mountRoutePlanner({ viewer, container: routePlanner, navigate: fly => {
    styleManager.controlCockpit?.('exit');
    return styleManager.runImmediateLocationNavigation(fly);
  } });
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

  function applyPersonalCctvPerformanceDefaults() {
    if (personalCctvPerfInitialized) return;
    const cctv = dataManager?.layers?.get('cctv')?.module;
    cctv?.setParams?.(
      {
        coverageMode: 'off',
        showProjection: false,
        autoHop: false,
      },
      { origin: 'personal-performance-default' },
    );
    personalCctvPerfInitialized = true;
  }

  async function openPersonalCctvControls() {
    cctvViewportArmed = true;
    if (cctvViewport) cctvViewport.hidden = false;
    if (
      dataManager?.layers?.has('cctv') &&
      !dataManager.isEnabled?.('cctv')
    ) {
      await dataManager.setEnabled('cctv', true, { origin: 'user' });
    }
    applyPersonalCctvPerformanceDefaults();
    setRightPanel('cctv', { toggle: false });
    return openNearestCctv(dataManager, {
      origin: 'user',
      durationSec: 1.4,
    });
  }

  async function enableTransitSuite() {
    const requested = [
      'transit',
      'transit-routes',
      'transit-stops',
      'transit-vehicles',
    ];
    const results = [];
    for (const id of requested) {
      if (!dataManager?.layers?.has(id)) continue;
      try {
        if (!dataManager.isEnabled?.(id))
          await dataManager.setEnabled(id, true, { origin: 'user' });
        results.push(id);
      } catch {}
    }
    say(
      results.length
        ? `Public transit layers enabled · ${results.join(', ')}`
        : 'Transit layers are unavailable in this build',
    );
    return results.length > 0;
  }

  function openFuelTools() {
    routing.open();
    for (const details of document.querySelectorAll(
      '.lw-fuel-advisor details, .lw-fuel-ledger > details',
    )) {
      details.open = true;
    }
    say('Fuel, range and cost tools opened');
  }

  const featureCenter = mountFeatureCenter({
    catalog: featureCatalogForEdition('personal'),
    edition: 'personal',
    onAction: async (actionName, featureDomain) => {
      featureCenter.close();
      if (actionName === 'routing') {
        routing.open();
        say(`${featureDomain.label} · route tools opened`);
        return true;
      }
      if (actionName === 'layers') {
        toggleLayerMenu(true);
        return true;
      }
      if (actionName === 'offline') {
        routing.open();
        const offlineDetails = [...routing.root.querySelectorAll('details')].find(
          (details) => /offline/i.test(details.textContent || ''),
        );
        if (offlineDetails) offlineDetails.open = true;
        say('Offline trip controls opened');
        return true;
      }
      if (actionName === 'roadside') {
        roadside.toggle();
        return true;
      }
      if (actionName === 'fuel') {
        openFuelTools();
        return true;
      }
      if (actionName === 'community') {
        hazardReports.root.hidden = false;
        say('Community hazard and safety reporting opened');
        return true;
      }
      if (actionName === 'transit') {
        return enableTransitSuite();
      }
      if (actionName === 'cctv') {
        const opened = await openPersonalCctvControls();
        say(
          opened.ok
            ? `CCTV · ${opened.camera?.name || opened.cameraId}`
            : `CCTV catalog opened · ${opened.reason}`,
        );
        return opened.ok;
      }
      if (actionName === 'preferences') {
        preferences.open();
        return true;
      }
      if (actionName === 'cockpit') {
        const result = personalCockpit.open();
        if (!result?.ok) say(result?.error || 'Cockpit unavailable');
        return Boolean(result?.ok);
      }
      toggleLayerMenu(true);
      return true;
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
    const devicePoint = deviceLocation.getPoint();
    if (!devicePoint) {
      currentLocationLabel = 'Your location';
      mapReports.refresh();
      return;
    }
    const cell = `device:${devicePoint.lat.toFixed(3)},${devicePoint.lon.toFixed(3)}`;
    if (cell === locationCell) return;
    locationCell = cell;
    const generation = ++locationRequestGeneration;
    try {
      const response = await fetch(
        `/api/regional-brief?latitude=${encodeURIComponent(devicePoint.lat)}&longitude=${encodeURIComponent(devicePoint.lon)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) throw new Error('Regional context unavailable');
      const payload = await response.json();
      if (generation !== locationRequestGeneration) return;
      const place = payload?.place;
      currentLocationLabel =
        place?.locality || place?.region || place?.country || 'Your location';
    } catch {
      if (generation !== locationRequestGeneration) return;
      currentLocationLabel = 'Your location';
    }
    mapReports.refresh();
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
          : 'Street map imagery',
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
    if (document.body.classList.contains('cockpit-mode')) return;
    if (!viewer?.camera || recenteringDistantGlobe) return;
    const activeStack = mapStackController?.getActiveId?.();
    if (activeStack === 'photoreal') return;
    const carto = viewer.camera.positionCartographic;
    if (!carto || !Number.isFinite(carto.height) || carto.height < 5_500_000)
      return;
    const pitchError = Math.abs(viewer.camera.pitch + Cesium.Math.PI_OVER_TWO);
    if (pitchError < Cesium.Math.toRadians(0.75)) return;
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
    viewer?.camera?.moveEnd?.addEventListener?.(recenterDistantGlobe) || null;
  const onViewportResize = () => recenterDistantGlobe();
  globalThis.addEventListener?.('resize', onViewportResize);

  async function locate(query, { altitude = 6000 } = {}) {
    if (!query || !viewer) return false;
    try {
      const matches = await locationSearch.search(query);
      const point = matches[0];
      if (!point) throw new Error('No matching location');
      const requestedAltitude = Number(altitude);
      const safeAltitude = Number.isFinite(requestedAltitude)
        ? Math.max(1000, requestedAltitude)
        : 6000;
      styleManager.controlCockpit?.('exit');
      const moved = styleManager.runImmediateLocationNavigation(() => { viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          point.lon,
          point.lat,
          safeAltitude,
        ),
        duration: 1.2,
      }); return true; });
      if (moved === false) throw new Error('Camera navigation blocked');
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

  const nationalCatalog = mountNationalCameraCatalog({
    host: shell,
    notify: say,
    onJurisdictionSelect: async (row, action) => {
      const name = String(row?.name || '').trim();
      if (!name) return false;
      const altitude =
        row?.type === 'federal-district'
          ? 85000
          : row?.type === 'territory'
            ? 300000
            : 500000;
      const found = await locate(
        `${name}, ${row?.country || 'United States'}`,
        { altitude },
      );
      if (!found) return false;

      nationalCatalog.close();
      if (!action?.canViewCameras) {
        setRightPanel(null, { toggle: false });
        if (action?.requiredCredential) {
          say(
            `${name} camera connector is ready · add ${action.requiredCredential} to activate it`,
          );
        } else {
          say(
            `${name} located · no verified integrated camera feed is registered yet`,
          );
        }
        return true;
      }

      setRightPanel('cctv', { toggle: false });
      const opened = await openNearestCctv(dataManager, {
        origin: 'user',
        durationSec: 1.4,
      });
      if (!opened.ok) {
        say(`${name} camera catalog opened · ${opened.reason}`);
        return true;
      }
      say(
        `${name} CCTV · ${opened.camera?.name || opened.cameraId} · ${opened.camera?.provider || 'official provider'}`,
      );
      return true;
    },
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
    shell.querySelector('[data-agent-flip]')?.classList.toggle('open', next);
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
    toggleLayerMenu(false);
    const result = await routing.routeFromVoice({
      origin: 'current',
      destination: q,
    });
    if (!result?.ok) {
      routing.open();
      if (!result?.needsSelection) {
        say('Trip search opened. Confirm the destination or choose a matching address.');
      }
    }
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
      dataManager.layers
        .get(alertButton.dataset.alertList)
        ?.module?.setParams?.({ list: true });
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
        toggleAgent(false);
        return;
      }
      if (id === 'transit') {
        await enableTransitSuite();
        return;
      }
      if (id === 'features') {
        featureCenter.open();
        return;
      }
      if (id === 'intel') {
        toggleLayerMenu(true);
        return;
      }
      if (id === 'ai') {
        toggleAgent(true);
        return;
      }
    }

    if (action === 'ai') {
      toggleAgent();
      return;
    }
    if (action === 'cockpit') {
      const result = personalCockpit.open();
      if (!result?.ok) say(result?.error || 'Cockpit unavailable');
      return;
    }
    if (action === 'help') {
      preferences.openAtlas?.();
      return;
    }
    if (action === 'preferences') {
      toggleLayerMenu(false);
      preferences.open();
      return;
    }
    if (action === 'map-tools') {
      toggleLayerMenu(false);
      getMapToolsPanel().open();
      return;
    }
    if (action === 'connect-world') {
      await probeWorldProvider({ explain: true });
      return;
    }
    if (action === 'roadside') {
      roadside.toggle();
      return;
    }
    if (action === 'capabilities') {
      featureCenter.toggle();
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
    if (action === 'layers') {
      toggleLayerMenu();
      return;
    }
    if (action === 'close-layers') {
      toggleLayerMenu(false);
      return;
    }
    if (action === 'hide-cctv-view') {
      cctvViewportArmed = false;
      if (cctvViewport) cctvViewport.hidden = true;
      return;
    }
    if (action === 'collapse') {
      shell.querySelector('.lws-rail').classList.toggle('compact');
      return;
    }
    if (action === 'toggle-personal-rail') {
      const hidden = document.body.classList.toggle('leeway-personal-rail-hidden');
      const button = shell.querySelector('[data-action="toggle-personal-rail"]');
      if (button) {
        button.textContent = hidden ? '›' : '‹';
        button.setAttribute('aria-expanded', String(!hidden));
        button.setAttribute('aria-label', hidden ? 'Show map controls' : 'Collapse map controls');
      }
      return;
    }

    if (dock === 'layers') {
      toggleLayerMenu();
      return;
    }
    if (dock === 'traffic') {
      await toggleLayer('traffic');
      mapReports.refresh();
      return;
    }
    if (dock === 'cctv') {
      nationalCatalog.close();
      say('Loading nearest public traffic camera…');
      const opened = await openPersonalCctvControls();
      if (opened.ok) {
        if (cctvViewport) cctvViewport.hidden = false;
        if (cctvChannel)
          cctvChannel.textContent = opened.camera?.name || opened.cameraId || 'CCTV';
        say(
          `CCTV channel · ${opened.camera?.name || opened.cameraId} · ${opened.camera?.provider || 'official provider'}`,
        );
      } else {
        say(`CCTV unavailable in this view · ${opened.reason}`);
      }
      return;
    }
    if (dock === 'travel') {
      nationalCatalog.close();
      setRightPanel('ops', { toggle: false });
      say('Travel cockpit opened');
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
      await mapReports.refresh();
      const summary = mapReports.getSummary?.();
      if (summary?.weather) say(summary.weather);
      return;
    }
    if (dock === 'transit') {
      await enableTransitSuite();
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
      await deviceLocation.recenter();
    }
  });

  /* Preserve the application's 3D option. Geographic
     identity is independent through the location badge, while Map and
     Satellite are explicit operator-selectable labeled views. */
  queueMicrotask(() => {
    syncRightTabs();
    recenterDistantGlobe();
    void updateLocationBadge();
  });

  let currentLocationLabel = 'Your location';
  let mapReports = { refresh() {} };
  const deviceLocation = mountDeviceLocation({
    viewer,
    button: shell.querySelector('[data-dock="locate"]'),
    notify: say,
    navigate: (fly) => {
      styleManager.controlCockpit?.('exit');
      return styleManager.runImmediateLocationNavigation(fly);
    },
    onChange: () => {
      queueMicrotask(() => {
        mapReports.refresh();
        void updateLocationBadge();
      });
    },
  });
  mapReports = mountMapReports({
    shell,
    viewer,
    dataManager,
    getPoint: () => deviceLocation.getPoint(),
    getLocationLabel: () => currentLocationLabel,
    onWeather: () => setRightPanel('weather', { toggle: false }),
    onTraffic: async () => {
      try {
        if (dataManager?.layers?.has('traffic') && !dataManager.isEnabled?.('traffic')) {
          await dataManager.setEnabled('traffic', true, { origin: 'reports' });
        }
        mapReports.refresh();
      } catch {
        say('Local traffic flow is unavailable for this area');
      }
    },
  });

  async function selectCctv(query) {
    const requested = String(query || '')
      .trim()
      .toLowerCase();
    if (!requested) return { ok: false, reason: 'camera-query-required' };
    nationalCatalog.close();
    cctvViewportArmed = true;
    if (cctvViewport) cctvViewport.hidden = false;
    if (dataManager?.layers?.has('cctv') && !dataManager.isEnabled?.('cctv')) {
      await dataManager.setEnabled('cctv', true, { origin: 'copilot' });
    }
    applyPersonalCctvPerformanceDefaults();
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

  const deviceProfile = deviceCapabilityProfile();
  const runtimeCapabilities = discoverRuntimeCapabilities();
  const workloadPlan = buildWorkloadPlan(runtimeCapabilities, [
    { id: 'map-render', kind: 'map-render', latencyCritical: true },
    { id: 'visual-inference', kind: 'visual-inference', latencyCritical: true },
    { id: 'journey-geospatial', kind: 'geospatial-compute', latencyCritical: true },
    { id: 'background-index', kind: 'background-index', latencyCritical: false },
  ]);
  const devicePolicyState = applyMobileRenderPolicy({ viewer, dataManager, profile: deviceProfile });
  document.body.dataset.leewayDevicePolicy = devicePolicyState.policy.id;
  const mapViewControls = mountMapViewControls({ application, shell, addLauncher: false });
  const personalCockpit = mountPersonalCockpitViewport({
    shell,
    styleManager,
    catalog,
    notify: say,
  });
  const journeyContinuity = mountJourneyContinuityMonitor({
    viewer,
    dataManager,
    shell,
    mapViewControls,
    routePlanner: routing,
    openNearestCctv,
    notify: say,
    addLauncher: false,
  });
  let mapToolsPanel = null;
  const getMapToolsPanel = () => {
    if (!mapToolsPanel) {
      mapToolsPanel = mountMapToolsPanel({
        application,
        shell,
        addLauncher: false,
      });
    }
    return mapToolsPanel;
  };

  return {
    root: shell,
    routePlanner: routing,
    locate,
    openWeather,
    async openCctv() {
      nationalCatalog.close();
      return openPersonalCctvControls();
    },
    selectCctv,
    getDeviceProfile: () => devicePolicyState,
    getRuntimeCapabilities: () => ({ runtimeCapabilities, workloadPlan }),
    openAgent: () => toggleAgent(true),
    closeAgent: () => toggleAgent(false),
    notify: say,
    destroy() {
      journeyContinuity.destroy();
      mapToolsPanel?.destroy();
      personalCockpit.destroy();
      mapViewControls.destroy();
      cctvObserver?.disconnect();
      weatherObserver?.disconnect();
      document.removeEventListener('leeway:right-panel-close', closeRightPanel);
      clearTimeout(cctvRecoveryTimer);
      cctvViewport?.removeEventListener(
        'leeway:cctv-frame-unavailable',
        recoverFailedCctv,
      );
      cctvViewport?.removeEventListener(
        'leeway:cctv-frame-ready',
        confirmWorkingCctv,
      );
      cctvObserver = null;
      weatherObserver = null;
      removeWorldCentering?.();
      removeLocationBadgeListener?.();
      stopCctvViewportDrag?.();
      globalThis.removeEventListener?.('resize', onViewportResize);
      if (cctvPanel && cctvOriginalParent) {
        const frameWrap = cctvFrameSlot?.querySelector?.('#cctv-frame-wrap');
        if (frameWrap) cctvPanel.querySelector('.cyber-panel-body')?.prepend(frameWrap);
        if (
          cctvOriginalNextSibling &&
          cctvOriginalNextSibling.parentNode === cctvOriginalParent
        ) {
          cctvOriginalParent.insertBefore(cctvPanel, cctvOriginalNextSibling);
        } else {
          cctvOriginalParent.appendChild(cctvPanel);
        }
      }
      if (weatherPanel && weatherOriginalParent) {
        if (
          weatherOriginalNextSibling &&
          weatherOriginalNextSibling.parentNode === weatherOriginalParent
        ) {
          weatherOriginalParent.insertBefore(weatherPanel, weatherOriginalNextSibling);
        } else {
          weatherOriginalParent.appendChild(weatherPanel);
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
      hazardReports.destroy();
      peerComms.destroy();
      deviceLocation.destroy();
      mapReports.destroy();
      routing.destroy();
      roadside.destroy();
      featureCenter.destroy();
      nationalCatalog.destroy();
      shell.remove();
    },
  };
}
