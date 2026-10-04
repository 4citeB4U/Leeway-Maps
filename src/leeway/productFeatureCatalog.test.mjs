import test from 'node:test';
import assert from 'node:assert/strict';
import { PERSONAL_FEATURE_CATALOG, featureCatalogForEdition } from './productFeatureCatalog.js';
import { classifyCopilotCommand, executeCopilotCommand } from './copilotCommands.js';
import { readFile } from 'node:fs/promises';
test('personal catalog cannot switch into business features', () => {
 assert.equal(featureCatalogForEdition('business'), PERSONAL_FEATURE_CATALOG);
 assert.doesNotMatch(JSON.stringify(PERSONAL_FEATURE_CATALOG), /fleet|dispatch|load pricing|crm|municipal|payroll|cargo/i);
 assert.ok(PERSONAL_FEATURE_CATALOG.some(row => row.id === 'public-transit-rider'));
});
test('personal commands never invoke commercial load planning', async () => {
 assert.equal(classifyCopilotCommand('Open dispatch load planning'), null);
 assert.deepEqual(await executeCopilotCommand('Open dispatch load planning', {openLoadPlanning(){assert.fail('commercial operation invoked');}}), {handled:false});
});
test('personal entry import graph excludes commercial UI implementations', async () => {
 const visited = new Set();
 async function scan(url) {
  if (visited.has(url.href)) return; visited.add(url.href);
  const code = await readFile(url, 'utf8');
  for (const match of code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
   if (!match[1].startsWith('.') || !/\.(js|mjs)$/.test(match[1])) continue;
   const child = new URL(match[1], url);
   assert.doesNotMatch(child.pathname, /\/(fuelLedger|loadComparison|loadIntake|enterpriseWorkspace|municipalTransit|transitWorldCockpit|logisticsKnowledge)[^/]*\.(m?js)$/, child.pathname);
   await scan(child);
  }
 }
 await scan(new URL('../main.js', import.meta.url));
});
test('personal directions do not offer commercial vehicle controls', async () => {
 const source = await readFile(new URL('./routePlanner.js', import.meta.url), 'utf8');
 assert.doesNotMatch(source, /<option value="(?:truck|semi|van)"|data-profile="(?:hazmat|oversize|grossWeightKg|axleWeightKg)"/);
 assert.match(source, /data-mode="foot"/);
 assert.match(source, /data-mode="bike"/);
 assert.match(source, /FlowMaterialProperty/);
 assert.match(source, /PolylineGlowMaterialProperty/);
 assert.match(source, /holdContinuousRender\(ROUTE_RENDER_HOLD\)/);
 assert.match(source, /releaseContinuousRender\(ROUTE_RENDER_HOLD\)/);
});
test('personal shell has no dormant commercial controls and travel contacts are opt-in', async () => {
 const shell = await readFile(new URL('./mapsShell.js', import.meta.url), 'utf8');
 assert.doesNotMatch(shell, /isBusiness|loadComparison|Driver radio|data-nav="(?:loads|fleet|drivers|crm)"|workspace\.(?:open|close)/);
 assert.match(shell, /Where do you want to go\?/);
 assert.match(shell, /Go anywhere\. Know what's around you\./);
 assert.match(shell, /My location/);
 assert.match(shell, /Cameras/);
 assert.match(shell, /icon-192\.png/);
 assert.match(shell, /lm-agent-mic/);
 assert.doesNotMatch(shell, /lm-profile/);
 assert.match(shell, /aria-label="Agent Lee"/);
 assert.match(shell, /data-agent-flip/);
 assert.match(shell, /data-cctv-viewport/);
 assert.match(shell, /data-action="cockpit"/);
 assert.doesNotMatch(shell, /class="lws-right-tabs/);
 const dock = shell.slice(shell.indexOf('aria-label="Agent Lee"'), shell.indexOf('aria-label="Agent Lee"') + 900);
 assert.match(dock, /lm-agent-mic/);
 assert.doesNotMatch(dock, /data-dock="(?:transit|traffic|weather|cctv|layers)"/);
 const peers = await readFile(new URL('./peerComms.js', import.meta.url), 'utf8');
 assert.doesNotMatch(peers, /Fleet coworkers|available driver or dispatcher|companyDirectory/);
 assert.match(peers, /identity\?\.directoryPolicy !== 'opt-in'/);
});


test('personal cockpit viewport is independent from the primary map camera', async () => {
 const shell = await readFile(new URL('./mapsShell.js', import.meta.url), 'utf8');
 const cockpit = await readFile(new URL('./personalCockpitViewport.js', import.meta.url), 'utf8');
 assert.match(shell, /mountPersonalCockpitViewport/);
 assert.doesNotMatch(shell, /mapViewControls\.actions\.cockpit\(\)/);
 assert.match(cockpit, /new Cesium\.Viewer/);
 assert.match(cockpit, /requestRenderMode: true/);
 assert.match(cockpit, /getAircraftTrackingTarget/);
});


test('Personal CCTV media is independent from the settings card', async () => {
 const shell = await readFile(new URL('./mapsShell.js', import.meta.url), 'utf8');
 const presentation = await readFile(new URL('../ui/cctvPresentation.js', import.meta.url), 'utf8');
 assert.match(shell, /cctvViewportArmed/);
 assert.match(shell, /coverageMode: 'off'/);
 assert.match(shell, /showProjection: false/);
 assert.match(presentation, /personalViewportVisible/);
 assert.match(presentation, /!personalMaps\s*&&\s*effectiveActiveId/);
});

test('Personal Transit avoids duplicate vehicle layers and keeps routes visible', async () => {
 const shell = await readFile(new URL('./mapsShell.js', import.meta.url), 'utf8');
 const network = await readFile(new URL('../layers/transit/network.js', import.meta.url), 'utf8');
 assert.match(shell, /const requested = \['transit', 'transit-routes', 'transit-stops'\]/);
 assert.match(shell, /origin: 'transit-fallback'/);
 assert.match(network, /PolylineGlowMaterialProperty/);
 assert.match(network, /mode === 'rail' \|\| mode === 'subway'/);
});

test('Personal cockpit opens as a viewport before aircraft selection and releases its GPU context on close', async () => {
 const cockpit = await readFile(new URL('./personalCockpitViewport.js', import.meta.url), 'utf8');
 assert.match(cockpit, /waitingForAircraft: true/);
 assert.match(cockpit, /viewer\?\.destroy\?\.\(\)/);
 assert.match(cockpit, /setInterval\(update, 500\)/);
});


test('Personal Transit exposes explicit layer and mode control instead of one opaque toggle', async () => {
 const shell = await readFile(new URL('./mapsShell.js', import.meta.url), 'utf8');
 const controls = await readFile(new URL('./personalTransitControls.js', import.meta.url), 'utf8');
 const network = await readFile(new URL('../layers/transit/network.js', import.meta.url), 'utf8');
 assert.match(shell, /mountPersonalTransitControls/);
 for (const id of ['transit','transit-routes','transit-stops','transit-vehicles'])
   assert.match(controls, new RegExp('data-layer="' + id + '"'));
 for (const mode of ['bus','tram','subway','rail','ferry'])
   assert.match(controls, new RegExp("\\['" + mode + "',"));
 assert.match(network, /visibleModes/);
 assert.match(network, /PolylineGlowMaterialProperty/);
});

test('Personal Street View restores a drag-and-drop map target using the server proxy', async () => {
 const shell = await readFile(new URL('./mapsShell.js', import.meta.url), 'utf8');
 const street = await readFile(new URL('./personalStreetView.js', import.meta.url), 'utf8');
 const world = await readFile(new URL('../../server/deployment/vercelWorld.js', import.meta.url), 'utf8');
 assert.match(shell, /mountPersonalStreetView/);
 assert.match(street, /screenPointToLonLat/);
 assert.match(street, /pointerdown/);
 assert.match(street, /\/api\/streetview\/image/);
 assert.match(world, /streetViewProxy/);
});

test('Personal cockpit reads the tracked flights layer directly so rotorcraft use the same cockpit path', async () => {
 const cockpit = await readFile(new URL('./personalCockpitViewport.js', import.meta.url), 'utf8');
 assert.match(cockpit, /dataManager\?\.layers\?\.get\('flights'\)/);
 assert.match(cockpit, /sourceViewer\?\.trackedEntity\?\.gevTrackedId/);
 assert.doesNotMatch(cockpit, /helicopter.*unavailable/i);
});


test('Personal Places uses zoom tiers and never materializes all-world business data', async () => {
 const shell = await readFile(new URL('./mapsShell.js', import.meta.url), 'utf8');
 const places = await readFile(new URL('./personalPlacesOverlay.js', import.meta.url), 'utf8');
 assert.match(shell, /data-action="places"/);
 assert.match(shell, /mountPersonalPlacesOverlay/);
 assert.match(places, /nearby-places/);
 assert.match(places, /maxHeightM: 18000/);
 assert.match(places, /limit: 20/);
 assert.match(places, /cache\.size > 24/);
});

test('direct transit animation can follow exact matching route geometry without mutating raw GPS', async () => {
 const network = await readFile(new URL('../layers/transit/network.js', import.meta.url), 'utf8');
 const rendering = await readFile(new URL('../layers/transit/rendering.js', import.meta.url), 'utf8');
 assert.match(network, /routePathBetween/);
 assert.match(network, /normalizeRouteRef/);
 assert.match(rendering, /mapped-route-geometry/);
 assert.match(rendering, /sampleRouteTraversal/);
});
