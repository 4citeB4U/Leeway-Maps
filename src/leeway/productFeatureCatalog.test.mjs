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
 const peers = await readFile(new URL('./peerComms.js', import.meta.url), 'utf8');
 assert.doesNotMatch(peers, /Fleet coworkers|available driver or dispatcher|companyDirectory/);
 assert.match(peers, /identity\?\.directoryPolicy !== 'opt-in'/);
});
