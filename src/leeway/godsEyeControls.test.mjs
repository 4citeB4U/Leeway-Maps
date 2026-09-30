import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGodsEyeActions } from './godsEyeControls.js';

test('cockpit activates original Contacts before entering the selected aircraft', async () => {
  const calls = [],
    target = { layerId: 'flights', id: 'abc123' };
  const actions = createGodsEyeActions({
    styleManager: {
      getAircraftTrackingTarget: () => target,
      setContextMode: async (mode) => {
        calls.push(['context', mode]);
        return { ok: true };
      },
      controlCockpit: (action, options) => {
        calls.push([action, options]);
        return { ok: true };
      },
    },
  });
  assert.equal((await actions.cockpit()).ok, true);
  assert.deepEqual(calls, [
    ['context', 'flights'],
    ['enter', { selectedTarget: target }],
  ]);
});
test('missing selection or failed Contacts cannot produce a half-entered cockpit', async () => {
  const absent = createGodsEyeActions({
    styleManager: {
      getAircraftTrackingTarget: () => null,
      controlCockpit: () => assert.fail(),
    },
  });
  assert.match((await absent.cockpit()).error, /Select an aircraft/);
  const failed = createGodsEyeActions({
    styleManager: {
      getAircraftTrackingTarget: () => ({ id: 'abc123' }),
      setContextMode: async () => ({ ok: false, error: 'Feed offline' }),
      controlCockpit: () => assert.fail(),
    },
  });
  assert.equal((await failed.cockpit()).error, 'Feed offline');
});
test('follow uses canonical tracked camera refocus; exit restores workspace', () => {
  const calls = [],
    target = { layerId: 'military', id: 'def456' };
  const actions = createGodsEyeActions({
    styleManager: {
      controlCockpit: (action) => calls.push(action),
      getAircraftTrackingTarget: () => target,
    },
    catalog: {
      get: (id) => {
        assert.equal(id, 'military');
        return {
          refocusTrackedById: (id, options) => {
            calls.push([id, options]);
            return true;
          },
        };
      },
    },
    onAdvanced: (value) => calls.push(value),
  });
  assert.equal(actions.follow().ok, true);
  actions.exit();
  assert.deepEqual(calls, [
    'exit',
    ['def456', { origin: 'user' }],
    'exit',
    false,
  ]);
});
test('advanced view retains every original preset and complete layer/context controls', () => {
  const template = readFileSync(
    new URL('../ui/templates/command-dock.html', import.meta.url),
    'utf8',
  );
  assert.deepEqual(
    [
      ...template.matchAll(/class="style-btn[^\"]*" data-style="([^\"]+)"/g),
    ].map((m) => m[1]),
    ['normal', 'retro', 'surveillance', 'thermal', 'anime', 'noir', 'snow'],
  );
  const source = readFileSync(
    new URL('./godsEyeControls.js', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /classList\.toggle\('leeway-enterprise-shell',\s*!original\)/,
  );
  assert.match(source, /data-panel/);
  assert.match(source, /control-panel-toggle/);
  assert.match(source, /body:is\(\.leeway-gods-eye,\.cockpit-mode\) :is\(#first-run-launcher,#leeway-agent-lee:not\(\.leeway-open\),#leeway-transit-world,#leeway-enterprise-workspace\)\{display:none!important\}/);
});
